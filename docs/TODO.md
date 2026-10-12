# Incomplete features

Work started but not finished, to come back to. (Rules as built live in `GAME_DESIGN.md`.)

## Dreams of the Lost: missing puzzles

The puzzle generator (`scripts/dreams-gen.ts`, merged into `src/engine/dreams-data.ts` by `scripts/dreams-merge.ts`)
now holds every puzzle to stricter rules, and every dream was re-checked against them: a **win** must not fall to going
straight for the sun (the answer has to be in the rival's board); a **survive** can't be had by the kill (the rival's
sun is out of reach in one); and the rival takes any win in reach, so no survival rests on its blunder. Every dream in
the game is proven by `tests/dreams.test.ts`. 96 dreams are in the game (8 of them win-in-N); each tier
should have a win and a survive puzzle for every race (0 Aureline … 7 Pyrr). Tiers 3 and up are also challenge mode's.
Missing:

| Tier | Missing |
| --- | --- |
| 1 | race 5 win |
| 2 | race 2 win, race 5 win, race 6 both, race 7 both |
| 3 | race 5 win, race 6 both, race 7 both |
| 4 | race 1 survive, race 2 both, race 3 survive, race 5 both, race 6 both, race 7 both |

Win in 2 (tier 5) and win in 3 (tier 6) have 7 and 1; each race should have one of each. (A win in 3 found for race 4 was dropped: its proof took minutes and failed the test.)

Where a tier has no puzzle for a combination, the campaign falls back to another dream. To fill the gaps, run only
what's missing, e.g.

    TIERS=3 RACES=0-3 GOALS=survive SEED=6 OUT=scripts/dreams/s3.jsonl npx vite-node scripts/dreams-gen.ts
    DAYS_TIERS=6 RACES=0-3 SEED=7 OUT=scripts/dreams/d6.jsonl npx vite-node scripts/dreams-gen.ts

then merge every file in `scripts/dreams/`: `npx vite-node scripts/dreams-merge.ts scripts/dreams/*.jsonl`.

## Rifts: the other two Lost Races

Rifts exist for the Nyxari (the Dark Galaxy) and the Seren (Time Dense Space). The Korrath's and the Pyrr's rift
galaxies are still to be designed [direction: "I'll figure out the remaining 2 lost races later"].

## Enigma card art

The eight Enigmas (`src/engine/cards-enigma.ts`) have procedural art only. Painted art costs money (Fal): ask first.
