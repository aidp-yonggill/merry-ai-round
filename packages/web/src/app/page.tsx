'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, MessageSquare, Users, Activity, DollarSign } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useApiClient } from '@/hooks/useApiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AgentStatusBadge } from '@/components/agents/AgentStatusBadge';
import type { SystemHealth, CostSummary } from '@merry/shared';

export default function DashboardPage() {
  const agents = useStore((s) => s.agents);
  const rooms = useStore((s) => s.rooms);
  const setAgents = useStore((s) => s.setAgents);
  const setRooms = useStore((s) => s.setRooms);
  const connected = useStore((s) => s.connected);
  const api = useApiClient();

  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [costs, setCosts] = useState<CostSummary | null>(null);

  useEffect(() => {
    if (!connected) return;
    api.listAgents().then(setAgents).catch(() => {});
    api.listRooms().then(setRooms).catch(() => {});
    api.health().then(setHealth).catch(() => {});
    api.costs().then(setCosts).catch(() => {});
  }, [connected, api, setAgents, setRooms]);

  const activeAgents = agents.filter(
    (a) => a.status === 'thinking' || a.status === 'responding'
  );

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {connected ? 'Connected to daemon' : 'Not connected'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/rooms/new">
            <Button size="sm" variant="outline">
              <Plus className="mr-1 h-3.5 w-3.5" />
              New Room
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rooms</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rooms.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agents.length}</div>
            {activeAgents.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {activeAgents.length} active
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health ? formatUptime(health.uptime) : '--'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${costs ? costs.totalUsd.toFixed(4) : '0.0000'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Agent Status</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents loaded</p>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-3">
                  <span className="text-base">{agent.definition.avatar}</span>
                  <span
                    className="text-sm font-medium min-w-[100px]"
                    style={{ color: agent.definition.color }}
                  >
                    {agent.definition.name}
                  </span>
                  <AgentStatusBadge status={agent.status} />
                  {agent.currentRoomId && (
                    <span className="text-xs text-muted-foreground">
                      in {rooms.find((r) => r.id === agent.currentRoomId)?.name ?? agent.currentRoomId}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    ${agent.totalCostUsd.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Rooms */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rooms</CardTitle>
        </CardHeader>
        <CardContent>
          {rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rooms yet</p>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => (
                <Link
                  key={room.id}
                  href={`/rooms/${room.id}`}
                  className="flex items-center gap-3 rounded-md p-2 text-sm hover:bg-accent/50 transition-colors"
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{room.name}</span>
                  <span className="text-xs text-muted-foreground">{room.type}</span>
                  <span className="text-xs text-muted-foreground">{room.turnStrategy}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {room.members.length} members
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
