# Blue Loop: Game design (as implemented)

Status: **playable prototype**. Rules from the original brief are marked
**[brief]**. Everything else was added to make the brief playable, and is
marked **[proposed]** for the design team to confirm or change.

## Setup

- 2–4 players. [proposed player count]
- Each player draws a random solar system from a pool of 8. [brief]
- Each player starts with **9 Stardust** (+1 money) and **1 Command Directive**. [brief]
- **3 cards** are on display at all times, drawn from a **200-card market deck**. [brief said 8; reduced to 3 in design review]
- Suns start at **0**. The floor is **-10**, and a sun at **10** goes supernova and that player is out. [brief]
- Hand size is 5. Standard deck-builder flow: draw 5, play, then discard hand and played cards and draw 5 more. [proposed]
- 3 global objectives are face up, drawn from a pool of 11. [proposed]

## Turn structure

1. **Gain resources**: money from economy planets and system abilities, plus shields from defence planets. [brief: "gain resources"]
2. **Resolve global effects**: Solar Storm, Ice Age, Trade Boom. [brief]
3. **Stellar Instability**: from round 8, every sun heats at the start of its turn. [proposed; see below]
4. **Main phase**, in any order and as often as money allows:
   - Play cards from hand.
   - Buy a card from the display. It goes to the discard pile. [proposed]
   - **Solar Flare**: pay 2 to heat an enemy sun by 1, +1 per upgrade. [brief]
   - **Thermosiphon**: pay 2 to cool your own sun by 1, +1 per upgrade. [brief]
5. **End turn**: check objectives, discard everything, draw a new hand. Unspent money is lost. [proposed]

## Core actions

Solar Flare and Thermosiphon are **actions, not cards**. They are always
available, shown as two tiles in the dock, and can be used as often as you can
pay for them. [brief]

| Action | Base | Upgrade slots | Max |
| --- | --- | --- | --- |
| Solar Flare | 1 heat to an enemy sun | 3 (small squares on the tile) | 4 heat |
| Thermosiphon | 1 cooling to your own sun | 1 (large square on the tile) | 2 cooling |
| Cooling Chamber | Passive: max health 10 | 3 (vertical bars on the tile) | max health 25 (+5 each) |

**Max health** is the heat at which your sun goes supernova. Everyone starts at 10.

## Command cards

A Command card upgrades **one** of these by 1 [proposed: which things it can upgrade]:
- a Solar Flare, Thermosiphon or Cooling Chamber upgrade slot, or
- one of your planets, by 1 level (max 3). [brief: "upgrade a planet or system"]

Each planet belongs to one of four tracks [brief]:

| Track | Effect per level [proposed] |
| --- | --- |
| Weapons | Your heat ignores 1 enemy shield per 2 weapon levels. (Solar Flare stays capped at 4.) |
| Defences | +1 shield per 2 defence levels, refreshed each turn. Shields absorb enemy heat. |
| Economy | +1 money at turn start per level. |
| Resources | +1 hand size per 2 resource levels. |

Systems differ by their mix of planets **and** a unique ability.

## The 8 solar systems [proposed content]

| System | Planets | Ability |
| --- | --- | --- |
| Helios Reach | W, D, E, R | First Thermosiphon each turn costs 1 less |
| Vulcan Forge | W1, W, E | Solar Flare starts with 1 upgrade |
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

## Objectives and rewards

**Global objectives** are shared and first come, first served. [design review] Three are face up. The first player to meet one, checked after every action on their turn, claims it. It is then replaced from the pool, and the claimer chooses a reward.
Pool [proposed]: Deep Freeze, Firestorm, Collector, Big Spender, Brinkmanship, Industrialist, Shieldwall, Arsenal, Cold Front, Trade Baron, Overdrive.

**Missions** are personal objectives on cards in the market deck: 6 kinds, 2 copies each. [design review] Buy one, then play it to put it in front of you. When you meet its condition on your turn you choose a reward, and the mission card leaves the game.

**Rewards**: each claim offers 3 at random from the pool below, and you pick 1. Each reward can be taken **once per player per game**. [design review: "one time use"; proposed interpretation]

| Reward | Type | Effect |
| --- | --- | --- |
| Command Upgrade | instant | Upgrade one action or planet now. |
| Requisition | instant | Take any display card for free. |
| Purge | instant | Remove up to 2 Stardust for good (deck thinning). |
| Emergency Vent | instant | Cool your sun by 4. |
| Wide Sensors | permanent | Draw 1 extra card each turn. |
| Stellar Mint | permanent | +1 money each turn. |
| Plasma Focus | permanent | Your attack cards deal +1 heat. |
| Deep Coolant | permanent | Thermosiphon and cooling cards cool +1. (Suggested +2; reduced to +1 because Thermosiphon at 4 cooling per use made suns nearly unkillable.) |
| Aegis Lattice | permanent | +1 shield each turn. |
| Flare Focus | permanent | Your first Solar Flare each turn costs 1 less. |

## Planet effects vs action upgrades

These are separate systems:
- **Action upgrades** (Command card → Solar Flare or Thermosiphon slot) make that action stronger every time you use it.
- **Planets** (Command card → planet level) give passive bonuses from their track, summed across all your planets of that track. Economy is the simplest: every economy level is +1 money at the start of every turn, permanently.

Open question: should weapons and defence planets instead boost attack and cooling *cards*? See open questions.

## Why Stellar Instability exists

The HUD shows a **stability bar** that loses one segment each completed round.
When it empties, instability begins.

Heating and cooling both cost 2 money, and a defender also gets shields, so
two careful players can stall forever. The first AI simulations did exactly
that: games ran past 300 turns. Stellar Instability is a late-game clock: from
round 8, every sun heats by 1 at the start of its turn, plus 1 more every 4
rounds. It fits the theme (the loop decays) and guarantees games end.
AI games currently average about 11 rounds with 2 players and 11 with 4.

Alternatives worth playtesting instead: make Solar Flare cheaper than
Thermosiphon, cap cooling per turn, or add a market-exhaustion end condition.

## Open design questions

1. **"Upgrade a planet *or system*"**: what does a system-level upgrade do? Currently only planets upgrade.
2. **Rewards**: is "once per player" the right reading of "one time use"? Should the offer be 3 random rewards, or the full list?
3. **Global effects**: which cards trigger them, how long they last (currently one round), and can they stack?
4. **Player elimination**: should eliminated players keep a role, for example controlling global events?
5. **Game length**: with a 4-heat Solar Flare costing only 2 money, AI games average about 6 rounds (2 players), so most end before Stellar Instability starts. Consider scaling the flare cost with its upgrades.
6. **Balance**: `npm run simulate` shows Cryon Drift winning far too often in 4-player games (about 55%, against a fair 25%), while Vulcan Forge and Obsidian Veil win too rarely. Part of that is the AI always targeting the hottest sun. Needs human playtesting.
7. **Weapon and defence planets**: should they add their bonus to attack and cooling cards (as suggested in review), or keep the current effects (shield pierce and shields), or get more unique abilities per planet?
8. **Deck exhaustion**: what happens when all 200 market cards are bought? Currently the display slots stay empty.
