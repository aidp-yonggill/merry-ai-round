'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentDetail } from '@/components/agents/AgentDetail';
import type { AgentState } from '@merry/shared';

export default function AgentsPage() {
  const agents = useStore((s) => s.agents);
  const setAgents = useStore((s) => s.setAgents);
  const connected = useStore((s) => s.connected);
  const api = useApiClient();
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);

  useEffect(() => {
    if (!connected) return;
    api.listAgents().then(setAgents).catch(() => {});
  }, [connected, api, setAgents]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Agents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {agents.length} agent{agents.length !== 1 ? 's' : ''} loaded
        </p>
      </div>
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm">No agents found.</p>
          <p className="mt-1 text-xs">
            Add agent markdown files to the agents directory and restart the daemon.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={() => setSelectedAgent(agent)}
            />
          ))}
        </div>
      )}
      <AgentDetail
        agent={selectedAgent}
        open={selectedAgent !== null}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  );
}
