'use client';

import type { AgentState } from '@merry/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AgentStatusBadge } from './AgentStatusBadge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface AgentDetailProps {
  agent: AgentState | null;
  open: boolean;
  onClose: () => void;
}

export function AgentDetail({ agent, open, onClose }: AgentDetailProps) {
  if (!agent) return null;
  const { definition: def } = agent;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback
                className="text-xl"
                style={{ backgroundColor: def.color + '20', color: def.color }}
              >
                {def.avatar}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle style={{ color: def.color }}>{def.name}</SheetTitle>
              <AgentStatusBadge status={agent.status} />
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatBlock label="Model" value={def.model} />
            <StatBlock label="Max Turns" value={String(def.maxTurns)} />
            <StatBlock label="Tokens Used" value={agent.totalTokensUsed.toLocaleString()} />
            <StatBlock label="Cost" value={`$${agent.totalCostUsd.toFixed(4)}`} />
            <StatBlock label="Budget" value={`$${def.maxBudgetUsd.toFixed(2)}`} />
            <StatBlock label="Response Style" value={def.discussion.responseStyle} />
          </div>

          <Separator />

          {/* Tags */}
          <div>
            <h4 className="text-sm font-medium mb-2">Tags</h4>
            <div className="flex flex-wrap gap-1">
              {def.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Persona */}
          <div>
            <h4 className="text-sm font-medium mb-2">Persona</h4>
            <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap leading-relaxed">
              {def.persona}
            </div>
          </div>

          <Separator />

          {/* Tools */}
          <div>
            <h4 className="text-sm font-medium mb-2">Tools</h4>
            <div className="space-y-1 text-sm">
              {def.tools.allowed.length > 0 && (
                <p className="text-muted-foreground">
                  <span className="text-emerald-400">Allowed:</span>{' '}
                  {def.tools.allowed.join(', ')}
                </p>
              )}
              {def.tools.disallowed.length > 0 && (
                <p className="text-muted-foreground">
                  <span className="text-red-400">Disallowed:</span>{' '}
                  {def.tools.disallowed.join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
