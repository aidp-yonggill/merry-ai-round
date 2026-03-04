'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import type { SSEEvent } from '@merry/shared';

const HEARTBEAT_TIMEOUT_MS = 45_000;

export function useSSE() {
  const daemonUrl = useStore((s) => s.daemonUrl);
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

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heartbeatTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reconnectDelay = useRef(1000);

  const connect = useCallback(() => {
    // Clear existing reconnect timer before setting new one
    clearTimeout(reconnectTimer.current);

    if (esRef.current) {
      esRef.current.close();
    }

    const resetHeartbeatTimer = () => {
      clearTimeout(heartbeatTimer.current);
      heartbeatTimer.current = setTimeout(() => {
        setConnected(false);
        esRef.current?.close();
        esRef.current = null;
        // Trigger reconnect
        scheduleReconnect();
      }, HEARTBEAT_TIMEOUT_MS);
    };

    const scheduleReconnect = () => {
      clearTimeout(reconnectTimer.current);
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, 30000);
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, delay);
    };

    const es = new EventSource(`${daemonUrl}/api/events`);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      reconnectDelay.current = 1000;
      resetHeartbeatTimer();
    };

    es.onmessage = (ev) => {
      try {
        const event: SSEEvent = JSON.parse(ev.data);

        // Reset heartbeat timer on any message
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
            // Progress updates (optional content streaming for tool output)
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
            // Timer already reset above
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      clearTimeout(heartbeatTimer.current);
      es.close();
      esRef.current = null;

      // Exponential backoff reconnect: apply delay first, then multiply
      scheduleReconnect();
    };
  }, [daemonUrl, setConnected, addMessage, appendStreamChunk, clearStream, updateAgentStatus, addToolBlock, updateToolBlock, setRoomInstances, updateInstance, removeInstance]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      clearTimeout(heartbeatTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);
}
