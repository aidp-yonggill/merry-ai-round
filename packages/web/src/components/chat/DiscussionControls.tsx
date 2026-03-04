'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Play, Square, Loader2, AlertCircle } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { Button } from '@/components/ui/button';
import type { AgentInstanceInfo } from '@merry/shared';

const EMPTY_INSTANCES: AgentInstanceInfo[] = [];

interface ChannelAgentControlsProps {
  roomId: string;
}

export function ChannelAgentControls({ roomId }: ChannelAgentControlsProps) {
  const t = useTranslations('agents');
  const instances = useStore((s) => s.agentInstances.get(roomId) ?? EMPTY_INSTANCES);
  const agents = useStore((s) => s.agents);
  const rooms = useStore((s) => s.rooms);
  const api = useApiClient();
  const [loadingAgent, setLoadingAgent] = useState<string | null>(null);

  const room = rooms.find((r) => r.id === roomId);
  const memberAgents = agents.filter((a) => room?.members.includes(a.id));

  const getInstanceForAgent = (agentId: string): AgentInstanceInfo | undefined =>
    instances.find((i) => i.agentId === agentId);

  const handleStartAgent = useCallback(async (agentId: string) => {
    setLoadingAgent(agentId);
    try {
      await api.startAgentInRoom(roomId, agentId);
    } catch (err) {
      console.error('Failed to start agent:', err);
    } finally {
      setLoadingAgent(null);
    }
  }, [api, roomId]);

  const handleStopAgent = useCallback(async (agentId: string) => {
    setLoadingAgent(agentId);
    try {
      await api.stopAgentInRoom(roomId, agentId);
    } catch (err) {
      console.error('Failed to stop agent:', err);
    } finally {
      setLoadingAgent(null);
    }
  }, [api, roomId]);

  const handleStartAll = useCallback(async () => {
    setLoadingAgent('all');
    try {
      await api.startAllAgents(roomId);
    } catch (err) {
      console.error('Failed to start all agents:', err);
    } finally {
      setLoadingAgent(null);
    }
  }, [api, roomId]);

  const handleStopAll = useCallback(async () => {
    setLoadingAgent('all');
    try {
      await api.stopAllAgents(roomId);
    } catch (err) {
      console.error('Failed to stop all agents:', err);
    } finally {
      setLoadingAgent(null);
    }
  }, [api, roomId]);

  const hasRunningInstances = instances.some(
    (i) => i.status === 'running' || i.status === 'spawning'
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
      {/* Quick actions */}
      {!hasRunningInstances ? (
        <Button
          size="sm"
          variant="outline"
          onClick={handleStartAll}
          disabled={loadingAgent !== null || memberAgents.length === 0}
        >
          <Play className="mr-1 h-3 w-3" />
          {loadingAgent === 'all' ? '...' : t('startAll')}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={handleStopAll}
          disabled={loadingAgent !== null}
        >
          <Square className="mr-1 h-3 w-3" />
          {loadingAgent === 'all' ? '...' : t('stopAll')}
        </Button>
      )}

      {/* Mobile running count summary */}
      <span className="text-xs text-muted-foreground sm:hidden">
        {instances.filter((i) => i.status === 'running').length}/{memberAgents.length}
      </span>

      {/* Per-agent status badges with toggle */}
      {memberAgents.map((agent) => {
        const instance = getInstanceForAgent(agent.id);
        const isRunning = instance?.status === 'running' || instance?.status === 'spawning';
        const isLoading = loadingAgent === agent.id;
        const isCrashed = instance?.status === 'crashed';

        return (
          <button
            key={agent.id}
            onClick={() => (isRunning ? handleStopAgent(agent.id) : handleStartAgent(agent.id))}
            disabled={loadingAgent !== null}
            className="hidden items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-accent disabled:opacity-50 sm:inline-flex"
            style={{ borderColor: agent.definition.color + '40' }}
            title={isRunning ? `Stop ${agent.definition.name}` : `Start ${agent.definition.name}`}
          >
            <span>{agent.definition.avatar}</span>
            <span style={{ color: agent.definition.color }} className="font-medium">
              {agent.definition.slug}
            </span>
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isCrashed ? (
              <AlertCircle className="h-3 w-3 text-destructive" />
            ) : (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: isRunning ? '#22c55e' : '#6b7280',
                }}
              />
            )}
          </button>
        );
      })}

      {/* Instance count — desktop only */}
      {instances.length > 0 && (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {instances.filter((i) => i.status === 'running').length}/{memberAgents.length}
        </span>
      )}
    </div>
  );
}

// Backward-compatible alias
export { ChannelAgentControls as DiscussionControls };
