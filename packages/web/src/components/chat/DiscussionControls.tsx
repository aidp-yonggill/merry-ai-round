'use client';

import { useCallback, useState } from 'react';
import { Play, Pause, Square, SkipForward } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DiscussionControlsProps {
  roomId: string;
}

export function DiscussionControls({ roomId }: DiscussionControlsProps) {
  const discussion = useStore((s) => s.discussionStates.get(roomId));
  const agents = useStore((s) => s.agents);
  const rooms = useStore((s) => s.rooms);
  const api = useApiClient();
  const [loading, setLoading] = useState(false);

  const room = rooms.find((r) => r.id === roomId);
  const memberAgents = agents.filter((a) => room?.members.includes(a.id));
  const status = discussion?.status ?? 'idle';

  const handleAction = useCallback(async (action: () => Promise<unknown>) => {
    setLoading(true);
    try {
      await action();
    } catch {
      // TODO: toast
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={
          status === 'running' ? 'default' :
          status === 'paused' ? 'secondary' :
          'outline'
        }
        className="text-xs"
      >
        {status}
      </Badge>

      {status === 'idle' || status === 'stopped' ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleAction(() => api.startDiscussion(roomId))}
          disabled={loading}
        >
          <Play className="mr-1 h-3 w-3" />
          Start
        </Button>
      ) : status === 'running' ? (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction(() => api.pauseDiscussion(roomId))}
            disabled={loading}
          >
            <Pause className="mr-1 h-3 w-3" />
            Pause
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction(() => api.stopDiscussion(roomId))}
            disabled={loading}
          >
            <Square className="mr-1 h-3 w-3" />
            Stop
          </Button>
        </>
      ) : status === 'paused' ? (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction(() => api.resumeDiscussion(roomId))}
            disabled={loading}
          >
            <Play className="mr-1 h-3 w-3" />
            Resume
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction(() => api.stopDiscussion(roomId))}
            disabled={loading}
          >
            <Square className="mr-1 h-3 w-3" />
            Stop
          </Button>
        </>
      ) : null}

      {/* Assign turn manually */}
      {(status === 'running' || status === 'paused') && memberAgents.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              <SkipForward className="mr-1 h-3 w-3" />
              Assign
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {memberAgents.map((agent) => (
              <DropdownMenuItem
                key={agent.id}
                onClick={() => handleAction(() => api.assignTurn(roomId, { agentId: agent.id }))}
              >
                <span className="mr-2">{agent.definition.avatar}</span>
                {agent.definition.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {discussion && discussion.totalTurns > 0 && (
        <span className="text-xs text-muted-foreground">
          Turn {discussion.totalTurns}
        </span>
      )}
    </div>
  );
}
