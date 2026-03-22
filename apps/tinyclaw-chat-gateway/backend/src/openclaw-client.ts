import WebSocket from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';

interface OpenClawConfig {
  gatewayUrl: string;
  token?: string;
  password?: string;
}

type Pending = {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: OpenClawConfig;
  private connected = false;
  private pending = new Map<string, Pending>();
  private connectPromise: Promise<void> | null = null;

  constructor(config: OpenClawConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      const wsUrl = this.config.gatewayUrl.replace(/^http/, 'ws');
      const wsOptions: any = {};
      if (this.config.gatewayUrl.includes('localhost') || this.config.gatewayUrl.includes('127.0.0.1')) {
        wsOptions.headers = { Origin: this.config.gatewayUrl };
      }
      this.ws = new WebSocket(wsUrl, wsOptions);

      const fail = (err: Error) => {
        this.connected = false;
        this.connectPromise = null;
        reject(err);
      };

      this.ws.on('open', () => {
        // wait for connect.challenge event
      });

      this.ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // challenge from gateway
          if (msg.type === 'event' && msg.event === 'connect.challenge') {
            try {
              await this.request('connect', {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: 'openclaw-control-ui',
                  version: 'clawui-backend',
                  mode: 'webchat',
                  platform: process.platform,
                },
                caps: [],
                auth: {
                  token: this.config.token,
                  password: this.config.password,
                },
                role: 'operator',
                scopes: ['operator.admin', 'operator.write', 'operator.read'],
              });

              this.connected = true;
              this.connectPromise = null;
              this.emit('connected');
              resolve();
            } catch (err: any) {
              fail(new Error(err?.message || 'Gateway connect failed'));
            }
            return;
          }

          // response frame
          if (msg.type === 'res' && msg.id) {
            const pending = this.pending.get(msg.id);
            if (!pending) return;
            this.pending.delete(msg.id);
            clearTimeout(pending.timer);

            if (msg.ok) pending.resolve(msg.payload);
            else pending.reject(new Error(msg?.error?.message || 'Request failed'));
            return;
          }

          // Chat streaming events from gateway
          if (msg.type === 'event' && msg.event === 'chat') {
            const payload = msg.payload || msg.data;
            if (!payload) return;

            const state = payload.state; // 'delta' | 'final'
            const sessionKey = payload.sessionKey;
            const text = this.extractChatEventText(payload);
            const runId = payload.runId;

            if (state === 'delta') {
              this.emit('chat.delta', { sessionKey, runId, text });
            } else if (state === 'final') {
              this.emit('chat.final', { sessionKey, runId, text, message: payload.message });
            } else if (state === 'error') {
              // The gateway may send an error state if the LLM request fails dynamically
              this.emit('chat.error', { sessionKey, runId, error: payload.error || text || 'Unknown stream error' });
            }
            return;
          }
        } catch (err: any) {
          this.emit('error', new Error(err?.message || 'Failed to parse message'));
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.connectPromise = null;
        this.emit('disconnected');
      });

      this.ws.on('error', (err) => {
        this.emit('error', err as Error);
        if (!this.connected) fail(err as Error);
      });
    });

    return this.connectPromise;
  }

  private async request(method: string, params?: any, timeoutMs = 60000): Promise<any> {
    if (!this.ws) throw new Error('WebSocket not initialized');

    const id = crypto.randomUUID();
    const frame = { type: 'req', id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timeout`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(frame));
    });
  }

  private extractLatestAssistantText(historyPayload: any): string {
    const messages = Array.isArray(historyPayload?.messages) ? historyPayload.messages : [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role !== 'assistant') continue;
      const content = Array.isArray(m?.content) ? m.content : [];
      const textParts = content
        .filter((c: any) => c?.type === 'text' && typeof c?.text === 'string')
        .map((c: any) => c.text);
      if (textParts.length > 0) return textParts.join('\n');
    }
    return '';
  }

  private extractChatEventText(payload: any): string {
    if (!payload) return '';
    if (typeof payload.text === 'string' && payload.text.trim()) return payload.text;
    const message = payload.message;
    if (!message) return '';
    if (typeof message.text === 'string' && message.text.trim()) return message.text;
    if (typeof message.content === 'string' && message.content.trim()) return message.content;
    const content = Array.isArray(message.content) ? message.content : [];
    const parts = content
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.text === 'string') return item.text;
        if (item && typeof item.content === 'string') return item.content;
        return '';
      })
      .filter((item: string) => item.trim().length > 0);
    return parts.join('\n');
  }

  // Non-blocking: sends message and returns immediately. 
  // Listen on 'chat.delta' and 'chat.final' events for the response.
  async sendChatMessageStreaming(params: {
    sessionKey: string;
    message: string;
    agentId?: string;
  }): Promise<{ runId: string; sessionKey: string }> {
    if (!this.connected) {
      await this.connect();
    }

    const agentId = params.agentId || 'main';
    const finalSessionKey = params.sessionKey.startsWith('agent:') 
      ? params.sessionKey 
      : `agent:${agentId}:chat:${params.sessionKey}`;

    const started = await this.request('chat.send', {
      sessionKey: finalSessionKey,
      message: params.message,
      idempotencyKey: crypto.randomUUID(),
    }, 30000);

    const runId = started?.runId;
    if (!runId) throw new Error('chat.send did not return runId');

    return { runId, sessionKey: finalSessionKey };
  }

  async fetchLatestAssistantText(sessionKey: string, limit = 20): Promise<string> {
    const history = await this.request('chat.history', {
      sessionKey,
      limit,
    }, 30000);
    return this.extractLatestAssistantText(history);
  }

  // Blocking: sends message and waits for full response (legacy)
  async sendChatMessage(params: {
    sessionKey: string;
    message: string;
    agentId?: string;
  }): Promise<string> {
    if (!this.connected) {
      await this.connect();
    }

    const agentId = params.agentId || 'main';
    const finalSessionKey = params.sessionKey.startsWith('agent:') 
      ? params.sessionKey 
      : `agent:${agentId}:chat:${params.sessionKey}`;

    const started = await this.request('chat.send', {
      sessionKey: finalSessionKey,
      message: params.message,
      idempotencyKey: crypto.randomUUID(),
    }, 30000);

    const runId = started?.runId;
    if (!runId) throw new Error('chat.send did not return runId');

    await this.request('agent.wait', { runId, timeoutMs: 90000 }, 95000);

    const history = await this.request('chat.history', {
      sessionKey: finalSessionKey,
      limit: 20,
    }, 30000);

    const text = this.extractLatestAssistantText(history);
    return text || 'No assistant text found in response.';
  }

  async testConnection(): Promise<boolean> {
    if (!this.connected) {
      await this.connect();
    }
    return this.connected;
  }

  disconnect(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('Client disconnected'));
    }
    this.pending.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.connectPromise = null;
  }
}

export default OpenClawClient;
