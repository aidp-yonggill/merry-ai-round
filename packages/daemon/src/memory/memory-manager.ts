import fs from 'node:fs';
import path from 'node:path';
import type {
  ShortTermMemory,
  ShortTermTurnEntry,
  LongTermSynthesis,
  CompactedSession,
  AgentDefinition,
} from '@merry/shared';

/**
 * Manages the multi-level memory system for agents.
 *
 * Directory structure:
 *   data/memory/{agentId}/
 *     rules.md
 *     long-term/
 *       synthesis.md
 *       synthesis.json
 *       sessions/{roomId}_{timestamp}.json
 *     short-term/
 *       {roomId}/
 *         context.json
 *         turns.jsonl
 */
export class MemoryManager {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  // ─── Directory helpers ─────────────────────────────

  private agentDir(agentId: string): string {
    return path.join(this.dataDir, 'memory', agentId);
  }

  private longTermDir(agentId: string): string {
    return path.join(this.agentDir(agentId), 'long-term');
  }

  private sessionsDir(agentId: string): string {
    return path.join(this.longTermDir(agentId), 'sessions');
  }

  private shortTermDir(agentId: string, roomId: string): string {
    return path.join(this.agentDir(agentId), 'short-term', roomId);
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // ─── Rules ─────────────────────────────────────────

  getRules(agentId: string): string | null {
    const filePath = path.join(this.agentDir(agentId), 'rules.md');
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  saveRules(agentId: string, content: string): void {
    this.ensureDir(this.agentDir(agentId));
    fs.writeFileSync(path.join(this.agentDir(agentId), 'rules.md'), content, 'utf-8');
  }

  // ─── Short-term Memory ─────────────────────────────

  /**
   * Append a turn entry to the room-specific turns.jsonl file.
   */
  appendTurn(agentId: string, roomId: string, entry: ShortTermTurnEntry): void {
    const dir = this.shortTermDir(agentId, roomId);
    this.ensureDir(dir);
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(path.join(dir, 'turns.jsonl'), line, 'utf-8');
  }

  /**
   * Read all turns for a room.
   */
  getTurns(agentId: string, roomId: string): ShortTermTurnEntry[] {
    const filePath = path.join(this.shortTermDir(agentId, roomId), 'turns.jsonl');
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
    return lines.map(l => JSON.parse(l));
  }

  /**
   * Get the short-term context (findings, token estimate) for a room.
   */
  getShortTermContext(agentId: string, roomId: string): ShortTermMemory {
    const contextPath = path.join(this.shortTermDir(agentId, roomId), 'context.json');
    if (fs.existsSync(contextPath)) {
      return JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
    }
    return {
      agentId,
      roomId,
      turnEntries: [],
      findings: [],
      tokenEstimate: 0,
    };
  }

  /**
   * Save the short-term context.
   */
  saveShortTermContext(agentId: string, roomId: string, context: ShortTermMemory): void {
    const dir = this.shortTermDir(agentId, roomId);
    this.ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'context.json'), JSON.stringify(context, null, 2), 'utf-8');
  }

  /**
   * Add a finding to the short-term context.
   */
  addFinding(agentId: string, roomId: string, finding: string): void {
    const context = this.getShortTermContext(agentId, roomId);
    if (!context.findings.includes(finding)) {
      context.findings.push(finding);
      this.saveShortTermContext(agentId, roomId, context);
    }
  }

  /**
   * Delete short-term memory for a specific room.
   */
  clearShortTermMemory(agentId: string, roomId: string): void {
    const dir = this.shortTermDir(agentId, roomId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // ─── Long-term Memory ──────────────────────────────

  /**
   * Get the long-term synthesis for an agent.
   */
  getLongTermSynthesis(agentId: string): LongTermSynthesis | null {
    const filePath = path.join(this.longTermDir(agentId), 'synthesis.json');
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  /**
   * Get the long-term synthesis as markdown.
   */
  getLongTermMarkdown(agentId: string): string | null {
    const filePath = path.join(this.longTermDir(agentId), 'synthesis.md');
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  /**
   * Save long-term synthesis (both JSON and markdown).
   */
  saveLongTermSynthesis(agentId: string, synthesis: LongTermSynthesis): void {
    const dir = this.longTermDir(agentId);
    this.ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'synthesis.json'), JSON.stringify(synthesis, null, 2), 'utf-8');

    // Also save as markdown for human readability
    const md = this.synthesisToMarkdown(synthesis);
    fs.writeFileSync(path.join(dir, 'synthesis.md'), md, 'utf-8');
  }

  // ─── Compacted Sessions ────────────────────────────

  /**
   * Save a compacted session.
   */
  saveCompactedSession(agentId: string, session: CompactedSession): void {
    const dir = this.sessionsDir(agentId);
    this.ensureDir(dir);
    const filename = `${session.roomId}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * Get all compacted sessions for an agent, optionally filtered by room.
   */
  getCompactedSessions(agentId: string, roomId?: string): CompactedSession[] {
    const dir = this.sessionsDir(agentId);
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const sessions: CompactedSession[] = files.map(f =>
      JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
    );
    if (roomId) {
      return sessions.filter(s => s.roomId === roomId);
    }
    return sessions.sort((a, b) => a.compactedAt.localeCompare(b.compactedAt));
  }

  /**
   * Get sessions that haven't been included in the latest synthesis.
   */
  getUnsynthesizedSessions(agentId: string): CompactedSession[] {
    const synthesis = this.getLongTermSynthesis(agentId);
    const allSessions = this.getCompactedSessions(agentId);
    if (!synthesis) return allSessions;
    return allSessions.filter(s => !synthesis.sourceSessionIds.includes(s.id));
  }

  // ─── System Prompt Building ────────────────────────

  /**
   * Build the full system prompt for an agent in a room.
   * Combines: persona + rules + long-term memory + room context.
   */
  buildSystemPrompt(
    agent: AgentDefinition,
    roomContext?: { name: string; members: string[] },
  ): string {
    const parts: string[] = [];

    // 1. Persona
    parts.push(agent.persona);

    // 2. Rules
    const rules = this.getRules(agent.id);
    if (rules) {
      parts.push(`\n## Agent Rules\n${rules}`);
    }

    // 3. Long-term memory
    const longTermMd = this.getLongTermMarkdown(agent.id);
    if (longTermMd) {
      parts.push(`\n## Your Long-term Memory\n${longTermMd}`);
    }

    // 4. Room context
    if (roomContext) {
      parts.push(`\n## Current Room\n- Room: ${roomContext.name}\n- Participants: ${roomContext.members.join(', ')}`);
    }

    // 5. Behavior guidelines
    parts.push(`\n## Behavior Guidelines\n- Response style: ${agent.behavior.responseStyle}`);
    if (agent.behavior.watchPatterns?.length) {
      parts.push(`- Watch for topics involving: ${agent.behavior.watchPatterns.join(', ')}`);
    }

    // 6. General rules
    parts.push(`\n## Rules\n- Keep responses focused and concise.\n- Reference other participants by @slug when responding to or building on their ideas.\n- If you have nothing meaningful to add, say so briefly rather than repeating what's been said.`);

    return parts.join('\n');
  }

  /**
   * Get the full memory status for an agent (for API).
   */
  getMemoryStatus(agentId: string): {
    rules: string | null;
    longTerm: LongTermSynthesis | null;
    sessions: CompactedSession[];
    shortTermRooms: string[];
  } {
    const rules = this.getRules(agentId);
    const longTerm = this.getLongTermSynthesis(agentId);
    const sessions = this.getCompactedSessions(agentId);

    // List rooms with active short-term memory
    const shortTermBase = path.join(this.agentDir(agentId), 'short-term');
    let shortTermRooms: string[] = [];
    if (fs.existsSync(shortTermBase)) {
      shortTermRooms = fs.readdirSync(shortTermBase).filter(f =>
        fs.statSync(path.join(shortTermBase, f)).isDirectory()
      );
    }

    return { rules, longTerm, sessions, shortTermRooms };
  }

  // ─── Helpers ───────────────────────────────────────

  private synthesisToMarkdown(synthesis: LongTermSynthesis): string {
    const parts: string[] = [];

    parts.push(`# Long-term Memory (v${synthesis.version})`);
    parts.push(`*Last updated: ${synthesis.lastSynthesizedAt}*\n`);

    if (synthesis.narrative) {
      parts.push(`## Narrative\n${synthesis.narrative}\n`);
    }

    if (synthesis.knowledge.length > 0) {
      parts.push('## Knowledge');
      for (const fact of synthesis.knowledge) {
        parts.push(`- [${fact.confidence >= 0.8 ? '✓' : '~'}] ${fact.fact}`);
      }
      parts.push('');
    }

    if (synthesis.relationships.length > 0) {
      parts.push('## Relationships');
      for (const rel of synthesis.relationships) {
        const emoji = rel.sentiment === 'positive' ? '👍' : rel.sentiment === 'negative' ? '👎' : '↔';
        parts.push(`- ${emoji} **${rel.agentId}**: ${rel.relationship}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }
}
