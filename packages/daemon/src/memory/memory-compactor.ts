import { spawn } from 'node:child_process';
import { nanoid } from 'nanoid';
import type { ShortTermTurnEntry, CompactedSession, CompactedFact } from '@merry/shared';
import type { MemoryManager } from './memory-manager.js';

const CHUNK_SIZE = 20; // Turns per chunk for summarization

/**
 * Compacts short-term memory into a CompactedSession.
 * Uses Claude CLI (haiku) to generate structured summaries.
 */
export class MemoryCompactor {
  private memoryManager: MemoryManager;
  private model: string;
  private cliPath: string;

  constructor(memoryManager: MemoryManager, options?: { model?: string; cliPath?: string }) {
    this.memoryManager = memoryManager;
    this.model = options?.model ?? 'haiku';
    this.cliPath = options?.cliPath ?? process.env.CLAUDE_CLI_PATH ?? 'claude';
  }

  /**
   * Compact short-term memory for an agent in a room.
   * Returns the CompactedSession or null if nothing to compact.
   */
  async compact(agentId: string, roomId: string): Promise<CompactedSession | null> {
    const turns = this.memoryManager.getTurns(agentId, roomId);
    if (turns.length === 0) return null;

    const context = this.memoryManager.getShortTermContext(agentId, roomId);

    // For large turn logs, chunk and summarize
    let summary: string;
    let keyTakeaways: string[];
    let factsLearned: CompactedFact[];

    if (turns.length <= CHUNK_SIZE * 2) {
      // Small enough to summarize in one pass
      const result = await this.summarizeTurns(turns, context.findings);
      summary = result.summary;
      keyTakeaways = result.keyTakeaways;
      factsLearned = result.factsLearned;
    } else {
      // Chunk into groups and summarize each, then merge
      const chunks = this.chunkArray(turns, CHUNK_SIZE);
      const chunkSummaries: string[] = [];

      for (const chunk of chunks) {
        const result = await this.summarizeTurns(chunk, []);
        chunkSummaries.push(result.summary);
      }

      // Final merge summary
      const mergeResult = await this.mergeSummaries(chunkSummaries, context.findings);
      summary = mergeResult.summary;
      keyTakeaways = mergeResult.keyTakeaways;
      factsLearned = mergeResult.factsLearned;
    }

    const session: CompactedSession = {
      id: nanoid(),
      roomId,
      agentId,
      summary,
      keyTakeaways,
      factsLearned,
      turnCount: turns.length,
      compactedAt: new Date().toISOString(),
    };

    // Save and cleanup
    this.memoryManager.saveCompactedSession(agentId, session);
    this.memoryManager.clearShortTermMemory(agentId, roomId);

    return session;
  }

  private async summarizeTurns(
    turns: ShortTermTurnEntry[],
    findings: string[],
  ): Promise<{ summary: string; keyTakeaways: string[]; factsLearned: CompactedFact[] }> {
    const conversationText = turns.map(t => {
      const role = t.agentId ? `Agent(${t.agentId})` : t.role;
      return `[${role}]: ${t.content.slice(0, 500)}`;
    }).join('\n');

    const findingsText = findings.length > 0
      ? `\n\nKey findings during this session:\n${findings.map(f => `- ${f}`).join('\n')}`
      : '';

    const prompt = `Summarize this conversation session into a structured JSON format.

Conversation (${turns.length} turns):
${conversationText}
${findingsText}

Respond ONLY with valid JSON in this exact format:
{
  "summary": "2-3 sentence overview of the conversation",
  "keyTakeaways": ["takeaway1", "takeaway2", "takeaway3"],
  "factsLearned": [
    {"fact": "specific fact learned", "source": "from conversation context", "importance": "high|medium|low"}
  ]
}`;

    const result = await this.callClaude(prompt);
    try {
      return JSON.parse(result);
    } catch {
      // Fallback if JSON parsing fails
      return {
        summary: result.slice(0, 500),
        keyTakeaways: findings.slice(0, 5),
        factsLearned: [],
      };
    }
  }

  private async mergeSummaries(
    summaries: string[],
    findings: string[],
  ): Promise<{ summary: string; keyTakeaways: string[]; factsLearned: CompactedFact[] }> {
    const prompt = `Merge these conversation chunk summaries into one cohesive summary.

Chunk summaries:
${summaries.map((s, i) => `[Chunk ${i + 1}]: ${s}`).join('\n\n')}

Session findings:
${findings.map(f => `- ${f}`).join('\n')}

Respond ONLY with valid JSON:
{
  "summary": "2-3 sentence overview of the full conversation",
  "keyTakeaways": ["takeaway1", "takeaway2", "takeaway3"],
  "factsLearned": [
    {"fact": "specific fact", "source": "from context", "importance": "high|medium|low"}
  ]
}`;

    const result = await this.callClaude(prompt);
    try {
      return JSON.parse(result);
    } catch {
      return {
        summary: summaries.join(' '),
        keyTakeaways: findings.slice(0, 5),
        factsLearned: [],
      };
    }
  }

  private callClaude(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const MODEL_MAP: Record<string, string> = {
        haiku: 'claude-haiku-4-5',
        sonnet: 'claude-sonnet-4-6',
      };
      const modelId = MODEL_MAP[this.model] ?? MODEL_MAP.haiku;

      const proc = spawn(this.cliPath, [
        '--print',
        '--model', modelId,
        '--max-turns', '1',
        '--permission-mode', 'bypassPermissions',
        '--dangerously-skip-permissions',
        '-p', prompt,
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CLAUDECODE: undefined },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Claude compaction failed (code ${code}): ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
