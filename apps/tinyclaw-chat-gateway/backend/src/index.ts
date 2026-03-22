import express from 'express';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createServer } from 'http';
import multer from 'multer';
import { WebSocket } from 'ws';
import OpenClawClient from './openclaw-client';
import SessionManager from './session-manager';
import ConfigManager from './config-manager';
import DB from './db';
import AgentProvisioner from './agent-provisioner';
import { exec } from 'child_process';
import util from 'util';
import net from 'net';

const execPromise = util.promisify(exec);

const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

const dataDir = process.env.CLAWUI_DATA_DIR || '.clawui';
const uploadDir = path.join(process.env.HOME || '.', dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// OpenClaw media directory (screenshots, inbound files, etc.)
const openclawMediaDir = path.join(process.env.HOME || '.', '.openclaw', 'media');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const config = configManager.getConfig();
    const sessionId = _req.body?.sessionId || '';
    const sessionInfo = sessionManager.getSession(sessionId);
    const agentId = sessionInfo?.agentId || 'main';
    const workspacePath = agentProvisioner.getWorkspacePath(agentId);
    
    const finalUploadDir = path.join(workspacePath, 'uploads');
    console.log(`[Upload] Session: ${sessionId}, Agent: ${agentId}, Path: ${finalUploadDir}`);
    try {
      fs.mkdirSync(finalUploadDir, { recursive: true });
    } catch (err) {
      console.error(`[Upload] Failed to use workspace for agent ${agentId}: ${err instanceof Error ? err.message : String(err)}`);
    }
    
    cb(null, finalUploadDir);
  },
  filename: (_req, file, cb) => {
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const safe = decodedName.replace(/[^a-zA-Z0-9.\u4e00-\u9fa5_-]/g, '_');
    file.originalname = decodedName; // Save decoded name back for later use
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
});

// Initialize managers
const db = new DB();
const configManager = new ConfigManager();
const sessionManager = new SessionManager(db);
const agentProvisioner = new AgentProvisioner();

// Ensure main agent workspace is registered in openclaw.json at startup
const mainRegistered = agentProvisioner.ensureMainAgent();
if (mainRegistered) {
  console.log('[Startup] Main agent workspace registered in openclaw.json');
}

// LibreOffice detection
let hasLibreOffice = false;
const previewCacheDir = path.join(process.env.HOME || '.', '.clawui_preview_cache');
fs.mkdirSync(previewCacheDir, { recursive: true });

(async () => {
  try {
    await execPromise('which libreoffice');
    hasLibreOffice = true;
    console.log('[Preview] ✅ LibreOffice detected - high-fidelity preview enabled');
  } catch {
    hasLibreOffice = false;
    console.log('[Preview] ⚠️  LibreOffice not found - using client-side preview fallback');
  }
})();

// Host checking middleware for reverse proxies
app.use((req, res, next) => {
  const reqHost = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
  const hostName = reqHost.split(':')[0]; // get hostname without port
  
  // Allow local connections and pure IPs
  if (!hostName || hostName === 'localhost' || hostName === '127.0.0.1' || net.isIP(hostName)) {
    return next();
  }

  const config = configManager.getConfig();
  const allowedHosts = config.allowedHosts || [];
  
  if (!allowedHosts.includes(hostName)) {
    return res.status(403).send(`Blocked request. This host ("${hostName}") is not allowed.`);
  }
  
  next();
});

// Store active OpenClaw connections
// Helper to rewrite outgoing messages: expand /uploads/ markdown links to absolute paths
function rewriteOutgoingMessage(message: string, agentId: string): string {
  const workspacePath = agentProvisioner.getWorkspacePath(agentId);
  const absoluteUploadsDir = path.join(workspacePath, 'uploads');

  // Regex to find markdown links like [name](/uploads/filename) or ![name](/uploads/filename)
  // or naked /uploads/filename if not in markdown
  return message.replace(/(\(?\/uploads\/)([^\s)]+)(\)?)/g, (match, prefix, filename, suffix) => {
    const absolutePath = path.join(absoluteUploadsDir, filename);
    return `${prefix.startsWith('(') ? '(' : ''}${absolutePath}${suffix.endsWith(')') ? ')' : ''}`;
  });
}

const connections = new Map<string, OpenClawClient>();

// Rewrite absolute local file paths in AI responses to HTTP-accessible download URLs
function rewriteOpenClawMediaPaths(text: string): string {
  // Match absolute Unix paths, stopping at whitespace, Markdown punct, or Chinese brackets/parens
  // \uff08\uff09 = （） \u3010\u3011 = 【】 \u300a\u300b = 《》
  const regex = /(\/(?:[^\s\)\]\u0022\u0027\u0060|<>\uff08\uff09\u3010\u3011\u300a\u300b\u300c\u300d]+))/g;
  
  return text.replace(regex, (match, _p1, offset) => {
    // Must have at least 2 path segments (e.g. /home/something) to avoid matching things like /api
    if (match.split('/').length < 3) return match;
    // Must have a file extension to be considered a downloadable file
    const ext = path.extname(match);
    if (!ext) return match;
    // Skip URLs: check both the match content and surrounding context
    if (match.includes('://')) return match;
    // Skip if this is part of a URL (preceded by ":" from a scheme like https: or http:)
    if (offset > 0 && text[offset - 1] === ':') return match;
    
    try {
      const encodedPath = Buffer.from(match).toString('base64');
      const filename = path.basename(match);
      return `\n\n[${filename}](/api/files/download?path=${encodeURIComponent(encodedPath)})\n\n`;
    } catch {
      return match;
    }
  });
}

// Helper to get or create connection
async function getConnection(sessionId: string): Promise<OpenClawClient> {
  if (connections.has(sessionId)) {
    return connections.get(sessionId)!;
  }

  const config = configManager.getConfig();
  const client = new OpenClawClient({
    gatewayUrl: config.gatewayUrl,
    token: config.token,
    password: config.password,
  });
  client.on('error', (err) => {
    console.error(`[OpenClawClient Error for session ${sessionId}]`, err.message);
  });

  await client.connect();
  connections.set(sessionId, client);

  client.on('disconnected', () => {
    connections.delete(sessionId);
  });

  return client;
}

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    connections: connections.size,
  });
});

// API Routes
app.get('/api/system/check-update', async (_req, res) => {
  try {
    const response = await axios.get('https://api.github.com/repos/liandu2024/OpenClaw-Chat-Gateway/releases/latest', {
      timeout: 10000,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'OpenClaw-Chat-Gateway-ClawUI'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('[UpdateCheck] Failed to fetch latest release:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'Failed to fetch update info from GitHub' });
  }
});

app.get('/api/config', (_req, res) => {
  const config = configManager.getConfig();
  res.json({
    gatewayUrl: config.gatewayUrl,
    token: config.token || '',
    defaultAgent: config.defaultAgent,
    language: config.language || 'zh-CN',
    hasToken: !!config.token,
    hasPassword: !!config.password,
    aiName: config.aiName || 'OpenClaw',
    loginEnabled: config.loginEnabled || false,
    loginPassword: config.loginPassword || '123456',
    allowedHosts: config.allowedHosts || [],
    openclawWorkspace: config.openclawWorkspace || '',
  });
});

app.post('/api/config', (req, res) => {
  configManager.setConfig(req.body);
  res.json({ success: true });
});

import crypto from 'crypto';

function generateAuthToken(password: string): string {
  return crypto.createHash('sha256').update(password + '_clawui_salt').digest('hex');
}

// Auth endpoints
app.get('/api/auth/check', (req, res) => {
  const config = configManager.getConfig();
  const providedToken = req.query.token as string | undefined;
  
  if (!config.loginEnabled) {
     return res.json({ loginRequired: false });
  }

  const correctPassword = config.loginPassword || '123456';
  const expectedToken = generateAuthToken(correctPassword);

  if (providedToken && providedToken === expectedToken) {
     return res.json({ loginRequired: false });
  }

  res.json({ loginRequired: true });
});

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const config = configManager.getConfig();
  
  if (!config.loginEnabled) {
    return res.json({ success: true, token: 'disabled' });
  }
  
  const correctPassword = config.loginPassword || '123456';
  if (password === correctPassword) {
    res.json({ success: true, token: generateAuthToken(correctPassword) });
  } else {
    res.status(401).json({ success: false, message: '密码错误' });
  }
});

app.get('/api/gateway/status', async (_req, res) => {
  const config = configManager.getConfig();
  if (!config.gatewayUrl) {
    return res.json({ connected: false, message: 'Gateway URL not configured' });
  }

  try {
    const client = new OpenClawClient({ 
      gatewayUrl: config.gatewayUrl, 
      token: config.token, 
      password: config.password 
    });
    client.on('error', () => {});
    await client.connect();
    client.disconnect();
    res.json({ connected: true });
  } catch (error: any) {
    res.json({ connected: false, message: error?.message || 'Connection failed' });
  }
});

app.post('/api/config/test', async (req, res) => {
  const { gatewayUrl, token, password } = req.body;

  if (!gatewayUrl) {
    return res.status(400).json({ success: false, message: 'Gateway URL is required' });
  }

  try {
    console.log('[API] /api/config/test - Creating client');
    const client = new OpenClawClient({ gatewayUrl, token, password });
    client.on('error', (err) => { console.error('[API] Client error:', err); });
    
    // Attempt to connect and authenticate
    console.log('[API] /api/config/test - Connecting client');
    await client.connect();
    
    // If we reach here, connection and authentication succeeded
    console.log('[API] /api/config/test - Connection successful, disconnecting');
    client.disconnect();
    res.json({ success: true, message: 'Connection successful' });
  } catch (error: any) {
    console.error('[API] /api/config/test - Connection failed:', error);
    res.json({ success: false, message: error?.message || 'Connection failed' });
  }
});

app.get('/api/config/detect-all', (req, res) => {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    let gatewayUrl = '';
    let token = '';
    let password = '';
    let workspacePath = '';

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.gateway) {
        gatewayUrl = `ws://127.0.0.1:${config.gateway.port || 18789}`;
        token = config.gateway.auth?.token || '';
        password = config.gateway.auth?.password || '';
      }
    }

    const mainWorkspace = agentProvisioner.getWorkspacePath('main');
    if (fs.existsSync(mainWorkspace)) {
      workspacePath = mainWorkspace;
    }

    if (!gatewayUrl && !workspacePath) {
      return res.json({ success: false, message: 'Could not detect gateway config or workspace' });
    }

    res.json({
      success: true,
      data: {
        gatewayUrl,
        token,
        password,
        workspacePath
      }
    });
  } catch (error: any) {
    res.json({ success: false, message: 'Error detecting config: ' + error.message });
  }
});

// --- Max Permissions Toggle ---
const MAX_PERMISSIONS_TOOLS = {
  web: {
    fetch: { enabled: true }
  },
  exec: {
    security: 'full',
    ask: 'off'
  },
  elevated: {
    enabled: true,
    allowFrom: { webchat: ['*'], '*': ['*'] }
  }
};

app.get('/api/config/max-permissions', (_req, res) => {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    if (!fs.existsSync(configPath)) {
      return res.json({ enabled: false });
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    // If tools has a "profile" key, it's using the simplified preset (not max permissions)
    const enabled = !config.tools?.profile && config.tools?.exec?.security === 'full';
    res.json({ enabled });
  } catch (error: any) {
    res.json({ enabled: false });
  }
});

app.post('/api/config/max-permissions', (req, res) => {
  try {
    const { enabled } = req.body;
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ success: false, message: 'openclaw.json not found' });
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (enabled) {
      config.tools = MAX_PERMISSIONS_TOOLS;
      // Ensure commands are fully enabled
      if (!config.commands) config.commands = {};
      config.commands.bash = true;
      config.commands.restart = true;
      config.commands.native = 'auto';
      config.commands.nativeSkills = 'auto';
    } else {
      config.tools = { profile: 'coding' };
    }

    // Ensure sandbox is off for local self-hosted setups
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.sandbox) config.agents.defaults.sandbox = {};
    config.agents.defaults.sandbox.mode = 'off';

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Also patch exec-approvals.json (the actual file OpenClaw reads for approval policy)
    const execApprovalsPath = path.join(os.homedir(), '.openclaw', 'exec-approvals.json');
    if (fs.existsSync(execApprovalsPath)) {
      try {
        const approvals = JSON.parse(fs.readFileSync(execApprovalsPath, 'utf-8'));
        if (!approvals.defaults) approvals.defaults = {};
        if (enabled) {
          approvals.defaults.ask = 'off';
          approvals.defaults.security = 'full';
          approvals.agents = { '*': { allowlist: [{ pattern: '*' }] } };
        } else {
          delete approvals.defaults.ask;
          delete approvals.defaults.security;
          delete approvals.agents;
        }
        fs.writeFileSync(execApprovalsPath, JSON.stringify(approvals, null, 2));
      } catch (e) {
        console.error('Failed to patch exec-approvals.json:', e);
      }
    }

    res.json({ success: true, enabled });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/config/restart', async (_req, res) => {
  try {
    // Disconnect all active clients first
    for (const [sessionId, client] of connections.entries()) {
      try {
        client.disconnect();
      } catch (err) {
        console.error(`Error disconnecting client ${sessionId}:`, err);
      }
    }
    connections.clear();

    // Execute the actual restart command on the system
    await execPromise('openclaw gateway restart');

    res.json({ success: true, message: 'Gateway connections reset and service restarted' });
  } catch (error: any) {
    console.error('Failed to restart gateway:', error);
    res.status(500).json({ success: false, error: '执行重启命令失败: ' + error.message });
  }
});

app.get('/api/models', (_req, res) => {
  const models = agentProvisioner.readAvailableModels();
  res.json({ success: true, models });
});

app.post('/api/models/test', async (req, res) => {
  try {
    const { endpoint, modelName } = req.body;
    if (!endpoint || !modelName) {
      return res.status(400).json({ success: false, error: 'endpoint and modelName required' });
    }

    const endpoints = agentProvisioner.getEndpoints();
    const config = endpoints.find((e: any) => e.id === endpoint);
    if (!config) {
      return res.status(404).json({ success: false, error: 'Endpoint not found' });
    }

    let baseUrl = config.baseUrl;
    const apiKey = config.apiKey || '';
    const apiType = config.api.toLowerCase();

    let testUrl = '';
    let headers: any = {
      'Content-Type': 'application/json'
    };
    let body: any = {};

    if (apiType.includes('anthropic')) {
      testUrl = `${baseUrl.replace(/\/$/, '')}/messages`;
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      body = {
        model: modelName,
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 5
      };
    } else if (apiType.includes('gemini') || apiType.includes('google')) {
      testUrl = `${baseUrl.replace(/\/$/, '')}/models/${modelName}:generateContent?key=${apiKey}`;
      body = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        generationConfig: { maxOutputTokens: 5 }
      };
    } else if (apiType.includes('ollama')) {
      testUrl = `${baseUrl.replace(/\/$/, '')}/api/chat`; 
      body = {
        model: modelName,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false
      };
    } else {
      // Fallback for OpenAI, Ark, DeepSeek, Minimax, etc.
      testUrl = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = {
        model: modelName,
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 5,
        stream: false
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const resp = await fetch(testUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        return res.json({ success: true, message: '模型有效连通' });
      } else {
        const errorText = await (await resp.blob()).text();
        let errMsg = `HTTP ${resp.status} ${resp.statusText}`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error?.message) errMsg += ` - ${parsed.error.message}`;
          else if (parsed.error) errMsg += ` - ${JSON.stringify(parsed.error)}`;
          else if (parsed.message) errMsg += ` - ${parsed.message}`;
        } catch {
          if (errorText.length > 0) errMsg += ` - ${errorText.substring(0, 100)}`;
        }
        return res.json({ success: false, error: errMsg });
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      return res.json({ success: false, error: e.message || '网络连接失败' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/models/discover', async (req, res) => {
  try {
    const endpoint = req.query.endpoint as string;
    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'endpoint required' });
    }

    const endpoints = agentProvisioner.getEndpoints();
    const config = endpoints.find((e: any) => e.id === endpoint);
    if (!config) {
      return res.status(404).json({ success: false, error: 'Endpoint not found' });
    }

    const baseUrl = config.baseUrl.replace(/\/$/, '');
    const apiKey = config.apiKey || '';
    const apiType = config.api.toLowerCase();

    let discoverUrl = '';
    const headers: any = {
      'Content-Type': 'application/json'
    };

    if (apiType.includes('anthropic')) {
      discoverUrl = `${baseUrl}/models`;
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (apiType.includes('gemini') || apiType.includes('google')) {
      discoverUrl = `${baseUrl}/models?key=${apiKey}`;
    } else if (apiType.includes('ollama')) {
      discoverUrl = `${baseUrl}/api/tags`;
    } else {
      // Fallback for OpenAI, Ark, DeepSeek, Minimax, etc.
      discoverUrl = `${baseUrl}/models`;
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(discoverUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errorText = await resp.text();
      return res.status(resp.status).json({ success: false, error: `Failed to discover models: HTTP ${resp.status} - ${errorText.substring(0, 100)}` });
    }

    const data: any = await resp.json();
    let models: string[] = [];

    if (apiType.includes('ollama')) {
      if (data.models && Array.isArray(data.models)) {
        models = data.models.map((m: any) => m.name);
      }
    } else if (apiType.includes('gemini') || apiType.includes('google')) {
      if (data.models && Array.isArray(data.models)) {
        models = data.models.map((m: any) => m.name.replace('models/', ''));
      }
    } else {
      // OpenAI / Anthropic format
      if (data.data && Array.isArray(data.data)) {
        models = data.data.map((m: any) => m.id);
      } else if (Array.isArray(data)) {
         models = data.map((m: any) => m.id || m.name);
      }
    }

    return res.json({ success: true, models: models.filter(Boolean) });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Network error during discovery' });
  }
});

app.post('/api/models/manage', async (req, res) => {
  try {
    const { endpoint, modelName, alias } = req.body;
    if (!endpoint || !modelName) {
      return res.status(400).json({ success: false, error: 'endpoint and modelName required' });
    }
    const success = await agentProvisioner.addModelConfig(endpoint, modelName, alias);
    if (success) {
      // Gateway auto-reloads config files on change
      return res.json({ success: true });
    }
    return res.status(400).json({ success: false, error: 'Model may already exist or config invalid' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/models/manage', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'id required' });
    
    const success = await agentProvisioner.deleteModelConfig(id);
    if (success) {
      // Gateway auto-reloads config files on change
      return res.json({ success: true });
    }
    return res.status(404).json({ success: false, error: 'Model not found' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/models/manage/default', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'id required' });

    const success = await agentProvisioner.setDefaultModel(id);
    if (success) {
      // Gateway auto-reloads config files on change
      return res.json({ success: true });
    }
    return res.status(404).json({ success: false, error: 'Model not found' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/models/manage', async (req, res) => {
  try {
    const { id, alias } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'id required' });

    const success = await agentProvisioner.updateModelConfig(id, alias);
    if (success) {
      return res.json({ success: true });
    }
    return res.status(404).json({ success: false, error: 'Model not found' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/endpoints/manage', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ success: false, error: 'endpoint required' });

    const count = await agentProvisioner.deleteEndpointConfig(endpoint);
    if (count > 0) {
      // Gateway auto-reloads config files on change
      return res.json({ success: true, deleted: count });
    }
    return res.status(404).json({ success: false, error: 'Endpoint not found or no models under it' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/endpoints', (_req, res) => {
  try {
    const endpoints = agentProvisioner.getEndpoints();
    res.json({ success: true, endpoints });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/endpoints', async (req, res) => {
  try {
    const { id, baseUrl, apiKey, api } = req.body;
    if (!id || !baseUrl || !api) {
      return res.status(400).json({ success: false, error: 'id, baseUrl, and api are required' });
    }

    const success = await agentProvisioner.saveEndpoint(id, { baseUrl, apiKey, api });
    if (success) {
      // Gateway auto-reloads config files on change
      return res.json({ success: true });
    }
    return res.status(400).json({ success: false, error: 'Failed to save endpoint' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/characters', (_req, res) => {
  const characters = db.getCharacters().map(char => {
    const diskSoul = agentProvisioner.readSoul(char.agentId);
    if (diskSoul !== null) {
      char.systemPrompt = diskSoul;
    }
    // Always read the actual model from openclaw.json (source of truth)
    const actualModel = agentProvisioner.readAgentModel(char.agentId);
    if (actualModel) {
      char.model = actualModel;
    }
    return char;
  });
  res.json({ success: true, characters });
});

app.post('/api/characters', async (req, res) => {
  const char = req.body;
  if (!char.id) char.id = 'char_' + Date.now();

  // Validate agentId
  if (!char.agentId) {
    return res.status(400).json({ success: false, error: '智能体 ID 不能为空' });
  }
  if (/\s/.test(char.agentId)) {
    return res.status(400).json({ success: false, error: '智能体 ID 不允许包含空格' });
  }
  
  // Check for duplicate agentId (excluding the current character being edited)
  const existingChars = db.getCharacters();
  const isDuplicate = existingChars.some(c => c.agentId === char.agentId && c.id !== char.id);
  if (isDuplicate) {
    return res.status(400).json({ success: false, error: `智能体 ID "${char.agentId}" 已存在，请使用其他 ID` });
  }

  // Provision full isolated environment in OpenClaw (workspace, SOUL.md, USER.md, etc.)
  const configChanged = await agentProvisioner.provision({
    agentId: char.agentId,
    soulContent: char.systemPrompt,
    model: char.model,
  });
  
  // Also update SOUL.md if this is an existing character being re-saved
  if (!configChanged) {
    await agentProvisioner.updateSoul(char.agentId, char.systemPrompt);
    // Update model in config if changed
    const modelChanged = await agentProvisioner.updateModel(char.agentId, char.model);
    if (modelChanged) {
      // Gateway auto-reloads config
    }
  }
  
  db.saveCharacter(char);

  if (configChanged) {
      console.log('OpenClaw config changed for new agent, auto-reloading...');
  }

  res.json({ success: true, character: char });
});

app.delete('/api/characters/:id', async (req, res) => {
  try {
    const character = db.getCharacters().find(c => c.id === req.params.id);
    if (!character) {
      return res.status(404).json({ success: false, error: 'Character not found' });
    }

    db.deleteCharacter(req.params.id);

    // Deprovision agent: remove from OpenClaw config + delete workspace & state dirs
    if (character.agentId && character.agentId !== 'main') {
      const configChanged = await agentProvisioner.deprovision(character.agentId);
      if (configChanged) {
        console.log(`Agent "${character.agentId}" fully removed, gateway auto-reloading...`);
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting character:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// USER.md read/write API for per-character user profile
app.get('/api/characters/:agentId/user-md', (req, res) => {
  const content = agentProvisioner.readUserMd(req.params.agentId);
  res.json({ success: true, content });
});

app.put('/api/characters/:agentId/user-md', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing content' });
  }
  agentProvisioner.writeUserMd(req.params.agentId, content);
  res.json({ success: true });
});

app.get('/api/sessions', (_req, res) => {
  const sessions = sessionManager.getAllSessions();
  const sessionsWithModel = sessions.map(session => {
    return {
      ...session,
      model: agentProvisioner.readAgentModel(session.agentId) || ''
    };
  });
  res.json(sessionsWithModel);
});

app.post('/api/sessions', async (req, res) => {
  const { id, name, soulContent, userContent, agentsContent, toolsContent, heartbeatContent, identityContent, model } = req.body;
  const prompt = soulContent;
  
  if (id && sessionManager.getSession(id)) {
    return res.status(400).json({ success: false, error: 'Agent ID already exists' });
  }

  // Provide basic default for first session if it doesn't exist
  const newSession = sessionManager.createSession({ id, name, prompt });
  const agentId = newSession.id;

  // Provision agent workspace
  await agentProvisioner.provision({ 
    agentId, 
    soulContent: prompt,
    userContent,
    agentsContent,
    toolsContent,
    heartbeatContent,
    identityContent,
    model 
  });
  
  // Update session record with the auto-generated agentId
  sessionManager.updateSession(newSession.id, { agentId });
  const finalSession = sessionManager.getSession(newSession.id);

  res.json({ success: true, session: finalSession });
});

app.put('/api/sessions/:id', async (req, res) => {
  const { name, soulContent, userContent, agentsContent, toolsContent, heartbeatContent, identityContent, model } = req.body;
  const prompt = soulContent;
  const session = sessionManager.getSession(req.params.id);
  
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  const updated = sessionManager.updateSession(req.params.id, { name, prompt });
  
  if (session.agentId) {
    await agentProvisioner.updateSoul(session.agentId, prompt || '');
    if (userContent !== undefined) agentProvisioner.writeAgentFile(session.agentId, 'USER.md', userContent);
    if (agentsContent !== undefined) agentProvisioner.writeAgentFile(session.agentId, 'AGENTS.md', agentsContent);
    if (toolsContent !== undefined) agentProvisioner.writeAgentFile(session.agentId, 'TOOLS.md', toolsContent);
    if (heartbeatContent !== undefined) agentProvisioner.writeAgentFile(session.agentId, 'HEARTBEAT.md', heartbeatContent);
    if (identityContent !== undefined) agentProvisioner.writeAgentFile(session.agentId, 'IDENTITY.md', identityContent);
    
    // Model update might require gateway restart
    const modelChanged = await agentProvisioner.updateModel(session.agentId, model);
    if (modelChanged) {
      // Gateway auto-reloads config
    }
  }

  res.json({ success: true, session: updated });
});

app.delete('/api/sessions/:id', async (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  if (session.id === 'main' || session.agentId === 'main') {
    return res.status(400).json({ success: false, error: 'Cannot delete the main agent session' });
  }

  const agentId = session.agentId;
  const success = sessionManager.deleteSession(req.params.id);
  
  if (success) {
    if (agentId && agentId !== 'main') {
      const configChanged = await agentProvisioner.deprovision(agentId);
      if (configChanged) {
        // Gateway auto-reloads config
      }
    }
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'Session not found' });
  }
});

// Endpoint to fetch all configuring MD files for a given session's agent
app.get('/api/sessions/:id/configs', (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  
  const agentId = session.agentId;
  res.json({
    success: true,
    configs: {
      soulContent: agentProvisioner.readSoul(agentId) || '',
      userContent: agentProvisioner.readAgentFile(agentId, 'USER.md', ''),
      agentsContent: agentProvisioner.readAgentFile(agentId, 'AGENTS.md', ''),
      toolsContent: agentProvisioner.readAgentFile(agentId, 'TOOLS.md', ''),
      heartbeatContent: agentProvisioner.readAgentFile(agentId, 'HEARTBEAT.md', ''),
      identityContent: agentProvisioner.readAgentFile(agentId, 'IDENTITY.md', ''),
      model: agentProvisioner.readAgentModel(agentId)
    }
  });
});

app.post('/api/sessions/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ success: false, error: 'Invalid ids format' });
  }
  sessionManager.reorderSessions(ids);
  res.json({ success: true });
});

app.get('/api/history/:sessionId', (req, res) => {
  const rows = db.getMessages(req.params.sessionId, 200).reverse();
  res.json({ success: true, messages: rows });
});

app.delete('/api/messages/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.deleteMessage(Number(id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function classifyStreamStatus(errorText: string): 'token_insufficient' | 'model_unresponsive' {
  const normalized = (errorText || '').toLowerCase();
  if (
    normalized.includes('token') ||
    normalized.includes('balance') ||
    normalized.includes('quota') ||
    normalized.includes('insufficient') ||
    normalized.includes('额度') ||
    normalized.includes('余额')
  ) {
    return 'token_insufficient';
  }
  return 'model_unresponsive';
}

app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'Missing sessionId or message' });
  }

  try {
    const sessionInfo = sessionManager.getSession(sessionId);
    let finalMessage = String(message);

    if (sessionInfo && sessionInfo.prompt) {
      const history = db.getMessages(sessionId, 1);
      if (history.length === 0) {
        finalMessage = `[System Instructions: ${sessionInfo.prompt}]\n\nUser: ${finalMessage}`;
      }
    }

    db.saveMessage({ session_key: sessionId, role: 'user', content: String(message) });
    const client = await getConnection(sessionId);
    const agentId = sessionInfo?.agentId || 'main';

    // Resolve agent name and model for per-message snapshot
    const allCharacters = db.getCharacters();
    const character = allCharacters.find(c => c.agentId === agentId);
    // Session name is the user-visible name; character.name is just a DB default
    const agentName = sessionInfo?.name || character?.name || agentId;
    const modelUsed = agentProvisioner.readAgentModel(agentId) ||
      agentProvisioner.readAvailableModels().find(m => m.primary)?.id || '';

    const outgoingMessage = rewriteOutgoingMessage(finalMessage, agentId);

    // Set up SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let lastText = '';
    let currentRunId = '';
    let streamSessionKey = '';
    let gotDelta = false;
    let streamEnded = false;
    let streamTimeout: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(streamTimeout);
      client.off('chat.delta', onDelta);
      client.off('chat.final', onFinal);
      client.off('chat.error', onError);
      client.off('disconnected', onDisconnected);
    };

    const resetStreamTimeout = () => {
      clearTimeout(streamTimeout);
      const timeoutMs = gotDelta ? 120000 : 45000;
      streamTimeout = setTimeout(() => {
        if (!streamEnded) {
          streamEnded = true;
          cleanup();
          const errorMsg = lastText ? 'Response interrupted (model stalled).' : 'Model did not respond in time.';
          const rewritten = rewriteOpenClawMediaPaths(lastText || errorMsg);
          db.saveMessage({ session_key: sessionId, role: 'assistant', content: rewritten, model_used: modelUsed, agent_id: agentId, agent_name: agentName });
          res.write(`data: ${JSON.stringify({ type: 'status', code: 'model_unresponsive', text: '模型未响应' })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'final', text: rewritten, status: 'model_unresponsive' })}\n\n`);
          res.end();
        }
      }, timeoutMs);
    };

    const acceptRunEvent = (runId?: string) => {
      if (!runId) return true;
      if (!currentRunId) {
        currentRunId = runId;
        return true;
      }
      return runId === currentRunId;
    };

    const onDelta = (data: { sessionKey: string; runId: string; text: string }) => {
      if (streamEnded) return;
      if (!acceptRunEvent(data.runId)) return;
      gotDelta = true;
      resetStreamTimeout();
      lastText = data.text;
      const rewritten = rewriteOpenClawMediaPaths(data.text);
      res.write(`data: ${JSON.stringify({ type: 'status', code: 'thinking', text: '思考中...' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'delta', text: rewritten })}\n\n`);
    };

    const onFinal = async (data: { sessionKey: string; runId: string; text: string }) => {
      if (streamEnded) return;
      if (!acceptRunEvent(data.runId)) return;
      streamEnded = true;
      cleanup();
      let finalText = data.text || lastText;
      if (!finalText.trim()) {
        const key = data.sessionKey || streamSessionKey;
        if (key) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 160));
            const recovered = await client.fetchLatestAssistantText(key, 30);
            if (recovered.trim()) finalText = recovered;
          } catch {
          }
        }
      }
      const rewritten = rewriteOpenClawMediaPaths(finalText);

      // Save final response to DB
      db.saveMessage({ session_key: sessionId, role: 'assistant', content: rewritten, model_used: modelUsed, agent_id: agentId, agent_name: agentName });

      res.write(`data: ${JSON.stringify({ type: 'final', text: rewritten, status: 'done' })}\n\n`);
      res.end();
    };

    const onError = (data: { sessionKey: string; runId: string; error: string }) => {
      if (streamEnded) return;
      if (!acceptRunEvent(data.runId)) return;
      streamEnded = true;
      cleanup();
      const code = classifyStreamStatus(String(data.error || ''));
      const statusText = code === 'token_insufficient' ? 'token不足' : '模型未响应';
      const errorMsg = `❌ Error: ${data.error}`;
      db.saveMessage({ session_key: sessionId, role: 'assistant', content: errorMsg, model_used: modelUsed, agent_id: agentId, agent_name: agentName });
      res.write(`data: ${JSON.stringify({ type: 'status', code, text: statusText })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'final', text: errorMsg, status: code })}\n\n`);
      res.end();
    };

    const onDisconnected = () => {
      if (streamEnded) return;
      streamEnded = true;
      cleanup();
      const fallback = lastText || 'Model disconnected before finishing the response.';
      const rewritten = rewriteOpenClawMediaPaths(fallback);
      db.saveMessage({ session_key: sessionId, role: 'assistant', content: rewritten, model_used: modelUsed, agent_id: agentId, agent_name: agentName });
      res.write(`data: ${JSON.stringify({ type: 'status', code: 'model_unresponsive', text: '模型未响应' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'final', text: rewritten, status: 'model_unresponsive' })}\n\n`);
      res.end();
    };

    // Listen for streaming events
    client.on('chat.delta', onDelta);
    client.on('chat.final', onFinal);
    client.on('chat.error', onError);
    client.on('disconnected', onDisconnected);

    res.write(`data: ${JSON.stringify({ type: 'status', code: 'waiting', text: '等待' })}\n\n`);
    resetStreamTimeout();

    // Send the message (non-blocking)
    const { runId, sessionKey } = await client.sendChatMessageStreaming({
      sessionKey: sessionId,
      message: outgoingMessage,
      agentId: agentId
    });
    currentRunId = runId;
    streamSessionKey = sessionKey;
    res.write(`data: ${JSON.stringify({ type: 'status', code: 'thinking', text: '思考中...' })}\n\n`);

    // Clean up on client disconnect
    req.on('close', () => {
      streamEnded = true;
      cleanup();
    });

  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      const errorMsg = `❌ Error: ${error.message}`;
      const sessionInfo = db.getSession(sessionId);
      const agentId = sessionInfo?.agentId || 'main';
      const character = db.getCharacters().find(c => c.agentId === agentId);
      const agentName = sessionInfo?.name || character?.name || agentId;
      const modelUsed = agentProvisioner.readAgentModel(agentId) || agentProvisioner.readAvailableModels().find(m => m.primary)?.id || '';
      
      db.saveMessage({ session_key: sessionId, role: 'assistant', content: errorMsg, model_used: modelUsed, agent_id: agentId, agent_name: agentName });
      res.write(`data: ${JSON.stringify({ type: 'final', text: errorMsg })}\n\n`);
      res.end();
    }
  }
});

app.post('/api/chat/silent', async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'Missing sessionId or message' });
  }

  try {
    const client = await getConnection(sessionId);
    const rawResponse = await client.sendChatMessage({ sessionKey: sessionId, message });
    // Rewrite absolute OpenClaw media paths to HTTP-accessible URLs
    const response = rewriteOpenClawMediaPaths(rawResponse);
    // Note: We intentionally DO NOT save to DB here
    res.json({ success: true, response });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// file upload (doc/image/video/audio), supports multiple files
app.post('/api/files/upload', upload.array('files', 20), (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (!files.length) return res.status(400).json({ success: false, error: 'No files uploaded' });

  const sessionId = (req.body?.sessionId as string) || '';
  const saved = files.map((f) => {
    db.saveFile({
      sessionKey: sessionId,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      storedPath: f.path,
    });

    return {
      name: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      url: `/uploads/${path.basename(f.path)}`,
    };
  });

  res.json({
    success: true,
    files: saved,
  });
});

app.get('/api/files', (_req, res) => {
  res.json({ success: true, files: db.getFiles(300) });
});

app.get('/api/commands', (_req, res) => {
  const commands = db.getQuickCommands();
  res.json({ success: true, commands });
});

app.post('/api/commands', (req, res) => {
  const { command, description } = req.body;
  if (!command || !description) return res.status(400).json({ success: false, error: 'Missing command or description' });
  try {
    db.saveQuickCommand(command, description);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/commands/:id', (req, res) => {
  const { command, description } = req.body;
  const { id } = req.params;
  if (!command || !description) return res.status(400).json({ success: false, error: 'Missing command or description' });
  try {
    db.updateQuickCommand(Number(id), command, description);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/commands/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.deleteQuickCommand(Number(id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // 1. Try to find in database (to support agent workspaces)
  const fileInfo = db.getFileByStoredName(filename);
  if (fileInfo && fs.existsSync(fileInfo.stored_path)) {
    return res.sendFile(fileInfo.stored_path);
  }

  // 2. Fallback to global upload dir
  const globalPath = path.join(uploadDir, filename);
  if (fs.existsSync(globalPath)) {
    return res.sendFile(globalPath);
  }

  res.status(404).send('File not found');
});


// Serve OpenClaw files (workspaces, media, etc.)
app.use('/openclaw', express.static(path.join(process.env.HOME || '', '.openclaw')));

// Securely serve arbitrary local files via base64 encoded paths
app.get('/api/files/download', (req, res) => {
  const b64Path = req.query.path as string;
  if (!b64Path) {
    return res.status(400).send('Missing path parameter');
  }

  try {
    const absolutePath = Buffer.from(b64Path, 'base64').toString('utf8');
    
    // Basic security check: ensure it's an absolute path
    if (!path.isAbsolute(absolutePath)) {
      return res.status(403).send('Only absolute paths are allowed');
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).send('File not found');
    }

    const filename = path.basename(absolutePath);
    // Set proper Content-Disposition with UTF-8 filename for correct downloads
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.sendFile(absolutePath);
  } catch (error: any) {
    console.error(`[Download Error] ${error.message}`);
    res.status(500).send('Failed to serve file');
  }
});

// File preview capabilities
app.get('/api/files/capabilities', (_req, res) => {
  res.json({ libreoffice: hasLibreOffice });
});

app.get('/api/files/preview', async (req, res) => {
  try {
    if (!hasLibreOffice) {
      return res.status(501).json({ error: 'LibreOffice not available', fallback: true });
    }

    let absolutePath = '';
    const b64Path = req.query.path as string;
    const filenameParam = req.query.filename as string;

    if (b64Path) {
      absolutePath = Buffer.from(b64Path, 'base64').toString('utf8');
      if (!path.isAbsolute(absolutePath)) {
        return res.status(403).send('Only absolute paths are allowed');
      }
    } else if (filenameParam) {
      // Resolve uploaded file path
      const decodedFilename = decodeURIComponent(filenameParam);
      const fileInfo = db.getFileByStoredName(decodedFilename);
      if (fileInfo && fs.existsSync(fileInfo.stored_path)) {
        absolutePath = fileInfo.stored_path;
      } else {
        const globalPath = path.join(uploadDir, decodedFilename);
        if (fs.existsSync(globalPath)) {
          absolutePath = globalPath;
        }
      }
    }

    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return res.status(404).send('File not found');
    }

    // Create a hash-based cache key
    const crypto = require('crypto');
    const stat = fs.statSync(absolutePath);
    const cacheKey = crypto.createHash('md5').update(`${absolutePath}:${stat.mtimeMs}`).digest('hex');
    const cachedPdf = path.join(previewCacheDir, `${cacheKey}.pdf`);

    // Serve from cache if available
    if (fs.existsSync(cachedPdf)) {
      res.setHeader('Content-Type', 'application/pdf');
      return res.sendFile(cachedPdf);
    }

    // Convert using LibreOffice
    const tmpDir = path.join(previewCacheDir, cacheKey);
    fs.mkdirSync(tmpDir, { recursive: true });

    await execPromise(
      `libreoffice --headless --convert-to pdf --outdir "${tmpDir}" "${absolutePath}"`,
      { timeout: 30000 }
    );

    // Find the output PDF
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.pdf'));
    if (files.length === 0) {
      throw new Error('LibreOffice conversion produced no PDF output');
    }

    const outputPdf = path.join(tmpDir, files[0]);
    // Move to cache location
    fs.renameSync(outputPdf, cachedPdf);
    // Clean up tmp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(cachedPdf);
  } catch (error: any) {
    console.error(`[Preview Error] ${error.message}`);
    res.status(500).json({ error: 'Preview conversion failed', message: error.message });
  }
});

// Serve hashed static assets with long-lived cache (JS/CSS filenames include content hash)
app.use('/assets', express.static(path.join(__dirname, '../../frontend/dist/assets'), {
  maxAge: '1y',
  immutable: true,
}));

// Serve other static files (images, favicon, manifest, etc.) with short cache
app.use(express.static(path.join(__dirname, '../../frontend/dist'), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    // index.html must NEVER be cached by proxies — always revalidate
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

// Fallback for SPA — also no-cache
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// Error handling
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Express error:', err);
  res.status(500).json({ success: false, error: err.message });
});

// Start server
const PORT = Number(process.env.PORT) || 3100;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`ClawUI backend listening on http://0.0.0.0:${PORT}`);
});
