# Merry AI Round - Web UI Specifications

## 1. Overview

The Merry AI Round Web UI is a Next.js 15 application that provides a real-time interface for orchestrating multi-agent AI discussions. Users can create chat rooms, assign AI agents to rooms, start/pause/stop discussions, send messages, and observe agents conversing in real time.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS, shadcn/ui, Zustand, TypeScript
**Daemon API:** Express.js on `localhost:3141`
**Shared Types:** `@merry/shared` package

---

## 2. Daemon API Reference

### 2.1 REST Endpoints

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| **Agents** |
| GET | `/api/agents` | List all agents | - | `AgentState[]` |
| GET | `/api/agents/:id` | Get agent detail | - | `AgentState` |
| POST | `/api/agents/:id/reload` | Reload agent config from disk | - | `AgentDefinition` |
| POST | `/api/agents/:id/stop` | Stop an agent | - | `void` |
| GET | `/api/agents/:id/memory` | Get agent memory | - | `{ context, facts, preferences }` |
| **Rooms** |
| GET | `/api/rooms` | List all rooms | - | `Room[]` |
| POST | `/api/rooms` | Create a room | `CreateRoomRequest` | `Room` |
| GET | `/api/rooms/:id` | Get room detail | - | `Room` |
| PATCH | `/api/rooms/:id` | Update room | Partial `Room` | `Room` |
| POST | `/api/rooms/:id/members` | Add member | `{ agentId }` | `Room` |
| DELETE | `/api/rooms/:id/members/:mid` | Remove member | - | `Room` |
| **Messages** |
| GET | `/api/rooms/:id/messages` | Get messages (paginated) | Query: `limit`, `before` | `PaginatedResponse<ChatMessage>` |
| POST | `/api/rooms/:id/messages` | Send user message | `SendMessageRequest` | `ChatMessage` |
| **Discussions** |
| GET | `/api/rooms/:id/discussion` | Get discussion state | - | `DiscussionState` |
| POST | `/api/rooms/:id/discussion/start` | Start discussion | - | `DiscussionState` |
| POST | `/api/rooms/:id/discussion/pause` | Pause discussion | - | `DiscussionState` |
| POST | `/api/rooms/:id/discussion/resume` | Resume discussion | - | `DiscussionState` |
| POST | `/api/rooms/:id/discussion/stop` | Stop discussion | - | `DiscussionState` |
| POST | `/api/rooms/:id/discussion/assign` | Assign next speaker | `{ agentId }` | `void` |
| **System** |
| GET | `/api/system/health` | Health check | - | `SystemHealth` |
| GET | `/api/system/config` | System configuration | - | `SystemConfig` |
| GET | `/api/system/costs` | Cost summary | - | `CostSummary` |

### 2.2 SSE Endpoint

**URL:** `GET /api/events?roomId=<optional>`

Clients connect to receive real-time events. If `roomId` is provided, the client receives room-scoped events plus global broadcasts.

### 2.3 SSE Event Types

| Event Type | Payload | When Emitted |
|------------|---------|--------------|
| `message:new` | `ChatMessage` | New message saved to a room |
| `message:stream` | `{ messageId, roomId, agentId, chunk, done }` | Agent streaming a response token-by-token |
| `agent:status` | `{ agentId, status, roomId? }` | Agent status changes (idle/thinking/responding/error/stopped) |
| `discussion:state` | `DiscussionState` | Discussion status changes (start/pause/resume/stop/turn change) |
| `heartbeat` | `{ timestamp }` | Every 30 seconds to keep connection alive |

### 2.4 Response Envelope

All REST responses use `ApiResponse<T>`:
```typescript
{ ok: true, data: T }        // success
{ ok: false, error: string }  // error
```

Paginated endpoints use:
```typescript
{ items: T[], hasMore: boolean, nextCursor?: string }
```

---

## 3. Page Structure & Routes

```
/                       Dashboard - overview of rooms, agents, system health
/rooms/[roomId]         Room view - chat interface for a specific room
/agents                 Agent gallery - browse and manage all agents
/settings               Settings - system config, cost tracking
```

### 3.1 Dashboard (`/`)

**Purpose:** Landing page showing at-a-glance status of the entire system.

**Layout:**
```
+----------------------------------------------------------+
| TopNav: Logo | Rooms | Agents | Settings       [Health]  |
+----------------------------------------------------------+
| SystemHealthBar (uptime, active agents, costs)            |
+---------------------------+------------------------------+
| RoomList                  | ActiveDiscussions            |
| - Room card               | - Live discussion preview    |
| - Room card               | - Agent status indicators    |
| - [+ Create Room]         |                              |
+---------------------------+------------------------------+
| AgentOverview (compact grid of agent avatars + status)    |
+----------------------------------------------------------+
```

**Components:**
- `SystemHealthBar` - Displays uptime, active agents count, active rooms, total cost
- `RoomList` - Card grid of all rooms with member count, last message preview, discussion status badge
- `RoomCard` - Single room summary with name, member avatars, status indicator, link to room
- `CreateRoomDialog` - Modal form: name, type (group/dm), turn strategy, member selection
- `ActiveDiscussionsList` - Shows rooms with running discussions, current speaker, turn count
- `AgentOverviewGrid` - Compact avatar grid showing all agents with status color indicators

**Data Requirements:**
- `GET /api/rooms` - room list
- `GET /api/agents` - agent list for avatars and statuses
- `GET /api/system/health` - system metrics
- `GET /api/system/costs` - cost summary
- SSE: `agent:status`, `discussion:state` for live updates

**Acceptance Criteria:**
- [ ] Page loads and displays all rooms as cards within 1 second
- [ ] System health bar shows uptime, active agent count, active room count, and total cost
- [ ] Room cards show room name, member count, member avatars, and discussion status badge
- [ ] "Create Room" button opens a modal dialog
- [ ] Room cards link to `/rooms/[roomId]`
- [ ] Active discussions section shows rooms with running discussions
- [ ] Agent overview shows all agents with colored status dots
- [ ] SSE events update agent status indicators and discussion badges in real time

### 3.2 Room View (`/rooms/[roomId]`)

**Purpose:** The primary interaction surface. A chat-style interface where users observe and participate in agent discussions.

**Layout:**
```
+----------------------------------------------------------+
| TopNav: [< Back] Room Name          [Members] [Settings]  |
+----------------------------------------------------------+
| DiscussionControls                                        |
| [Start] [Pause] [Resume] [Stop]  Strategy: round-robin   |
| Turn: 5 | Current Speaker: Aria (thinking...)             |
+----------------------------------------------------------+
| MessageList (scrollable)                                  |
| +------------------------------------------------------+ |
| | [Avatar] AgentName                         12:30 PM   | |
| | Message content with markdown rendering...            | |
| | tokens: 142 | cost: $0.003                            | |
| +------------------------------------------------------+ |
| | [Avatar] AgentName (streaming...)                     | |
| | Partial message being streamed █                      | |
| +------------------------------------------------------+ |
| | [You]                                      12:31 PM   | |
| | User intervention message                             | |
| +------------------------------------------------------+ |
+----------------------------------------------------------+
| MessageInput                                              |
| [Agent selector ▾] [Type a message...          ] [Send]  |
+----------------------------------------------------------+
| MembersSidebar (collapsible)                              |
| - Agent avatar + name + status                            |
| - Agent avatar + name + status                            |
| - [Assign Next Speaker]                                   |
| - [+ Add Member]                                          |
+----------------------------------------------------------+
```

**Components:**
- `RoomHeader` - Room name, back navigation, member toggle, room settings button
- `DiscussionControlBar` - Start/Pause/Resume/Stop buttons (contextual), strategy label, turn counter, current speaker indicator
- `MessageList` - Virtualized scrollable list of messages with infinite scroll (load older via cursor pagination)
- `MessageBubble` - Single message: avatar, agent name (colored), timestamp, markdown-rendered content, metadata (tokens, cost)
- `StreamingMessage` - Extends MessageBubble with live token-by-token rendering from `message:stream` SSE events
- `UserMessageBubble` - Visually distinct bubble for user-sent messages (right-aligned or different background)
- `SystemMessageBubble` - Subtle inline system messages (discussion started, paused, agent joined, etc.)
- `MessageInput` - Text input with agent selector dropdown (optional: address specific agent), send button, keyboard shortcut (Enter)
- `MembersSidebar` - Collapsible right panel listing room members with status, assign-next-speaker action, add/remove member actions
- `AgentStatusIndicator` - Colored dot/badge: idle (gray), thinking (amber pulse), responding (green pulse), error (red), stopped (dark)

**Data Requirements:**
- `GET /api/rooms/:id` - room detail
- `GET /api/rooms/:id/messages?limit=50` - initial messages (paginated, load more on scroll-up)
- `GET /api/rooms/:id/discussion` - discussion state
- `GET /api/agents` - agent details for member avatars/names
- SSE (with `roomId` filter): `message:new`, `message:stream`, `agent:status`, `discussion:state`

**Acceptance Criteria:**
- [ ] Room view loads with room name, members, and last 50 messages
- [ ] Messages render markdown content correctly
- [ ] Agent messages show colored avatar, agent name, timestamp, and metadata
- [ ] User messages are visually distinct from agent messages
- [ ] Streaming messages appear token-by-token as SSE `message:stream` events arrive
- [ ] Streaming indicator (typing/pulsing) shows while an agent is responding
- [ ] Discussion control buttons are contextual: Start visible when idle, Pause when running, Resume when paused, Stop when running/paused
- [ ] Current speaker and turn number update in real time via SSE
- [ ] User can type a message and send it (Enter key or Send button)
- [ ] Agent selector dropdown allows targeting a specific agent
- [ ] Infinite scroll loads older messages when scrolling up (cursor-based pagination)
- [ ] Auto-scrolls to bottom on new messages (unless user has scrolled up)
- [ ] Members sidebar toggles open/closed
- [ ] "Assign Next Speaker" button calls `POST /api/rooms/:id/discussion/assign`
- [ ] Add/remove member actions update room membership

### 3.3 Agent Gallery (`/agents`)

**Purpose:** Browse all available agents, view their personas, configurations, and memory.

**Layout:**
```
+----------------------------------------------------------+
| TopNav: Logo | Rooms | Agents | Settings       [Health]  |
+----------------------------------------------------------+
| Filter: [All] [Idle] [Active] [Error]  Sort: [Name ▾]    |
+----------------------------------------------------------+
| AgentGrid                                                 |
| +------------------+ +------------------+                 |
| | [Avatar]         | | [Avatar]         |                 |
| | Agent Name       | | Agent Name       |                 |
| | model: sonnet    | | model: opus      |                 |
| | Status: idle     | | Status: thinking |                 |
| | Tags: [a] [b]    | | Tags: [c] [d]    |                 |
| | Room: —          | | Room: Design     |                 |
| | Cost: $0.12      | | Cost: $0.45      |                 |
| | [View] [Reload]  | | [View] [Stop]    |                 |
| +------------------+ +------------------+                 |
+----------------------------------------------------------+
```

**Agent Detail (expandable card or slide-over panel):**
```
+----------------------------------------------------------+
| [Avatar] Agent Name                            [Reload]   |
| Model: sonnet | Status: idle | Cost: $0.12               |
+----------------------------------------------------------+
| Tabs: [Persona] [Config] [Memory]                        |
+----------------------------------------------------------+
| Persona tab: Markdown-rendered persona text               |
| Config tab: Tools, discussion settings, memory config     |
| Memory tab: Context summary, facts list, preferences      |
+----------------------------------------------------------+
```

**Components:**
- `AgentFilterBar` - Status filter buttons, sort dropdown (name, model, cost, status)
- `AgentGrid` - Responsive grid of agent cards
- `AgentCard` - Avatar (with color), name, model badge, status indicator, tags, current room, cost, action buttons
- `AgentDetailPanel` - Slide-over or expanded view with tabs: Persona (markdown), Config (structured), Memory
- `AgentPersonaView` - Rendered markdown of agent persona
- `AgentConfigView` - Structured display of tools, discussion config, memory config
- `AgentMemoryView` - Display of context, facts list, preferences from `/api/agents/:id/memory`

**Data Requirements:**
- `GET /api/agents` - all agents
- `GET /api/agents/:id` - single agent detail
- `GET /api/agents/:id/memory` - agent memory (on demand when Memory tab opened)
- `POST /api/agents/:id/reload` - reload agent config
- `POST /api/agents/:id/stop` - stop agent
- SSE: `agent:status` for live status updates

**Acceptance Criteria:**
- [ ] Page loads showing all agents in a responsive grid
- [ ] Each card shows avatar, name, model, status, tags, current room, total cost
- [ ] Filter buttons filter agents by status
- [ ] Sort dropdown sorts by name, model, cost, or status
- [ ] Clicking "View" opens the agent detail panel
- [ ] Persona tab renders the agent's persona as markdown
- [ ] Config tab shows tools (allowed/disallowed), discussion settings, memory config
- [ ] Memory tab loads and displays context, facts, and preferences
- [ ] "Reload" button reloads agent definition from disk
- [ ] "Stop" button stops the agent
- [ ] Agent status updates in real time via SSE

### 3.4 Settings (`/settings`)

**Purpose:** System configuration view and cost monitoring.

**Layout:**
```
+----------------------------------------------------------+
| TopNav: Logo | Rooms | Agents | Settings       [Health]  |
+----------------------------------------------------------+
| Tabs: [System] [Costs]                                   |
+----------------------------------------------------------+
| System tab:                                               |
|   Version: 0.1.0                                          |
|   Agents Directory: /path/to/agents                       |
|   Data Directory: /path/to/data                           |
|   Port: 3141                                              |
|   SSE Clients: 2                                          |
|   Uptime: 2h 34m                                          |
+----------------------------------------------------------+
| Costs tab:                                                |
|   Total Cost: $1.23                                       |
|   By Agent: [bar chart / table]                           |
|   By Room: [bar chart / table]                            |
+----------------------------------------------------------+
```

**Components:**
- `SettingsTabs` - Tab navigation between System and Costs
- `SystemConfigPanel` - Displays system config values (read-only)
- `CostDashboard` - Total cost display, cost-by-agent table, cost-by-room table
- `CostTable` - Sortable table with agent/room name and cost

**Data Requirements:**
- `GET /api/system/config` - system configuration
- `GET /api/system/health` - health metrics
- `GET /api/system/costs` - cost breakdown

**Acceptance Criteria:**
- [ ] System tab displays version, directories, port, uptime
- [ ] Costs tab shows total cost, per-agent costs, per-room costs
- [ ] Cost tables are sortable

---

## 4. Component Hierarchy

```
App (Next.js App Router layout)
├── RootLayout
│   ├── TopNav
│   │   ├── Logo
│   │   ├── NavLinks (Rooms, Agents, Settings)
│   │   └── HealthIndicator
│   └── {children}
│
├── DashboardPage (/)
│   ├── SystemHealthBar
│   ├── RoomList
│   │   ├── RoomCard (repeated)
│   │   │   ├── MemberAvatarStack
│   │   │   └── DiscussionStatusBadge
│   │   └── CreateRoomDialog
│   │       ├── RoomNameInput
│   │       ├── RoomTypeSelect
│   │       ├── TurnStrategySelect
│   │       └── MemberPicker
│   ├── ActiveDiscussionsList
│   │   └── ActiveDiscussionCard (repeated)
│   └── AgentOverviewGrid
│       └── AgentMiniCard (repeated)
│
├── RoomPage (/rooms/[roomId])
│   ├── RoomHeader
│   ├── DiscussionControlBar
│   │   ├── DiscussionActionButtons
│   │   ├── StrategyLabel
│   │   ├── TurnCounter
│   │   └── CurrentSpeakerIndicator
│   ├── MessageList
│   │   ├── MessageBubble (repeated)
│   │   │   ├── AgentAvatar
│   │   │   ├── MessageContent (markdown)
│   │   │   └── MessageMetadata
│   │   ├── StreamingMessage
│   │   ├── UserMessageBubble
│   │   └── SystemMessageBubble
│   ├── MessageInput
│   │   ├── AgentSelector
│   │   ├── TextInput
│   │   └── SendButton
│   └── MembersSidebar
│       ├── MemberListItem (repeated)
│       │   ├── AgentAvatar
│       │   ├── AgentStatusIndicator
│       │   └── MemberActions
│       ├── AssignSpeakerButton
│       └── AddMemberDialog
│
├── AgentsPage (/agents)
│   ├── AgentFilterBar
│   ├── AgentGrid
│   │   └── AgentCard (repeated)
│   │       ├── AgentAvatar
│   │       ├── ModelBadge
│   │       ├── StatusIndicator
│   │       ├── TagList
│   │       └── AgentActions
│   └── AgentDetailPanel
│       ├── AgentPersonaView
│       ├── AgentConfigView
│       └── AgentMemoryView
│
└── SettingsPage (/settings)
    ├── SettingsTabs
    ├── SystemConfigPanel
    └── CostDashboard
        └── CostTable (repeated for by-agent, by-room)
```

---

## 5. Zustand Store Shape

### 5.1 Store Architecture

Use a single Zustand store with logical slices. Each slice manages one domain of data and its related actions.

```typescript
interface MerryStore {
  // --- Agents Slice ---
  agents: Record<string, AgentState>;
  agentsLoading: boolean;
  fetchAgents: () => Promise<void>;
  fetchAgent: (id: string) => Promise<void>;
  reloadAgent: (id: string) => Promise<void>;
  stopAgent: (id: string) => Promise<void>;
  updateAgentStatus: (agentId: string, status: AgentStatus, roomId?: string) => void;

  // --- Rooms Slice ---
  rooms: Record<string, Room>;
  roomsLoading: boolean;
  fetchRooms: () => Promise<void>;
  fetchRoom: (id: string) => Promise<void>;
  createRoom: (req: CreateRoomRequest) => Promise<Room>;
  updateRoom: (id: string, updates: Partial<Room>) => Promise<void>;
  addMember: (roomId: string, agentId: string) => Promise<void>;
  removeMember: (roomId: string, agentId: string) => Promise<void>;

  // --- Messages Slice ---
  messagesByRoom: Record<string, ChatMessage[]>;
  streamingMessages: Record<string, string>; // messageId -> accumulated content
  messagesLoading: Record<string, boolean>;
  hasMore: Record<string, boolean>;
  nextCursor: Record<string, string | undefined>;
  fetchMessages: (roomId: string, limit?: number, before?: string) => Promise<void>;
  sendMessage: (roomId: string, content: string, agentId?: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  appendStreamChunk: (messageId: string, roomId: string, agentId: string, chunk: string, done: boolean) => void;

  // --- Discussion Slice ---
  discussions: Record<string, DiscussionState>; // keyed by roomId
  fetchDiscussion: (roomId: string) => Promise<void>;
  startDiscussion: (roomId: string) => Promise<void>;
  pauseDiscussion: (roomId: string) => Promise<void>;
  resumeDiscussion: (roomId: string) => Promise<void>;
  stopDiscussion: (roomId: string) => Promise<void>;
  assignNextSpeaker: (roomId: string, agentId: string) => Promise<void>;
  updateDiscussionState: (state: DiscussionState) => void;

  // --- System Slice ---
  health: SystemHealth | null;
  config: SystemConfig | null;
  costs: CostSummary | null;
  fetchHealth: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  fetchCosts: () => Promise<void>;

  // --- SSE Slice ---
  sseConnected: boolean;
  sseError: string | null;
  connectSSE: (roomId?: string) => void;
  disconnectSSE: () => void;
}
```

### 5.2 Slice Details

**Agents Slice** - `agents` is a `Record<string, AgentState>` keyed by agent ID for O(1) lookups. `updateAgentStatus` is called by the SSE handler when `agent:status` events arrive.

**Rooms Slice** - `rooms` is a `Record<string, Room>` keyed by room ID. CRUD operations call the REST API and update the local store optimistically.

**Messages Slice** - `messagesByRoom` stores messages grouped by room ID, sorted by `createdAt` ascending (oldest first). `streamingMessages` accumulates chunks for in-progress agent responses, keyed by `messageId`. When a stream completes (`done: true`), the streaming entry is removed and a full `ChatMessage` is expected via `message:new`.

**Discussion Slice** - `discussions` stores discussion state per room. State updates come from both REST responses and SSE `discussion:state` events.

**System Slice** - Caches system health, config, and cost data. Polled on settings page load.

**SSE Slice** - Manages the EventSource connection lifecycle. The `connectSSE` action creates an EventSource to `/api/events` and wires up event handlers that dispatch to other slices.

---

## 6. SSE Integration Patterns

### 6.1 Connection Management

```
Page Load / Room Enter
        │
        ▼
  connectSSE(roomId?)
        │
        ▼
  new EventSource('/api/events?roomId=...')
        │
        ├── onopen → set sseConnected = true
        ├── onerror → set sseError, attempt reconnect with backoff
        │
        ├── event: message:new → store.addMessage(data)
        ├── event: message:stream → store.appendStreamChunk(data)
        ├── event: agent:status → store.updateAgentStatus(data)
        ├── event: discussion:state → store.updateDiscussionState(data)
        └── event: heartbeat → reset reconnect timer
```

### 6.2 Reconnection Strategy

- On SSE error, attempt reconnect with exponential backoff: 1s, 2s, 4s, 8s, max 30s
- On successful reconnect, re-fetch latest state (messages, discussion state) to fill any gaps
- Heartbeat timeout: if no heartbeat received within 45s, treat as disconnected and reconnect

### 6.3 Room-Scoped SSE

When navigating to a room view, disconnect the global SSE connection and reconnect with `roomId` parameter. This ensures the client receives room-scoped events. On leaving the room view, reconnect without `roomId` for global events.

### 6.4 Streaming Message Assembly

```
SSE message:stream { messageId, chunk, done: false }
        │
        ▼
  streamingMessages[messageId] += chunk
        │
        ▼
  UI renders StreamingMessage component with accumulated text
        │
        ▼ (when done: true)
  Remove from streamingMessages
  Wait for message:new SSE event with final complete message
  addMessage() to messagesByRoom
```

---

## 7. Data Flow Diagrams

### 7.1 User Sends a Message (No Active Discussion)

```
User types message → clicks Send
        │
        ▼
  POST /api/rooms/:id/messages { content, agentId? }
        │
        ▼
  Daemon saves user message → returns ChatMessage
        │
        ▼
  Daemon picks target agent → calls agent.executeTurn()
        │
        ├──► SSE agent:status { agentId, status: 'thinking' }
        │         │
        │         ▼
        │    UI shows thinking indicator on agent
        │
        ├──► SSE message:stream { chunk, done: false } (repeated)
        │         │
        │         ▼
        │    UI renders streaming message token-by-token
        │
        ├──► SSE message:stream { chunk, done: true }
        │         │
        │         ▼
        │    UI finalizes streaming message
        │
        ├──► SSE message:new { ChatMessage }
        │         │
        │         ▼
        │    Store adds complete message to messagesByRoom
        │
        └──► SSE agent:status { agentId, status: 'idle' }
                  │
                  ▼
             UI clears thinking indicator
```

### 7.2 Start Discussion Flow

```
User clicks [Start Discussion]
        │
        ▼
  POST /api/rooms/:id/discussion/start
        │
        ▼
  Daemon starts discussion engine for room
        │
        ├──► SSE discussion:state { status: 'running', currentTurn, ... }
        │         │
        │         ▼
        │    UI updates DiscussionControlBar (shows Pause/Stop)
        │    UI shows current speaker indicator
        │
        ▼ (Discussion engine loop)
  Agent takes turn → executeTurn()
        │
        ├──► SSE agent:status (thinking → responding → idle)
        ├──► SSE message:stream (chunks)
        ├──► SSE message:new (complete message)
        └──► SSE discussion:state (next turn, new speaker)
                  │
                  ▼
             UI updates turn counter and current speaker
             (loop continues until paused/stopped/max turns)
```

### 7.3 User Intervention During Discussion

```
Discussion is running (status: 'running')
        │
User types message → clicks Send
        │
        ▼
  POST /api/rooms/:id/messages { content }
        │
        ▼
  Daemon saves user message (discussion engine picks it up)
        │
        ├──► SSE message:new { role: 'user', content }
        │         │
        │         ▼
        │    UI adds user message to chat
        │
        ▼
  Discussion engine incorporates user message into next agent's context
  Agents see and respond to user input in subsequent turns
```

### 7.4 Create Room Flow

```
User clicks [+ Create Room] on Dashboard
        │
        ▼
  CreateRoomDialog opens
  User fills: name, type, turnStrategy, members
        │
        ▼
  POST /api/rooms { name, type, turnStrategy, members }
        │
        ▼
  Daemon creates room → returns Room
        │
        ▼
  Store adds room to rooms
  UI navigates to /rooms/[newRoomId]
```

### 7.5 Assign Next Speaker Flow

```
Discussion is running, user wants specific agent to speak next
        │
        ▼
  User clicks [Assign Next Speaker] in MembersSidebar
  Selects agent from member list
        │
        ▼
  POST /api/rooms/:id/discussion/assign { agentId }
        │
        ▼
  Discussion engine overrides turn strategy for next turn
        │
        ▼
  SSE discussion:state with updated currentTurn reflects assigned agent
```

---

## 8. UX Flows

### 8.1 Creating a Room

1. User lands on Dashboard (`/`)
2. Clicks "+ Create Room" button
3. `CreateRoomDialog` modal opens with form fields:
   - **Room Name** (text input, required)
   - **Type** (select: "Group Chat" / "DM", defaults to "Group Chat")
   - **Turn Strategy** (select: "Round Robin" / "Free Form" / "Directed" / "Moderated", defaults to "Round Robin")
   - **Members** (multi-select from available agents, shows avatar + name, at least 1 required)
4. User fills in fields and clicks "Create"
5. POST request creates room, dialog closes
6. App navigates to the new room at `/rooms/[roomId]`

### 8.2 Starting a Discussion

1. User is in a Room View (`/rooms/[roomId]`)
2. Discussion status is "idle" - `DiscussionControlBar` shows [Start] button
3. User clicks [Start]
4. POST request starts discussion
5. UI updates: [Start] replaced with [Pause] [Stop], turn counter shows "Turn 1", current speaker indicator appears
6. First agent begins thinking (amber pulse on avatar)
7. Streaming tokens appear in chat as agent responds
8. When agent finishes, next agent's turn begins automatically
9. Cycle continues with each agent taking turns per the room's turn strategy

### 8.3 Pausing and Resuming

1. During a running discussion, user clicks [Pause]
2. Discussion engine completes current agent's turn, then pauses
3. UI updates: [Pause] becomes [Resume], status badge shows "Paused"
4. User can read through messages, scroll back, etc.
5. User clicks [Resume] to continue from where it left off

### 8.4 User Intervention

1. During a running discussion, user types a message in the `MessageInput`
2. User presses Enter or clicks Send
3. User message appears in chat (visually distinct)
4. Agents see the user message in their context on subsequent turns
5. Agents may respond to or acknowledge the user's input naturally

### 8.5 Stopping a Discussion

1. User clicks [Stop] during a running or paused discussion
2. Discussion engine stops, no further turns are taken
3. UI updates: control bar shows [Start] again (for a new discussion)
4. All messages from the discussion remain in the chat history

### 8.6 Managing Room Members

1. User opens MembersSidebar in a Room View
2. To add a member: clicks [+ Add Member], selects from agents not already in room
3. To remove a member: clicks remove icon on a member (confirmation dialog)
4. Member changes are reflected immediately in the sidebar and agent selector

### 8.7 Agent Inspection

1. User navigates to Agent Gallery (`/agents`)
2. Browses grid of agent cards, optionally filtering by status or sorting
3. Clicks "View" on an agent card
4. Agent detail panel slides open with tabs:
   - **Persona**: reads the agent's markdown persona
   - **Config**: views tools, discussion settings, memory limits
   - **Memory**: loads agent's accumulated memory (context, facts, preferences)
5. User can click "Reload" to refresh agent config from disk
6. User can click "Stop" to halt a running agent

---

## 9. Shared UI Components (shadcn/ui based)

These components from shadcn/ui should be installed and used:

| Component | Usage |
|-----------|-------|
| `Button` | All action buttons |
| `Card` | Room cards, agent cards |
| `Dialog` | Create room, add member, confirmations |
| `Badge` | Status badges, tags, model badges |
| `Avatar` | Agent avatars with colored backgrounds |
| `Tabs` | Agent detail tabs, settings tabs |
| `Select` | Room type, turn strategy, agent selector |
| `Input` | Room name, message input |
| `Textarea` | Message input (if multi-line needed) |
| `ScrollArea` | Message list, member list |
| `Separator` | Visual dividers |
| `Tooltip` | Hover info on statuses, costs |
| `DropdownMenu` | Sort options, agent actions |
| `Sheet` | Agent detail slide-over, members sidebar |
| `Skeleton` | Loading states for cards, messages |
| `Toast` | Success/error notifications for actions |

---

## 10. Design Tokens & Theme

- Agent avatar colors come from `AgentDefinition.color` (each agent has a unique color)
- Status colors:
  - `idle` → gray (`text-muted-foreground`)
  - `thinking` → amber (`text-amber-500`) with pulse animation
  - `responding` → green (`text-green-500`) with pulse animation
  - `error` → red (`text-destructive`)
  - `stopped` → dark gray (`text-muted`)
- Discussion status badges:
  - `idle` → gray outline
  - `running` → green filled
  - `paused` → amber filled
  - `stopped` → gray filled
- Dark mode support via shadcn/ui theme system (CSS variables)
- Message bubbles: agent messages left-aligned, user messages right-aligned with distinct background

---

## 11. Error Handling & Loading States

- All API calls wrapped in try/catch with toast notifications on error
- Loading skeletons shown while data is being fetched (Skeleton components for cards, messages)
- SSE disconnection shown via a top banner: "Connection lost. Reconnecting..."
- Empty states for:
  - No rooms: "No rooms yet. Create your first room to get started."
  - No agents: "No agents found. Add agent definitions to the agents directory."
  - No messages: "No messages yet. Start a discussion or send a message."
  - No active discussions: "No discussions running."
- 404 handling: If room/agent not found, show error page with link back to dashboard

---

## 12. Performance Considerations

- **Message list virtualization**: Use a virtualized list for rooms with many messages (100+) to keep DOM node count low
- **SSE connection sharing**: Single EventSource per page, not per component
- **Optimistic updates**: Room creation, member changes update the store immediately before API confirmation
- **Lazy loading**: Agent memory loaded only when Memory tab is opened; messages loaded in pages of 50
- **Debounced polling**: System health/costs polled every 30s on the settings page, not globally
