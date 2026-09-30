# Blue Loop: Game design (as implemented)

Status: **playable prototype**. Blue Loop is a tableau card game: each player
brings a deck, and the cards they play stay in front of them, powering each
other up. Decisions from design review are marked **[design review]**. The
rest was added to make them playable and is marked **[proposed]**, for the
design team to confirm or change.

The deck-building version (solar systems, money, the display, objectives)
was replaced by this design in design review.

## The goal

- 2–4 players. Every sun starts at **0** heat with **24** max health. Reaching max health makes your sun go supernova, and you are out. The last sun standing wins. [proposed numbers]
- Cooling can take a sun down to **-5**. [proposed]

## Decks

- A deck is **exactly 20 cards**, with **at most 2 copies** of any card and **exactly 2 Command cards**. [design review: 20 cards, 2 commands; proposed: 2 copies]
- Players build decks in the **deck builder** (Quickplay → deck builder) from the whole card pool, or pick one of the four **race starter decks**. The AI plays the starters. [design review]
- Each deck carries a race emblem. Cards can be mixed freely across races. [proposed]

## Turns

1. **Start of turn.** In this order:
   - Your shields fade (unless Deep Current holds them).
   - Draw **1 card**. Your opening hand of 5 covers your first turn.
   - Stellar Instability applies, if it has begun.
   - The global card applies, if there is one.
   - Your tableau's **start-of-turn effects** trigger, left to right.
   - Then every card in your tableau loses **1 stability**. A card at 0 fades back into your deck.
2. **Play cards.** You may play **1 card on your first turn and 2 on every turn after that**. Hive Relay adds 1. [design review: draw 1 a turn; proposed: cap of 2]
3. **End turn.** Unplayed cards stay in your hand. [proposed]

**Second seat head start** [proposed]: in 2-player games, the second player starts with a sun 1 cooler. With fewer plays and draws, the old head start (2 cooler, 1 extra card, 1 extra play) let the second seat win 68%. The smaller one makes seats even (48/52). In 3–4 player games there is no head start: everyone else gangs up on the leader anyway.

**An empty deck** is refilled by shuffling your discard pile back in, so destroyed and cancelled cards come round again. (Cards that fade go straight back into the deck.) Each reshuffle heats your sun by 2 (unblockable). Only with both deck and discard pile empty does each card you should have drawn heat your sun by 2 instead. [design review: cards are discarded for reuse; proposed: 2 heat]

## The tableau

- Played cards **stay in play** in your tableau, which has **5 slots**. [design review: 5 slots]
- **You choose the slot.** There is **no replacing**: with every slot full, no new card goes in (Lightspeed cards excepted) until one fades, or is recalled or removed. Fill your tableau carelessly and you can lock yourself out. [design review]
- **Defence** comes from the slot: **1, 2, 3, 2, 1** from left to right. The middle is the safest place for the card you most want to keep. [design review]
  - Sturdy cards add their own defence: Bellwarden, Hero of Rathune and Aegis Monolith, +1 each.
  - Bulwarks guard their neighbours: Bulwark Plating gives +1 to the cards either side. Aegis Monolith (Anomaly) gives +2 either side and +1 two slots away.
  - Removal can only reach cards with low enough defence:
    - Ion Cannon: 2 or less.
    - Tractor Beam and Command Breaker: 3 or less.
    - Event Horizon (Anomaly): any.
- **Stability** is how many of your turns a card stays in play. Its start-of-turn effects trigger that many times, then it fades back into your deck at a random place. [design review: stability on each card replaces the stability bar]
  - **Standard stability:** 3.
  - **Cards with only a when-played effect:** 2. They are mostly slot-fillers once played.
  - **Command cards:** 3.
  - **Cards with their own stability:** Mycelium Tower 4 (it grows over time), Aegis Monolith 4.
  - **Restoring it (at a price):**
    - Stasis Field: +2 to a card, heat your own sun 1.
    - Shard Renewal (Xel'Naru): +3, heat your own sun 2.
    - Hive Rooting (Ixquor): +1 to all your others, draw 1.
    - Chrono Anchor: the cards next to it lose none. The Anchor itself still fades.
  - **Eroding it:**
    - Entropy Pulse: −2 to a rival card, heat 1.
    - Undertow (Vorthane): −2, gain 2 shields.
    - Decay Wave: −1 to every card in the target's tableau, heat your own sun 2.
  - Erosion ignores defence. A card eroded to 0 is swept back into its owner's deck.
- On the board, each card in play shows ⛨ defence and ◷ stability. The badge turns red on its last turn. Empty slots show their defence.
- Cards have up to three kinds of effect:
  - **When played**: a one-off effect.
  - **Start of turn**: triggers at the start of each of your turns while the card is in play.
  - **Passive**: works while the card is in play.

  A few cards also do something **when they leave** your tableau (faded, destroyed or returned to hand), or **when you recover them** from your discard pile. [design review]
- Every player's tableau is visible. On the board, your target's tableau lies across the table and yours is on the near side. Tap a rival's pill (top left) to target them and bring their tableau across. [design review: players need to see each other's tableaus]
- Only **one global card** can be in play on the whole table. A new one sweeps the old one away. Global effects apply to everyone equally. [design review: globals are symmetric]

## Targets and shields

- **Your target** is the rival your attacks hit. Tap a rival to choose. It defaults to the next rival round the table, and moves on if they are knocked out. [proposed]
- **Shields** absorb enemy heat point for point. They fade at the start of your turn. Heat you deal to your own sun (drawbacks, fatigue, instability) ignores shields. [proposed]
- A few cards splash: they hit your target in full and every other enemy for 1. In 2-player games that is the same as hitting your target. [proposed, for multiplayer balance]

## Command cards

Each Command card upgrades a core stat for your **whole deck**, permanently. Command cards **stay in your tableau** like any other card and take a slot. When one fades, it goes back into your deck; destroyed, it goes to your discard pile. Play one again and it upgrades again, so full upgrades are reachable. [design review]

| Upgrade | Effect per level | Max |
| --- | --- | --- |
| Solar Flare | Every heat effect from your **attack cards** deals +1 | 3 |
| Thermosiphon | Every cooling effect from your cards cools +1 | 3 |
| Cooling Chamber | +6 max health | 3 |

The standard Command card is **Command Directive**: choose any of the three upgrades. Every starter deck runs two. The other Command cards are fine-tuned alternatives a player can swap in. Each gives one fixed upgrade plus an effect **while it stays in your tableau**, which gives a reason to keep it there. [design review: commands stay general unless you swap in a fine-tuned one]

| Card | Rarity | Effect |
| --- | --- | --- |
| Command Directive | White Dwarf | Choose any upgrade |
| Ignition Protocol | Stellar | Solar Flare upgrade. Start of turn: heat your target by 1 |
| Coolant Protocol | Stellar | Thermosiphon upgrade. Start of turn: cool your sun by 1 |
| Chamber Protocol | Stellar | Cooling Chamber upgrade. Start of turn: gain 1 shield |
| The Admiralty | Anomaly | Choose any upgrade. Resonance: cards next to it get +1 |

**Keeping Command cards in play** is rewarded by:
- Standing Orders: draw 1; start of turn, draw 1 if you control 2 or more Command cards.
- Chain of Command: cool 1 per Command card (up to 2).
- Aureline War-Herald: heat 1 per Command card (up to 2).

**Replaying Command cards.** Phase Shift returns one of your cards to your hand and gives the play back, so a Command card can be recalled and played again for another upgrade. Command Breaker is the answer: it destroys a Command card in your target's tableau.

## Resonance [design review]

Resonance cards power up their neighbours in your tableau (by slot: an empty slot between two cards separates them). The bonus applies to heat, cooling and shields, and only to an effect that already does something. A card's current bonus shows as a violet badge on it.

| Card | Rarity | Resonance |
| --- | --- | --- |
| Resonance Lattice | White Dwarf | +1 to the cards either side |
| Sunforge (Aureline) | Stellar | +1 to attack cards either side, and start of turn: heat 1 |
| The Admiralty | Anomaly | +1 to the cards either side (a Command card) |
| Harmonic Singularity | Anomaly | +2 to the cards either side, +1 to the cards two places away |

Some cards count their own neighbours instead:
- Tide Pylon (Vorthane): start of turn, 1 shield +1 per defence card next to it.
- Prism Conduit (Xel'Naru): start of turn, cool 1 per attack card next to it.

## Recovery, recall and removal [design review]

- **Recover** (from your discard pile to your hand): Salvage Drone (any card), Xel'Naru Reliquarist (an attack card, then draw 1), Regrowth Pod (a growth card, and cool 1).
- **On recovery**, some cards fire an effect: Ember Shard heats every enemy by 1; Spore Husk draws 2.
- **Recall** (from your tableau to your hand, triggering its leave effects, to play it again): Phase Shift, which also gives you 1 extra play this turn.
- **Removal** of cards in your target's tableau:
  - Ion Cannon destroys a card.
  - Command Breaker destroys a Command card, and heats 1.
  - Tractor Beam returns a card to its owner's hand, and heats 1.
  - Event Horizon (Anomaly) destroys a card and flings the cards either side of it back to their owner's hand.

## Lightspeed cards [design review]

Lightspeed cards are played **face down**. They don't take a slot, and **only one can be face down at a time**. Rivals see only that one is set (⚡ by the owner's tableau and pill). The card springs **during an enemy's turn** when its trigger happens. It is revealed ("Lightspeed!"), resolves against that enemy ("your target" means them), and goes to your discard pile.

| Card | Rarity | Springs when an enemy… | Effect |
| --- | --- | --- | --- |
| Null Field | Stellar | plays an attack card | Cancel it |
| Signal Jammer | White Dwarf | plays a Command card | Cancel it, draw 1 |
| Frost Snare | White Dwarf | plays a defence card | Cancel it, heat them 1 |
| Solar Mirror | White Dwarf | is about to heat your sun | First gain 3 shields and heat them 1 |
| Decoy Array | White Dwarf | is about to destroy or return one of your cards | Cancel it, draw 1 |
| Riptide Ambushers (Vorthane) | Stellar | is about to heat your sun by 3 or more | Cancel that heat, heat them 2 |
| Temporal Snare | Anomaly | plays any card | Cancel it; they may play no more cards this turn |

A cancelled card still uses the play and goes to its owner's discard pile. The AI plans without seeing its rivals' face-down cards.

## Rarity [design review]

Every card has a rarity, shown by a small animated gem in its top corner. The gem is a tiny cabochon of dark glass in a silver bezel, with a glowing body inside it. The images are rendered by `scripts/render_gems.py`.

| Rarity | Gem | Deck limit |
| --- | --- | --- |
| White Dwarf (standard) | A searing blue-white point whose glare breathes and twinkles | 2 copies |
| Stellar | A granulated, limb-darkened sun turning slowly in its corona | 2 copies |
| Anomaly | A black hole: a lensed glow over the shadow, and an accretion disk that streams around it and passes in front; never at rest | **1 copy** (unique) [proposed] |

Stellar and Anomaly cards also get a faint gold or violet edge. In the campaign, rarer cards cost more in the armory (3 / 5 / 8 materials, +1 for a race card) and turn up less often there and in mission rewards.

## Characters [design review]

Many race cards are **characters**: people of that race, who will feature in the card's picture. Until the portraits are commissioned, a character card shows a figure of its race: the race's emblem as the head, over a pair of shoulders, in an arched window. Named heroes (the Anomalies) wear a halo. Each race has a Stellar hero and an Anomaly, and both are in its starter deck.

| Race | Characters |
| --- | --- |
| Aureline | Aureline Lancer, Halo Warden, Chorus of Dawn (Stellar), Aureline Sun-Priest (Stellar), **Aurelia, the First Light** (Anomaly) |
| Xel'Naru | Xel'Naru Martyr (Stellar), Fracture Seer, Xel'Naru Champion (Stellar), **Kyr'Vessa, Prism Queen** (Anomaly) |
| Vorthane | Vorthanian Bellwarden, Vorthanian Commoners, Abyssal Choir (Stellar), Hero of Rathune (Stellar), **Ommarath, the Deep Bell** (Anomaly) |
| Ixquor | Ixquor Sporecaster, Ixquor Brood-Tender (Stellar), **The Brood Queen** (Anomaly) |

Rathune is the Vorthane home tide-world. [proposed lore]

## The card pool [proposed content]

**84 cards:** 40 neutral (26 others, 3 globals, 5 Command cards and 6 Lightspeed cards), and 10–12 for each race. Cards have no cost: the number of plays per turn is the only limit, so no single card is a bomb. The power is in combinations. The full list and exact wording are in `src/engine/cards.ts`. Rarity and characters are set in one table there (`CARD_META`).

| Race | Theme | Its cards |
| --- | --- | --- |
| Aureline | Lancers: many attack cards, each making the others hit harder | Aureline Lancer, Focusing Array (other attack cards +1 at start of turn; copies don't stack), Chorus of Dawn (1 heat per attack card you control), Sunspear, Dawn Beacon, Halo Warden, Sun-Priest (cools with your attack cards), Aurelia (heat that grows with your attack cards), War-Herald (heat per Command card in play), Sunforge (resonance for attack cards) |
| Xel'Naru | Overload: splash every enemy, and run your own sun hot to hit harder | Shard Reactor, Crystal Storm, Overload Core (harder while overheated), Xel'Naru Martyr (burst when it leaves play), Prism Vent, Fracture Seer, Champion (harder while overheated), Kyr'Vessa (strikes whenever another of your cards leaves play), Ember Shard (burst when recovered), Reliquarist (recovers an attack card), Prism Conduit (cools with neighbouring attack cards) |
| Vorthane | Tides: build shields, keep them, and sting attackers | Bellwarden, Stinging Veil (once per attacking card each turn), Tidal Bloom, Abyssal Choir (heat from your shields), Deep Current (shields no longer fade), Vorthanian Commoners, Hero of Rathune (shields from your defence cards), Ommarath (cools your sun when your shields absorb a hit), Tide Pylon (shields from neighbouring defence cards), Riptide Ambushers (Lightspeed: turn aside a big hit) |
| Ixquor | The hive: grow, go wide and play more | Mycelium Tower (grows each turn), Hive Relay (+1 play), Sporecaster, Rot Bloom and Canopy (both scale with cards in play), Spore Cloud, Brood-Tender (your other cards grow faster), The Brood Queen (+1 play, and splash once you're wide), Regrowth Pod (recovers a growth card), Spore Husk (draws when recovered) |

**Neutral cards:**
- Coronal Lance, Plasma Relay, Gravity Sling, Thermal Exchange, Solar Battery, Coolant Array, Cryo Vault, Deflector Grid, Heat Sink and Deep-Space Scanners.
- Removal: Ion Cannon, Tractor Beam, Command Breaker and Event Horizon.
- Resonance: Resonance Lattice and Harmonic Singularity.
- Recovery and recall: Salvage Drone and Phase Shift.
- Command synergies: Standing Orders and Chain of Command.
- Defence and stability: Bulwark Plating, Aegis Monolith, Chrono Anchor, Stasis Field, Entropy Pulse and Decay Wave. The race cards are Shard Renewal (Xel'Naru), Undertow (Vorthane) and Hive Rooting (Ixquor).
- Commands and Lightspeed cards: see above.

**Globals:** Solar Storm (every sun heats 1 each turn), Ice Age (every sun cools 1 each turn) and Solar Maximum (every heat effect +1).

## Balance (AI simulations)

`npm run simulate -- [games] [players]` plays AI-versus-AI games with the four starter decks.

**2 players** (1000 games). Seats are even (48/52). Overall deck win rates are 47–52%. The worst match-up is about 61/39: Bloom over Lancers. Games last about 11 rounds.

| Row beats column | Lancers | Overload | Tide | Bloom |
| --- | --- | --- | --- | --- |
| Solar Lancers | – | 50% | 47% | 39% |
| Shard Overload | 50% | – | 47% | 54% |
| Abyssal Tide | 53% | 53% | – | 51% |
| Hive Bloom | 61% | 46% | 49% | – |

**Rule and card changes, with 5 slots, 1 draw, 2 plays a turn and stability:**
- **Max health:** 30 down to 24. Heat builds more slowly with fewer plays, and games had stretched to 12 rounds.
- **Second-seat head start:** cut to 1 cooler (see Turns).
- **Go-wide thresholds scaled to 5 slots:**
  - Spore Cloud and The Brood Queen now need 4 cards.
  - Canopy cools 1 per 2 cards.
  - Hero of Rathune shields 1 per 2 defence cards.
- **Aureline Lancer:** heats 2. Many small attack cards suffer most from a small, fading tableau, so the Lancers deck fell to about 35%.
- **Kept from the last balance pass:** Bell Warden 3 shields, Shard Reactor self-heat 2, Overload Core 1 (3 while overheated), Xel'Naru Champion opening 1. Rot Bloom is back to 1 +1 per 2 cards, up to 5.

**3–4 players.**
- Deck rates are close to fair in 3-player games (29–36%, against 33%).
- In 4-player games Abyssal Tide does best (35%, against 25%) and Solar Lancers worst (15%).
- Later seats do better: seat 1 wins 26% of 3-player games and 17% of 4-player games. The head start only applies to 2-player games.
- The AI attacks the rival on its left, but switches to finish off a sun near supernova or to rein in a clear leader.

Balance has been sensitive to single cards, removal above all. Adding two Ion Cannons to the Tide starter once swung it from 45% to 80% overall. `npm run simulate` takes three overrides, so you can experiment without editing the code:
- `DECKS='{"1": [...]}'` for a starter deck change.
- `PATCH='{"card_id": {...}}'` for a card change.
- `BAL='{"maxPlays": 3}'` for a rules number.

## Why Stellar Instability exists

Stability now lives on each card, so the old stability bar is gone from the top of the screen. The round counter keeps a late-game clock as a safety net: from round **10**, every sun heats at the start of its turn, +1 and then +1 more each round after. The counter only shows "instability" once it has begun. AI games last about 11 rounds, so the clock often decides the end. [proposed: keep the clock until playtesting shows games end without it]

## The four races

Each player is one of four non-humanoid alien races. The race sets the faction emblem and colour, and each has ten or eleven cards of its own.

| Race | Form | Colour |
| --- | --- | --- |
| Aureline | Tilted plasma halos around a single unblinking eye | Blue |
| Xel'Naru | A choir of floating crystal shards around a core of light | Rose |
| Vorthane | A drifting jelly-like bell rimmed with glowing eyes | Gold |
| Ixquor | A branching fungal hive with pulsing nodes | Violet |

## Always landscape

The game is always landscape.
- **Native iOS app** (`ios/`): landscape is its only orientation, so iOS locks it like any App Store game.
- **Web version held upright** (browsers can't lock orientation on iPhone): the page draws itself sideways. It re-measures until a rotation settles, then re-lays out the hand and map.
- **Android and full-screen browsers that allow it:** the app also requests a real lock.

## The battle table

The whole play area is a table seen in perspective, like a tabletop simulator. A flat HUD sits above it:
- **Top left:** player pills, in a column. The active player glows green, and your target has a crosshair.
- **Top centre:** the round (and, from round 10, the instability).
- **Top right:** the global card, skip and the menu.

On the table:
- Your target's tableau lies across the far side, yours on the near side, and the rotating white star between them.
- The log runs down the right.
- Your hand fans along the bottom, with your deck and discard piles either side.
- The upgrade rail sits on the left, and the "plays left" pips and End Turn on the right.

When a card needs a choice, you make it on the board and a short prompt appears at the top of the screen:
- which rival card a removal card destroys or returns
- which empty slot a card goes in (each shows its defence; the prompt reminds you the middle is safest)
- which of your cards Phase Shift returns, or Stasis Field restores

Small dialogs handle the other choices:
- Command Directive's upgrade
- what to recover from your discard pile

A face-down Lightspeed card shows as an amber ⚡ chip by its owner's tableau label. Yours is named and can be read; a rival's only says "face down". When one springs, a "Lightspeed!" banner names it and the card is shown at the middle right. Press and hold any card to read it at the middle right of the screen.

## Campaign mode

Universe domination on a map of 48 linked solar systems, played with the card game. Code: `src/engine/campaign.ts` (rules) and `src/ui/campaign.ts` (screen).

**Setup.** Choose your race and 1–3 rivals. The rivals are the other races. Your deck starts mostly neutral: 8 neutral pairs, 2 cards of your race and 2 Command Directives.

**The map.**
- 48 systems in loose clusters, linked by routes that never cross, on a tilted 3D plane that you can pan and zoom.
- The map is wide (3500 × 2250) so systems sit well apart. Stars are small, sharp points with only a tight glow, so the map stays readable.
- Tap the turn box (top left) to open the **overview**: every faction's systems held, their share of the map, and the win condition. The side panel only holds hints, missions and the log.
- Factions start in the corners. Neutral systems are held by sentinels, which get stronger towards the middle of the map.
- Outer sentinels start their battles with hotter suns (+5 heat at tier 1, +2 at tier 2), so early expansion is easier. [proposed]

**Turns, attacks, conquest, missions and winning** work as before:
- One attack per turn, on a system linked to yours. The battle is a 1v1 game: you attack from your system, the defender holds theirs.
- After a win, choose Settle, Absorb or Supernova.
- Damage carries between battles.
- The campaign lasts 60 turns. You win at 50% of the systems or by eliminating every rival.

**Economy.**
- **Credits** repair damage (1 per point) and **fortify** a system (4, then 8, then 12). Each fortification level gives that system's defender +4 max health.
- **Materials** buy cards in the armory by rarity: 3 for a White Dwarf, 5 for a Stellar, 8 for an Anomaly, +1 for a race card. The armory and mission rewards offer mostly your own race's cards, and Anomalies least often. The fine-tuned Command cards are on offer too, to swap for a standard Command Directive.

**The deck.** Your campaign deck is always a legal 20-card deck. Cards you win or buy wait in your **reserve**. You swap a reserve card in for a deck card, as long as the deck stays legal.

**Garrisons.** Send up to 3 reserve cards to a system you control. They take a turn to arrive and a turn to return. When the system is attacked, stationed cards **start the battle already in the defender's tableau**, a stationed Command card gives its upgrade instead, and a stationed Lightspeed card starts the battle set face down (only one). If the system falls, the conqueror takes them. [design review: garrisoned cards defend a system]

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

1. **Numbers:** max health 24, 5 slots, slot defence 1-2-3-2-1, stability 3 (2 for when-played cards), a cap of 2 plays and 1 draw a turn are all first guesses. Human playtesting should drive them.
2. **Removal:** Ion Cannon is the only way to destroy a card, and it swings match-ups hard. Should there be more removal, or none?
3. **Multiplayer:** defensive decks win free-for-alls. Should attacks be restricted (for example, only your neighbours), or should defence scale down with more players?
4. **Collection:** decks are built from the full pool. A collection to unlock would suit a CCG, but was left for later.
5. **Campaign balance:** some races and corners win far more often in AI-only campaigns.
