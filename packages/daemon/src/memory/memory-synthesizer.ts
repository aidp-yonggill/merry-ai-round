import { spawn } from 'node:child_process';
import type { LongTermSynthesis, CompactedSession, SynthesizedFact, AgentRelationship } from '@merry/shared';
import type { MemoryManager } from './memory-manager.js';

/**
 * Synthesizes compacted sessions into long-term memory.
 * Uses Claude (sonnet) to merge, deduplicate, and resolve contradictions.
 */
export class MemorySynthesizer {
  private memoryManager: MemoryManager;
  private model: string;
  private cliPath: string;

  constructor(memoryManager: MemoryManager, options?: { model?: string; cliPath?: string }) {
    this.memoryManager = memoryManager;
    this.model = options?.model ?? 'sonnet';
    this.cliPath = options?.cliPath ?? process.env.CLAUDE_CLI_PATH ?? 'claude';
  }

  /**
   * Synthesize unsynthesized sessions into the agent's long-term memory.
   * Returns the updated synthesis or null if nothing to synthesize.
   */
  async synthesize(agentId: string): Promise<LongTermSynthesis | null> {
    const unsynthesized = this.memoryManager.getUnsynthesizedSessions(agentId);
    if (unsynthesized.length === 0) return null;

    const existing = this.memoryManager.getLongTermSynthesis(agentId);

    const newSynthesis = await this.mergeSessions(agentId, existing, unsynthesized);
    this.memoryManager.saveLongTermSynthesis(agentId, newSynthesis);

    return newSynthesis;
  }

  private async mergeSessions(
    agentId: string,
    existing: LongTermSynthesis | null,
    sessions: CompactedSession[],
  ): Promise<LongTermSynthesis> {
    const existingContext = existing
      ? `## Existing Long-term Memory (v${existing.version})

Narrative: ${existing.narrative}

Knowledge:
${existing.knowledge.map(k => `- [${k.confidence}] ${k.fact} (sources: ${k.sources.join(', ')})`).join('\n')}

Relationships:
${existing.relationships.map(r => `- ${r.agentId}: ${r.relationship} (${r.sentiment})`).join('\n')}`
      : 'No existing long-term memory.';

    const sessionsContext = sessions.map(s =>
      `### Session: ${s.roomId} (${s.compactedAt})
Summary: ${s.summary}
Key Takeaways: ${s.keyTakeaways.join('; ')}
Facts: ${s.factsLearned.map(f => `[${f.importance}] ${f.fact}`).join('; ')}`
    ).join('\n\n');

    const prompt = `You are synthesizing an AI agent's long-term memory. Merge existing memory with new session data.

${existingContext}

## New Sessions to Integrate
${sessionsContext}

Rules:
- Deduplicate facts (keep higher confidence version)
- Resolve contradictions (prefer newer information, note the change)
- Update relationships based on interactions
- Keep the narrative concise (300-500 words)
- Confidence scores: 0.0-1.0 (higher = more certain)

Respond ONLY with valid JSON:
{
  "narrative": "Updated narrative summary of all experiences",
  "knowledge": [
    {"fact": "specific fact", "confidence": 0.9, "sources": ["roomId1"], "learnedAt": "ISO date"}
  ],
  "relationships": [
    {"agentId": "agent-id", "relationship": "description", "sentiment": "positive|neutral|negative"}
  ]
}`;

    const result = await this.callClaude(prompt);
    let parsed: { narrative: string; knowledge: SynthesizedFact[]; relationships: AgentRelationship[] };

    try {
      parsed = JSON.parse(result);
    } catch {
      // Fallback: create basic synthesis from sessions
      parsed = {
        narrative: sessions.map(s => s.summary).join(' '),
        knowledge: sessions.flatMap(s => s.factsLearned.map(f => ({
          fact: f.fact,
          confidence: f.importance === 'high' ? 0.9 : f.importance === 'medium' ? 0.7 : 0.5,
          sources: [s.roomId],
          learnedAt: s.compactedAt,
        }))),
        relationships: existing?.relationships ?? [],
      };
    }

    const allSessionIds = [
      ...(existing?.sourceSessionIds ?? []),
      ...sessions.map(s => s.id),
    ];

    return {
      agentId,
      narrative: parsed.narrative,
      knowledge: parsed.knowledge,
      relationships: parsed.relationships,
      version: (existing?.version ?? 0) + 1,
      lastSynthesizedAt: new Date().toISOString(),
      sourceSessionIds: allSessionIds,
    };
  }

  private callClaude(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const MODEL_MAP: Record<string, string> = {
        haiku: 'claude-haiku-4-5',
        sonnet: 'claude-sonnet-4-6',
      };
      const modelId = MODEL_MAP[this.model] ?? MODEL_MAP.sonnet;

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
          reject(new Error(`Claude synthesis failed (code ${code}): ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }
}
