'use client';

import { useTranslations } from 'next-intl';
import type { AgentStatus } from '@merry/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_CLASS: Record<AgentStatus, string> = {
  idle: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  thinking: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  responding: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  stopped: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
};

const STATUS_KEYS: Record<AgentStatus, string> = {
  idle: 'idle',
  thinking: 'thinking',
  responding: 'responding',
  error: 'error',
  stopped: 'stopped',
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const t = useTranslations('agentStatus');
  const className = STATUS_CLASS[status];

  return (
    <Badge variant="outline" className={cn('text-xs', className)}>
      {(status === 'thinking' || status === 'responding') && (
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {t(STATUS_KEYS[status])}
    </Badge>
  );
}
