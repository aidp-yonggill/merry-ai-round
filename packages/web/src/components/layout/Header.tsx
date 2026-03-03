'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { ConnectionStatus } from './ConnectionStatus';

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Merry AI Round</h1>
        <ConnectionStatus />
      </div>
      <nav className="flex items-center gap-2">
        <Link
          href="/settings"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </nav>
    </header>
  );
}
