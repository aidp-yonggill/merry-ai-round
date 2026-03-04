'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@merry/shared';

const EMPTY_MESSAGES: ChatMessage[] = [];
const PAGE_SIZE = 50;

interface MessageListProps {
  roomId: string;
}

export function MessageList({ roomId }: MessageListProps) {
  const t = useTranslations('chat');
  const messages = useStore((s) => s.messages.get(roomId) ?? EMPTY_MESSAGES);
  const setMessages = useStore((s) => s.setMessages);
  // Subscribe to size changes to trigger re-renders (actual data read via getState())
  const streamingSize = useStore((s) => s.streamingMessages.size);
  const toolBlocksSize = useStore((s) => s.activeToolBlocks.size);
  void toolBlocksSize; // reactive subscription only
  const agents = useStore((s) => s.agents);
  const api = useApiClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const cursorRef = useRef<string | undefined>(undefined);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);

  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoadingOlder(true);
    try {
      const res = await api.listMessages(roomId, PAGE_SIZE, cursorRef.current);
      if (res.items.length > 0) {
        cursorRef.current = res.nextCursor;
        hasMoreRef.current = res.hasMore;
        setHasMore(res.hasMore);
        // Prepend older messages
        const current = useStore.getState().messages.get(roomId) ?? [];
        const existingIds = new Set(current.map((m) => m.id));
        const newItems = res.items.filter((m) => !existingIds.has(m.id));
        if (newItems.length > 0) {
          setMessages(roomId, [...newItems, ...current]);
        }
      } else {
        hasMoreRef.current = false;
        setHasMore(false);
      }
    } catch {
      // silently fail, user can scroll up again
    } finally {
      loadingRef.current = false;
      setLoadingOlder(false);
    }
  }, [api, roomId, setMessages]);

  // Reset pagination state when room changes
  useEffect(() => {
    hasMoreRef.current = true;
    loadingRef.current = false;
    setHasMore(true);
    cursorRef.current = undefined;
  }, [roomId]);

  // Intersection Observer for infinite scroll (top sentinel)
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadOlderMessages();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlderMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    bottomRef.current?.scrollIntoView({ behavior: isMobile ? 'auto' : 'smooth' });
  }, [messages.length, streamingSize]);

  return (
    <ScrollArea className="flex-1 min-h-0 [&>div]:touch-pan-y [&>div]:overscroll-contain">
      <div ref={scrollContainerRef} className="flex flex-col py-2 md:py-4">
        {/* Top sentinel for infinite scroll */}
        {hasMore && (
          <div ref={topSentinelRef} className="flex justify-center py-2">
            {loadingOlder && (
              <span className="text-xs text-muted-foreground">{t('loadingMore', { defaultMessage: 'Loading...' })}</span>
            )}
          </div>
        )}

        {messages.length === 0 && !loadingOlder && (
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
            streamingContent={useStore.getState().streamingMessages.get(msg.id)}
            activeToolBlocks={useStore.getState().activeToolBlocks.get(msg.id)}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
