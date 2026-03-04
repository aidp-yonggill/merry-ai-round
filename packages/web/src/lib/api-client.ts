import type {
  AgentState,
  Room,
  CreateRoomRequest,
  ChatMessage,
  SendMessageRequest,
  AgentInstanceInfo,
  ApiResponse,
  PaginatedResponse,
  SystemHealth,
  SystemConfig,
  CostSummary,
} from '@merry/shared';

const FETCH_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromStatus(status: number, serverMessage?: string): ApiError {
    const fallback: Record<number, string> = {
      400: 'Bad request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not found',
      409: 'Conflict',
      429: 'Too many requests',
      500: 'Internal server error',
      502: 'Bad gateway',
      503: 'Service unavailable',
    };
    const message = serverMessage ?? fallback[status] ?? `HTTP error ${status}`;
    return new ApiError(message, status);
  }
}

export class ApiClient {
  constructor(private baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError('Request timed out', 0, 'TIMEOUT');
      }
      throw new ApiError(
        err instanceof Error ? err.message : 'Network error',
        0,
        'NETWORK',
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      let serverMessage: string | undefined;
      try {
        const body = await res.json();
        serverMessage = body.error;
      } catch {
        // ignore parse errors
      }
      throw ApiError.fromStatus(res.status, serverMessage);
    }

    const json: ApiResponse<T> = await res.json();
    if (!json.ok) throw new ApiError(json.error ?? 'Unknown API error', res.status);
    return json.data as T;
  }

  // --- System ---
  health() {
    return this.request<SystemHealth>('/api/system/health');
  }
  config() {
    return this.request<SystemConfig>('/api/system/config');
  }
  costs() {
    return this.request<CostSummary>('/api/system/costs');
  }

  // --- Agents ---
  listAgents() {
    return this.request<AgentState[]>('/api/agents');
  }
  getAgent(id: string) {
    return this.request<AgentState>(`/api/agents/${id}`);
  }
  reloadAgent(id: string) {
    return this.request<AgentState>(`/api/agents/${id}/reload`, { method: 'POST' });
  }
  getAgentMemory(id: string) {
    return this.request<unknown>(`/api/agents/${id}/memory`);
  }

  // --- Rooms ---
  listRooms() {
    return this.request<Room[]>('/api/rooms');
  }
  getRoom(id: string) {
    return this.request<Room>(`/api/rooms/${id}`);
  }
  createRoom(data: CreateRoomRequest) {
    return this.request<Room>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  updateRoom(id: string, data: Partial<Pick<Room, 'name' | 'turnStrategy'>>) {
    return this.request<Room>(`/api/rooms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
  addRoomMember(roomId: string, agentId: string) {
    return this.request<Room>(`/api/rooms/${roomId}/members`, {
      method: 'POST',
      body: JSON.stringify({ agentId }),
    });
  }
  removeRoomMember(roomId: string, memberId: string) {
    return this.request<Room>(`/api/rooms/${roomId}/members/${memberId}`, {
      method: 'DELETE',
    });
  }

  // --- Messages ---
  listMessages(roomId: string, limit = 50, before?: string) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return this.request<PaginatedResponse<ChatMessage>>(
      `/api/rooms/${roomId}/messages?${params}`
    );
  }
  sendMessage(roomId: string, data: SendMessageRequest) {
    return this.request<ChatMessage>(`/api/rooms/${roomId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // --- Instances ---
  startAgentInRoom(roomId: string, agentId: string) {
    return this.request<AgentInstanceInfo>(`/api/rooms/${roomId}/agents/${agentId}/start`, { method: 'POST' });
  }
  stopAgentInRoom(roomId: string, agentId: string) {
    return this.request<void>(`/api/rooms/${roomId}/agents/${agentId}/stop`, { method: 'POST' });
  }
  startAllAgents(roomId: string) {
    return this.request<AgentInstanceInfo[]>(`/api/rooms/${roomId}/agents/start-all`, { method: 'POST' });
  }
  stopAllAgents(roomId: string) {
    return this.request<void>(`/api/rooms/${roomId}/agents/stop-all`, { method: 'POST' });
  }
  getRoomInstances(roomId: string) {
    return this.request<AgentInstanceInfo[]>(`/api/rooms/${roomId}/agents/instances`);
  }
  getAllInstances() {
    return this.request<AgentInstanceInfo[]>('/api/instances');
  }

  // --- Agent Config ---
  getAgentConfig(id: string) {
    return this.request<string>(`/api/agents/${id}/config`);
  }
  updateAgentConfig(id: string, content: string) {
    return this.request<unknown>(`/api/agents/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }
  getAgentRules(id: string) {
    return this.request<string>(`/api/agents/${id}/rules`);
  }
  updateAgentRules(id: string, content: string) {
    return this.request<unknown>(`/api/agents/${id}/rules`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }
}
