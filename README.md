# Modern Queenzle Lab

Modern Queenzle의 핵심 가설을 실험하는 연구용 정적 웹앱입니다. `classic`과 `modern-minimal` 플래그 구성을 같은 퍼즐 위에서 비교하면서, 모던 UX 시스템이 실제 체감에 어떤 차이를 만드는지 검증하는 것이 목표입니다.

## Stack

- `Bun`
- `SvelteKit` + `adapter-static`
- `TypeScript`
- `PixiJS 8`
- `Vitest`
- `Playwright`

## Commands

```sh
bun install
bun run dev
bun run check
bun run lint
bun run test
bun run build
```

## Architecture

- `src/lib/core`: 게임 상태, 규칙, solver, generator, persistence
- `src/lib/render/pixi`: Pixi 보드 렌더러와 입력 어댑터
- `src/lib/ui`: Svelte DOM 패널, 프리셋, URL sync
- `src/routes`: `/`, `/lab`, `v0.1`용 showcase placeholder

## Deployment

- GitHub Pages `Project Pages` 기준
- production base path: `/queenzle-lab`
- 모든 공개 라우트는 prerender 대상

## Pixi policy

- v0는 `plain PixiJS 8 only`
- `@pixi/ui`, `@pixi/layout`, `@pixi/react`는 도입하지 않음
- 캔버스 안 UI가 커질 때만 재평가
