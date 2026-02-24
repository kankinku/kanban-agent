# Kanban SSOT Multi-Agent System (Phase 0-4 Sprint)

## 현재 상태
- PDF 기반 요구사항을 반영한 `plan.md` 기준으로 Phase 0~4 뼈대를 구현했으며, 4.1 보안/운영 일부를 반영했습니다.

## 실행 방법

```bash
cd /home/jinu/.openclaw/workspace/projects/kanban-ssot-system

# server 실행
cd server
npm install
npm run dev            # API 서버(http://localhost:4100)

# dashboard 실행(별도 터미널)
npm run serve-web      # dashboard(http://localhost:4173)
```

## API 엔드포인트 (구현)
- `GET /health`
- `GET /api/tasks`
- `GET /api/tasks/{id}`
- `GET /api/tasks/{id}/artifacts`
- `GET /api/tasks/{id}/reviews`
- `GET /api/tasks/{id}/decisions`
- `GET /api/agents`, `GET /api/blockeds`, `GET /api/audit`
- `POST /api/tasks`
- `POST /api/tasks/{id}/status`
- `POST /api/tasks/{id}/artifacts`
- `POST /api/tasks/{id}/reviews`
- `POST /api/tasks/{id}/assign`
- `POST /api/tasks/{id}/lock`
- `POST /api/tasks/{id}/release`
- `POST /api/orchestrator/run`
- `GET /api/control/orchestrator`, `POST /api/control/orchestrator/pause`, `POST /api/control/orchestrator/resume`
- `POST /api/tasks/{id}/retry`
- `POST /api/secrets`, `GET /api/secrets`, `DELETE /api/secrets/{id}`

## 구현 범위 요약
- **State/권한**: DB 스키마 + 전이 엔진 + 가드
- **Core API**: Task/Artifact/Review/Decision/Audit 조회/생성
- **Dashboard**: Polling 기반 보드, Agents/Blocked/Audit 패널
- **Runtime**: Worker/Reviewer/Manager 스텁 런타임 + Orchestrator 라우팅(초기)
- **Provider Hub**: OpenAI/Gemini/Codex 스텁 커넥터
- **Security**: Secret store AES-256-GCM, 민감정보 마스킹 API

## 진행 중/남은 항목
- 실제 Worker/Reviewer/Manager 검증 로직 고도화
- Antigravity 플러그인(옵션) 통합
- 수동 중단 스위치 / 재시도 정책 정교화
- Blocked/Archived/Retry e2e 통합 완료
