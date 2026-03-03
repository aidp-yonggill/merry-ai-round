import type { Response } from 'express';
import type { SSEEvent } from '@merry/shared';

interface SSEClient {
  id: string;
  res: Response;
  roomId?: string;
}

export class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHeartbeat();
  }

  addClient(id: string, res: Response, roomId?: string): void {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    this.clients.set(id, { id, res, roomId });

    res.on('close', () => {
      this.clients.delete(id);
    });

    // Send initial connection event
    this.sendTo(id, { type: 'heartbeat', data: { timestamp: new Date().toISOString() } });
  }

  broadcast(event: SSEEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const client of this.clients.values()) {
      try {
        client.res.write(data);
      } catch {
        this.clients.delete(client.id);
      }
    }
  }

  broadcastToRoom(roomId: string, event: SSEEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const client of this.clients.values()) {
      if (!client.roomId || client.roomId === roomId) {
        try {
          client.res.write(data);
        } catch {
          this.clients.delete(client.id);
        }
      }
    }
  }

  private sendTo(clientId: string, event: SSEEvent): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      client.res.write(data);
    } catch {
      this.clients.delete(clientId);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({ type: 'heartbeat', data: { timestamp: new Date().toISOString() } });
    }, 30_000);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    for (const client of this.clients.values()) {
      try { client.res.end(); } catch { /* ignore */ }
    }
    this.clients.clear();
  }
}
