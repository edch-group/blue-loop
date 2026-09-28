# Release roadmap: Steam, iOS and Android

## Technology choice

The game ships as an **Electron** desktop app, the same approach as a number of
successful Steam titles, including card games. The rules engine is plain
TypeScript with no UI dependencies, so the client can move to Godot or Unity
later without redesigning the game.

## Steamworks checklist

1. **Steamworks partner account** for Coronal Mass Games, then pay the Steam Direct fee (US$100 per app) to get an **App ID**.
2. **Store page** ("Coming Soon"): capsule art, at least 5 screenshots, a trailer, description and tags (Deckbuilder, Card Game, Strategy, Space, Turn-Based, Local Multiplayer). Wishlists build from here, and Kickstarter backers can be pointed at it.
3. **steamworks.js** integration in `electron/main.cjs` and `electron/preload.cjs`:
   - Initialise with the App ID and enable the Steam overlay.
   - **Achievements**: map one to each objective, and add ones for winning with each solar system and for "survive at 9 heat".
   - **Steam Cloud**: sync the save file.
   - **Rich Presence**, for example "Round 12, sun at 7".
4. **Online multiplayer**: the engine is deterministic, so use lockstep over Steam Networking (P2P) with Steam lobbies. Only actions are sent; every client runs the same reducer.
5. **Steam Deck**: target 1280×800, full controller navigation, and readable text sizes. This is required for the "Verified" badge.
6. **Builds and depots**: `npm run dist` for Windows, macOS and Linux, then upload with SteamPipe (`steamcmd` + depot VDFs).
7. **Code signing**: macOS notarisation and a Windows Authenticode certificate.

## Before launch (game work)

- Card and system art, animations, sound and music.
- Tutorial / guided first game.
- Settings: audio, display, animation speed, colour-blind-safe heat palette.
- Smarter AI difficulty levels.
- Localisation.

## Mobile (iOS App Store, Google Play)

The client is designed **landscape-phone first** (the primary target is about
844×390; the smallest supported is iPhone SE at 667×375) and scales up to
tablets and desktop from the same code. On touch screens, tapping a card opens
a readable view with its Play or Buy button. Portrait phones get a
rotate-your-device prompt.

To ship to the stores, wrap the same web build with **Capacitor**:
1. `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`, then `npx cap init "Blue Loop" com.coronalmassgames.blueloop --web-dir dist`.
2. `npx cap add ios` / `npx cap add android`, then lock orientation to landscape in the Xcode and Android Studio projects.
3. `npm run build && npx cap sync`, then build and sign in Xcode (Apple Developer account, US$99/yr) and Android Studio (Google Play Console, US$25 one-off).
4. Store extras: app icons and splash screens (`@capacitor/assets`), haptics on card play (`@capacitor/haptics`), Game Center and Google Play Games for achievements.
