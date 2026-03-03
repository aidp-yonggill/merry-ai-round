'use client';

import { useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { ApiClient } from '@/lib/api-client';

export default function SettingsPage() {
  const daemonUrl = useStore((s) => s.daemonUrl);
  const setDaemonUrl = useStore((s) => s.setDaemonUrl);

  const [urlInput, setUrlInput] = useState(daemonUrl);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const handleSave = useCallback(() => {
    setDaemonUrl(urlInput.replace(/\/+$/, ''));
  }, [urlInput, setDaemonUrl]);

  const handleTest = useCallback(async () => {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const client = new ApiClient(urlInput.replace(/\/+$/, ''));
      const health = await client.health();
      setTestStatus('success');
      setTestMessage(
        `Connected! Status: ${health.status}, Uptime: ${health.uptime}s, ` +
        `Agents: ${health.activeAgents}, Rooms: ${health.activeRooms}`
      );
    } catch (err) {
      setTestStatus('error');
      setTestMessage(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [urlInput]);

  return (
    <div className="mx-auto max-w-xl p-8">
      <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure your connection to the Merry daemon.
      </p>

      <div className="mt-8 space-y-6">
        <div className="space-y-2">
          <label htmlFor="daemon-url" className="text-sm font-medium">
            Daemon URL
          </label>
          <input
            id="daemon-url"
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="http://localhost:3141"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <p className="text-xs text-muted-foreground">
            The base URL of your running Merry daemon instance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
          <button
            onClick={handleTest}
            disabled={testStatus === 'testing'}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {testMessage && (
          <div
            className={`rounded-md p-3 text-sm ${
              testStatus === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {testMessage}
          </div>
        )}
      </div>
    </div>
  );
}
