# 작업 백로그

## T-INIT-001: 요구사항 잠금 완료
- 상태: Done
- 범위: PDF 요구사항을 requirements.md/architecture.md로 정합성 정리
- 산출물: requirements.md, execution-plan.md, plan.md (Phase0 완료)

## T-DATA-101: DB 스키마 초기 구현
- 상태: Done
- 범위:
  - `server/src/models/schema.sql` 생성 및 핵심 엔티티 정의
  - Agent, Task, Artifact, ReviewReport, Issue, Decision, Secret, AuditEvent
- 산출물: schema.sql, README 갱신

## T-WF-102: 상태 전이/역할권한 규칙
- 상태: Done
- 범위:
  - 상태 전이 매트릭스 초안 구현
  - 역할(Worker/Manager) 기반 권한 체크
- 산출물: `server/src/policy/transition.js`, `server/src/services/kanbanService.js`

## T-CORE-110: Core API 및 Dashboard MVP
- 상태: Done
- 범위:
  - Task/Artifact/Review API, Audit 조회
  - 우선순위 점수/guard 계산 반영
  - 웹 대시보드 polling 기반 보드 뷰
- 산출물: `server/src/api/server.js`, `web/index.html`, `server/src/services/kanbanService.js`

## T-ORB-120: Orchestrator/Runtime 초기 뼈대
- 상태: Done
- 범위:
  - Ready -> InProgress -> InReview 모의 오케스트레이션 스크립트
  - Worker/Reviewer/Manager 런타임 템플릿(stub)
  - Provider Hub 인터페이스 스텁
- 산출물: `server/src/orchestrator.js`, `runtime/*-runtime.js`, `server/src/providers/*.js`

## T-SEC-130: Secret/보안/운영 안전
- 상태: Done
- 범위:
  - Secret 암복호화 저장소 + 마스킹
  - lock/attempt/중복 작업 방지 정책
  - retry 토글/수동 중단 정책(운영용 API) 적용
  - Orchestrator 동시 실행 차단(`_cycleRunning` 플래그)
- 산출물: `server/src/lib/security.js`, `server/src/services/secretService.js`, `server/src/services/kanbanService.js`, `server/src/orchestrator.js`

## T-E2E-140: 통합 검증
- 상태: Done
- 범위:
  - e2e 체크리스트 정리 및 전체 시나리오 확대
  - 핵심 플로우(생성/전이/오케스트레이터) 검증 기록
  - Blocked/Archived/Retry 경로 e2e 시나리오 완성
  - Lock/Secret/결정이력 API 시나리오 추가
- 산출물: `docs/e2e-checklist.md` (7개 시나리오)

## T-OPS-150: 배포/운영 가이드
- 상태: Done
- 범위:
  - 로컬 단일 머신 배치 가이드
  - 환경 변수, DB 관리, 재시작/장애 대응
  - API 전체 요약표
- 산출물: `docs/operations.md`

## T-CHKSUM-160: Artifact Checksum 자동화
- 상태: Done
- 범위:
  - `addArtifact` sha256 자동 계산 로직 구현
  - worker-runtime에서 checksum 포함 산출물 생성
  - orchestrator에서 checksum 전달 연결
- 산출물: `server/src/services/kanbanService.js`, `runtime/worker/worker-runtime.js`, `server/src/orchestrator.js`

## T-API-History-170: 전체 결정/리뷰 이력 API
- 상태: Done
- 범위:
  - `GET /api/decisions` 전체 결정 이력 엔드포인트
  - `GET /api/reviews` 전체 리뷰 이력 엔드포인트
  - `listAllReviewReports` 서비스 함수
- 산출물: `server/src/api/server.js`, `server/src/services/kanbanService.js`
