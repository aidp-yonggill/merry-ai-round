import type { TurnStrategy, ChatMessage } from '@merry/shared';

export class TurnController {
  /**
   * Determine the next agent to speak based on the turn strategy.
   */
  getNextSpeaker(params: {
    strategy: TurnStrategy;
    members: string[];
    lastSpeaker: string | null;
    recentMessages: ChatMessage[];
    assignedAgent?: string;
  }): string | null {
    const { strategy, members, lastSpeaker, assignedAgent } = params;

    if (members.length === 0) return null;

    switch (strategy) {
      case 'round-robin':
        return this.roundRobin(members, lastSpeaker);
      case 'directed':
        return assignedAgent ?? null;
      case 'free-form':
        return this.freeForm(params);
      case 'moderated':
        // For Phase 5 - fallback to round-robin
        return this.roundRobin(members, lastSpeaker);
      default:
        return this.roundRobin(members, lastSpeaker);
    }
  }

  private roundRobin(members: string[], lastSpeaker: string | null): string {
    if (!lastSpeaker) return members[0];
    const idx = members.indexOf(lastSpeaker);
    return members[(idx + 1) % members.length];
  }

  private freeForm(params: {
    members: string[];
    recentMessages: ChatMessage[];
  }): string {
    const { members, recentMessages } = params;

    // Check for @mentions in the last message
    const lastMsg = recentMessages[recentMessages.length - 1];
    if (lastMsg?.metadata.mentions) {
      for (const mention of lastMsg.metadata.mentions) {
        if (members.includes(mention)) {
          return mention;
        }
      }
    }

    // Pick the agent who spoke least recently
    const lastSpoken = new Map<string, number>();
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      if (msg.agentId && members.includes(msg.agentId) && !lastSpoken.has(msg.agentId)) {
        lastSpoken.set(msg.agentId, i);
      }
    }

    // Return the member who hasn't spoken, or spoke longest ago
    let bestAgent = members[0];
    let bestScore = Infinity;
    for (const m of members) {
      const score = lastSpoken.get(m) ?? -1;
      if (score < bestScore) {
        bestScore = score;
        bestAgent = m;
      }
    }

    return bestAgent;
  }
}
