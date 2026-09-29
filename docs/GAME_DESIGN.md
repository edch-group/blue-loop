# Blue Loop: Game design (as implemented)

Status: **playable prototype**. Blue Loop is a tableau card game: each player
brings a deck, and the cards they play stay in front of them, powering each
other up. Decisions from design review are marked **[design review]**. The
rest was added to make them playable and is marked **[proposed]**, for the
design team to confirm or change.

The deck-building version (solar systems, money, the display, objectives)
was replaced by this design in design review.

## The goal

- 2–4 players. Every sun starts at **0** heat with **30** max health. Reaching max health makes your sun go supernova, and you are out. The last sun standing wins. [proposed numbers]
- Cooling can take a sun down to **-5**. [proposed]

## Decks

- A deck is **exactly 20 cards**, with **at most 2 copies** of any card and **exactly 2 Command cards**. [design review: 20 cards, 2 commands; proposed: 2 copies]
- Players build decks in the **deck builder** (Quickplay → deck builder) from the whole card pool, or pick one of the four **race starter decks**. The AI plays the starters. [design review]
- Each deck carries a race emblem. Cards can be mixed freely across races. [proposed]

## Turns

1. **Start of turn.** In this order:
   - Your shields fade (unless Deep Current holds them).
   - Draw **2 cards**. Your opening hand of 5 covers your first turn.
   - Stellar Instability applies, if it has begun.
   - The global card applies, if there is one.
   - Your tableau's **start-of-turn effects** trigger, oldest card first.
2. **Play cards.** You may play **1 card on your first turn, 2 on your second, 3 on your third, and 4 on every turn after that**. Hive Relay adds 1. [design review: 1, 2, 3…; proposed: cap of 4]
3. **End turn.** Unplayed cards stay in your hand. [proposed]

**Second seat head start** [proposed]: in 2-player games, the second player starts with a sun 2 cooler, 1 extra card in hand, and 1 extra play on their first turn. Without it the first player won about 70% of AI games; with it, seats are even. In 3–4 player games there is no head start: everyone else gangs up on the leader anyway.

**Drawing from an empty deck** heats your sun by 2 for each card you should have drawn. [proposed]

## The tableau

- Played cards **stay in play** in your tableau, which has **8 slots**. [design review: cards persist; proposed: 8 slots]
- When all 8 are full, a new card must **replace** one of yours, which goes to your discard pile. [design review]
- Cards have up to three kinds of effect:
  - **When played**: a one-off effect.
  - **Start of turn**: triggers at the start of each of your turns while the card is in play.
  - **Passive**: works while the card is in play.

  A few cards also do something **when they leave** your tableau. [design review]
- Every player's tableau is visible. On the board, your target's tableau lies across the table and yours is on the near side. Tap a rival's pill (top left) to target them and bring their tableau across. [design review: players need to see each other's tableaus]
- Only **one global card** can be in play on the whole table. A new one sweeps the old one away. Global effects apply to everyone equally. [design review: globals are symmetric]

## Targets and shields

- **Your target** is the rival your attacks hit. Tap a rival to choose. It defaults to the next rival round the table, and moves on if they are knocked out. [proposed]
- **Shields** absorb enemy heat point for point. They fade at the start of your turn. Heat you deal to your own sun (drawbacks, fatigue, instability) ignores shields. [proposed]
- A few cards splash: they hit your target in full and every other enemy for 1. In 2-player games that is the same as hitting your target. [proposed, for multiplayer balance]

## Command cards

Command cards don't take a tableau slot. Each one upgrades a core stat for your **whole deck**, permanently. [design review]

| Upgrade | Effect per level | Max |
| --- | --- | --- |
| Solar Flare | Every heat effect from your **attack cards** deals +1 | 3 |
| Thermosiphon | Every cooling effect from your cards cools +1 | 3 |
| Cooling Chamber | +6 max health | 3 |

The Command cards:

| Card | Effect |
| --- | --- |
| Ignition Protocol | Solar Flare upgrade, and heat your target by 1 |
| Coolant Protocol | Thermosiphon upgrade, and cool your sun by 1 |
| Chamber Protocol | Cooling Chamber upgrade, and gain 2 shields |
| Command Directive | Choose any upgrade |

With exactly 2 Command cards per deck, a player reaches at most +2 on one stat in a game. The campaign's garrisons can add more.

## The card pool [proposed content]

**42 cards:** 14 neutral (including 3 globals), 4 Command cards, and 6 for each race. Cards have no cost: the number of plays per turn is the only limit, so no single card is a bomb. The power is in combinations. The full list and exact wording are in `src/engine/cards.ts`.

| Race | Theme | Its cards |
| --- | --- | --- |
| Aureline | Lancers: many attack cards, each making the others hit harder | Helio Lancer, Focusing Array (other attack cards +1 at start of turn; copies don't stack), Coronal Chorus (1 heat per attack card you control), Sunspear, Dawn Beacon, Halo Ward |
| Xel'Naru | Overload: splash every enemy, and run your own sun hot to hit harder | Shard Reactor, Crystal Storm, Overload Core (harder while overheated), Martyr Crystal (burst when it leaves play), Prism Vent, Fracture Lens |
| Vorthane | Tides: build shields, keep them, and sting attackers | Bell Warden, Stinging Veil (once per attacking card each turn), Tidal Bloom, Abyssal Choir (heat from your shields), Deep Current (shields no longer fade), Lure Jelly |
| Ixquor | The hive: grow, go wide and play more | Mycelium Tower (grows each turn), Hive Relay (+1 play), Sporecaster, Rot Bloom and Canopy (both scale with cards in play), Spore Cloud |

**Neutral cards:** Coronal Lance, Plasma Relay, Gravity Sling, Thermal Exchange, Solar Battery, Ion Cannon, Coolant Array, Cryo Vault, Deflector Grid, Heat Sink and Deep-Space Scanners. Ion Cannon destroys a card in your target's tableau.

**Globals:** Solar Storm (every sun heats 1 each turn), Ice Age (every sun cools 1 each turn) and Solar Maximum (every heat effect +1).

## Balance (AI simulations)

`npm run simulate -- [games] [players]` plays AI-versus-AI games with the four starter decks.

**2 players.** Seats are even (49/51). Overall deck win rates are 42–57%. The worst match-up is about 70/30:

| Row beats column | Lancers | Overload | Tide | Bloom |
| --- | --- | --- | --- | --- |
| Solar Lancers | – | 32% | 72% | 53% |
| Shard Overload | 68% | – | 33% | 68% |
| Abyssal Tide | 28% | 67% | – | 51% |
| Hive Bloom | 47% | 32% | 49% | – |

**3–4 players.**
- Abyssal Tide (defence) does best: about 47% in 3-player games, against a fair 33%, and 37% in 4-player games, against a fair 25%.
- Solar Lancers (all attack) does worst: 15–23%.
- The AI attacks the rival on its left, but switches to finish off a sun near supernova or to rein in a clear leader.

The balance has been sensitive to single cards, removal above all. Adding two Ion Cannons to the Tide starter swung it from 45% to 80% overall.

## Why Stellar Instability exists

The stability bar loses one segment each round. From round **10**, every sun heats at the start of its turn: +1, then +1 more each round after. Together with fatigue from empty decks, this guarantees that games end. AI games currently last about 7–8 rounds, so most end before instability begins.

## The four races

Each player is one of four non-humanoid alien races. The race sets the faction emblem and colour, and each has six cards of its own.

| Race | Form | Colour |
| --- | --- | --- |
| Aureline | Tilted plasma halos around a single unblinking eye | Blue |
| Xel'Naru | A choir of floating crystal shards around a core of light | Rose |
| Vorthane | A drifting jelly-like bell rimmed with glowing eyes | Gold |
| Ixquor | A branching fungal hive with pulsing nodes | Violet |

## Always landscape

The game is always landscape. Held upright, a phone shows the whole page turned a quarter-turn, so you just hold it sideways. That works even with rotation lock on. Browsers can't lock orientation on iPhone, so this is the only reliable way. Where a real lock is allowed (Android, full screen), the app asks for one too. [design review]

## The battle table

The whole play area is a table seen in perspective, like a tabletop simulator. A flat HUD sits above it:
- **Top left:** player pills, in a column. The active player glows green, and your target has a crosshair.
- **Top centre:** the round and stability.
- **Top right:** the global card, skip and the menu.

On the table:
- Your target's tableau lies across the far side, yours on the near side, and the rotating white star between them.
- The log runs down the right.
- Your hand fans along the bottom, with your deck and discard piles either side.
- The upgrade rail sits on the left, and the "plays left" pips and End Turn on the right.

When a card needs a choice, you make it on the board and a short prompt appears at the top of the screen:
- which rival card Ion Cannon destroys
- which of your cards to replace when your tableau is full

Command Directive's upgrade choice is a small dialog. Press and hold any card to read it at the middle right of the screen.

## Campaign mode

Universe domination on a map of 48 linked solar systems, played with the card game. Code: `src/engine/campaign.ts` (rules) and `src/ui/campaign.ts` (screen).

**Setup.** Choose your race and 1–3 rivals. The rivals are the other races. Your deck starts mostly neutral: 8 neutral pairs, 2 cards of your race and 2 Command Directives.

**The map.** Unchanged from before:
- 48 systems in loose clusters, linked by routes that never cross, on a tilted 3D plane that you can pan and zoom.
- Factions start in the corners. Neutral systems are held by sentinels, which get stronger towards the middle of the map.
- Outer sentinels start their battles with hotter suns (+5 heat at tier 1, +2 at tier 2), so early expansion is easier. [proposed]

**Turns, attacks, conquest, missions and winning** work as before:
- One attack per turn, on a system linked to yours. The battle is a 1v1 game: you attack from your system, the defender holds theirs.
- After a win, choose Settle, Absorb or Supernova.
- Damage carries between battles.
- The campaign lasts 60 turns. You win at 50% of the systems or by eliminating every rival.

**Economy.**
- **Credits** repair damage (1 per point) and **fortify** a system (4, then 8, then 12). Each fortification level gives that system's defender +4 max health.
- **Materials** buy cards in the armory: 3 neutral, 4 global or Command, 5 race. The armory and mission rewards offer mostly your own race's cards.

**The deck.** Your campaign deck is always a legal 20-card deck. Cards you win or buy wait in your **reserve**. You swap a reserve card in for a deck card, as long as the deck stays legal.

**Garrisons.** Send up to 3 reserve cards to a system you control. They take a turn to arrive and a turn to return. When the system is attacked, stationed cards **start the battle already in the defender's tableau**, and a stationed Command card gives its upgrade instead. If the system falls, the conqueror takes them. [design review: garrisoned cards defend a system]

**Anomalies** now give battle modifiers:

| Anomaly | Boon | Cost |
| --- | --- | --- |
| Black Hole | +5 max health | Opening hand 1 card smaller |
| Nebula | +1 shield every turn | Sun starts 3 hotter |
| Dark Matter Cluster | Draw 1 extra card every turn | Sun heats by 1 every turn |
| Pulsar | Sun cools by 1 every turn | 4 less max health |

**Balance notes (simulator).**
- With the AI running every faction, campaigns average about 56 turns.
- Race and starting corner matter too much: in 12 all-AI campaigns, Xel'Naru won 8 and Aureline none. This needs tuning next.

## Open design questions

1. **Numbers:** max health 30, 8 slots, a cap of 4 plays and 2 draws a turn are all first guesses. Human playtesting should drive them.
2. **Removal:** Ion Cannon is the only way to destroy a card, and it swings match-ups hard. Should there be more removal, or none?
3. **Multiplayer:** defensive decks win free-for-alls. Should attacks be restricted (for example, only your neighbours), or should defence scale down with more players?
4. **Collection:** decks are built from the full pool. A collection to unlock would suit a CCG, but was left for later.
5. **Campaign balance:** some races and corners win far more often in AI-only campaigns.
