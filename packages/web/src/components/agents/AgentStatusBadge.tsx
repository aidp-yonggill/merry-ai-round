'use client';

import type { AgentStatus } from '@merry/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<AgentStatus, { label: string; className: string }> = {
  idle: { label: 'Idle', className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  thinking: { label: 'Thinking', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  responding: { label: 'Responding', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  error: { label: 'Error', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  stopped: { label: 'Stopped', className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn('text-xs', config.className)}>
      {(status === 'thinking' || status === 'responding') && (
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {config.label}
    </Badge>
  );
}
