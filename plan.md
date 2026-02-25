# Kanban SSOT 멀티에이전트 자동화 시스템 구축 계획

## 1) 사용자 의도 정확 파악 (요약)
- **목표:** Kanban을 SSOT로 두고 Worker / Reviewer / Manager 역할을 분리한 로컬 멀티에이전트 자동 운영 체계를 구축
- **핵심:** 문서 기반(요구사항, 상태 규칙, 데이터 스키마)으로만 구현 범위를 정의하고, 임의 확장/과도한 자동화 없이 통제 가능한 실행 흐름으로 구현
- **중요 제약:**
  - 모델/서비스 약관 회피 자동화 금지
  - API 키/토큰을 프론트에서 직접 다루지 않음
  - 무한 루프/무승인 자율실행 금지
- **요청 반영 방식:** 최종 산출물(명세/설계/작업표) 기반으로 **omx-automation 기반으로 단계 실행**

## 2) 새 폴더 생성 완료
- 경로: `projects/kanban-ssot-system/`
- 핵심 문서: `plan.md` (본 파일)

---

## 3) 진행 단계별 구현 계획 (체크리스트)

### Phase 0. 범위 고정 및 MVP 확정 (선결)
- [x] 문서 요건 정합성 정리
  - [x] 0.1 시스템 개요의 목적/비목적을 기능 요구사항/비기능 요구사항으로 분리
  - [x] 1.1 아키텍처 컴포넌트( Core/Orchestrator/Runtime/Provider Hub/Credentials/Audit/Dashboard )를 MVP 범위로 축소 정의
- [x] 기술 스택 확정 (최소 의존성)
  - [x] db: sqlite(초기), redis: 옵션
  - [x] 서버: Node.js(TypeScript) + 경량 API 서버
- [x] 보안/운영 정책 확정
  - [x] 비밀값 암호화 저장/마스킹 정책
  - [x] 종료 조건, 재시도 상한, infinite-loop 방지 조건(최소 1개)
  - [x] 감사로그 보존 정책(기본 보존 기간)
- [x] 테스트 전략 확정
  - [x] 단위/통합/워크플로우 테스트 케이스 목록 작성

### Phase 1. 데이터 모델 및 상태 기초 구현
- [x] DB 스키마 구현 (초기 뼈대 생성)
  - [x] `Task` 테이블(문서 3.1 필드 1:1 반영)
  - [x] `Artifact`, `ReviewReport`, `Issue` 기본 테이블
  - [x] 잠금(`lock_id`, `lock_expires_at`) 및 버전(`version`) 처리
  - [x] 전환 이력/감사 이벤트 기본 테이블(`decisions`, `audit_events`) 추가
- [x] 상태 전이 규칙 구현(문서 2.2)
  - [x] `Backlog->Ready`, `Ready->InProgress`, `InProgress->InReview`, `InReview->Done/Backlog/Ready`, `Any->Blocked`, `Any->Archived`
  - [x] 역할권한(Worker/Manager) 및 조건(artifact/reviewer pass) 강제
  - [x] 전이 규칙 엔진 초안(`server/src/policy/transition.ts` / `server/src/services/kanbanService.js`) 추가(권한·조건 적용)
  - [x] 문서 조건/아티팩트/리뷰 pass 가드 정식 통합(guard in service + API transitions) 완료
- [x] Ready 승격 가드(문서 2.3)
  - [x] acceptance criteria ≥1, DoD 존재, dependency 배열 처리
  - [x] effort 과대 시 분해 권고 플래그

### Phase 2. 이벤트/대시보드 코어
- [x] `Kanban Core Service` 구현
  - [x] Task/Artifact/Review/Decision 저장·조회 API
  - [x] 우선순위 점수 계산(문서 기반 기본 수식 적용)
  - [x] WIP/시도 횟수 제한 규칙 적용(필드 보존 및 제한 정책 엔진 기초)
- [x] Event Bus + Audit Log
  - [x] 상태 변경/리뷰/결정 이벤트 발행
  - [x] 감사 이벤트 최소 항목(누가/무엇/언제/왜) 저장
- [x] Local Dashboard 기본 UI
  - [x] Kanban Board 컬럼 조회
  - [x] Agents/Review/Blocked/로그 패널
  - [x] WebSocket 또는 polling으로 상태 반영

### Phase 3. Orchestrator + Agent Runtime
- [x] Orchestrator 스케줄러 구현(초안)
  - [x] Ready → Worker 할당
  - [x] 완료 산출물 자동 In Review 전환(모의 모드)
  - [x] Reviewer 큐/Manager 의사결정 라우팅
- [x] Agent Runtime 구조 분리
  - [x] Worker/Reviewer/Manager 실행 템플릿
  - [x] Heartbeat + 상태 보고(스탠바이)
  - [x] JSON 산출물 규격(artifact, review report)
- [x] Provider Hub
  - [x] OpenAI API 커넥터(스텁)
  - [x] Gemini API/OAuth 커넥터(스텁)
  - [x] Codex CLI 커넥터(스텁)
  - [ ] Antigravity: 기본 비활성 플러그인화 (보류)

### Phase 4. 보안·운영·안전 통제 강화
- [ ] Credentials & Secret Store
  - [x] Secret 암호화 저장 및 접근권한 검증(보완 필요: 접근권한 정책 미세조정)
  - [x] 로그/응답에서 민감정보 마스킹(공개 응답 기준 마스킹)
- [ ] 충돌·재작업 방지
  - [x] Attempt/Lock 정책, 중복 작업 차단(동시 작업 임계/락 획득/해제)
  - [x] 리뷰 실패/변경 후 Backlog or Ready 복귀 정책(관리자 force 전환 지원)
  - [x] 수동 승인/중단 토글(추후 UI 전환 버튼 연동)
- [ ] 감사 가능성/재현성
  - [x] 작업 산출물 path 및 checksum 저장(addArtifact sha256 자동 계산)
  - [x] 결정 이력 및 리뷰 이력 조회 API (`GET /api/decisions`, `GET /api/reviews` 추가)

### Phase 5. 통합 검증 및 런칭 준비
- [x] e2e 시나리오 준비
  - [x] Task 생성/조회/상태 전이 API 검증
  - [x] Blocked/Archived/Retry 경로 검증 (docs/e2e-checklist.md 시나리오 2~3 완성)
  - [x] Worker 수행→Reviewer 리뷰→Manager 결정 완전 자동 경로 실제 통합 검증
- [x] 성능/안정성 체크
  - [x] 동시성, 큐 지연, 이벤트 누락 대응 (orchestrator _cycleRunning 플래그, lock TTL)
- [x] 배포/운영 가이드 작성
  - [x] 로컬 단일 머신 배치(요구사항 1.2) → docs/operations.md
  - [x] 최초 실행/재시작/장애 대응 방법 → docs/operations.md 섹션 4, 7

### Phase 6. 실제 AI 파이프라인 연결 및 핵심 결함 수정
> **배경:** Phase 5까지 인프라(DB/API/상태머신/보안/대시보드)는 완성. 하지만 Worker/Reviewer/Manager Runtime이 스텁이며 Provider Hub와 전혀 연결되지 않아 실제 AI가 한 번도 호출되지 않는 상태. 이 단계에서 실제 멀티에이전트 동작을 구현한다.

#### [P0-CRITICAL] 실제 AI 실행 파이프라인 연결
- [x] 6.1 orchestrator.js 비동기 전환 및 callProvider() 연결
  - [x] `runCycle()` / `_runCycleImpl()` → async 함수로 전환
  - [x] 에이전트 DB에서 모델명 조회 → 프로바이더 자동 매핑 (gpt→openai, gemini→gemini, codex→codex, copilot→github-copilot)
  - [x] Worker step: `callProvider(providerName, {prompt, systemPrompt})` 실제 호출 (프로바이더 미설정 시 스텁 fallback)
  - [x] Reviewer step: 워커 결과를 컨텍스트로 `callProvider` 호출 → verdict 파싱
  - [x] Manager step: 리뷰 결과를 컨텍스트로 `callProvider` 호출 → Done/Blocked 결정 파싱
- [x] 6.2 Worker 실패 시 Blocked 자동 rollback
  - [x] `workerOut.ok === false` 시 `updateTaskStatus → Blocked` 처리
  - [x] 오류 이유 audit log 기록

#### [P1-MAJOR] API 및 서버 수정
- [x] 6.3 server.js에서 `await runCycle()` 처리 (async 전환 반영)
- [x] 6.4 index.js에 자동 스케줄러 추가
  - [x] `KANBAN_CYCLE_INTERVAL_MS` env 변수 (기본 30초)
  - [x] pause 상태 시 스킵, 이미 실행 중 시 스킵

#### [P1-MAJOR] 대시보드 UX 수정
- [x] 6.5 addTaskModal에 `definitionOfDone` textarea 추가
  - [x] `submitTask()`에서 `definitionOfDone` 필드 POST body에 포함
  - [x] AC/DoD 비어있을 시 alert 및 제출 차단
- [x] 6.6 kickoffModal `submitKickoff()` 수정
  - [x] 킥오프 태스크에 기본 `acceptanceCriteria` + `definitionOfDone` 자동 세팅
  - [x] Backlog 등록 후 API로 즉시 Ready 승격
- [x] 6.7 task 상세 모달에 상태별 액션 버튼 추가
  - [x] Backlog 태스크: "Ready로 승격" 버튼
  - [x] Blocked 태스크: "Ready로 재시도 / Backlog로 / 보관" 버튼
  - [x] `promoteTask(id, toStatus)` 헬퍼 함수 추가

#### [P2-QUALITY] WIP 계산 버그 수정
- [x] 6.8 `getTaskCountInProgress` agentId 필터 제거
  - [x] 전체 InProgress/InReview 태스크 수 기준으로 WIP 제한 계산

#### [P2-QUALITY] PM 에이전트 태스크 분해 로직
- [x] 6.9 pm-01 Kickoff 태스크 자동 분해 처리
  - [x] orchestrator가 `assigneeAgentId === 'pm-01'` 또는 `[프로젝트 셋업]` 제목 태스크를 특별 처리
  - [x] callProvider로 PM 에이전트에게 프로젝트 설명 전달 → 하위 태스크 목록 수신 (fallback: 기본 3개 자동 생성)
  - [x] 하위 태스크 자동 `createTask` + Backlog 등록
- [x] 6.10 `upsertDefaultAgents` INSERT OR IGNORE 수정
  - [x] 기존 에이전트가 있어도 pm-01 포함 모든 기본 에이전트 항상 확보
- [x] 6.11 artifact kind 제약 조건 준수
  - [x] PM artifact kind를 'pm_decomposition' → 'report'로 수정 (SQLite CHECK constraint 준수)

---

## 4) omx 작업 실행 제안 (문서 기반 실행)
- **작업 단위 분해 원칙:** Phase별로 각 Task를 개별 Omx 작업으로 등록해 진행
  - 현재 착수: `T-INIT-001`, `T-DATA-101`, `T-WF-102`, `T-CORE-110`, `T-ORB-120`
- **예시 실행 큐 구성(첫 사이클):**
  - `T-INIT-001`: Phase0 범위 고정 및 MVP 요구사항 잠금
  - `T-ARCH-010`: DB 스키마(Task/Artifact/Review) 설계 및 마이그레이션
  - `T-WF-020`: 상태 전이/역할 권한 엔진 구현
  - `T-DASH-030`: Kanban Board+이벤트 로그 기본 UI
  - `T-ORB-040`: Orchestrator 스케줄러와 worker/reviewer/manager 라우팅
- **운영 루프:**
  - 매일 기준점검: `Blocked` 처리 건수, attempt 상한 초과율, 리뷰 부적합률
  - 실패 시 원인 분기(요건 부재/리뷰 불일치/오류/보안 정책 위반)로 되돌리기

## 5) 산출물 체크 포맷 (omx 연동 권장)
- 각 작업 완료 시 `Task` 상태와 연계해 다음을 저장
  - [ ] 변경된 파일 목록
  - [ ] API 명세 diff
  - [ ] 단위 테스트 결과
  - [ ] Reviewer 보고서(통과/재작업)
  - [ ] 관련 Artifact 링크/체크섬

## 6) 참고 문서 반영 우선순위
1. 문서 2.2 상태 전이/권한 규칙 (우선 반영)
2. 문서 3.1~3.3 데이터 스키마 (우선 반영)
3. 문서 1.1 핵심 모듈(Orchestrator/Provider Hub/Secret/Audit)
4. 문서 1.2 배포 아키텍처
5. 문서 2.3 Ready 승격 조건

