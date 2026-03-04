'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import type { SSEEvent } from '@merry/shared';

export function useSSE() {
  const daemonUrl = useStore((s) => s.daemonUrl);
  const setConnected = useStore((s) => s.setConnected);
  const addMessage = useStore((s) => s.addMessage);
  const appendStreamChunk = useStore((s) => s.appendStreamChunk);
  const clearStream = useStore((s) => s.clearStream);
  const updateAgentStatus = useStore((s) => s.updateAgentStatus);
  const setDiscussionState = useStore((s) => s.setDiscussionState);
  const addToolBlock = useStore((s) => s.addToolBlock);
  const updateToolBlock = useStore((s) => s.updateToolBlock);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reconnectDelay = useRef(1000);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(`${daemonUrl}/api/events`);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      reconnectDelay.current = 1000;
    };

    es.onmessage = (ev) => {
      try {
        const event: SSEEvent = JSON.parse(ev.data);
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
          case 'discussion:state':
            setDiscussionState(event.data.roomId, event.data);
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
          case 'heartbeat':
            // Keep-alive, nothing to do
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;

      // Exponential backoff reconnect
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
        connect();
      }, reconnectDelay.current);
    };
  }, [daemonUrl, setConnected, addMessage, appendStreamChunk, clearStream, updateAgentStatus, setDiscussionState, addToolBlock, updateToolBlock]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);
}
