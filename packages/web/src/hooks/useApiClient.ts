'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { ApiClient } from '@/lib/api-client';

export function useApiClient() {
  const daemonUrl = useStore((s) => s.daemonUrl);
  return useMemo(() => new ApiClient(daemonUrl), [daemonUrl]);
}
