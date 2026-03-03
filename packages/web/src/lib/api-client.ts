import type {
  AgentState,
  Room,
  CreateRoomRequest,
  ChatMessage,
  SendMessageRequest,
  DiscussionState,
  AssignTurnRequest,
  ApiResponse,
  PaginatedResponse,
  SystemHealth,
  SystemConfig,
  CostSummary,
  TurnStrategy,
} from '@merry/shared';

export class ApiClient {
  constructor(private baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    const json: ApiResponse<T> = await res.json();
    if (!json.ok) throw new Error(json.error ?? 'Unknown API error');
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
  stopAgent(id: string) {
    return this.request<void>(`/api/agents/${id}/stop`, { method: 'POST' });
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

  // --- Discussion ---
  getDiscussion(roomId: string) {
    return this.request<DiscussionState>(`/api/rooms/${roomId}/discussion`);
  }
  startDiscussion(roomId: string, opts?: { strategy?: TurnStrategy; turns?: number }) {
    return this.request<DiscussionState>(`/api/rooms/${roomId}/discussion/start`, {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    });
  }
  pauseDiscussion(roomId: string) {
    return this.request<DiscussionState>(`/api/rooms/${roomId}/discussion/pause`, {
      method: 'POST',
    });
  }
  resumeDiscussion(roomId: string) {
    return this.request<DiscussionState>(`/api/rooms/${roomId}/discussion/resume`, {
      method: 'POST',
    });
  }
  stopDiscussion(roomId: string) {
    return this.request<DiscussionState>(`/api/rooms/${roomId}/discussion/stop`, {
      method: 'POST',
    });
  }
  assignTurn(roomId: string, data: AssignTurnRequest) {
    return this.request<DiscussionState>(`/api/rooms/${roomId}/discussion/assign`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}
