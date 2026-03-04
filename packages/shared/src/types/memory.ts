/** Short-term turn entry (appended to turns.jsonl per room) */
export interface ShortTermTurnEntry {
  timestamp: string;
  role: 'user' | 'agent' | 'system';
  agentId: string | null;
  content: string;
  tokenEstimate: number;
}

/** Short-term memory for a specific agent in a specific room */
export interface ShortTermMemory {
  agentId: string;
  roomId: string;
  turnEntries: ShortTermTurnEntry[];
  findings: string[];
  tokenEstimate: number;
}

/** A single synthesized fact in long-term memory */
export interface SynthesizedFact {
  fact: string;
  confidence: number;
  sources: string[];
  learnedAt: string;
}

/** Relationship between agents tracked in long-term memory */
export interface AgentRelationship {
  agentId: string;
  relationship: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

/** Long-term synthesis (cross-room, per agent) */
export interface LongTermSynthesis {
  agentId: string;
  narrative: string;
  knowledge: SynthesizedFact[];
  relationships: AgentRelationship[];
  version: number;
  lastSynthesizedAt: string;
  sourceSessionIds: string[];
}

/** A fact extracted during compaction */
export interface CompactedFact {
  fact: string;
  source: string;
  importance: 'high' | 'medium' | 'low';
}

/** Result of compacting a short-term session */
export interface CompactedSession {
  id: string;
  roomId: string;
  agentId: string;
  summary: string;
  keyTakeaways: string[];
  factsLearned: CompactedFact[];
  turnCount: number;
  compactedAt: string;
}
