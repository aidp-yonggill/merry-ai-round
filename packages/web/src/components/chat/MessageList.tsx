'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@merry/shared';

const EMPTY_MESSAGES: ChatMessage[] = [];

interface MessageListProps {
  roomId: string;
}

export function MessageList({ roomId }: MessageListProps) {
  const messages = useStore((s) => s.messages.get(roomId) ?? EMPTY_MESSAGES);
  const streamingMessages = useStore((s) => s.streamingMessages);
  const agents = useStore((s) => s.agents);
  const bottomRef = useRef<HTMLDivElement>(null);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingMessages.size]);

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col py-4">
        {messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              No messages yet. Start a conversation or begin a discussion.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            agent={msg.agentId ? agentMap.get(msg.agentId) : undefined}
            streamingContent={streamingMessages.get(msg.id)}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
