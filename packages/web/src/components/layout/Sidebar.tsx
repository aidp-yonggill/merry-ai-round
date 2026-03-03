'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Hash, Users, Plus, MessageSquare } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const rooms = useStore((s) => s.rooms);
  const setRooms = useStore((s) => s.setRooms);
  const setAgents = useStore((s) => s.setAgents);
  const connected = useStore((s) => s.connected);
  const api = useApiClient();
  const pathname = usePathname();

  useEffect(() => {
    if (!connected) return;
    api.listRooms().then(setRooms).catch(() => {});
    api.listAgents().then(setAgents).catch(() => {});
  }, [connected, api, setRooms, setAgents]);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Rooms
        </span>
        <Link
          href="/rooms/new"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-2">
        {rooms.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            No rooms yet
          </p>
        )}
        {rooms.map((room) => {
          const isActive = pathname === `/rooms/${room.id}`;
          return (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                isActive
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              {room.type === 'group' ? (
                <Hash className="h-4 w-4 shrink-0" />
              ) : (
                <MessageSquare className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{room.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {room.members.length}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        <Link
          href="/agents"
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
            pathname === '/agents'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          )}
        >
          <Users className="h-4 w-4" />
          <span>Agents</span>
        </Link>
      </div>
    </aside>
  );
}
