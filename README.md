# Blue Loop

*A deck-building duel of warring solar civilisations, by **Coronal Mass Games**.*

Each player rules a solar system. Heat enemy suns until they go supernova, and
cool your own to survive. The last sun standing wins.

This repository holds the digital edition, which is aimed at release on Steam.

## Quick start

```bash
npm install
npm run dev          # play in the browser at http://localhost:5173
npm test             # rules engine tests
npm run simulate     # AI-vs-AI balance report: npm run simulate -- <games> <players>
npm run electron:dev # run as a desktop app (Electron)
npm run dist         # package a desktop build into release/
```

## Project layout

| Path | What it is |
| --- | --- |
| `src/engine/` | The rules engine: pure, deterministic, UI-free TypeScript. |
| `src/engine/balance.ts` | Every tunable number (costs, limits, clocks). |
| `src/engine/cards.ts` | Starter cards and the 200-card market deck. |
| `src/engine/systems.ts` | The 8 solar systems. |
| `src/engine/objectives.ts` | Objectives and global effects. |
| `src/engine/ai.ts` | Heuristic AI opponent. |
| `src/ui/` | Game client (plain TypeScript + DOM, no framework). |
| `electron/` | Desktop shell for the Steam build. |
| `scripts/simulate.ts` | Balance simulator. |
| `docs/GAME_DESIGN.md` | Rules as implemented, and open design questions. |
| `docs/STEAM.md` | Steam release roadmap. |

## Architecture notes

- **The engine is a pure reducer**: `applyAction(state, action) → newState`.
  State is plain JSON, and all randomness comes from a seeded RNG stored in
  that state. This gives free save/load, deterministic replays, easy undo, and
  a straight path to online multiplayer: sync actions, not state.
- **The UI never contains rules.** It asks the engine what things cost and
  sends it actions. If the client is later rebuilt in a game engine (for
  example Godot or Unity), the rules can be ported, or kept and run in a
  JS runtime, without redesign.
