'use client';

import { useStore } from '@/lib/store';
import { Separator } from '@/components/ui/separator';
import { DiscussionControls } from './DiscussionControls';

interface RoomHeaderProps {
  roomId: string;
}

export function RoomHeader({ roomId }: RoomHeaderProps) {
  const rooms = useStore((s) => s.rooms);
  const agents = useStore((s) => s.agents);
  const room = rooms.find((r) => r.id === roomId);

  if (!room) return null;

  const memberAgents = agents.filter((a) => room.members.includes(a.id));

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold">{room.name}</h2>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-1">
          {memberAgents.map((agent) => (
            <span
              key={agent.id}
              title={agent.definition.name}
              className="cursor-default text-base"
            >
              {agent.definition.avatar}
            </span>
          ))}
          {memberAgents.length === 0 && (
            <span className="text-xs text-muted-foreground">No agents</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {room.turnStrategy}
        </span>
      </div>
      <DiscussionControls roomId={roomId} />
    </div>
  );
}
