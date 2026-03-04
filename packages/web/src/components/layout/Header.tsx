'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Menu, Settings } from 'lucide-react';
import { useStore } from '@/lib/store';
import { ConnectionStatus } from './ConnectionStatus';

export function Header() {
  const t = useTranslations('app');
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-3 md:px-4">
      <div className="flex items-center gap-2 md:gap-3">
        <button
          type="button"
          onClick={toggleSidebar}
          data-testid="header-menu-toggle"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base md:text-lg font-semibold tracking-tight">{t('title')}</h1>
        <ConnectionStatus />
      </div>
      <nav className="flex items-center gap-2">
        <Link
          href="/settings"
          data-testid="header-settings-link"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </nav>
    </header>
  );
}
