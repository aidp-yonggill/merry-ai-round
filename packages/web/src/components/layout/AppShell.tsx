'use client';

import { useSSE } from '@/hooks/useSSE';
import { Header } from './Header';
import { Sidebar, MobileSidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  useSSE();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MobileSidebar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
