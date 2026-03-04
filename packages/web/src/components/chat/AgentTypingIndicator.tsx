'use client';

import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';

interface AgentTypingIndicatorProps {
  roomId: string;
}

export function AgentTypingIndicator({ roomId }: AgentTypingIndicatorProps) {
  const t = useTranslations('chat');
  const agents = useStore((s) => s.agents);
  const activeAgents = agents.filter(
    (a) => a.currentRoomId === roomId && (a.status === 'thinking' || a.status === 'responding')
  );

  if (activeAgents.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
      {activeAgents.map((agent) => (
        <div key={agent.id} className="flex items-center gap-1.5">
          <span>{agent.definition.avatar}</span>
          <span className="font-medium" style={{ color: agent.definition.color }}>
            {agent.definition.name}
          </span>
          <span>{agent.status === 'thinking' ? t('isThinking') : t('isResponding')}</span>
          <span className="inline-flex gap-0.5">
            <span className="animate-bounce [animation-delay:0ms] text-xs">.</span>
            <span className="animate-bounce [animation-delay:150ms] text-xs">.</span>
            <span className="animate-bounce [animation-delay:300ms] text-xs">.</span>
          </span>
        </div>
      ))}
    </div>
  );
}
