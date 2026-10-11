# Incomplete features

Work started but not finished, to come back to. (Rules as built live in `GAME_DESIGN.md`.)

## Dreams of the Lost: missing puzzles

The puzzle generator (`scripts/dreams-gen.ts`, merged into `src/engine/dreams-data.ts` by `scripts/dreams-merge.ts`)
was stopped at its time limit with gaps. 47 dreams are in the game; each tier should have a **win** and a **survive**
puzzle for every race (0 Aureline … 7 Pyrr). Missing:

| Tier | Missing |
| --- | --- |
| 2 | win: races 5, 6, 7 (searched, none found) |
| 3 | win: races 5, 6 (searched, none found); race 7 win and survive (not reached) |
| 4 | race 0 done; race 1 survive; races 2, 3 (both); race 5 win (searched, none found); race 6 win (searched, none found) and survive; race 7 (both) |

Where a tier has no puzzle for a combination, the game falls back to another dream, so deep galaxies repeat tier 4
dreams more often. To fill the gaps, run only what's missing (each tier-4 race takes hours), e.g.

    TIERS=4 RACES=2-3 SEED=6 OUT=scripts/dreams/d4c.jsonl npx vite-node scripts/dreams-gen.ts

then merge every file in `scripts/dreams/` (the puzzles found so far are kept there; leave one out and its puzzles
drop out of the game): `npx vite-node scripts/dreams-merge.ts scripts/dreams/*.jsonl`. The combinations
searched with no result may need the generator's tier settings loosened (`TIERS` in the script) for those races.

## Rifts: the other two Lost Races

Rifts exist for the Nyxari (the Dark Galaxy) and the Seren (Time Dense Space). The Korrath's and the Pyrr's rift
galaxies are still to be designed [direction: "I'll figure out the remaining 2 lost races later"].

## Enigma card art

The eight Enigmas (`src/engine/cards-enigma.ts`) have procedural art only. Painted art costs money (Fal): ask first.
