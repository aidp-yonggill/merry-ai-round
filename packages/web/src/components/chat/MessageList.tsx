'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@merry/shared';

const EMPTY_MESSAGES: ChatMessage[] = [];

interface MessageListProps {
  roomId: string;
}

export function MessageList({ roomId }: MessageListProps) {
  const t = useTranslations('chat');
  const messages = useStore((s) => s.messages.get(roomId) ?? EMPTY_MESSAGES);
  const streamingMessages = useStore((s) => s.streamingMessages);
  const activeToolBlocks = useStore((s) => s.activeToolBlocks);
  const agents = useStore((s) => s.agents);
  const bottomRef = useRef<HTMLDivElement>(null);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    bottomRef.current?.scrollIntoView({ behavior: isMobile ? 'auto' : 'smooth' });
  }, [messages.length, streamingMessages.size]);

  return (
    <ScrollArea className="flex-1 min-h-0 [&>div]:touch-pan-y [&>div]:overscroll-contain">
      <div className="flex flex-col py-2 md:py-4">
        {messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              {t('noMessages')}
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            agent={msg.agentId ? agentMap.get(msg.agentId) : undefined}
            streamingContent={streamingMessages.get(msg.id)}
            activeToolBlocks={activeToolBlocks.get(msg.id)}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
