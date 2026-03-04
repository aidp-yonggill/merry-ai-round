'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { ApiClient } from '@/lib/api-client';

export function useApiClient() {
  const daemonUrl = useStore((s) => s.daemonUrl);
  const apiKey = useStore((s) => s.apiKey);
  return useMemo(() => new ApiClient(daemonUrl, apiKey || undefined), [daemonUrl, apiKey]);
}
