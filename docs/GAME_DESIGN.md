# Blue Loop: Game design (as implemented)

Status: **playable prototype**. Rules from the original brief are marked
**[brief]**. Everything else was added to make the brief playable, and is
marked **[proposed]** for the design team to confirm or change.

## Setup

- 2–4 players. [proposed player count]
- Each player draws a random solar system from a pool of 8. [brief]
- Each player starts with **9 Stardust** (+1 money) and **1 Command Directive**. [brief]
- 8 cards are on display at all times, drawn from a **200-card market deck**. [brief]
- Suns start at **0**. The floor is **-10**, and a sun at **10** goes supernova and that player is out. [brief]
- Hand size is 5. Standard deck-builder flow: draw 5, play, then discard hand and played cards and draw 5 more. [proposed]
- 3 objectives are drawn from a pool of 7 each game. [proposed]

## Turn structure

1. **Gain resources**: money from economy planets and system abilities, plus shields from defence planets. [brief: "gain resources"]
2. **Resolve global effects**: Solar Storm, Ice Age, Trade Boom. [brief]
3. **Stellar Instability**: from round 8, every sun heats at the start of its turn. [proposed; see below]
4. **Main phase**, in any order and as often as money allows:
   - Play cards from hand.
   - Buy a card from the display. It goes to the discard pile. [proposed]
   - **Solar Flare**: pay 2 to heat an enemy sun by 1. [brief]
   - **Cryostasis**: pay 2 to cool your own sun by 1. [brief]
5. **End turn**: check objectives, discard everything, draw a new hand. Unspent money is lost. [proposed]

## Planets and Command cards

A Command card upgrades one of your planets by 1 level (max 3). [brief: "upgrade a planet or system"]
Each planet belongs to one of four tracks [brief]:

| Track | Effect per level [proposed] |
| --- | --- |
| Weapons | Your first Solar Flare each turn gets +1 heat per 2 weapon levels. |
| Defences | +1 shield per 2 defence levels, refreshed each turn. Shields absorb enemy heat. |
| Economy | +1 money at turn start per level. |
| Resources | +1 hand size per 2 resource levels. |

Systems differ by their mix of planets **and** a unique ability.

## The 8 solar systems [proposed content]

| System | Planets | Ability |
| --- | --- | --- |
| Helios Reach | W, D, E, R | First Cryostasis each turn costs 1 less |
| Vulcan Forge | W1, W, E | First Solar Flare each turn +1 heat |
| Aegis Cluster | D, R | +1 shield every turn |
| Midas Belt | E1, E, R | +1 money every turn |
| Cryon Drift | D, R1, E | Sun starts at -3 |
| Tempest Binary | W, R | Draw 1 extra card every turn |
| Obsidian Veil | E, W, D | Display cards cost 2 less (min 1) |
| Nova Crown | E1, W1, D | +1 money per 3 heat above 0 at turn start |

(`W1` = starts at level 1.)

## Market deck (200 cards) [proposed content]

Economy 62 · Attack 48 · Defence 50 · Command 16 · Global 24.
The full list is in `src/engine/cards.ts`.

## Objectives [proposed content]

Each player can complete each objective once. The reward is a Command Directive, added to the discard pile. [brief: "unlock more command cards via reaching objectives"]
Pool: Deep Freeze, Firestorm, Collector, Big Spender, Brinkmanship, Industrialist, Shieldwall.

## Why Stellar Instability exists

Heating and cooling both cost 2 money, and a defender also gets shields, so
two careful players can stall forever. The first AI simulations did exactly
that: games ran past 300 turns. Stellar Instability is a late-game clock: from
round 8, every sun heats by 1 at the start of its turn, plus 1 more every 4
rounds. It fits the theme (the loop decays) and guarantees games end.
AI games currently average about 11 rounds with 2 players and 11 with 4.

Alternatives worth playtesting instead: make Solar Flare cheaper than
Cryostasis, cap cooling per turn, or add a market-exhaustion end condition.

## Open design questions

1. **"Upgrade a planet *or system*"**: what does a system-level upgrade do? Currently only planets upgrade.
2. **Objectives**: public and shared (current), or secret per-player?
3. **Global effects**: which cards trigger them, how long they last (currently one round), and can they stack?
4. **Player elimination**: should eliminated players keep a role, for example controlling global events?
5. **Balance**: `npm run simulate` shows defensive systems (Aegis, Cryon) winning too often in 4-player games. Part of that is the AI always targeting the hottest sun. Needs human playtesting.
6. **Deck exhaustion**: what happens when all 200 market cards are bought? Currently the display slots stay empty.
