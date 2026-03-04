import { create } from 'zustand';
import type {
  AgentState,
  Room,
  ChatMessage,
  DiscussionState,
  ToolUseBlock,
} from '@merry/shared';

const DEFAULT_DAEMON_URL = 'http://localhost:3141';

interface AppStore {
  // Connection
  daemonUrl: string;
  connected: boolean;
  setDaemonUrl: (url: string) => void;
  setConnected: (connected: boolean) => void;

  // Agents
  agents: AgentState[];
  setAgents: (agents: AgentState[]) => void;
  updateAgentStatus: (agentId: string, status: AgentState['status'], roomId?: string) => void;

  // Rooms
  rooms: Room[];
  activeRoom: string | null;
  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => void;
  setActiveRoom: (roomId: string | null) => void;

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

  // Discussions
  discussionStates: Map<string, DiscussionState>;
  setDiscussionState: (roomId: string, state: DiscussionState) => void;

  // UI
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const useStore = create<AppStore>((set) => ({
  // Connection
  daemonUrl: typeof window !== 'undefined'
    ? localStorage.getItem('merry-daemon-url') ?? DEFAULT_DAEMON_URL
    : DEFAULT_DAEMON_URL,
  connected: false,
  setDaemonUrl: (url) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('merry-daemon-url', url);
    }
    set({ daemonUrl: url });
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

  // Rooms
  rooms: [],
  activeRoom: null,
  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set((state) => ({ rooms: [...state.rooms, room] })),
  setActiveRoom: (roomId) => set({ activeRoom: roomId }),

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
    const next = new Map(state.streamingMessages);
    const current = next.get(messageId) ?? '';
    next.set(messageId, current + chunk);
    return { streamingMessages: next };
  }),
  clearStream: (messageId) => set((state) => {
    const next = new Map(state.streamingMessages);
    next.delete(messageId);
    return { streamingMessages: next };
  }),

  // Tool Use
  activeToolBlocks: new Map(),
  addToolBlock: (messageId, block) => set((state) => {
    const next = new Map(state.activeToolBlocks);
    const existing = next.get(messageId) ?? [];
    next.set(messageId, [...existing, block]);
    return { activeToolBlocks: next };
  }),
  updateToolBlock: (messageId, toolUseId, update) => set((state) => {
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
    const next = new Map(state.activeToolBlocks);
    next.delete(messageId);
    return { activeToolBlocks: next };
  }),

  // Discussions
  discussionStates: new Map(),
  setDiscussionState: (roomId, ds) => set((state) => {
    const next = new Map(state.discussionStates);
    next.set(roomId, ds);
    return { discussionStates: next };
  }),

  // UI
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
