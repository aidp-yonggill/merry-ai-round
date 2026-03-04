'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import type { SSEEvent } from '@merry/shared';

const HEARTBEAT_TIMEOUT_MS = 45_000;

export function useSSE() {
  const daemonUrl = useStore((s) => s.daemonUrl);
  const apiKey = useStore((s) => s.apiKey);
  const setConnected = useStore((s) => s.setConnected);
  const addMessage = useStore((s) => s.addMessage);
  const appendStreamChunk = useStore((s) => s.appendStreamChunk);
  const clearStream = useStore((s) => s.clearStream);
  const updateAgentStatus = useStore((s) => s.updateAgentStatus);
  const addToolBlock = useStore((s) => s.addToolBlock);
  const updateToolBlock = useStore((s) => s.updateToolBlock);
  const setRoomInstances = useStore((s) => s.setRoomInstances);
  const updateInstance = useStore((s) => s.updateInstance);
  const removeInstance = useStore((s) => s.removeInstance);

  const abortRef = useRef<AbortController | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heartbeatTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reconnectDelay = useRef(1000);

  const connect = useCallback(() => {
    clearTimeout(reconnectTimer.current);

    // Abort previous connection
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const scheduleReconnect = () => {
      clearTimeout(reconnectTimer.current);
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, 30000);
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, delay);
    };

    const resetHeartbeatTimer = () => {
      clearTimeout(heartbeatTimer.current);
      heartbeatTimer.current = setTimeout(() => {
        setConnected(false);
        controller.abort();
        scheduleReconnect();
      }, HEARTBEAT_TIMEOUT_MS);
    };

    const handleEvent = (event: SSEEvent) => {
      resetHeartbeatTimer();

      switch (event.type) {
        case 'message:new':
          addMessage(event.data);
          break;
        case 'message:stream':
          if (event.data.done) {
            clearStream(event.data.messageId);
          } else {
            appendStreamChunk(event.data.messageId, event.data.chunk);
          }
          break;
        case 'agent:status':
          updateAgentStatus(event.data.agentId, event.data.status, event.data.roomId);
          break;
        case 'tool:start':
          addToolBlock(event.data.messageId, {
            id: event.data.toolUseId,
            toolName: event.data.toolName,
            input: event.data.input,
            status: 'running',
          });
          break;
        case 'tool:complete':
          updateToolBlock(event.data.messageId, event.data.toolUseId, {
            status: event.data.isError ? 'error' : 'completed',
            output: event.data.output,
          });
          break;
        case 'tool:progress':
          break;
        case 'instance:spawning':
        case 'instance:running':
          updateInstance(event.data);
          break;
        case 'instance:stopped':
          removeInstance(event.data.instanceId, event.data.roomId);
          break;
        case 'instance:crashed':
          removeInstance(event.data.instanceId, event.data.roomId);
          break;
        case 'instance:resource':
          {
            const instances = useStore.getState().agentInstances.get(event.data.roomId);
            const inst = instances?.find(i => i.instanceId === event.data.instanceId);
            if (inst) {
              updateInstance({ ...inst, tokensUsed: event.data.tokensUsed, costUsd: event.data.costUsd });
            }
          }
          break;
        case 'memory:compaction':
          console.log('[memory:compaction]', event.data);
          break;
        case 'heartbeat':
          break;
      }
    };

    // Use fetch-based SSE to support custom headers (ngrok, API key)
    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
      'ngrok-skip-browser-warning': 'true',
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    fetch(`${daemonUrl}/api/events`, {
      headers,
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      setConnected(true);
      reconnectDelay.current = 1000;
      resetHeartbeatTimer();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE: split on double newline (event boundary)
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const event: SSEEvent = JSON.parse(line.slice(6));
                handleEvent(event);
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      }

      // Stream ended normally
      setConnected(false);
      scheduleReconnect();
    }).catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setConnected(false);
      scheduleReconnect();
    });
  }, [daemonUrl, apiKey, setConnected, addMessage, appendStreamChunk, clearStream, updateAgentStatus, addToolBlock, updateToolBlock, setRoomInstances, updateInstance, removeInstance]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      clearTimeout(heartbeatTimer.current);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [connect]);
}
