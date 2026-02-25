# 운영 가이드 — Kanban SSOT Multi-Agent System

## 1. 로컬 단일 머신 배치

### 1-1. 사전 요건

| 항목 | 최소 버전 | 확인 명령 |
|------|-----------|-----------|
| Node.js | 18 LTS 이상 | `node -v` |
| npm | 9 이상 | `npm -v` |
| curl (선택) | 7 이상 | `curl --version` |

SQLite는 `better-sqlite3` 패키지에 번들됩니다. 별도 설치 불필요.

### 1-2. 최초 실행

```bash
# 1. 저장소 클론 / 폴더 진입
cd kanban-agent

# 2. 서버 의존성 설치
cd server
npm install

# 3. (선택) 암호화 키 설정 — 없으면 평문 저장
export KANBAN_SECRET_KEY="$(node -e "require('crypto').randomBytes(32).then?? || require('node:crypto').randomBytes(32).toString('hex')" 2>/dev/null || node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")"
# Windows PowerShell:
# $env:KANBAN_SECRET_KEY = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

# 4. API 서버 시작 (포트 4100)
npm run dev
```

```bash
# 별도 터미널에서 Dashboard 실행 (포트 4173)
cd server
npm run serve-web
```

브라우저에서 `http://localhost:4173` 접속.

### 1-3. 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `PORT` | API 서버 포트 | `4100` |
| `KANBAN_DB_PATH` | SQLite DB 파일 경로 | `server/src/lib/data/kanban.db` |
| `KANBAN_SECRET_KEY` | AES-256-GCM 암호화 키 (32바이트 hex) | 미설정 시 평문 저장 |
| `KANBAN_MAX_WIP_PER_AGENT` | 에이전트당 최대 WIP | `2` |
| `KANBAN_WORKER_AGENT_ID` | 실행될 Worker Agent ID | `worker-01` |
| `KANBAN_REVIEWER_AGENT_ID` | 실행될 Reviewer Agent ID | `reviewer-01` |
| `KANBAN_MANAGER_AGENT_ID` | 실행될 Manager Agent ID | `manager-01` |

---

## 2. 프로세스 구성

```
kanban-agent/
├── server/          ← API + Orchestrator (Node.js, port 4100)
├── web/             ← Dashboard 정적 파일 (http-server, port 4173)
└── runtime/         ← Worker/Reviewer/Manager 스텁 런타임
```

두 프로세스를 동시에 실행해야 합니다:

```bash
# 터미널 1
cd server && npm run dev

# 터미널 2
cd server && npm run serve-web
```

---

## 3. DB 관리

### 3-1. DB 파일 위치

```
server/src/lib/data/kanban.db
```

최초 실행 시 자동 생성됩니다. 디렉터리가 없으면 자동 생성됩니다.

### 3-2. 백업

```bash
# 서버 실행 중에도 안전하게 복사 가능 (SQLite WAL 모드)
cp server/src/lib/data/kanban.db server/src/lib/data/kanban.db.bak
```

### 3-3. 초기화 (전체 리셋)

```bash
rm server/src/lib/data/kanban.db
npm run dev   # 재시작 시 빈 DB 자동 생성
```

---

## 4. 재시작 절차

```bash
# 1. 서버 프로세스 종료 (Ctrl+C 또는 kill)

# 2. 재시작
cd server && npm run dev
```

- DB는 파일 기반이므로 재시작 후에도 데이터 보존
- 오케스트레이터 일시정지 상태(`orchestratorPaused`)는 **메모리 상태**이므로 재시작 시 초기화(false)

---

## 5. 오케스트레이터 운영

### 5-1. 수동 일시정지 / 재개

```bash
# 일시정지 (진행 중인 사이클이 완료된 후 멈춤)
curl -s -X POST http://localhost:4100/api/control/orchestrator/pause

# 재개
curl -s -X POST http://localhost:4100/api/control/orchestrator/resume

# 상태 확인
curl -s http://localhost:4100/api/control/orchestrator
```

### 5-2. 수동 1회 실행

```bash
curl -s -X POST http://localhost:4100/api/orchestrator/run
```

응답 예:
```json
{
  "ok": true,
  "moved": 1,
  "reason": "cycle_executed",
  "reports": [
    { "taskId": "T-2026-001234", "ok": true, "step": "approve", "status": "Done" }
  ]
}
```

### 5-3. 동시 실행 방지

오케스트레이터는 동시에 1개 사이클만 실행됩니다. 이미 실행 중이면:
```json
{ "ok": true, "moved": 0, "reason": "cycle_already_running" }
```

---

## 6. 안전 제한 정책

| 정책 | 설정값 | 설명 |
|------|--------|------|
| WIP 제한 | `KANBAN_MAX_WIP_PER_AGENT=2` | 에이전트 당 동시 진행 최대 2개 |
| 최대 재시도 | `maxAttempt` (태스크별, 기본 3) | 초과 시 InProgress 전환 차단 |
| Lock TTL | 기본 1800초 (30분) | 락 만료 후 자동 해제 가능 |
| Archived 전환 | 취소 불가 | Archived 이후 추가 전이 없음 |

---

## 7. 장애 대응

### 7-1. 서버가 시작되지 않음

```bash
# 포트 충돌 확인
netstat -ano | findstr :4100      # Windows
lsof -i :4100                      # macOS/Linux

# 다른 포트로 실행
PORT=4200 npm run dev
```

### 7-2. DB 손상 / 오류

```bash
# DB 파일 삭제 후 재시작
rm server/src/lib/data/kanban.db
npm run dev
```

### 7-3. better-sqlite3 빌드 오류

```bash
# node 버전 확인 후 패키지 재설치
node -v         # 18 이상 권장
npm rebuild better-sqlite3
```

### 7-4. Task가 Blocked에서 빠져나오지 못함

```bash
# Manager 권한으로 강제 Ready 복귀
curl -s -X POST "http://localhost:4100/api/tasks/{TASK_ID}/retry" \
  -H 'content-type: application/json' \
  -d '{"toStatus":"Ready","actorAgentId":"manager-01","reason":"manual_unblock"}'
```

### 7-5. attempt 초과로 InProgress 전환 불가

```bash
# admin force로 상태 강제 변경
curl -s -X POST "http://localhost:4100/api/tasks/{TASK_ID}/status" \
  -H 'content-type: application/json' \
  -d '{"toStatus":"Backlog","actorRole":"admin","actorAgentId":"manager-01","force":true,"reason":"reset_attempt"}'
```

---

## 8. 감사 로그 조회

```bash
# 최근 50건
curl -s "http://localhost:4100/api/audit?limit=50"

# 전체 결정 이력
curl -s "http://localhost:4100/api/decisions?limit=100"

# 특정 Task 결정 이력
curl -s "http://localhost:4100/api/tasks/{TASK_ID}/decisions"

# 전체 리뷰 이력
curl -s "http://localhost:4100/api/reviews?limit=50"
```

---

## 9. API 요약

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 헬스체크 |
| GET | `/api/tasks` | 전체 태스크 목록 |
| POST | `/api/tasks` | 태스크 생성 |
| GET | `/api/tasks/{id}` | 태스크 조회 |
| POST | `/api/tasks/{id}/status` | 상태 전이 |
| POST | `/api/tasks/{id}/retry` | Blocked → Ready 복귀 |
| GET | `/api/tasks/{id}/artifacts` | 산출물 목록 |
| POST | `/api/tasks/{id}/artifacts` | 산출물 추가 |
| GET | `/api/tasks/{id}/reviews` | 리뷰 목록 |
| POST | `/api/tasks/{id}/reviews` | 리뷰 추가 |
| GET | `/api/tasks/{id}/decisions` | 태스크별 결정 이력 |
| POST | `/api/tasks/{id}/lock` | 락 획득 |
| POST | `/api/tasks/{id}/release` | 락 해제 |
| POST | `/api/tasks/{id}/assign` | 에이전트 배정 |
| GET | `/api/agents` | 에이전트 목록 |
| GET | `/api/blockeds` | Blocked 태스크 목록 |
| GET | `/api/audit?limit=N` | 감사 이벤트 |
| GET | `/api/decisions?limit=N` | 전체 결정 이력 |
| GET | `/api/reviews?limit=N` | 전체 리뷰 이력 |
| POST | `/api/orchestrator/run` | 오케스트레이터 1회 실행 |
| GET | `/api/control/orchestrator` | 오케스트레이터 상태 |
| POST | `/api/control/orchestrator/pause` | 일시정지 |
| POST | `/api/control/orchestrator/resume` | 재개 |
| GET | `/api/secrets` | 시크릿 목록 (마스킹) |
| POST | `/api/secrets` | 시크릿 저장 |
| DELETE | `/api/secrets/{id}` | 시크릿 삭제 |
| GET | `/api/providers` | Provider Hub 상태 |
| POST | `/api/providers/{name}/test` | Provider 연결 테스트 |
