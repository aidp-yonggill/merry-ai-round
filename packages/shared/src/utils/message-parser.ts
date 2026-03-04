const MENTION_REGEX = /@(\w[\w-]*)/g;

export type MentionMatchType = 'slug' | 'name' | 'id';

export interface MentionMatch {
  raw: string;
  agentId: string;
  matchType: MentionMatchType;
}

export interface AgentLookupEntry {
  id: string;
  slug: string;
  name: string;
}

export interface ParsedMessage {
  content: string;
  mentions: string[];        // agent IDs (resolved)
  mentionMatches: MentionMatch[];
}

/**
 * Parse message content for @mentions.
 * If agentLookup is provided, resolves mentions to agent IDs via slug → name → id priority.
 * Without agentLookup, treats raw mention text as potential agent IDs (backward compat).
 */
export function parseMessage(raw: string, agentLookup?: AgentLookupEntry[]): ParsedMessage {
  const mentionMatches: MentionMatch[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(raw)) !== null) {
    const token = match[1].toLowerCase();

    if (!agentLookup) {
      // Legacy mode: treat token as agent ID
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        mentionMatches.push({ raw: match[0], agentId: match[1], matchType: 'id' });
      }
      continue;
    }

    // Priority: slug → name → id
    const bySlug = agentLookup.find(a => a.slug.toLowerCase() === token);
    if (bySlug && !seen.has(bySlug.id)) {
      seen.add(bySlug.id);
      mentionMatches.push({ raw: match[0], agentId: bySlug.id, matchType: 'slug' });
      continue;
    }

    const byName = agentLookup.find(a =>
      a.name.toLowerCase().replace(/\s+/g, '-') === token ||
      a.name.toLowerCase().replace(/\s+/g, '') === token
    );
    if (byName && !seen.has(byName.id)) {
      seen.add(byName.id);
      mentionMatches.push({ raw: match[0], agentId: byName.id, matchType: 'name' });
      continue;
    }

    const byId = agentLookup.find(a => a.id.toLowerCase() === token);
    if (byId && !seen.has(byId.id)) {
      seen.add(byId.id);
      mentionMatches.push({ raw: match[0], agentId: byId.id, matchType: 'id' });
    }
  }

  return {
    content: raw,
    mentions: mentionMatches.map(m => m.agentId),
    mentionMatches,
  };
}
