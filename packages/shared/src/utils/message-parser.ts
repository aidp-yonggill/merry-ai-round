const MENTION_REGEX = /@(\w[\w-]*)/g;

export interface ParsedMessage {
  content: string;
  mentions: string[];
}

export function parseMessage(raw: string): ParsedMessage {
  const mentions: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = MENTION_REGEX.exec(raw)) !== null) {
    mentions.push(match[1]);
  }

  return {
    content: raw,
    mentions: [...new Set(mentions)],
  };
}
