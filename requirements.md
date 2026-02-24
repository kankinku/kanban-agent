# Kanban SSOT 멀티 에이전트 시스템 요구사항 v1.0

## 0) 범위
- 목표: **Kanban 단일 진실원천(SSOT)** 기반으로 Worker/Reviewer/Manager 역할을 분리한 로컬 멀티에이전트 자동작업 체계 구축.
- 배포: 단일 머신(로컬)에서 `api`, `orchestrator`, `agent-runtime`, `web`, `db`, (선택) `redis` 동시 구동.
- 원칙: 문서 기반 규칙 준수, 과도한 자율화 금지, 감사 가능성 보장.

## 1) 기능 요구사항
### 1.1 핵심 기능
- Kanban Core: Task/Artifact/Review/Decision/Agent/ProviderAccount 영속 저장 및 상태관리
- Orchestrator: 작업 스케줄링 및 Worker/Reviewer/Manager 경로 라우팅
- Agent Runtime: 역할별 실행 환경(Worker/Reviewer/Manager) 및 산출물 생성
- Provider Hub: OpenAI/Gemini/Codex/선택적 Antigravity 연동
- Credentials/Secret Store: 키/토큰 안전 저장 및 최소 접근
- Event Bus + Audit Log: 상태 변경 및 결정 이력 실시간 기록/재생성 가능성
- Local Dashboard: Kanban 보드 + 에이전트/리뷰/로그/대시보드 상태

### 1.2 비기능 요구
- 무한 루프 및 미승인 자동실행 금지(시도 제한/재시도 제한/휴지기/수동 승인 브레이크)
- 충돌 방지: lock + optimistic lock + 동일 작업 중복 방지
- 재현성: Artifact checksum + 실행 로그 + 결정 이력
- 보안: 비밀값 마스킹, 파일 기반 설정 오염 방지, 최소 권한

### 1.3 제외(Do Not)
- 약관/보안 정책 우회 자동화
- 프런트엔드에서 API 키/OAuth 토큰 직접 처리
- “완전 자동 완결”형 무제한 실행

## 2) 업무 규칙 (요구사항 정합성)
- Task 상태/전이: Backlog, Ready, InProgress, InReview, Blocked, Done, Archived
- 승인/리뷰 책임 분리: Worker 실행, Reviewer 평가, Manager 결정
- Ready 승격은 문서 조건 충족 시에만 허용

## 3) 산출물
- 요구사항 추적표(TR): plan.md 각 항목 ↔ 구현 모듈 매핑
- API 명세 + DB 마이그레이션
- 테스트 플랜(단위/통합/E2E)
- 운영 매뉴얼(로컬 배치/장애 복구)
