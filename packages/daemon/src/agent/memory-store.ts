import fs from 'node:fs';
import path from 'node:path';

export interface MemoryFact {
  fact: string;
  source: string;
  timestamp: string;
}

export interface MemoryPreference {
  key: string;
  value: string;
  confidence: number;
}

export class MemoryStore {
  private baseDir: string;

  constructor(dataDir: string) {
    this.baseDir = path.join(dataDir, 'memory');
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private agentDir(agentId: string): string {
    const dir = path.join(this.baseDir, agentId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  getSummary(agentId: string): string {
    const file = path.join(this.agentDir(agentId), 'summary.md');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  }

  saveSummary(agentId: string, summary: string): void {
    fs.writeFileSync(path.join(this.agentDir(agentId), 'summary.md'), summary, 'utf-8');
  }

  getFacts(agentId: string): MemoryFact[] {
    const file = path.join(this.agentDir(agentId), 'facts.json');
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }

  addFact(agentId: string, fact: MemoryFact, options?: { retentionDays?: number; maxEntries?: number }): void {
    let facts = this.getFacts(agentId);
    facts.push(fact);

    // Prune by retention period
    const retentionDays = options?.retentionDays ?? 30;
    const cutoff = Date.now() - retentionDays * 86400_000;
    facts = facts.filter(f => new Date(f.timestamp).getTime() > cutoff);

    // Prune by max entries (keep newest)
    const maxEntries = options?.maxEntries ?? 100;
    if (facts.length > maxEntries) {
      facts = facts.slice(facts.length - maxEntries);
    }

    fs.writeFileSync(
      path.join(this.agentDir(agentId), 'facts.json'),
      JSON.stringify(facts, null, 2),
      'utf-8',
    );
  }

  getPreferences(agentId: string): MemoryPreference[] {
    const file = path.join(this.agentDir(agentId), 'preferences.json');
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }

  getMemoryContext(agentId: string): string {
    const parts: string[] = [];
    const summary = this.getSummary(agentId);
    if (summary) parts.push(`## Memory Summary\n${summary}`);

    const facts = this.getFacts(agentId);
    if (facts.length > 0) {
      parts.push(`## Known Facts\n${facts.map(f => `- ${f.fact}`).join('\n')}`);
    }

    return parts.join('\n\n');
  }
}
