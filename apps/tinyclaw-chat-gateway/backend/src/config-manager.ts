import DB from './db';

interface Config {
  gatewayUrl: string;
  token?: string;
  password?: string;
  defaultAgent?: string;
  language?: 'zh-CN' | 'en';
  aiName?: string;
  loginEnabled?: boolean;
  loginPassword?: string;
  allowedHosts?: string[];
  openclawWorkspace?: string;
}

const DEFAULT_CONFIG: Config = {
  gatewayUrl: 'ws://127.0.0.1:18789',
  defaultAgent: 'main',
  language: 'zh-CN',
  aiName: '我的小龙虾',
  loginEnabled: false,
  loginPassword: '123456',
  allowedHosts: [],
  openclawWorkspace: '',
};

export class ConfigManager {
  private db: DB;

  constructor() {
    this.db = new DB();
  }

  getConfig(): Config {
    const raw = this.db.getConfig('app_config');
    if (!raw) return { ...DEFAULT_CONFIG };
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  setConfig(newConfig: Partial<Config>): void {
    const merged = { ...this.getConfig(), ...newConfig };
    this.db.setConfig('app_config', JSON.stringify(merged));
  }

  getGatewayUrl(): string {
    return this.getConfig().gatewayUrl;
  }

  getAuth(): { token?: string; password?: string } {
    const cfg = this.getConfig();
    return { token: cfg.token, password: cfg.password };
  }
}

export default ConfigManager;
