import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { Room, ChatMessage } from '@merry/shared';

export class SqliteStore {
  private db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'merry.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'group',
        turn_strategy TEXT NOT NULL DEFAULT 'round-robin',
        members TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        role TEXT NOT NULL,
        agent_id TEXT,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

      CREATE TABLE IF NOT EXISTS sessions (
        agent_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        session_data TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (agent_id, room_id)
      );

      CREATE TABLE IF NOT EXISTS costs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);

    // Migration: add status column to rooms
    const columns = this.db.pragma('table_info(rooms)') as { name: string }[];
    if (!columns.some(c => c.name === 'status')) {
      this.db.exec(`ALTER TABLE rooms ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
    }
  }

  // -- Rooms --

  saveRoom(room: Room): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO rooms (id, name, type, turn_strategy, members, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(room.id, room.name, room.type, room.turnStrategy, JSON.stringify(room.members), room.status ?? 'active', room.createdAt, room.updatedAt);
  }

  private rowToRoom(row: any): Room {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      turnStrategy: row.turn_strategy,
      members: JSON.parse(row.members),
      status: row.status ?? 'active',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getRoom(id: string): Room | null {
    const row = this.db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToRoom(row);
  }

  getAllRooms(): Room[] {
    const rows = this.db.prepare("SELECT * FROM rooms WHERE status = 'active' ORDER BY updated_at DESC").all() as any[];
    return rows.map(row => this.rowToRoom(row));
  }

  getArchivedRooms(): Room[] {
    const rows = this.db.prepare("SELECT * FROM rooms WHERE status = 'archived' ORDER BY updated_at DESC").all() as any[];
    return rows.map(row => this.rowToRoom(row));
  }

  archiveRoom(id: string): void {
    this.db.prepare("UPDATE rooms SET status = 'archived', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  unarchiveRoom(id: string): void {
    this.db.prepare("UPDATE rooms SET status = 'active', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  deleteRoom(id: string): void {
    this.db.prepare('DELETE FROM costs WHERE room_id = ?').run(id);
    this.db.prepare('DELETE FROM messages WHERE room_id = ?').run(id);
    this.db.prepare('DELETE FROM sessions WHERE room_id = ?').run(id);
    this.db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  }

  // -- Messages --

  saveMessage(msg: ChatMessage): void {
    this.db.prepare(`
      INSERT INTO messages (id, room_id, role, agent_id, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(msg.id, msg.roomId, msg.role, msg.agentId, msg.content, JSON.stringify(msg.metadata), msg.createdAt);
  }

  getMessages(roomId: string, limit = 50, before?: string): ChatMessage[] {
    let query = 'SELECT * FROM messages WHERE room_id = ?';
    const params: any[] = [roomId];

    if (before) {
      query += ' AND created_at < (SELECT created_at FROM messages WHERE id = ?)';
      params.push(before);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.reverse().map(row => ({
      id: row.id,
      roomId: row.room_id,
      role: row.role,
      agentId: row.agent_id,
      content: row.content,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
    }));
  }

  // -- Sessions --

  saveSession(agentId: string, roomId: string, data: Record<string, unknown>): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO sessions (agent_id, room_id, session_data, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(agentId, roomId, JSON.stringify(data), new Date().toISOString());
  }

  getSession(agentId: string, roomId: string): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT session_data FROM sessions WHERE agent_id = ? AND room_id = ?').get(agentId, roomId) as any;
    return row ? JSON.parse(row.session_data) : null;
  }

  // -- Costs --

  recordCost(agentId: string, roomId: string, tokensIn: number, tokensOut: number, costUsd: number): void {
    this.db.prepare(`
      INSERT INTO costs (agent_id, room_id, tokens_in, tokens_out, cost_usd, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(agentId, roomId, tokensIn, tokensOut, costUsd, new Date().toISOString());
  }

  getAgentCumulativeStats(agentId: string): { totalTokens: number; totalCostUsd: number } {
    const row = this.db.prepare(
      'SELECT COALESCE(SUM(tokens_in + tokens_out), 0) as total_tokens, COALESCE(SUM(cost_usd), 0) as total_cost FROM costs WHERE agent_id = ?'
    ).get(agentId) as any;
    return { totalTokens: row.total_tokens, totalCostUsd: row.total_cost };
  }

  getCostSummary(): { totalUsd: number; byAgent: Record<string, number>; byRoom: Record<string, number> } {
    const total = this.db.prepare('SELECT COALESCE(SUM(cost_usd), 0) as total FROM costs').get() as any;
    const byAgent = this.db.prepare('SELECT agent_id, SUM(cost_usd) as total FROM costs GROUP BY agent_id').all() as any[];
    const byRoom = this.db.prepare('SELECT room_id, SUM(cost_usd) as total FROM costs GROUP BY room_id').all() as any[];

    return {
      totalUsd: total.total,
      byAgent: Object.fromEntries(byAgent.map(r => [r.agent_id, r.total])),
      byRoom: Object.fromEntries(byRoom.map(r => [r.room_id, r.total])),
    };
  }

  close(): void {
    this.db.close();
  }
}
