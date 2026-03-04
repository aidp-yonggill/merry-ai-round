# Local Claude Code Agent Service - Architecture Redesign

## Status Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Shared Types | [x] | agent.ts, process.ts, memory.ts, events.ts, message-parser.ts, api.ts |
| 6. Agent Config | [x] | slug + behavior fields, all .agent.md updated |
| 2. ClaudeProcess | [x] | claude-process.ts with stdin/stdout JSON streaming |
| 3. ProcessManager | [x] | process-manager.ts with multi-instance, health checks, crash recovery |
| 5. Memory System | [x] | memory-manager.ts, memory-compactor.ts, memory-synthesizer.ts |
| 4. MessageDispatcher | [x] | message-dispatcher.ts with rule-based dispatch, chain depth limit |
| 7. API Endpoints | [x] | instances.ts, updated agents.ts, updated messages.ts, wired server.ts |
| 8. Web UI | [ ] | In progress (gemini agent) |
| 9. Cleanup | [x] | Removed SDK dep, deleted discussion-engine/turn-controller/prompt-builder/memory-store/agent-instance |

## Files Created
- `packages/shared/src/types/process.ts`
- `packages/shared/src/types/memory.ts`
- `packages/daemon/src/process/claude-process.ts`
- `packages/daemon/src/process/process-manager.ts`
- `packages/daemon/src/memory/memory-manager.ts`
- `packages/daemon/src/memory/memory-compactor.ts`
- `packages/daemon/src/memory/memory-synthesizer.ts`
- `packages/daemon/src/core/message-dispatcher.ts`
- `packages/daemon/src/api/routes/instances.ts`

## Files Modified
- `packages/shared/src/types/agent.ts` — slug, AgentBehaviorConfig, removed discussion
- `packages/shared/src/types/events.ts` — instance/memory events, removed discussion
- `packages/shared/src/types/api.ts` — activeInstances replaces activeDiscussions
- `packages/shared/src/utils/message-parser.ts` — slug-based mention matching
- `packages/shared/src/index.ts` — updated exports
- `packages/daemon/src/agent/agent-config-loader.ts` — slug, behavior fields
- `packages/daemon/src/core/agent-manager.ts` — simplified, no more AgentInstance
- `packages/daemon/src/api/routes/agents.ts` — config/rules/memory endpoints
- `packages/daemon/src/api/routes/messages.ts` — uses MessageDispatcher
- `packages/daemon/src/server.ts` — full DI rewiring
- `packages/daemon/src/index.ts` — removed API key requirement
- `packages/daemon/package.json` — removed claude-agent-sdk
- `agents/*.agent.md` — slug + behavior frontmatter
- `.env.example` — CLAUDE_CLI_PATH

## Files Deleted
- `packages/daemon/src/core/discussion-engine.ts`
- `packages/daemon/src/core/turn-controller.ts`
- `packages/daemon/src/agent/prompt-builder.ts`
- `packages/daemon/src/agent/memory-store.ts`
- `packages/daemon/src/agent/agent-instance.ts`
- `packages/daemon/src/api/routes/discussion.ts`
- `packages/shared/src/types/discussion.ts`
