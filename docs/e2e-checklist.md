# e2e 체크리스트

## 목표 시나리오
1. Task 생성
2. Backlog -> Ready 승인
3. Orchestrator 실행으로 Worker/Reviewer/Manager 루프 진입
4. 상태와 감사 로그 검증

## 확인 방법

```bash
# 1) 서버 실행
cd server && npm install && npm run dev

# 2) task 생성
curl -s -X POST http://localhost:4100/api/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"e2e-task","type":"feature","acceptanceCriteria":["A"],"definitionOfDone":["D"],"dependencies":[]}'

# 3) Ready 전환 (Manager)
curl -s -X POST http://localhost:4100/api/tasks/{TASK_ID}/status \
  -H 'content-type: application/json' \
  -d '{"toStatus":"Ready","actorRole":"manager","actorAgentId":"manager-01"}'

# 4) 오케스트레이터 1회 실행
curl -s -X POST http://localhost:4100/api/orchestrator/run

# 5) 상태/감사 확인
curl -s http://localhost:4100/api/tasks/{TASK_ID}
curl -s http://localhost:4100/api/audit?limit=20
curl -s http://localhost:4100/api/blockeds
```

## 현재 실행결과(현재 코드 기준)
- 핵심 엔드포인트는 동작 중이며, 오케스트레이터는 Ready task를 픽업해 상태/아티팩트/리뷰 루트를 수행합니다.
- 일부 조건(예: 실제 리뷰 통과/요건 미충족 경로)에 대한 결과는 정책/기본 에이전트 모델 상태에 따라 변경될 수 있어 운영 정책 조정 필요.

### 추가 검증 항목
- Blocked 태스크 `POST /api/tasks/{id}/retry`로 `Ready` 복귀 테스트
- `POST /api/control/orchestrator/pause`, `resume` 토글 테스트
- `Done -> Archived` 경로 전이 테스트
