'use client';

import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { RoomType, TurnStrategy } from '@merry/shared';

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'group', label: 'Group' },
  { value: 'dm', label: 'Direct Message' },
];

const TURN_STRATEGIES: { value: TurnStrategy; label: string; desc: string }[] = [
  { value: 'round-robin', label: 'Round Robin', desc: 'Agents take turns in order' },
  { value: 'free-form', label: 'Free Form', desc: 'Agents respond naturally' },
  { value: 'directed', label: 'Directed', desc: 'You assign each turn' },
  { value: 'moderated', label: 'Moderated', desc: 'AI moderates the discussion' },
];

export function CreateRoomDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<RoomType>('group');
  const [strategy, setStrategy] = useState<TurnStrategy>('round-robin');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const agents = useStore((s) => s.agents);
  const addRoom = useStore((s) => s.addRoom);
  const api = useApiClient();

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
      setOpen(false);
      setName('');
      setSelectedAgents([]);
    } catch {
      // TODO: toast
    } finally {
      setCreating(false);
    }
  }, [name, type, strategy, selectedAgents, api, addRoom]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Room
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Room</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="Room name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <div className="flex gap-2">
              {ROOM_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  onClick={() => setType(rt.value)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm transition-colors',
                    type === rt.value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  )}
                >
                  {rt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Turn Strategy</label>
            <div className="grid grid-cols-2 gap-2">
              {TURN_STRATEGIES.map((ts) => (
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
            <label className="text-sm font-medium">Members</label>
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agents available</p>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || selectedAgents.length === 0 || creating}
          >
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
