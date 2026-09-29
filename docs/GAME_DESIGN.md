# Blue Loop: Game design (as implemented)

Status: **playable prototype**. Rules from the original brief are marked
**[brief]**. Everything else was added to make the brief playable, and is
marked **[proposed]** for the design team to confirm or change.

## Setup

- 2–4 players. [proposed player count]
- **System draft:** each player is offered 2 random solar systems from the pool of 8 and picks one. A "SELECT SOLAR SYSTEM" banner plays over the board first, then the two offers appear; rivals' offers can be peeked at via tabs. [design review]
- Each player starts with **9 Stardust** (+1 money) and **1 Command Directive**. [brief]
- **3 cards** are on display at all times, drawn from a **200-card market deck**. [brief said 8; reduced to 3 in design review]
- **The display drifts:** after every full round, the leftmost card is discarded (out of the game), the other two slide one place left, and the empty right-hand slot is refilled from the deck. [design review]
- Suns start at **0**. The floor is **-10**, and a sun at **10** goes supernova and that player is out. [brief]
- Hand size is 5. Standard deck-builder flow: draw 5, play, then discard hand and played cards and draw 5 more. [proposed]
- 3 global objectives are face up, drawn from a pool of 11. [proposed]

## Turn structure

0. **Draw** a new hand (5 cards, plus bonuses). Hands are drawn when your turn begins, so nothing arrives during opponents' turns. [design review]
1. **Gain resources**: money from economy planets and system abilities, plus shields from defence planets. [brief: "gain resources"]
2. **Resolve global effects**: the active global card (if any), then Cryon Drift's thaw. [brief]
3. **Stellar Instability**: from round 8, every sun heats at the start of its turn: +1 in round 8, +2 in round 9, +3 in round 10, and so on. [design review]
4. **Main phase**, in any order and as often as money allows:
   - Play cards from hand.
   - Buy a card from the display. It goes to the discard pile. [proposed]
   - **Solar Flare**: pay 2 to heat an enemy sun by 1. Each upgrade adds +1 heat and +1 cost (2/3/4/5 money for 1/2/3/4 heat): the core actions are money sinks, never as efficient as bought cards. [design review]
   - **Thermosiphon**: pay 2 to cool your own sun by 1, +1 per upgrade. [brief]
5. **End turn**: discard your hand and played cards. Unspent money is lost. [proposed]

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
| Weapons | Your heat ignores 1 enemy shield. |
| Defences | +1 shield, refreshed each turn. Shields absorb enemy heat. |
| Economy | +1 money at turn start. |
| Resources | +1 hand size. |

Every level counts: planets go to level 3, and each level adds its bonus once. Bonuses add up across all your planets of that track.

Systems differ by their mix of planets, a unique ability **and** a drawback. [design review]

## The 8 solar systems [proposed content]

| System | Planets | Ability | Drawback |
| --- | --- | --- | --- |
| Helios Reach | W, D, E, R | First Thermosiphon each turn costs 1 less | Max health 1 lower |
| Vulcan Forge | W, W, E | Solar Flare starts with 2 upgrades | Max health 2 lower |
| Aegis Cluster | D, R | +1 shield every turn | Thermosiphon costs 1 more |
| Midas Belt | E1, E, R | +1 money every turn | Solar Flare and Thermosiphon cost 1 more; max health 2 lower |
| Cryon Drift | D, R, E | Sun starts at -10 | Thaw: sun heats by 1 at the start of each of its turns, until it reaches 4 |
| Tempest Binary | W, R | Draw 1 extra card every turn | Display cards cost 1 more; max health 4 lower |
| Obsidian Veil | E, W, D | Display cards cost 1 less (min 1) | Hand size fixed at 5 (planets and rewards cannot raise it) |
| Nova Crown | E1, W, D | +1 money per 3 heat above 0 at turn start | Max health 2 lower |

Tuned with `npm run simulate` after the Solar Flare cost change: every system wins 43–55% of 2-player games. [design review]

(`E1` = starts at level 1.)

## Market deck (200 cards) [proposed content]

Cards that hit **every enemy** (Plasma Barrage) are priced for several targets, so they are left out of 2-player games. The 2-player market deck is 190 cards. [design review]

Prices were lowered in design review: about 82% of the deck costs 4 or less, so early turns (4–6 money) can usually buy something.

Economy · Attack · Defence · Command · Mission · Global (24).

**Global cards change the board for everyone, equally.** They have no instant effect and never favour the player who played them: you pay to change the conditions of play, not for a direct benefit. Each lasts 3 full rounds. Only one is active at a time, and playing a new global replaces the current one. [design review]

| Card (cost) | For 3 rounds |
| --- | --- |
| Solar Storm (3) | Every sun heats by 1 at the start of its turn |
| Solar Maximum (3) | Every Solar Flare deals +1 heat |
| Ice Age (2) | Every sun cools by 1 at the start of its turn |
| Trade Boom (2) | Every player gains +1 money at the start of their turn |
| Magnetic Storm (2) | Every Solar Flare costs 1 more |
| Nebula Drift (2) | Display cards cost 1 less for everyone (min 1) |

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
round 8, every sun heats by 1 at the start of its turn, stacking +1 every round after. It fits the theme (the loop decays) and guarantees games end.
AI games currently average about 11 rounds with 2 players and 11 with 4.

Alternatives worth playtesting instead: make Solar Flare cheaper than
Thermosiphon, cap cooling per turn, or add a market-exhaustion end condition.

## Campaign mode [design review, first version]

Universe domination on a map of 48 linked solar systems. They're scattered in loose clusters with open voids between, so neighbours sit at irregular distances and angles. Routes follow a Gabriel graph, which never crosses. Overlong routes are dropped unless they're needed to keep the map connected. The map is a tilted 3D plane: drag to pan, scroll or pinch to zoom. Selecting a system zooms the camera in to show its planets orbiting the star. The player and 1–3 AI factions start in the corners. Everything else is neutral, held by "sentinels" that get stronger towards the middle of the map. Code: `src/engine/campaign.ts` (rules) and `src/ui/campaign.ts` (screen).

**Anomalies.** Eight anomalies settle in the voids between systems, each within reach of at least one system and never over a starting system. Each affects every battle fought from a system within its reach: the defender of a system there, or an attacker launching from one. Each is a trade-off:

| Anomaly | Boon | Cost |
| --- | --- | --- |
| Black Hole | +3 max health | Hand 1 card smaller |
| Nebula | +1 shield every turn | Display cards cost 1 more |
| Dark Matter Cluster | +1 money every turn | Thermosiphon costs 1 more |
| Pulsar | First Solar Flare each turn costs 1 less | Your sun heats by 1 each turn, up to 3 |

A system in reach of two anomalies gets both. Their effects are listed on the system panel, the attack matchup and the in-battle solar system card, and logged at the start of the battle.

**Turns.** On your turn you can manage your systems and deck freely, and make **one attack**. Then each AI faction takes its turn in order. Garrison moves resolve and every faction collects income at the start of the next turn. The campaign lasts **60 turns**.

**Attacking.** You can attack any system linked to one you control, except a supernova remnant that is still blocking you. The battle is a normal 1v1 game:
- **Attacker:** plays from the system it launched from, with that system's planet upgrades and damage.
- **Defender:** plays the target system, with its upgrades, damage and garrison.

You can fight a battle yourself or **auto-resolve** it, even partway through. AI-versus-AI battles resolve automatically.

**After a win, choose the system's fate:**

| Choice | Effect |
| --- | --- |
| Settle | Take control. It pays its yield (credits and materials) every turn. |
| Absorb | Take 3 turns of its yield at once. It is left neutral and depleted (yield −1 each). |
| Supernova | It is left neutral. No rival can attack it until each of them has had one turn. |

**Damage.** The winner's sun carries its final heat home as damage (capped at 6). A repelled attack deals 3 damage to the system it launched from. Damage adds to that system's starting heat in later battles.

**Two currencies**, each with its own solid icon: a gold coin for credits and a teal crystal for materials.
- **Credits** repair damage (2 per point) and upgrade planets (4 + 4 per level already bought).
- **Materials** buy armory cards (the card's price + 1; 3 new offers each turn) and upgrade cards (Stardust → Stellar Credits → Trade Convoy → Dyson Tap; Coolant Array → Cryo Vault; Gravity Sling → Coronal Lance → Starbreaker; and so on). An upgrade costs the new card's price.

**Deck.** Your battle deck is **always 10 cards**; empty slots are Stardust (unlimited). New cards wait in a reserve until you swap them in.

**Missions.** Each faction has 3 campaign missions at a time, from a pool of 10 (for example Settle 2 systems, Win a defence, Win a battle within 5 rounds). Each one pays 4 credits and 3 materials, plus a choice of 1 of 3 new cards. Winning any battle also pays 3 credits and 2 materials.

**Garrisons.** Send up to 3 cards to a system you control. Cards take **a turn to arrive** and **a turn to return**, and cannot be redirected while moving. Only stationed cards defend. When the system is attacked, each one gives its power as a head start:

| Card effect | Garrison bonus |
| --- | --- |
| Money | Defender's first-turn money |
| Draw | Extra cards in the first hand |
| Shields | First-turn shields |
| Attack | Heats the attacker's sun at the start (max 4) |
| Cooling | Cools the defender's sun at the start (max 5) |
| Command | +1 planet level |

Stardust, global and mission cards cannot garrison. If the system falls, the conqueror takes every card held there, including cards arriving or leaving.

**Winning.** You win by:
- controlling 50% of the systems,
- eliminating every rival (a faction is out when it holds no systems), or
- controlling the most systems when turn 60 ends.

You lose if you lose all your systems.

**Balance notes (simulator).**
- With the AI running every faction, campaigns average about 57 turns on the 48-system map, so most reach the turn limit. AI factions may need to be more aggressive.
- The first faction to act (the player's seat) wins most often. That's generous to the player, but needs tuning.
- An auto-player that never repairs or garrisons always loses, so management matters.

## Open design questions

1. **"Upgrade a planet *or system*"**: what does a system-level upgrade do? Currently only planets upgrade.
2. **Rewards**: is "once per player" the right reading of "one time use"? Should the offer be 3 random rewards, or the full list?
3. **Fields**: is 3 rounds the right length, and should the setter's advantage be bigger?
4. **Player elimination**: should eliminated players keep a role, for example controlling global events?
5. **Game length**: with the Solar Flare cost now rising with upgrades, 2-player AI games last about 23 turns (11 rounds), so Stellar Instability usually decides the late game.
6. **Balance**: with drawbacks, `npm run simulate` puts every system at 46–54% in 2-player games. In 4-player games the systems with lower max health (Vulcan, Nova, Obsidian, Tempest) still win too rarely (13–21% against a fair 25%), and Aegis and Helios win too often (37–43%). Part of that is the AI always targeting the hottest sun. Needs human playtesting.
7. **Weapon and defence planets**: should they add their bonus to attack and cooling cards (as suggested in review), or keep the current effects (shield pierce and shields), or get more unique abilities per planet?
8. **Deck exhaustion**: what happens when all 200 market cards are bought? Currently the display slots stay empty.
