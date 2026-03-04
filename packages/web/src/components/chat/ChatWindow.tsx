'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { RoomHeader } from './RoomHeader';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { AgentTypingIndicator } from './AgentTypingIndicator';

interface ChatWindowProps {
  roomId: string;
}

export function ChatWindow({ roomId }: ChatWindowProps) {
  const setMessages = useStore((s) => s.setMessages);
  const setRoomInstances = useStore((s) => s.setRoomInstances);
  const connected = useStore((s) => s.connected);
  const api = useApiClient();

  // Load messages and instance state when room is selected
  useEffect(() => {
    if (!connected) return;

    api.listMessages(roomId).then((res) => {
      setMessages(roomId, res.items);
    }).catch(() => {});

    api.getRoomInstances(roomId).then((instances) => {
      setRoomInstances(roomId, instances);
    }).catch(() => {});
  }, [roomId, connected, api, setMessages, setRoomInstances]);

  return (
    <div className="flex h-full flex-col">
      <RoomHeader roomId={roomId} />
      <MessageList roomId={roomId} />
      <AgentTypingIndicator roomId={roomId} />
      <ChatInput roomId={roomId} />
    </div>
  );
}
