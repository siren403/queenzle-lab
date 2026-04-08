Original prompt: 1. 연구실에서 홈이동 수단 추가 2. 캔버스위 페이지 스크롤은 여전히 안됨. 기술적으로 안되는거면 그렇다고 알려줘. 요청안하게 3. 마킹이 안됨 4. 지금까지 피드백한 이슈들 재발방지를 위한 하네스 강화 5. 조작이나 시스템 등 playwrite나 vitest등을 적극활용해서 사전검증및방지 수단 강화

- 2026-04-09: 연구실 홈 이동 수단, 캔버스 스크롤 정책 안내, 마킹 회귀 재현/수정, Playwright/Vitest 하네스 강화 진행 시작.
- 2026-04-09: DOM 기반 보드 통계와 Playwright 상호작용 검증을 추가해 클릭/사이클/리사이즈 회귀를 잡는 방향으로 진행.
- 2026-04-09: 연구실에 홈 이동 링크와 보드 통계 UI를 추가. 캔버스 스크롤 정책 문구를 명시.
- 2026-04-09: 렌더 입력 계층을 수정해 마킹 회귀를 해결. rootLayer를 passive로 바꾸고 셀 pointerup 체인을 안정화.
- 2026-04-09: Playwright에 3개 시나리오 추가. X -> 가설 -> 없음 클릭 사이클, 홈 이동, 뷰포트 축소 시 보드 즉시 리사이즈 검증.
- 2026-04-09: GSAP를 도입하고 Pixi 보드 렌더러를 retained-mode 구조로 전환 시작. `CellView`와 `BoardEffectController`를 추가해 셀별 persistent 객체와 kill/reset 가능한 트윈 제어를 분리.
- 2026-04-09: 기존 `removeChildren() -> 재생성` 기반 애니메이션 큐를 제거. 마커, 퀸, 하이라이트, 차지 링, 오류/성공 연출을 GSAP 기반 motion state로 재구성.
- 2026-04-09: GSAP 전환 후에도 기존 회귀 하네스 유지 확인. `bun run lint`, `bun run test:unit -- --run`, `bun run test:e2e`, `bun run build` 통과.
- 2026-04-09: 검증 완료. `bun run lint`, `bun run test:unit -- --run`, `bun run test:e2e`, `bun run build` 통과.
