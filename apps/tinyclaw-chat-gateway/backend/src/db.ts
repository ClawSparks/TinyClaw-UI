import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

export type ChatRow = {
  id?: number;
  session_key: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model_used?: string;
  agent_id?: string;
  agent_name?: string;
  created_at?: string;
};

export type SessionRow = {
  id: string;
  name: string;
  prompt?: string;
  agentId: string;
  characterId?: string;
  position: number;
  created_at: number;
  updated_at: number;
};

export type CharacterRow = {
  id: string;
  name: string;
  agentId: string;
  avatar?: string;
  systemPrompt?: string;
  model?: string;
  created_at?: number;
};

export class DB {
  private db: Database.Database;

  constructor() {
    const dataDir = process.env.CLAWUI_DATA_DIR || '.clawui';
    const base = path.join(process.env.HOME || '.', dataDir);
    fs.mkdirSync(base, { recursive: true });
    const dbPath = path.join(base, 'clawui.sqlite');
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_key TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_key TEXT,
        original_name TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        stored_path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS quick_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        prompt TEXT,
        agentId TEXT NOT NULL,
        characterId TEXT,
        position INTEGER DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      );

      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        agentId TEXT NOT NULL,
        avatar TEXT,
        systemPrompt TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert default agents/characters
      INSERT OR IGNORE INTO characters (id, name, agentId, systemPrompt) 
      VALUES ('char_main', '通用助手', 'main', 'You are a helpful AI assistant.');
      
      INSERT OR IGNORE INTO characters (id, name, agentId, systemPrompt) 
      VALUES ('char_coder', '代码专家', 'coder', 'You are an expert software engineer and architect.');

      -- Insert default commands if they don't exist
      INSERT OR IGNORE INTO quick_commands (command, description) VALUES ('/models', '列出模型供应商可进一步变更模型');
      INSERT OR IGNORE INTO quick_commands (command, description) VALUES ('/help', '帮助信息');
      INSERT OR IGNORE INTO quick_commands (command, description) VALUES ('/clear', '清空当前会话');
    `);

    try {
      this.db.exec("ALTER TABLE sessions ADD COLUMN characterId TEXT");
    } catch (e: any) {}

    try {
      this.db.exec("ALTER TABLE sessions ADD COLUMN description TEXT");
    } catch (e: any) {
      // Column already exists, ignore
    }
    
    try {
      this.db.exec("ALTER TABLE sessions ADD COLUMN prompt TEXT");
    } catch (e: any) {}

    try {
      this.db.exec("ALTER TABLE sessions ADD COLUMN position INTEGER DEFAULT 0");
    } catch (e: any) {}

    try {
      this.db.exec("ALTER TABLE characters ADD COLUMN model TEXT");
    } catch (e: any) {}

    // Per-message snapshot columns
    try { this.db.exec("ALTER TABLE chat_messages ADD COLUMN model_used TEXT"); } catch (e: any) {}
    try { this.db.exec("ALTER TABLE chat_messages ADD COLUMN agent_id TEXT"); } catch (e: any) {}
    try { this.db.exec("ALTER TABLE chat_messages ADD COLUMN agent_name TEXT"); } catch (e: any) {}
  }

  // --- Quick Commands ---
  getQuickCommands() {
    return this.db.prepare('SELECT * FROM quick_commands ORDER BY id ASC').all();
  }

  saveQuickCommand(command: string, description: string) {
    return this.db
      .prepare('INSERT INTO quick_commands (command, description) VALUES (?, ?)')
      .run(command, description);
  }

  updateQuickCommand(id: number, command: string, description: string) {
    return this.db
      .prepare('UPDATE quick_commands SET command = ?, description = ? WHERE id = ?')
      .run(command, description, id);
  }

  deleteQuickCommand(id: number) {
    return this.db.prepare('DELETE FROM quick_commands WHERE id = ?').run(id);
  }

  getConfig(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setConfig(key: string, value: string) {
    this.db
      .prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, value);
  }

  saveMessage(row: ChatRow) {
    this.db
      .prepare('INSERT INTO chat_messages (session_key, role, content, model_used, agent_id, agent_name) VALUES (?, ?, ?, ?, ?, ?)')
      .run(row.session_key, row.role, row.content, row.model_used || null, row.agent_id || null, row.agent_name || null);
  }

  deleteMessage(id: number) {
    return this.db.prepare('DELETE FROM chat_messages WHERE id = ?').run(id);
  }

  getMessages(sessionKey: string, limit = 100): ChatRow[] {
    return this.db
      .prepare(
        "SELECT id, session_key, role, content, model_used, agent_id, agent_name, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at FROM chat_messages WHERE session_key = ? ORDER BY id DESC LIMIT ?"
      )
      .all(sessionKey, limit) as ChatRow[];
  }

  saveFile(file: {
    sessionKey?: string;
    originalName: string;
    mimeType?: string;
    size?: number;
    storedPath: string;
  }) {
    this.db
      .prepare('INSERT INTO files (session_key, original_name, mime_type, size, stored_path) VALUES (?, ?, ?, ?, ?)')
      .run(file.sessionKey || null, file.originalName, file.mimeType || null, file.size || 0, file.storedPath);
  }

  getFiles(limit = 200) {
    return this.db
      .prepare('SELECT id, session_key, original_name, mime_type, size, stored_path, created_at FROM files ORDER BY id DESC LIMIT ?')
      .all(limit);
  }

  getFileByStoredName(filename: string) {
    return this.db
      .prepare('SELECT * FROM files WHERE stored_path LIKE ?')
      .get(`%/${filename}`) as any;
  }

  // --- Characters ---
  getCharacters(): CharacterRow[] {
    return this.db.prepare('SELECT * FROM characters ORDER BY created_at ASC').all() as CharacterRow[];
  }

  saveCharacter(char: CharacterRow) {
    this.db
      .prepare('INSERT INTO characters (id, name, agentId, avatar, systemPrompt, model) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, agentId=excluded.agentId, avatar=excluded.avatar, systemPrompt=excluded.systemPrompt, model=excluded.model')
      .run(char.id, char.name, char.agentId, char.avatar || null, char.systemPrompt || null, char.model || null);
  }

  deleteCharacter(id: string) {
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  }

  // --- Sessions ---
  saveSession(session: SessionRow) {
    this.db
      .prepare('INSERT INTO sessions (id, name, prompt, agentId, characterId, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, prompt=excluded.prompt, agentId=excluded.agentId, characterId=excluded.characterId, position=excluded.position, updated_at=excluded.updated_at')
      .run(session.id, session.name, session.prompt || null, session.agentId, session.characterId || null, session.position, session.created_at, session.updated_at);
  }

  getSession(id: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  }

  getSessions(): SessionRow[] {
    return this.db.prepare('SELECT * FROM sessions ORDER BY position ASC, updated_at DESC').all() as SessionRow[];
  }

  updateSessionPositions(orders: { id: string; position: number }[]) {
    const update = this.db.prepare('UPDATE sessions SET position = ? WHERE id = ?');
    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        update.run(item.position, item.id);
      }
    });
    transaction(orders);
  }

  deleteSession(id: string) {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM chat_messages WHERE session_key = ?').run(id);
  }
}

export default DB;
