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
npm run simulate     # AI-vs-AI balance report: npm run simulate -- <games>
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

## Online 1v1 (play with a friend on your own devices)

Online games run on a Cloudflare Worker (`server/`). The Worker serves the game itself and hosts the rooms. Each room is a Durable Object that runs the same engine as the game, checks every move, and sends each player only what they may see. That means your own hand and face-down card, but not your rival's.

**Deploy (once, then after each change):**

```bash
npx wrangler login     # first time only: authorise your Cloudflare account in the browser
npm run deploy         # builds the game, then deploys the Worker and its rooms
```

Wrangler prints the address, e.g. `https://blue-loop.<your-subdomain>.workers.dev`. Open it, then **Quickplay → play online → create room**, and send your friend the code or the invite link. The game starts as soon as they join.
- **Dropped connections:** a phone that locks or loses signal reconnects to its seat by itself. Reopening the invite link in the same browser also rejoins.
- **Dropped connections, for the other player:** while a rival is away, you see "rival disconnected · waiting". Their seat is kept, and the notice clears when they're back.
- **Quitting:** settings (⚙) → **quit game** asks first. Online, quitting concedes: your rival wins and there is no rematch. Against the AI, a game can be saved and left, or conceded. In a campaign battle, quitting is a retreat, which loses the battle.
- **Rematches:** they alternate who goes first.
- **Tidying up:** an idle room costs nothing. It hibernates between moves, and it deletes itself an hour after its game ends, or after a day without play.

**Try it locally first:** `npm run server` runs the Worker and rooms on your machine at http://localhost:8787. Open it in two browser windows to play yourself.

**Playing online from the Pages site:** the Pages build only has the game files, not the rooms. To play online from your `*.pages.dev` address, set the environment variable `VITE_SERVER_URL=https://blue-loop.<your-subdomain>.workers.dev` in the Pages project's build settings and redeploy. Otherwise share the `workers.dev` address, which has both.

## Native iPhone / iPad app (locked to landscape)

A web app added from Safari cannot lock its orientation: iOS doesn't allow it. The native app can,
like any App Store game. `ios/` is a native Xcode project ([Capacitor](https://capacitorjs.com))
that wraps the same game and declares **landscape as its only orientation**, with the status
bar hidden.

You need a Mac with Xcode, and an Apple ID. A free Apple ID runs the app on your own iPhone for a
week at a time; TestFlight and the App Store need a paid Apple Developer account.

```bash
npm install
npm run ios:open     # builds the game, copies it into ios/, and opens Xcode
```

In Xcode:
1. Select the **App** target, then **Signing & Capabilities**, and choose your team.
2. Plug in your iPhone, pick it as the run destination, and press **Run**.

After changing the game, run `npm run ios:sync` again.

The web version on Cloudflare still works in a browser. When an iPhone is held upright, it draws
the page sideways instead.



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
| `scripts/render_gems.py` | Renders the rarity gem images into `src/ui/gems/`. |
| `ios/`, `capacitor.config.ts` | The native iOS app (landscape only). |
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
