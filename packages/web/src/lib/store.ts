import { create } from 'zustand';
import type {
  AgentState,
  Room,
  ChatMessage,
  AgentInstanceInfo,
  ToolUseBlock,
} from '@merry/shared';

const DEFAULT_DAEMON_URL = 'http://localhost:3141';

interface AppStore {
  // Connection
  daemonUrl: string;
  apiKey: string;
  connected: boolean;
  setDaemonUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setConnected: (connected: boolean) => void;

  // Agents
  agents: AgentState[];
  setAgents: (agents: AgentState[]) => void;
  updateAgentStatus: (agentId: string, status: AgentState['status'], roomId?: string) => void;
  removeAgent: (agentId: string) => void;

  // Rooms
  rooms: Room[];
  activeRoom: string | null;
  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => void;
  setActiveRoom: (roomId: string | null) => void;
  removeRoom: (roomId: string) => void;
  archivedRooms: Room[];
  setArchivedRooms: (rooms: Room[]) => void;
  moveRoomToArchive: (roomId: string) => void;
  restoreRoomFromArchive: (roomId: string) => void;

  // Messages
  messages: Map<string, ChatMessage[]>;
  setMessages: (roomId: string, messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;

  // Streaming
  streamingMessages: Map<string, string>;
  appendStreamChunk: (messageId: string, chunk: string) => void;
  clearStream: (messageId: string) => void;

  // Tool Use (real-time tracking by messageId)
  activeToolBlocks: Map<string, ToolUseBlock[]>;
  addToolBlock: (messageId: string, block: ToolUseBlock) => void;
  updateToolBlock: (messageId: string, toolUseId: string, update: Partial<ToolUseBlock>) => void;
  clearToolBlocks: (messageId: string) => void;

  // Agent Instances (roomId → instances)
  agentInstances: Map<string, AgentInstanceInfo[]>;
  setRoomInstances: (roomId: string, instances: AgentInstanceInfo[]) => void;
  updateInstance: (instance: AgentInstanceInfo) => void;
  removeInstance: (instanceId: string, roomId: string) => void;

  // UI
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const STREAM_TTL_MS = 30_000;

const streamTimestamps = new Map<string, number>();
const toolBlockTimestamps = new Map<string, number>();

let ttlCleanupInterval: ReturnType<typeof setInterval> | undefined;

function startTTLCleanup(getState: () => AppStore) {
  if (ttlCleanupInterval) return;
  ttlCleanupInterval = setInterval(() => {
    const now = Date.now();
    const state = getState();

    // Clean stale streaming messages
    let streamDirty = false;
    const nextStream = new Map(state.streamingMessages);
    for (const [id, ts] of streamTimestamps) {
      if (now - ts > STREAM_TTL_MS) {
        nextStream.delete(id);
        streamTimestamps.delete(id);
        streamDirty = true;
      }
    }

    // Clean stale tool blocks
    let toolDirty = false;
    const nextTools = new Map(state.activeToolBlocks);
    for (const [id, ts] of toolBlockTimestamps) {
      if (now - ts > STREAM_TTL_MS) {
        nextTools.delete(id);
        toolBlockTimestamps.delete(id);
        toolDirty = true;
      }
    }

    if (streamDirty || toolDirty) {
      useStore.setState({
        ...(streamDirty ? { streamingMessages: nextStream } : {}),
        ...(toolDirty ? { activeToolBlocks: nextTools } : {}),
      });
    }
  }, 10_000);
}

export const useStore = create<AppStore>((set, get) => {
  // Start TTL cleanup once store is created
  if (typeof window !== 'undefined') {
    setTimeout(() => startTTLCleanup(get), 0);
  }

  return {
  // Connection
  daemonUrl: typeof window !== 'undefined'
    ? localStorage.getItem('merry-daemon-url') ?? DEFAULT_DAEMON_URL
    : DEFAULT_DAEMON_URL,
  apiKey: typeof window !== 'undefined'
    ? localStorage.getItem('merry-api-key') ?? ''
    : '',
  connected: false,
  setDaemonUrl: (url) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('merry-daemon-url', url);
    }
    set({ daemonUrl: url });
  },
  setApiKey: (key) => {
    if (typeof window !== 'undefined') {
      if (key) {
        localStorage.setItem('merry-api-key', key);
      } else {
        localStorage.removeItem('merry-api-key');
      }
    }
    set({ apiKey: key });
  },
  setConnected: (connected) => set({ connected }),

  // Agents
  agents: [],
  setAgents: (agents) => set({ agents }),
  updateAgentStatus: (agentId, status, roomId) => set((state) => ({
    agents: state.agents.map((a) =>
      a.id === agentId
        ? { ...a, status, currentRoomId: roomId ?? a.currentRoomId }
        : a
    ),
  })),
  removeAgent: (agentId) => set((state) => ({
    agents: state.agents.filter((a) => a.id !== agentId),
  })),

  // Rooms
  rooms: [],
  activeRoom: null,
  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set((state) => ({ rooms: [...state.rooms, room] })),
  setActiveRoom: (roomId) => set({ activeRoom: roomId }),
  removeRoom: (roomId) => set((state) => {
    const nextMessages = new Map(state.messages);
    nextMessages.delete(roomId);
    const nextInstances = new Map(state.agentInstances);
    nextInstances.delete(roomId);
    return {
      rooms: state.rooms.filter(r => r.id !== roomId),
      activeRoom: state.activeRoom === roomId ? null : state.activeRoom,
      messages: nextMessages,
      agentInstances: nextInstances,
    };
  }),
  archivedRooms: [],
  setArchivedRooms: (rooms) => set({ archivedRooms: rooms }),
  moveRoomToArchive: (roomId) => set((state) => {
    const room = state.rooms.find(r => r.id === roomId);
    return {
      rooms: state.rooms.filter(r => r.id !== roomId),
      activeRoom: state.activeRoom === roomId ? null : state.activeRoom,
      archivedRooms: room
        ? [...state.archivedRooms, { ...room, status: 'archived' as const }]
        : state.archivedRooms,
    };
  }),
  restoreRoomFromArchive: (roomId) => set((state) => {
    const room = state.archivedRooms.find(r => r.id === roomId);
    return {
      archivedRooms: state.archivedRooms.filter(r => r.id !== roomId),
      rooms: room
        ? [...state.rooms, { ...room, status: 'active' as const }]
        : state.rooms,
    };
  }),

  // Messages
  messages: new Map(),
  setMessages: (roomId, messages) => set((state) => {
    const next = new Map(state.messages);
    next.set(roomId, messages);
    return { messages: next };
  }),
  addMessage: (message) => set((state) => {
    const next = new Map(state.messages);
    const existing = next.get(message.roomId) ?? [];
    next.set(message.roomId, [...existing, message]);
    return { messages: next };
  }),

  // Streaming
  streamingMessages: new Map(),
  appendStreamChunk: (messageId, chunk) => set((state) => {
    streamTimestamps.set(messageId, Date.now());
    const next = new Map(state.streamingMessages);
    const current = next.get(messageId) ?? '';
    next.set(messageId, current + chunk);
    return { streamingMessages: next };
  }),
  clearStream: (messageId) => set((state) => {
    streamTimestamps.delete(messageId);
    const next = new Map(state.streamingMessages);
    next.delete(messageId);
    return { streamingMessages: next };
  }),

  // Tool Use
  activeToolBlocks: new Map(),
  addToolBlock: (messageId, block) => set((state) => {
    toolBlockTimestamps.set(messageId, Date.now());
    const next = new Map(state.activeToolBlocks);
    const existing = next.get(messageId) ?? [];
    next.set(messageId, [...existing, block]);
    return { activeToolBlocks: next };
  }),
  updateToolBlock: (messageId, toolUseId, update) => set((state) => {
    toolBlockTimestamps.set(messageId, Date.now());
    const next = new Map(state.activeToolBlocks);
    const blocks = next.get(messageId);
    if (blocks) {
      next.set(messageId, blocks.map(b =>
        b.id === toolUseId ? { ...b, ...update } : b
      ));
    }
    return { activeToolBlocks: next };
  }),
  clearToolBlocks: (messageId) => set((state) => {
    toolBlockTimestamps.delete(messageId);
    const next = new Map(state.activeToolBlocks);
    next.delete(messageId);
    return { activeToolBlocks: next };
  }),

  // Agent Instances
  agentInstances: new Map(),
  setRoomInstances: (roomId, instances) => set((state) => {
    const next = new Map(state.agentInstances);
    next.set(roomId, instances);
    return { agentInstances: next };
  }),
  updateInstance: (instance) => set((state) => {
    const next = new Map(state.agentInstances);
    const existing = next.get(instance.roomId) ?? [];
    const idx = existing.findIndex((i) => i.instanceId === instance.instanceId);
    if (idx >= 0) {
      const updated = [...existing];
      updated[idx] = instance;
      next.set(instance.roomId, updated);
    } else {
      next.set(instance.roomId, [...existing, instance]);
    }
    return { agentInstances: next };
  }),
  removeInstance: (instanceId, roomId) => set((state) => {
    const next = new Map(state.agentInstances);
    const existing = next.get(roomId) ?? [];
    next.set(roomId, existing.filter((i) => i.instanceId !== instanceId));
    return { agentInstances: next };
  }),

  // UI
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
};
});
