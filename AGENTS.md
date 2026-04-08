# Modern Queenzle Lab Agent Guide

## Project goals

- 이 리포는 Modern Queenzle의 UX 가설을 비교 실험하는 연구용 정적 웹앱입니다.
- 우선순위는 `playable`, `comparable`, `deployable` 순입니다.
- 같은 퍼즐에서 프리셋 차이를 체험할 수 있어야 합니다.

## Stack conventions

- Package manager and scripts: `bun`
- App shell: `SvelteKit` with `adapter-static`
- Renderer: `PixiJS 8`
- UI: Svelte DOM
- Tests: `Vitest`, `Playwright`

## Boundaries

- `src/lib/core`만 게임 진실 소스를 소유합니다.
- `src/lib/render/pixi`는 렌더링과 입력 어댑터만 담당합니다.
- `src/lib/ui`는 DOM 패널과 URL sync만 담당합니다.
- Pixi modules must not own puzzle rules or persistable state.

## Pixi ecosystem policy

- Use plain `pixi.js` only in v0.
- Do not add `@pixi/ui`, `@pixi/layout`, or `@pixi/react` unless the scope explicitly changes.

## UX guardrails

- Playfield first. Control panels must not cover the board center.
- Visual style: pastel, flat, low-noise, readable.
- `classic` vs `modern-minimal` comparison must stay obvious.

## Pages and routing

- Public v0 routes: `/`, `/lab`
- `showcase/minimal-modern` is scaffold-only in v0
- GitHub Pages base path is `/queenzle-lab` in production

## Quality bar

- Keep unit tests close to core logic.
- Run `bun run check`, `bun run test`, and `bun run build` before finishing substantial changes.
