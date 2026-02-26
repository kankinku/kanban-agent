# Kanban SSOT 시스템 아키텍처

## 1) 구성요소
- **Kanban Core Service**
  - Task/Artifact/Review/Decision/Agent/ProviderAccount 관리
  - 상태 전이 규칙, 권한 검증, 우선순위 스코어 계산, WIP/attempt 정책 적용
- **Orchestrator (Dispatcher)**
  - Ready 상태 작업 선별
  - Worker 할당 → 결과 수집 → Reviewer 큐 전달 → Manager 전달
  - 스케줄링 정책(우선순위, 모델비용, 의존성, 공정성)
- **Agent Runtime**
  - 역할별 실행기: Worker/Reviewer/Manager
  - 공통 인터페이스: heartbeat, 상태 리포트, 표준 산출물(JSON)
- **Provider Hub**
  - OpenAI API, Gemini API, Gemini OAuth, Codex CLI, (선택)Antigravity
  - 통합 실행 결과를 구조화 구조(Artifact/ReviewReport)로 반환
- **Credentials & Secret Store**
  - API 키/리프레시 토큰/Codex 상태 경로 저장
  - 마스킹된 감사로그 및 키 회수/폐기 경로 제공
- **Event Bus + Audit Log**
  - 상태/결정/리뷰/작업이벤트 스트림화
  - 실시간 UI 반영(WebSocket)
- **Local Dashboard (localhost)**
  - Kanban Board / Agents / Review / Triage / Logs / Artifacts 탐색

## 2) 데이터 흐름
1. 사용자/관리자가 Task 생성(문서 조건 보정)
2. Kanban Core가 상태 검증 후 Ready 승격 후보 반영
3. Orchestrator가 Worker로 할당
4. Worker가 산출물 생성 후 InReview 전환
5. Reviewer가 JSON 리포트 생성
6. Manager가 pass/needs_work/reject 결정
7. 결정 반영 + 감사 로그 축적 + Dashboard 갱신

## 3) 배치 방식
- 로컬 단일 머신 기준 1) api 2) orchestrator 3) runtime pool(Worker/Reviewer/Manager) 4) web-ui 5) db 6) redis(optional)
- 초기에는 sqlite + in-memory 큐로 시작, 성능 이슈 시 redis로 대체
