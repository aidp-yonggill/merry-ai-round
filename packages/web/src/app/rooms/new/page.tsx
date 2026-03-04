'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RoomType, TurnStrategy } from '@merry/shared';

export default function NewRoomPage() {
  const t = useTranslations('createRoom');
  const [name, setName] = useState('');
  const [type, setType] = useState<RoomType>('group');
  const [strategy, setStrategy] = useState<TurnStrategy>('round-robin');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const agents = useStore((s) => s.agents);
  const addRoom = useStore((s) => s.addRoom);
  const api = useApiClient();
  const router = useRouter();

  const turnStrategies: { value: TurnStrategy; label: string; desc: string }[] = [
    { value: 'round-robin', label: t('roundRobin'), desc: t('roundRobinDesc') },
    { value: 'free-form', label: t('freeForm'), desc: t('freeFormDesc') },
    { value: 'directed', label: t('directed'), desc: t('directedDesc') },
    { value: 'moderated', label: t('moderated'), desc: t('moderatedDesc') },
  ];

  const toggleAgent = useCallback((id: string) => {
    setSelectedAgents((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }, []);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || selectedAgents.length === 0) return;
    setCreating(true);
    try {
      const room = await api.createRoom({
        name: name.trim(),
        type,
        turnStrategy: strategy,
        members: selectedAgents,
      });
      addRoom(room);
      router.push(`/rooms/${room.id}`);
    } catch {
      // TODO: toast
    } finally {
      setCreating(false);
    }
  }, [name, type, strategy, selectedAgents, api, addRoom, router]);

  return (
    <div className="mx-auto max-w-lg p-8">
      <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('description')}
      </p>

      <div className="mt-8 space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('roomName')}</label>
          <Input
            placeholder={t('roomNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('type')}</label>
          <div className="flex gap-2">
            {(['group', 'dm'] as const).map((rt) => (
              <button
                key={rt}
                onClick={() => setType(rt)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  type === rt
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                )}
              >
                {rt === 'group' ? t('group') : t('directMessage')}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('turnStrategy')}</label>
          <div className="grid grid-cols-2 gap-2">
            {turnStrategies.map((ts) => (
              <button
                key={ts.value}
                onClick={() => setStrategy(ts.value)}
                className={cn(
                  'rounded-md border px-3 py-2 text-left transition-colors',
                  strategy === ts.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className="text-sm font-medium">{ts.label}</div>
                <div className="text-xs text-muted-foreground">{ts.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            {t('selectAgents', { count: selectedAgents.length })}
          </label>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('noAgentsAvailable')}
            </p>
          ) : (
            <div className="space-y-1">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => toggleAgent(agent.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                    selectedAgents.includes(agent.id)
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <span>{agent.definition.avatar}</span>
                  <span className="font-medium" style={{ color: agent.definition.color }}>
                    {agent.definition.name}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {agent.definition.model}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          onClick={handleCreate}
          disabled={!name.trim() || selectedAgents.length === 0 || creating}
          className="w-full"
        >
          {creating ? t('creating') : t('createRoom')}
        </Button>
      </div>
    </div>
  );
}
