import fs from 'fs';
import path from 'path';
import os from 'os';

const DEFAULT_USER_MD = `# User Profile

- 语言偏好：中文
- 称呼方式：随意
`;

const DEFAULT_AGENTS_MD = `# Agent Instructions

- 遵循 SOUL.md 中定义的人格设定
- 使用 memory/ 目录记录重要信息
- 保持角色一致性
`;

export interface ProvisionOptions {
  agentId: string;
  soulContent?: string;
  userContent?: string;
  agentsContent?: string;
  toolsContent?: string;
  heartbeatContent?: string;
  identityContent?: string;
  model?: string;  // e.g. "openai/gpt-5.2" or "ark/glm-4.7"
}

export class AgentProvisioner {
  private openclawDir: string;

  constructor() {
    this.openclawDir = path.join(os.homedir(), '.openclaw');
  }

  /**
   * Slugify a name to be used as a directory and agent ID
   */
  slugify(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '_')
      .replace(/^-+|-+$/g, '');
    
    // Fallback if slug is empty (e.g. only Chinese characters)
    return slug || `agent_${Date.now().toString(36)}`;
  }

  /**
   * Get the workspace path for a given agentId.
   * Rule: agent "abc" uses "workspace-abc". No special cases.
   */
  getWorkspacePath(agentId: string): string {
    return path.join(this.openclawDir, `workspace-${agentId}`);
  }

  /**
   * Ensure the 'main' agent has its workspace path registered in openclaw.json.
   * Called at application startup so that the OpenClaw engine also picks up
   * the correct workspace-main/ path instead of the default workspace/.
   */
  ensureMainAgent(): boolean {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return false;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.agents) config.agents = {};
    if (!config.agents.list) config.agents.list = [];

    const workspaceDir = this.getWorkspacePath('main');
    const existing = config.agents.list.find((a: any) => a.id === 'main');

    if (existing) {
      if (existing.workspace === workspaceDir) return false; // already correct
      existing.workspace = workspaceDir;
    } else {
      config.agents.list.push({ id: 'main', workspace: workspaceDir });
    }

    // Ensure the workspace directory exists
    fs.mkdirSync(workspaceDir, { recursive: true });

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`[AgentProvisioner] Registered main agent workspace: ${workspaceDir}`);
    return true;
  }

  /**
   * Provision a fully isolated agent environment in OpenClaw.
   * 
   * Creates:
   * - Independent workspace with SOUL.md, USER.md, AGENTS.md, memory/
   * - Agent entry in openclaw.json agents.list[]
   * - Copies auth-profiles.json from main agent for credential inheritance
   */
  async provision(opts: ProvisionOptions): Promise<boolean> {
    try {
      if (!fs.existsSync(this.openclawDir)) {
        console.error('OpenClaw directory not found at', this.openclawDir);
        return false;
      }


      const workspaceDir = this.getWorkspacePath(opts.agentId);
      const agentDir = path.join(this.openclawDir, 'agents', opts.agentId, 'agent');
      const memoryDir = path.join(workspaceDir, 'memory');
      
      // 1. Create workspace directory structure
      fs.mkdirSync(workspaceDir, { recursive: true });
      fs.mkdirSync(memoryDir, { recursive: true });
      fs.mkdirSync(agentDir, { recursive: true });

      // 2. Write workspace files
      const writeFileSafe = (filename: string, content: string | undefined, defaultContent?: string) => {
        const filePath = path.join(workspaceDir, filename);
        if (content !== undefined) {
          fs.writeFileSync(filePath, content);
        } else if (defaultContent !== undefined && !fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, defaultContent);
        }
      };

      writeFileSafe('SOUL.md', opts.soulContent, '# Agent\nDefault identity.');
      writeFileSafe('USER.md', opts.userContent, '# User Profile\n\n- 语言偏好：中文\n- 称呼方式：随意\n');
      writeFileSafe('AGENTS.md', opts.agentsContent, '# Agent Instructions\n\n- 遵循 SOUL.md 中定义的人格设定\n- 使用 memory/ 目录记录重要信息\n- 保持角色一致性\n');
      writeFileSafe('TOOLS.md', opts.toolsContent);
      writeFileSafe('HEARTBEAT.md', opts.heartbeatContent);
      writeFileSafe('IDENTITY.md', opts.identityContent);

      // 3. Copy auth-profiles.json from main agent for credential inheritance
      const mainAuthPath = path.join(this.openclawDir, 'agents', 'main', 'agent', 'auth-profiles.json');
      const agentAuthPath = path.join(agentDir, 'auth-profiles.json');
      if (fs.existsSync(mainAuthPath) && !fs.existsSync(agentAuthPath)) {
        fs.copyFileSync(mainAuthPath, agentAuthPath);
      }

      // 4. Update openclaw.json agents.list[]
      const configChanged = this.updateConfigList(opts.agentId, workspaceDir, opts.model);

      console.log(`[AgentProvisioner] Provisioned agent "${opts.agentId}" at ${workspaceDir}`);
      return configChanged;
    } catch (error) {
      console.error('Failed to provision agent:', error);
      return false;
    }
  }

  /**
   * Remove an agent from openclaw.json agents.list[]
   * Also removes the workspace directory and agent state directory.
   */
  async deprovision(agentId: string): Promise<boolean> {
    try {
      if (agentId === 'main') return false;

      const configPath = path.join(this.openclawDir, 'openclaw.json');
      if (!fs.existsSync(configPath)) return false;

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      let configChanged = false;
      if (config.agents?.list && Array.isArray(config.agents.list)) {
        const before = config.agents.list.length;
        config.agents.list = config.agents.list.filter(
          (a: any) => a.id !== agentId
        );
        if (config.agents.list.length < before) {
          configChanged = true;
          // If list is empty, remove it entirely to keep config clean
          if (config.agents.list.length === 0) {
            delete config.agents.list;
          }
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        }
      }

      // Clean up workspace directory
      const workspaceDir = this.getWorkspacePath(agentId);
      if (fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
        console.log(`[AgentProvisioner] Removed workspace ${workspaceDir}`);
      }

      // Clean up agent state directory
      const agentStateDir = path.join(this.openclawDir, 'agents', agentId);
      if (fs.existsSync(agentStateDir)) {
        fs.rmSync(agentStateDir, { recursive: true, force: true });
        console.log(`[AgentProvisioner] Removed agent state ${agentStateDir}`);
      }

      console.log(`[AgentProvisioner] Deprovisioned agent "${agentId}"`);
      return configChanged;
    } catch (error) {
      console.error('Failed to deprovision agent:', error);
      return false;
    }
  }

  /**
   * Update SOUL.md for an existing agent.
   */
  async updateSoul(agentId: string, soulContent: string): Promise<void> {
    const workspaceDir = this.getWorkspacePath(agentId);
    const soulPath = path.join(workspaceDir, 'SOUL.md');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(soulPath, soulContent || '# Agent\nDefault identity.');
  }

  /**
   * Read SOUL.md content for a given agent.
   */
  readSoul(agentId: string): string | null {
    const workspaceDir = this.getWorkspacePath(agentId);
    const soulPath = path.join(workspaceDir, 'SOUL.md');
    if (fs.existsSync(soulPath)) {
      return fs.readFileSync(soulPath, 'utf-8');
    }
    return null;
  }

  /**
   * Read available models from openclaw.json agents.defaults.models
   * Returns an array of { id: "provider/modelId", alias?: string, primary: boolean }
   */
  readAvailableModels(): { id: string; alias?: string; primary: boolean }[] {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return [];

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const modelsMap = config?.agents?.defaults?.models;
      const primaryModel = config?.agents?.defaults?.model?.primary;
      if (!modelsMap || typeof modelsMap !== 'object') return [];

      return Object.entries(modelsMap).map(([id, meta]: [string, any]) => ({
        id,
        alias: meta?.alias || undefined,
        primary: id === primaryModel,
      }));
    } catch (err) {
      console.error('Failed to read models from openclaw.json:', err);
      return [];
    }
  }

  /**
   * Add a new model to openclaw.json
   */
  async addModelConfig(endpoint: string, modelName: string, alias?: string): Promise<boolean> {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return false;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.models) config.agents.defaults.models = {};

    const modelId = `${endpoint}/${modelName}`;
    if (config.agents.defaults.models[modelId]) {
      // Model already exists
      return false;
    }

    config.agents.defaults.models[modelId] = alias ? { alias } : {};
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  }

  /**
   * Delete a model from openclaw.json and fallback agents using it to default
   */
  async deleteModelConfig(modelId: string): Promise<boolean> {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return false;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.agents?.defaults?.models?.[modelId]) {
      return false; // Model doesn't exist
    }

    // 1. Remove the model definition
    delete config.agents.defaults.models[modelId];

    // 2. Handle primary model fallback
    if (config.agents.defaults.model?.primary === modelId) {
      // Choose the first available model as the new primary, or delete it
      const remainingModels = Object.keys(config.agents.defaults.models);
      if (remainingModels.length > 0) {
        config.agents.defaults.model.primary = remainingModels[0];
      } else {
        delete config.agents.defaults.model.primary;
      }
    }

    // 3. Fallback agents that were using this model (deleting their 'model' falls back to default)
    if (Array.isArray(config.agents.list)) {
      config.agents.list.forEach((agent: any) => {
        if (agent.model === modelId) {
          delete agent.model;
        }
      });
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  }

  /**
   * Set a model as the default (primary) model in openclaw.json
   */
  async setDefaultModel(modelId: string): Promise<boolean> {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return false;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.model) config.agents.defaults.model = {};

    // Validate if the model actually exists
    if (!config.agents.defaults.models?.[modelId]) {
      return false;
    }

    config.agents.defaults.model.primary = modelId;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  }

  /**
   * Update a model's alias in openclaw.json
   */
  async updateModelConfig(modelId: string, alias?: string): Promise<boolean> {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return false;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.agents?.defaults?.models?.[modelId]) {
      return false; // Model doesn't exist
    }

    // Update (or clear) alias
    if (alias && alias.trim()) {
      config.agents.defaults.models[modelId] = { ...config.agents.defaults.models[modelId], alias: alias.trim() };
    } else {
      // Clear alias
      const { alias: _removed, ...rest } = config.agents.defaults.models[modelId];
      config.agents.defaults.models[modelId] = rest;
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  }

  /**
   * Delete all models under a given endpoint in openclaw.json, and the endpoint itself
   */
  async deleteEndpointConfig(endpoint: string): Promise<number> {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return 0;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    let deletedCount = 0;

    // 1. Delete associated models
    if (config.agents?.defaults?.models) {
      const prefix = `${endpoint}/`;
      const toDelete = Object.keys(config.agents.defaults.models).filter(id => id.startsWith(prefix));
      
      for (const modelId of toDelete) {
        delete config.agents.defaults.models[modelId];
        deletedCount++;
      }

      // Handle primary model fallback
      const primary = config.agents?.defaults?.model?.primary;
      if (primary && toDelete.includes(primary)) {
        const remaining = Object.keys(config.agents.defaults.models);
        if (remaining.length > 0) {
          config.agents.defaults.model.primary = remaining[0];
        } else {
          delete config.agents.defaults.model.primary;
        }
      }

      // Fallback agents using any deleted model
      if (Array.isArray(config.agents.list)) {
        config.agents.list.forEach((agent: any) => {
          if (toDelete.includes(agent.model)) {
            delete agent.model;
          }
        });
      }
    }

    // 2. Delete the endpoint provider definition itself
    if (config.models?.providers?.[endpoint]) {
      delete config.models.providers[endpoint];
      deletedCount++; // Ensure count > 0 to signal success
    }

    if (deletedCount > 0) {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
    
    return deletedCount;
  }

  /**
   * Get the list of all defined endpoints in openclaw.json
   */
  getEndpoints(): any[] {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return [];

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const providers = config?.models?.providers;
      if (!providers || typeof providers !== 'object') return [];

      return Object.entries(providers).map(([id, meta]: [string, any]) => ({
        id,
        baseUrl: meta?.baseUrl || '',
        apiKey: meta?.apiKey || '',
        api: meta?.api || 'openai-completions',
      }));
    } catch (err) {
      console.error('Failed to read endpoints from openclaw.json:', err);
      return [];
    }
  }

  /**
   * Add or update an endpoint provider in openclaw.json
   */
  async saveEndpoint(id: string, endpointConfig: { baseUrl: string, apiKey: string, api: string }): Promise<boolean> {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return false;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.models) config.models = {};
    if (!config.models.providers) config.models.providers = {};

    const existing = config.models.providers[id];
    config.models.providers[id] = {
      ...existing, // preserve existing models array or other metadata
      baseUrl: endpointConfig.baseUrl.trim(),
      apiKey: endpointConfig.apiKey.trim(),
      api: endpointConfig.api,
      models: existing?.models || []
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  }

  /**
   * Update the model for an existing agent in openclaw.json
   * For 'main' agent: updates agents.defaults.model.primary
   * For other agents: updates agents.list[].model
   */
  async updateModel(agentId: string, model?: string): Promise<boolean> {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return false;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (agentId === 'main') {
      // Main agent uses agents.defaults.model.primary
      if (!config.agents) config.agents = {};
      if (!config.agents.defaults) config.agents.defaults = {};
      if (!config.agents.defaults.model) config.agents.defaults.model = {};

      const current = config.agents.defaults.model.primary;
      if (model) {
        if (current === model) return false;
        config.agents.defaults.model.primary = model;
      } else {
        return false; // Don't clear the main agent's model
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return true;
    }

    // Non-main agents: update in agents.list[]
    if (!config.agents?.list || !Array.isArray(config.agents.list)) return false;

    const entry = config.agents.list.find((a: any) => a.id === agentId);
    if (!entry) return false;

    if (model) {
      if (entry.model === model) return false;
      entry.model = model;
    } else {
      if (!entry.model) return false;
      delete entry.model;
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  }

  /**
   * Read the actual model configured for an agent from openclaw.json
   * For 'main': reads agents.defaults.model.primary
   * For others: reads agents.list[].model (or falls back to default primary)
   */
  readAgentModel(agentId: string): string | null {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return null;

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const defaultModel = config?.agents?.defaults?.model?.primary || null;

      if (agentId === 'main') {
        return defaultModel;
      }

      // Check agent-specific model in list
      if (config.agents?.list && Array.isArray(config.agents.list)) {
        const entry = config.agents.list.find((a: any) => a.id === agentId);
        if (entry?.model) return entry.model;
      }

      return defaultModel;
    } catch {
      return null;
    }
  }


  /**
   * Generic reader for any .md file in the agent workspace
   */
  readAgentFile(agentId: string, filename: string, defaultContent: string = ''): string {
    const workspaceDir = this.getWorkspacePath(agentId);
    const filePath = path.join(workspaceDir, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return defaultContent;
  }

  /**
   * Generic writer for any .md file in the agent workspace
   */
  writeAgentFile(agentId: string, filename: string, content: string): void {
    const workspaceDir = this.getWorkspacePath(agentId);
    fs.mkdirSync(workspaceDir, { recursive: true });
    const filePath = path.join(workspaceDir, filename);
    fs.writeFileSync(filePath, content);
  }

  /**
   * Read USER.md content for a given agent. (kept for backwards compat)
   */
  readUserMd(agentId: string): string {
    return this.readAgentFile(agentId, 'USER.md', DEFAULT_USER_MD);
  }

  /**
   * Write USER.md content for a given agent. (kept for backwards compat)
   */
  writeUserMd(agentId: string, content: string): void {
    this.writeAgentFile(agentId, 'USER.md', content);
  }

  /**
   * Add or update agent entry in openclaw.json agents.list[]
   */
  private updateConfigList(agentId: string, workspaceDir: string, model?: string): boolean {
    const configPath = path.join(this.openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return false;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!config.agents) config.agents = {};
    if (!config.agents.list) config.agents.list = [];

    const existing = config.agents.list.find((a: any) => a.id === agentId);
    if (existing) {
      let changed = false;
      if (existing.workspace !== workspaceDir) {
        existing.workspace = workspaceDir;
        changed = true;
      }
      if (model && existing.model !== model) {
        existing.model = model;
        changed = true;
      } else if (!model && existing.model) {
        delete existing.model;
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      }
      return changed;
    }

    // Add new agent entry
    const entry: any = { id: agentId, workspace: workspaceDir };
    if (model) entry.model = model;
    config.agents.list.push(entry);

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  }
}

export default AgentProvisioner;
