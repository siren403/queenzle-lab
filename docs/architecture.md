# Architecture Notes

## Core principles

- Same puzzle, different flags: comparison beats content volume.
- DOM owns text-heavy UI.
- Pixi owns the board, hover/selection feedback, and pointer hit handling.
- Session persistence stores simulation state only.

## Public interfaces

- `FeatureFlags`
- `PuzzleSpec`
- `SessionState`
- `BoardViewModel`
- `RendererEvent`

## Routing

- `/`: project overview and research framing
- `/lab`: playable comparison surface
- `/showcase/minimal-modern`: v0.1 placeholder

## Pixi policy

- Use `Application`, `Container`, `Graphics`, `Text`, `Assets`, pointer events, and resize handling only.
- No Pixi-native widget framework in v0.

## Generator policy

- Catalog-first, generator-second.
- If generation exceeds the time budget, fall back to the catalog immediately.

## Deferred

- Advanced contradiction feedback
- Canvas-native UI packages
- Mobile-first gestures
- Rich showcase route
