# 실행 상세 계획 (Phase 0 완성 기준)

## 현재 상태
- Phase 0: 범위 잠금, 요구사항 정렬, 보안/운영 정책 정의 완료 예정
- 다음 단계: Phase 1(데이터 모델) 즉시 착수

## Phase 0 작업 항목
- [x] 요구사항 문서화(원칙, 제외항목, 규칙)
- [x] 초기 아키텍처 문서화
- [x] SSOT 실행 폴더/문서 체계 확보

## Phase 1 착수 체크리스트
- [ ] 프로젝트 스캐폴딩 생성
  - [ ] backend(`server`), web(`web`), runtime(`runtime`) 폴더
  - [ ] 패키지 매니저/런타임 설정(최소 의존성)
- [ ] DB 설계
  - [ ] `Task`, `Artifact`, `ReviewReport`, `Decision`, `Agent`, `ProviderAccount`
  - [ ] 전환 이력(`TransitionLog`) 테이블
  - [ ] 기본 인덱스/유효성 제약
- [ ] 상태/권한 규칙 엔진
  - [ ] 상태 전이 행렬 + 역할 검사
  - [ ] version/lock 검증

## 작업 산출물 규칙
- 각 phase 종료시 다음 문서로 PR 링크
  - `architecture.md` 반영사항
  - `schema.sql` 또는 migration
  - API 간단 시퀀스 다이어그램
  - 테스트 결과 요약

## 실행 오케스트레이션 (omx)
- `T-INIT-001` (요구사항 잠금 완료 보고)
- `T-DATA-101` (DB 스키마 생성)
- `T-WF-102` (상태 엔진 구현)
- `T-WF-103` (Ready 승격 가드 적용)
