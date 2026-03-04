'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentDetail } from '@/components/agents/AgentDetail';
import { CreateAgentDialog } from '@/components/agents/CreateAgentDialog';
import type { AgentState } from '@merry/shared';

export default function AgentsPage() {
  const t = useTranslations('agents');
  const agents = useStore((s) => s.agents);
  const setAgents = useStore((s) => s.setAgents);
  const connected = useStore((s) => s.connected);
  const api = useApiClient();
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);

  const refreshAgents = useCallback(() => {
    api.listAgents().then(setAgents).catch(() => {});
  }, [api, setAgents]);

  useEffect(() => {
    if (!connected) return;
    refreshAgents();
  }, [connected, refreshAgents]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('loaded', { count: agents.length })}
          </p>
        </div>
        <CreateAgentDialog onCreated={refreshAgents} />
      </div>
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm">{t('noAgentsFound')}</p>
          <p className="mt-1 text-xs">
            {t('addAgentHint')}
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
        onMutated={refreshAgents}
      />
    </div>
  );
}
