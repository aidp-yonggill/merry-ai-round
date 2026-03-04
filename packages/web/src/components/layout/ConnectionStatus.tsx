'use client';

import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function ConnectionStatus() {
  const t = useTranslations('connection');
  const connected = useStore((s) => s.connected);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          connected ? 'bg-emerald-500' : 'bg-red-500'
        )}
      />
      <span className="text-muted-foreground">
        {connected ? t('connected') : t('disconnected')}
      </span>
    </div>
  );
}
