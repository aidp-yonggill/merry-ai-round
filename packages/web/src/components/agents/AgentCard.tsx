'use client';

import type { AgentState } from '@merry/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AgentStatusBadge } from './AgentStatusBadge';

interface AgentCardProps {
  agent: AgentState;
  onClick?: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const { definition: def } = agent;

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/30"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback
              className="text-lg"
              style={{ backgroundColor: def.color + '20', color: def.color }}
            >
              {def.avatar}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate" style={{ color: def.color }}>
                {def.name}
              </h3>
              <AgentStatusBadge status={agent.status} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {def.model} / max {def.maxTurns} turns / ${def.maxBudgetUsd.toFixed(2)} budget
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {def.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{agent.totalTokensUsed.toLocaleString()} tokens used</span>
          <span>${agent.totalCostUsd.toFixed(4)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
