# Full Feature Test Plan

Daemon: http://localhost:3141
Web UI: http://localhost:3000

## Test Results

### Phase 1: System & Connection
- [x] 1.1 Settings 페이지 - 데몬 URL 설정 및 연결 테스트 → "Connected! Status: ok"
- [x] 1.2 Dashboard - 시스템 헬스, 에이전트 3개, 룸 목록 확인
- [x] 1.3 Connection status "Connected" 표시 확인

### Phase 2: Agents
- [x] 2.1 Agents 페이지 - 3개 에이전트 (architect, critic, researcher) 카드 표시
- [x] 2.2 Agent 상세 모달 - Model, Turns, Tokens, Cost, Budget, Persona, Tools 표시
- [x] 2.3 Agent memory 정보 확인 (tags, persona 등)

### Phase 3: Room Creation
- [x] 3.1 새 룸 생성 페이지 이동
- [x] 3.2 Room name, type (Group), turn strategy (Directed), agent 3개 선택
- [x] 3.3 Validation - Create Room 버튼 disabled (에이전트 미선택 시)
- [x] 3.4 룸 생성 완료 → 룸 페이지로 자동 이동

### Phase 4: Messaging & Streaming
- [x] 4.1 사용자 메시지 전송 → 정상 표시
- [x] 4.2 에이전트 응답 스트리밍 확인 ("is responding..." → 응답 완료)
- [x] 4.3 메시지에 마크다운 렌더링 (표, 코드블록, 볼드)
- [x] 4.4 @mention 자동완성 - @ 입력 시 드롭다운, 선택 시 자동 삽입

### Phase 5: Discussion Control
- [x] 5.1 Discussion 시작 (Start) → running 상태
- [x] 5.2 Round-robin 턴 진행 확인 (이전 세션 Test Room에서 확인)
- [x] 5.3 Discussion 일시정지 (Pause) → paused 상태 + Resume 버튼
- [x] 5.4 Discussion 재개 (Resume) → running 상태 복귀
- [x] 5.5 Discussion 중지 (Stop) → stopped 상태
- [x] 5.6 Directed 턴 - Assign 드롭다운 → The Critic 지정 → Turn 1 응답 완료

### Phase 6: Tool Use
- [x] 6.1 도구 사용 트리거 메시지 전송 → Architect가 Read/Glob 도구로 코드베이스 검색 후 응답
- [ ] 6.2 ToolUseBlock UI 시각화 미표시 — SDK 메시지 형식과 agent-instance.ts의 파싱 로직 불일치 (numTurns: 0, toolUseBlocks 미기록)

### Phase 7: Cost & Budget
- [x] 7.1 Dashboard 비용 표시 확인 - Total Cost $0.2214
- [x] 7.2 에이전트별 비용 추적 - Architect $0.0797, Critic $0.0877, Researcher $0.0540

### Phase 8: Persistence & Edge Cases
- [x] 8.1 페이지 새로고침 후 메시지 유지 → SQLite에서 메시지 로드 확인
- [x] 8.2 모바일 반응형 UI - 375x812에서 사이드바 접힘, 채팅 정상 표시

## Bugs Found & Fixed

### Bug 1: Directed mode assign 즉시 종료
- **증상:** Directed 모드 discussion 시작 후 Assign해도 에이전트가 응답하지 않음
- **원인:** `discussion-engine.ts` - 루프가 `_assignedAgent` 없으면 `break`로 즉시 종료
- **수정:** directed 모드에서는 500ms 폴링으로 대기 후 `continue`
- **파일:** `packages/daemon/src/core/discussion-engine.ts:152`

### Bug 2: 채팅 메시지 영역 스크롤 불가
- **증상:** 메시지가 많은 룸에서 마우스 휠 스크롤이 동작하지 않음
- **원인:** flex 컬럼 레이아웃에서 `min-height: auto` 기본값으로 ScrollArea가 콘텐츠 이하로 줄어들지 않음 → `<main overflow-hidden>`이 콘텐츠를 잘라냄
- **수정:** `MessageList.tsx`의 ScrollArea에 `min-h-0` 추가
- **파일:** `packages/web/src/components/chat/MessageList.tsx:31`

### Known Issue: ToolUseBlock 시각화 미동작
- **증상:** 에이전트가 도구를 사용해도 UI에 ToolUseBlock이 표시되지 않음
- **원인:** Claude Agent SDK의 `query()` 스트림 메시지 형식이 `agent-instance.ts`의 파싱 로직과 불일치 (assistant 메시지의 content 배열 접근 실패, `numTurns: 0`)
- **영향:** 기능 동작은 하지만 도구 사용 과정이 사용자에게 보이지 않음
- **추후 작업:** SDK 메시지 형식을 디버그 로깅으로 확인 후 파싱 로직 수정 필요

## Summary
- **23/24 항목 통과** (95.8%)
- **2 버그 발견 & 수정** (directed mode assign, 스크롤 불가)
- **1 Known Issue** (ToolUseBlock 시각화)
