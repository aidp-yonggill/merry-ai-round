# Contextual Response Trigger

Status: COMPLETE

## Concept
New `contextual` trigger type: use a fast Haiku call to ask "Should this agent respond to this message?" based on the agent's role, persona, and recent context.

## Steps
- [x] shared/types/agent.ts: Add 'contextual' to ResponseTrigger
- [x] daemon/agent/agent-config-loader.ts: Add 'contextual' to VALID_TRIGGERS
- [x] daemon/core/message-dispatcher.ts: Async shouldAgentRespond + Haiku relevance check
- [x] agents/*.agent.md: Change trigger to contextual
- [x] Frontend i18n + CreateAgentDialog: Add contextual trigger label/option
- [x] Build + verify
