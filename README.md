# Blue Loop

*A tableau card game of warring solar civilisations, by **Coronal Mass Games**.*

Each player brings a 20-card deck. Cards stay in play once played and power
each other up. Heat enemy suns until they go supernova, and cool your own to
survive. The last sun standing wins.

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

## Web app (iPhone / Android) on Cloudflare Pages

The build is a static site that installs as a full-screen web app. It has a
manifest, home-screen icons and an offline service worker (`public/`).

To deploy it on Cloudflare Pages (free plan):

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**, and pick this repository.
2. Build command: `npm run build`. Build output directory: `dist`.
3. Production branch: the branch you want live. Every push to it redeploys.

On iPhone, open the `*.pages.dev` address in **Safari**, tap **Share →
Add to Home Screen**, and launch it from the icon to play full-screen.

## Project layout

| Path | What it is |
| --- | --- |
| `src/engine/` | The rules engine: pure, deterministic, UI-free TypeScript. |
| `src/engine/balance.ts` | Every tunable number (costs, limits, clocks). |
| `src/engine/cards.ts` | The card pool, the four race starter decks and deck rules. |
| `src/engine/game.ts` | Turns, the tableau, effects, targets and shields. |
| `src/engine/campaign.ts` | Campaign mode: the map, factions, garrisons and battles. |
| `src/engine/ai.ts` | Heuristic AI opponent. |
| `src/ui/app.ts` | Game client (plain TypeScript + DOM, no framework). |
| `src/ui/builder.ts`, `src/ui/decks.ts` | The deck builder and saved decks. |
| `src/ui/art.ts`, `src/ui/glyphs.ts` | Procedural placeholder art: suns, upgrade tiles, card glyphs. |
| `src/ui/fx.ts` | Card movement, projectiles and hit effects. |
| `src/ui/sound.ts` | Synthesised placeholder sound effects (Web Audio). |
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
