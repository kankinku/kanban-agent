# E2E 검증 체크리스트

## 환경 준비

```bash
cd server
npm install
npm run dev          # API: http://localhost:4100
# 별도 터미널
npm run serve-web    # Dashboard: http://localhost:4173
```

---

## 시나리오 1 — Happy Path (정상 흐름)

### 1-1. Task 생성 (Backlog)
```bash
curl -s -X POST http://localhost:4100/api/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"e2e-happy","type":"feature","acceptanceCriteria":["구현 완료"],"definitionOfDone":["PR merge"],"dependencies":[]}'
# 반환된 id를 {TASK_ID}로 사용
```
- **검증**: `status == "Backlog"`, `version == 1`

### 1-2. Backlog -> Ready
```bash
curl -s -X POST "http://localhost:4100/api/tasks/{TASK_ID}/status" \
  -H 'content-type: application/json' \
  -d '{"toStatus":"Ready","actorRole":"manager","actorAgentId":"manager-01","reason":"criteria_met"}'
```
- **검증**: `status == "Ready"`, `version == 2`

### 1-3. Orchestrator 1회 실행
```bash
curl -s -X POST http://localhost:4100/api/orchestrator/run
```
- **검증**: `moved >= 1`, reports에서 최종 status 확인

### 1-4. 상태 및 감사 로그 확인
```bash
curl -s "http://localhost:4100/api/tasks/{TASK_ID}"
curl -s "http://localhost:4100/api/tasks/{TASK_ID}/artifacts"
curl -s "http://localhost:4100/api/tasks/{TASK_ID}/reviews"
curl -s "http://localhost:4100/api/tasks/{TASK_ID}/decisions"
curl -s "http://localhost:4100/api/audit?limit=20"
```
- **검증**: artifacts에 `checksum`(sha256 hex) 존재, decisions 이력 4건 이상

---

## 시나리오 2 — Blocked / Retry 경로

### 2-1. Task 생성 + Ready 전환
```bash
curl -s -X POST http://localhost:4100/api/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"e2e-blocked","type":"bug","acceptanceCriteria":["버그 수정"],"definitionOfDone":["테스트 통과"],"dependencies":[]}'
# => {BLOCKED_TASK_ID}

curl -s -X POST "http://localhost:4100/api/tasks/{BLOCKED_TASK_ID}/status" \
  -H 'content-type: application/json' \
  -d '{"toStatus":"Ready","actorRole":"manager","actorAgentId":"manager-01"}'
```

### 2-2. Blocked 전환
```bash
curl -s -X POST "http://localhost:4100/api/tasks/{BLOCKED_TASK_ID}/status" \
  -H 'content-type: application/json' \
  -d '{"toStatus":"Blocked","actorRole":"manager","actorAgentId":"manager-01","reason":"dependency_unresolved"}'
```
- **검증**: `status == "Blocked"`

### 2-3. Blocked 목록 조회
```bash
curl -s http://localhost:4100/api/blockeds
```
- **검증**: 위 task 포함

### 2-4. Retry — Blocked -> Ready 복귀
```bash
curl -s -X POST "http://localhost:4100/api/tasks/{BLOCKED_TASK_ID}/retry" \
  -H 'content-type: application/json' \
  -d '{"toStatus":"Ready","actorAgentId":"manager-01","reason":"dependency_resolved"}'
```
- **검증**: `status == "Ready"`, version 증가

---

## 시나리오 3 — Done -> Archived 경로

```bash
# force-Done (admin)
curl -s -X POST "http://localhost:4100/api/tasks/{TASK_ID}/status" \
  -H 'content-type: application/json' \
  -d '{"toStatus":"Done","actorRole":"admin","actorAgentId":"manager-01","force":true,"reason":"manual_close"}'

# Done -> Archived
curl -s -X POST "http://localhost:4100/api/tasks/{TASK_ID}/status" \
  -H 'content-type: application/json' \
  -d '{"toStatus":"Archived","actorRole":"manager","actorAgentId":"manager-01","reason":"sprint_complete"}'
```
- **검증**: `status == "Archived"`, 이후 전이 시도 → 400

---

## 시나리오 4 — Orchestrator 일시정지 / 재개

```bash
curl -s -X POST http://localhost:4100/api/control/orchestrator/pause
curl -s -X POST http://localhost:4100/api/orchestrator/run
# => { ok: true, moved: 0, reason: "orchestrator_paused" }

curl -s -X POST http://localhost:4100/api/control/orchestrator/resume
curl -s http://localhost:4100/api/control/orchestrator
# => { orchestratorPaused: false }
```

---

## 시나리오 5 — Lock / Release

```bash
curl -s -X POST "http://localhost:4100/api/tasks/{TASK_ID}/lock" \
  -H 'content-type: application/json' \
  -d '{"agentId":"worker-01","ttlSeconds":60}'

# 중복 락 차단
curl -s -X POST "http://localhost:4100/api/tasks/{TASK_ID}/lock" \
  -H 'content-type: application/json' \
  -d '{"agentId":"worker-99","ttlSeconds":60}'
# => { ok: false, code: "LOCKED" }

curl -s -X POST "http://localhost:4100/api/tasks/{TASK_ID}/release" \
  -H 'content-type: application/json' \
  -d '{"actorAgentId":"worker-01"}'
```

---

## 시나리오 6 — Secret Store / 마스킹

```bash
curl -s -X POST http://localhost:4100/api/secrets \
  -H 'content-type: application/json' \
  -d '{"provider":"openai","keyName":"api_key","value":"sk-test-abc123xyz"}'
# => { id: "..." }

curl -s http://localhost:4100/api/secrets
# value: "sk-***xyz" 형태 마스킹 확인

curl -s -X DELETE "http://localhost:4100/api/secrets/{SECRET_ID}"
```

---

## 시나리오 7 — 전체 결정/리뷰 이력 API

```bash
curl -s "http://localhost:4100/api/decisions?limit=50"
curl -s "http://localhost:4100/api/reviews?limit=20"
```

---

## 검증 요약 체크

| # | 시나리오 | 항목 | 상태 |
|---|---|---|---|
| 1 | Happy Path | Task 생성/Ready/Orchestrator Full-loop | [ ] |
| 1 | Happy Path | Artifact checksum(sha256) 존재 | [ ] |
| 2 | Blocked | Blocked 전환 / blockeds 목록 | [ ] |
| 2 | Retry | Blocked -> Ready 복귀 | [ ] |
| 3 | Archived | Done -> Archived / 이후 전환 차단(400) | [ ] |
| 4 | Orchestrator | Pause/Resume 토글 | [ ] |
| 5 | Lock | 획득/중복 차단/해제 | [ ] |
| 6 | Secret | 저장/마스킹/삭제 | [ ] |
| 7 | 이력 API | 전체 결정/리뷰 이력 조회 | [ ] |