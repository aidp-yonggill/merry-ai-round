import type { AgentDefinition, ChatMessage } from '@merry/shared';

export class PromptBuilder {
  buildSystemPrompt(agent: AgentDefinition, roomContext?: { name: string; members: string[] }): string {
    const parts: string[] = [];

    // Persona
    parts.push(agent.persona);

    // Room context
    if (roomContext) {
      parts.push(`\n## Current Discussion Room\n- Room: ${roomContext.name}\n- Participants: ${roomContext.members.join(', ')}`);
    }

    // Discussion behavior
    parts.push(`\n## Discussion Guidelines\n- Response style: ${agent.discussion.responseStyle}\n- You ${agent.discussion.initiatesTopics ? 'may' : 'should not'} proactively raise new topics.`);

    if (agent.discussion.mentionsBias.length > 0) {
      parts.push(`- You tend to engage more with: ${agent.discussion.mentionsBias.join(', ')}`);
    }

    // General rules
    parts.push(`\n## Rules\n- Keep responses focused and concise.\n- Reference other participants by @name when responding to or building on their ideas.\n- If you have nothing meaningful to add, say so briefly rather than repeating what's been said.`);

    return parts.join('\n');
  }

  buildTurnPrompt(
    recentMessages: ChatMessage[],
    agentNames: Map<string, string>,
    turnInstruction?: string,
  ): string {
    const parts: string[] = [];

    // Recent conversation
    if (recentMessages.length > 0) {
      parts.push('Recent discussion:');
      for (const msg of recentMessages) {
        const sender = msg.role === 'user'
          ? 'User'
          : agentNames.get(msg.agentId ?? '') ?? msg.agentId ?? 'Unknown';
        parts.push(`[${sender}]: ${msg.content}`);
      }
    }

    // Turn instruction
    if (turnInstruction) {
      parts.push(`\n${turnInstruction}`);
    } else {
      parts.push('\nPlease share your thoughts on the discussion above.');
    }

    return parts.join('\n');
  }
}
