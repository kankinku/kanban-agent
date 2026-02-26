# Kanban SSOT 멀티에이전트 자동화 시스템

Kanban을 단일 진실원천(SSOT)으로 삼아 **Worker / Reviewer / Manager** 역할을 분리한 로컬 멀티에이전트 자동 운영 체계.
AI 프로바이더(OpenAI, Gemini, Codex CLI, GitHub Copilot)와 연동해 Task를 자동으로 처리·검토·결정한다.

---

## 목차

1. [시스템 설계](#1-시스템-설계)
2. [개발 과정 Phase 0 ~ 7](#2-개발-과정-phase-0--7)
3. [프로젝트 구조](#3-프로젝트-구조)
4. [통합 실행](#4-통합-실행)
5. [환경 변수](#5-환경-변수)
6. [API 엔드포인트](#6-api-엔드포인트)
7. [AI 프로바이더 연동](#7-ai-프로바이더-연동)
8. [Task 상태 흐름](#8-task-상태-흐름)

---

## 1. 시스템 설계

### 핵심 원칙

| 원칙 | 내용 |
|---|---|
| SSOT | Kanban DB가 모든 상태의 유일한 진실원천 |
| 역할 분리 | Worker(실행) / Reviewer(검증) / Manager(결정) 완전 분리 |
| 통제 가능성 | 무한루프·미승인 자율실행 금지, 수동 중단 브레이크 |
| 감사 가능성 | 모든 상태 변경·결정·산출물에 이력 기록 + 체크섬 |
| 보안 | Secret AES-256-GCM 암호화, API 키 마스킹, 최소 권한 |

### 아키텍처 구성요소

```
┌─────────────────────────────────────────────────────────┐
│                   Local Dashboard (web/)                 │
│          Kanban Board · Agents · Audit · Logs            │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP / Polling
┌────────────────────▼────────────────────────────────────┐
│              REST API  (port 4100)                       │
│  server/src/api/server.js  +  server/src/services/       │
└──────┬──────────────┬───────────────────┬───────────────┘
       │              │                   │
  ┌────▼────┐   ┌─────▼──────┐   ┌───────▼───────┐
  │Kanban   │   │Orchestrator│   │  Secret Store  │
  │Core     │   │(Dispatcher)│   │  AES-256-GCM   │
  │SQLite   │   │ runCycle() │   └───────────────┘
  └────┬────┘   └─────┬──────┘
       │              │
  ┌────▼──────────────▼────────────────────────────┐
  │             Provider Hub                        │
  │  openai · gemini · gemini-oauth · codex · gh   │
  └────────────────────────────────────────────────┘
```

### 데이터 흐름

```
사용자 → Task 생성(Backlog)
       → Ready 승격(AC/DoD 조건 충족)
       → Orchestrator: Worker 할당 → callProvider()
       → Worker 산출물(Artifact) 생성 → InReview
       → Reviewer 검토 → ReviewReport
       → Manager 결정(pass/needs_work/reject)
       → Done or Blocked(Backlog 복귀)
       → Audit Log 축적
```

---

## 2. 개발 과정 Phase 0 ~ 7

### Phase 0 — 범위 고정 및 MVP 확정
- 요구사항 정합성 정리 (기능/비기능 분리)
- 기술 스택 확정: Node.js ESM + SQLite + Express
- 보안/운영 정책 확정 (비밀값 암호화, 재시도 상한, 감사로그 보존)

### Phase 1 — 데이터 모델 및 상태 기초
- SQLite 스키마 구현: `Task`, `Artifact`, `ReviewReport`, `Issue`, `AuditEvent`
- 상태 전이 엔진 구현 (문서 2.2 기준 7개 상태 × 권한 규칙)
- Ready 승격 가드: AcceptanceCriteria ≥ 1, DoD 존재, dependency 처리

### Phase 2 — 이벤트/대시보드 코어
- Kanban Core Service: Task/Artifact/Review/Decision CRUD
- 우선순위 점수 계산, WIP/시도 횟수 제한
- 감사 이벤트(누가/무엇/언제/왜) 저장
- 대시보드 UI: Kanban Board + Polling 상태 반영

### Phase 3 — Orchestrator + Agent Runtime
- Orchestrator 스케줄러: Ready → Worker 배정 → InReview 자동 전환
- Worker / Reviewer / Manager 실행 템플릿 분리
- Provider Hub: OpenAI / Gemini / Codex / GitHub Copilot 커넥터

### Phase 4 — 보안·운영·안전 통제
- Secret Store: AES-256-GCM 암호화 저장 + 마스킹 API
- Attempt/Lock 정책, 중복 작업 차단 (lock TTL + `_cycleRunning` 플래그)
- Artifact sha256 체크섬 자동 계산·저장
- 결정 이력 / 리뷰 이력 조회 API

### Phase 5 — 통합 검증 및 런칭 준비
- E2E 시나리오 검증 (생성 → 전이 → Blocked → Retry → Done)
- 운영 가이드 작성 ([docs/operations.md](docs/operations.md))
- E2E 체크리스트 작성 ([docs/e2e-checklist.md](docs/e2e-checklist.md))

### Phase 6 — 실제 AI 파이프라인 연결
- `orchestrator.js` async 전환 + `callProvider()` 실 연동
- Worker / Reviewer / Manager 각 단계마다 실제 AI 호출
- Worker 실패 시 Blocked 자동 rollback + audit log
- 대시보드 UX: addTaskModal DoD 필드, Kickoff 자동 AC 세팅, Blocked 액션 버튼
- PM 에이전트(pm-01) Kickoff 태스크 자동 분해 로직

### Phase 6.5 — 실행 파일(.exe) 빌드
- `build.js`: esbuild 번들 + pkg 패키징
- `launcher.cjs`: PATH에서 시스템 Node.js 탐색 → `dist/server/src/index.js` 스폰
- 빌드 결과: `dist/kanban-agent.exe` (단일 실행파일, 브라우저 자동 오픈)

### Phase 7 — Pre-flight 환경 자동 점검·설치

**배경:** CLI 도구 미설치 시 `spawn ENOENT`로 크래시 발생 → 구조적 해결

**문제:** `index.js`에 인라인으로 뭉쳐 있던 설치 로직 → 체크 범위 협소 + ENOENT 미처리

**개선 내용:**

- `server/src/lib/preflight.js` 독립 모듈 신설
  - Node.js 버전 체크 (≥18 미충족 시 `process.exit(1)`)
  - CLI 미설치 감지 → **자동 설치** (winget / brew / npm) → PATH 갱신 후 재탐색 최대 3회
  - 환경변수 미설정 경고 (warn — 서버 기동은 계속)
  - `fatal:N / warn:N` 요약 출력
- `index.js` 인라인 80줄 블록 → `await runPreflight()` 한 줄로 교체
- 각 Provider의 `spawnSync` 호출부에 `findBin()` 선체크 추가 (ENOENT 완전 차단)
- 모든 `spawn()` 호출에 `.on('error')` 핸들러 부착 (unhandled crash 방지)

---

## 3. 프로젝트 구조

```
kanban-agent/
├── dist/                       # 빌드 산출물
│   ├── kanban-agent.exe        # 단일 실행파일 (Windows)
│   ├── server/                 # 서버 소스 + node_modules
│   └── web/                    # 대시보드 정적 파일
│
├── server/
│   ├── package.json
│   └── src/
│       ├── index.js            # 진입점 (preflight → API → scheduler)
│       ├── orchestrator.js     # 자동 사이클 스케줄러
│       ├── control.js          # pause/resume 컨트롤
│       ├── launcher.cjs        # .exe 런처
│       ├── api/
│       │   └── server.js       # Express REST API (port 4100)
│       ├── lib/
│       │   ├── preflight.js    # 환경 자동 점검·설치 [Phase 7]
│       │   ├── db.js           # SQLite 연결
│       │   ├── constants.js
│       │   └── security.js     # AES-256-GCM 암호화
│       ├── models/
│       │   └── schema.sql      # DB 스키마
│       ├── policy/
│       │   └── transition.js   # 상태 전이 규칙 엔진
│       ├── providers/
│       │   ├── index.js        # Provider Hub (라우팅)
│       │   ├── openai.js       # OpenAI API
│       │   ├── gemini.js       # Gemini API + OAuth(gcloud)
│       │   ├── codex.js        # Codex CLI
│       │   └── github-copilot.js  # GitHub Copilot (gh CLI)
│       └── services/
│           ├── kanbanService.js   # Task/Artifact/Review 핵심 로직
│           └── secretService.js   # Secret Store
│
├── web/
│   └── index.html              # 대시보드 (단일 파일)
│
├── runtime/
│   ├── worker/worker-runtime.js
│   ├── reviewer/reviewer-runtime.js
│   └── manager/manager-runtime.js
│
├── plan.md                     # 개발 계획 및 체크리스트
├── requirements.md             # 요구사항 명세
├── architecture.md             # 아키텍처 설계
└── task-backlog.md             # 작업 백로그
```

---

## 4. 통합 실행

### 방법 A — 소스에서 직접 실행 (개발)

```powershell
# 의존성 설치
cd server
npm install

# 서버 실행
# preflight 자동 처리 → API 기동 → 브라우저 자동 오픈
node src/index.js
```

접속:
- API: `http://localhost:4100`
- 대시보드: 브라우저 자동 오픈 (또는 `http://localhost:4100` 직접 접속)

### 방법 B — 실행파일 (.exe)

```powershell
# 빌드 (최초 1회)
cd server
npm install
cd ..
node build.js
# → dist/kanban-agent.exe 생성

# 실행
dist\kanban-agent.exe
```

> Node.js가 시스템 PATH에 설치되어 있어야 합니다.

### 시작 시 자동 처리되는 항목 (Pre-flight)

```
[preflight] ══════════════════════════════
[preflight]  환경 점검 시작
[preflight] ══════════════════════════════
[preflight]  ✓ Node.js v22.x
[preflight]  ✗ gh (GitHub CLI) → 자동 설치 중... (winget)
[preflight]  ✓ gh 설치 완료
[preflight]  ✗ gcloud (Google Cloud SDK) → 자동 설치 중... (winget)
[preflight]  ✓ gcloud 설치 완료
[preflight]  ✗ codex (OpenAI Codex CLI) → 자동 설치 중... (npm install -g)
[preflight]  ✓ codex 설치 완료
[preflight]  ! [warn] OPENAI_API_KEY 미설정 (openai 프로바이더 비활성)
[preflight]  완료 — fatal:0 / warn:1
[preflight] ══════════════════════════════

Kanban SSOT server running on http://localhost:4100
[scheduler] Auto-cycle enabled: every 30s
```

- `fatal:0` 이면 서버 기동 진행
- CLI 미설치 시 **자동 설치 후 계속** (`warn`은 서버 기동을 막지 않음)
- CLI 설치 후 OAuth 로그인은 최초 1회 수동 진행 필요

### 오케스트레이터 제어

```powershell
# 일시정지
Invoke-RestMethod -Method POST "http://localhost:4100/api/control/orchestrator/pause"

# 재개
Invoke-RestMethod -Method POST "http://localhost:4100/api/control/orchestrator/resume"

# 수동 사이클 실행
Invoke-RestMethod -Method POST "http://localhost:4100/api/orchestrator/run"
```

### 프로세스 종료

```powershell
Get-Process node | Where-Object { $_.CommandLine -like "*index.js*" } | Stop-Process -Force
```

---

## 5. 환경 변수

`server/` 디렉토리에 `.env` 파일 생성 또는 시스템 환경변수로 설정.

| 변수 | 설명 | 기본값 |
|---|---|---|
| `PORT` | API 서버 포트 | `4100` |
| `OPENAI_API_KEY` | OpenAI 프로바이더 API 키 | — |
| `GEMINI_API_KEY` | Gemini 프로바이더 API 키 | — |
| `KANBAN_CYCLE_INTERVAL_MS` | 자동 사이클 간격 (ms) | `30000` |
| `KANBAN_SECRET_KEY` | Secret Store 마스터 키 | 자동 생성 |

> API 키는 `POST /api/secrets`로 DB에 암호화 저장하는 방법도 지원합니다.

---

## 6. API 엔드포인트

### 기본

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/health` | 헬스체크 `{"ok":true,"version":"v0.3.0"}` |

### Task

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/tasks` | 전체 Task 목록 |
| `GET` | `/api/tasks/:id` | Task 상세 |
| `POST` | `/api/tasks` | Task 생성 |
| `POST` | `/api/tasks/:id/status` | 상태 전이 |
| `POST` | `/api/tasks/:id/assign` | 에이전트 배정 |
| `POST` | `/api/tasks/:id/retry` | Blocked → Ready 재시도 |
| `POST` | `/api/tasks/:id/lock` | Task 잠금 획득 |
| `POST` | `/api/tasks/:id/release` | Task 잠금 해제 |

### Artifact / Review / Decision

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/tasks/:id/artifacts` | Task 산출물 목록 |
| `POST` | `/api/tasks/:id/artifacts` | 산출물 등록 (sha256 자동 계산) |
| `GET` | `/api/tasks/:id/reviews` | Task 리뷰 이력 |
| `POST` | `/api/tasks/:id/reviews` | 리뷰 등록 |
| `GET` | `/api/tasks/:id/decisions` | Task 결정 이력 |
| `GET` | `/api/decisions` | 전체 결정 이력 (`?limit=N`) |
| `GET` | `/api/reviews` | 전체 리뷰 이력 (`?limit=N`) |

### 에이전트 / 시스템

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/agents` | 에이전트 목록 및 상태 |
| `GET` | `/api/blockeds` | Blocked Task 목록 |
| `GET` | `/api/audit` | 감사 로그 |
| `POST` | `/api/orchestrator/run` | 수동 사이클 실행 |
| `GET` | `/api/control/orchestrator` | 오케스트레이터 상태 |
| `POST` | `/api/control/orchestrator/pause` | 일시정지 |
| `POST` | `/api/control/orchestrator/resume` | 재개 |

### Secret Store

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/secrets` | Secret 목록 (값 마스킹) |
| `POST` | `/api/secrets` | Secret 저장 (AES-256-GCM) |
| `DELETE` | `/api/secrets/:id` | Secret 삭제 |

---

## 7. AI 프로바이더 연동

| 프로바이더 | 인증 방식 | 사전 요구 |
|---|---|---|
| `openai` | API Key | `OPENAI_API_KEY` 환경변수 또는 Secret Store |
| `gemini` | API Key | `GEMINI_API_KEY` 환경변수 또는 Secret Store |
| `gemini-oauth` | Google OAuth | `gemini auth login` 우선 시도, 없으면 `gcloud auth login` |
| `google-antigravity` | Google OAuth (Legacy Alias) | 내부적으로 Gemini OAuth 연결 로직 사용 |
| `codex` | OAuth CLI | `codex login` (CLI 자동 설치 후 최초 1회 실행) |
| `github-copilot` | GitHub Device Flow OAuth | 브라우저 로그인 + Device Code 승인 (gh CLI 없이도 가능) |

> `gcloud`, `codex` CLI는 **서버 시작 시 미설치 감지 → 자동 설치**됩니다.
> `github-copilot`은 Device Flow로 동작해 `gh` CLI 없이도 인증 가능합니다.

---

## 8. Task 상태 흐름

```
              ┌─────────┐
              │ Backlog │ ◀──────────────────────────────┐
              └────┬────┘                                │
                   │ AC/DoD 충족                         │
              ┌────▼────┐                                │
              │  Ready  │                                │
              └────┬────┘                                │
                   │ Worker 배정                         │
         ┌─────────▼─────────┐                          │
         │    InProgress     │                          │
         └─────────┬─────────┘                          │
                   │ Artifact 생성       ┌──────────┐   │
         ┌─────────▼─────────┐  실패 ──▶│ Blocked  │───┘
         │     InReview      │          └──────────┘
         └─────────┬─────────┘
                   │ pass
          ┌────────▼────────┐      ┌──────────┐
          │      Done       │      │ Archived │
          └─────────────────┘      └──────────┘
```

| 전이 | 조건 |
|---|---|
| Backlog → Ready | AcceptanceCriteria ≥ 1, DoD 존재 |
| Ready → InProgress | Worker 에이전트 배정 |
| InProgress → InReview | Artifact 등록 |
| InReview → Done | Reviewer pass + Manager 결정 |
| InReview → Blocked | needs_work / reject |
| Blocked → Ready | retry (attempt 상한 미초과) |
| Any → Archived | 수동 보관 |
