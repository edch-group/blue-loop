# Blue Loop: Game design (as implemented)

Status: **playable prototype**. Blue Loop is a tableau card game: each player
brings a deck, and the cards they play stay in front of them, powering each
other up. Decisions from design review are marked **[design review]**. The
rest was added to make them playable and is marked **[proposed]**, for the
design team to confirm or change.

The deck-building version (solar systems, money, the display, objectives)
was replaced by this design in design review.

## The goal

- **1v1**: two players, always. Every sun starts at **0** heat with **24** max health. Reaching max health makes your sun go supernova, and your rival wins. [proposed numbers; design review: 1v1 across the board]
- Cooling can take a sun down to **-5**. [proposed]

## Decks

- A deck is **30 to 40 cards**, with **at most 2 copies** of any card and **one Command card per 10 cards** (3 in a 30-card deck, 4 in 40), so a deck runs at least two different Command cards. The starter decks are 30. [design review: 30–40 cards so a deck has room for a balanced curve and its big cards; proposed: 2 copies]
- Players build decks in the **deck builder** (Quickplay → deck builder) from the whole card pool, or pick one of the four **race starter decks**. The builder shows real cards, always the same shape and size as on the table. The AI plays the starters. [design review]
- Each deck carries a race emblem. Cards can be mixed freely across races. [proposed]

## Turns

1. **Dawn.** In this order:
   - Your shields fade (unless Deep Current holds them).
   - Draw **1 card**. Your opening hand of 5 covers your first day.
   - At the first dawn of each round, once regional stability has run out, regional instability heats **every sun at once** by the same amount, past shields. If that would finish every sun, the one least far past its limit holds on (a coin flip if level) and wins. (Simulated 300 games: seats 51.7% / 48.3%.)
   - The global card applies, if there is one.
   - Your tableau's **dawn effects** trigger, left to right.
   - Then every card in your tableau loses **1 stability**. A card at 0 fades into your discard pile.
2. **Play cards** with your **energy**: 1 on your first day, then 2, 3, and **4 a day** from your fourth day. The industrial planet, a Command card's energy option and cards like Hive Relay add more on top, with no ceiling (5+ is normal). [design review: a cap of 4, because big cards are fun]
3. **End day.** Unplayed cards stay in your hand. [proposed]

**Second seat head start** [proposed]: the second player starts with 1 extra card (with 4 energy and 30-card decks the first seat won 55–58% without it; with it, seats are about 48/52). The old head start (2 cooler, 1 extra card, 1 extra play) let the second seat win 68%; a sun 1 cooler was still worth too much with the current decks. With 1 extra card, seats are 46/54.

**The discard pile** takes every card that leaves play: cards that fade, and cards destroyed or cancelled (cards returned or recalled go to hand). Recovery cards draw from it. **An empty deck** is refilled by shuffling the discard pile into a new deck. Each reshuffle heats your sun by 2 (unblockable). Only with both deck and discard pile empty does each card you should have drawn heat your sun by 2 instead. [design review: cards are discarded for reuse; proposed: 2 heat]

## The tableau

- Played cards **stay in play** in your tableau, which has **5 slots**. [design review: 5 slots]
- **You choose the slot.** There is **no replacing**: with every slot full, no new card goes in (Lightspeed cards excepted) until one fades, or is recalled or removed. A recall card is the one way in: it takes the place of the card it recalls. Fill your tableau carelessly and you can lock yourself out. [design review]
- **Defence** comes from the slot: **1, 2, 3, 2, 1** from left to right. The middle is the safest place for the card you most want to keep. [design review]
  - Sturdy cards add their own defence: Bellwarden, Hero of Rathune and Aegis Monolith, +1 each.
  - Bulwarks guard their neighbours: Bulwark Plating gives +1 to the cards either side. Aegis Monolith (Anomaly) gives +2 either side and +1 two slots away.
  - Removal can only reach cards with low enough defence:
    - Ion Cannon: 2 or less.
    - Tractor Beam and Command Breaker: 3 or less.
    - Event Horizon (Anomaly): any.
- **Stability** is how many of your days a card stays in play. Its dawn effects trigger that many times, then it fades into your discard pile. [design review: stability on each card; the discard pile takes everything that leaves play]
  - **Standard stability:** 3.
  - **Cards with only a one-time effect** (no Dawn effect, nothing passive), Command Directive included: 1. They stay through your rival's day and fade at your next dawn: the slot is part of their cost, but they never stay past the day they are played. A card with a leave effect (Xel'Naru Martyr) fires it then.
  - **Command cards** with a Dawn effect or a passive: 3.
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
  - Erosion ignores defence. A card eroded to 0 fades into its owner's discard pile.
- Every card that stays in play shows its stability (◷) in your hand, zoomed and in the deck builder too.
- On the board, each card in play shows ⛨ defence and ◷ stability. The badge turns red on its last turn. Empty slots show their defence.
- Cards have up to three kinds of effect:
  - **When played**: a one-off effect.
  - **Dawn**: triggers at each of your dawns while the card is in play.
  - **Passive**: works while the card is in play.

  A few cards also do something **when they leave** your tableau (faded, destroyed or returned to hand), or **when you recover them** from your discard pile. [design review]
- Both tableaus are visible: your rival's lies across the table and yours is on the near side. [design review: players need to see each other's tableaus]
- Only **one global card** can be in play on the whole table. A new one sweeps the old one away. Global effects apply to both players equally. [design review: globals are symmetric]

## Orbit

Three planets circle each sun. Each faces it for **3 of its owner's turns**, in turn, and then the next comes round. [design review]

| Planet | While it faces your sun |
| --- | --- |
| Dead | Nothing. |
| Abundant | Draw 1 extra card each day. |
| Industrial | Play 1 extra card each day. |

- Every sun starts at the dead planet. The orbit moves on one step at each of your dawns: three steps per planet, nine for the whole orbit.
- **Orbit cards** move an orbit on or back, yours or your rival's, and the change counts from your next day. "Orbit +3" swings the next planet round; "your rival's orbit −2" holds their next planet back (and from their dead planet's first day, it wraps round to their industrial planet).
- Some cards are **stronger while a planet faces your sun** (a scaling bonus, so attack bonuses count once).
- Each sun sits on the board at the left end of its tableau row: the top half of a sphere rising out of the board, slowly turning, its surface mottled with granulation, deep orange where it faces you and white-hot at its outline (as in a photograph of the Sun), with a flickering corona of flames across the board round its base. Round it, flat on the board, lie its orbit ring (three markers for the current planet's three turns: done, now, still to come) and inside that its shield and heat rings. Its planets are half-spheres in the board on the orbit, all the same size, lit from the sun's side, passing behind it. The orbit turns clockwise, and a change (at the start of a day, or from a card) is seen: the planets swing round a notch at a time, and the planet facing the sun lays a trail in its colour along the notches it has passed (the dead planet a grey one, and so on), which fades as it swings away and the next planet comes in. Flat on the board beyond the orbit lie a tag naming the facing planet and its days left, and the sun's shields: under your rival's sun, above yours. (Sun and planets are ray-traced onto a canvas lying on the board: each pixel's line of sight from the viewer's eye, worked out from the table's perspective, either meets a ball or reaches the board, so they look truly solid without making the board itself a 3D scene, which is slow.)
- Between the tableaus (beneath your rival's, above yours, centred on each), its owner's next dawn as symbols: ✹ heat to their rival, ⛨ shields, ❄ cooling, ☀ heat to their own sun from their cards and the table, ≋ regional instability, extra cards and extra plays (details in each one's tooltip). Instability is shown as the amount every sun takes when the next round begins.

| Card | Kind | Text |
| --- | --- | --- |
| Gravity Assist | Attack | Heat your rival by 2. Your orbit +1. |
| Orbital Slingshot | Growth | Your orbit +3 (the next planet swings round). Draw 1 card. |
| Tidal Brake | Defence | Gain 2 shields. Your rival's orbit −2. |
| Dead World Mine | Growth | Dawn: cool your sun by 1. While your dead planet faces your sun, also draw 1 card. |
| Perihelion Forge (Stellar) | Attack | Dawn: heat your rival by 1, or by 3 while your industrial planet faces your sun. |
| Sunward Lance (Aureline) | Attack | Heat your rival by 1, or by 3 while your industrial planet faces your sun. Your orbit +1. |
| Comet Shard (Xel'Naru) | Attack | Heat your rival by 3. Your rival's orbit −1. Heat your own sun by 1. |
| Tide Lock (Vorthane) | Defence | Dawn: gain 1 shield, or 3 while your abundant planet faces your sun. |
| Orbit Root (Ixquor, Stellar) | Growth | Dawn: gain 1 shield. While your dead planet faces your sun, your orbit +2 (it moves on in a day, not three). |

**Starter decks with orbit:**
- **Solar Lancers:** Gravity Assist and Tidal Brake, in place of a Helio Lancer and Aurelia.
- **Shard Overload:** Comet Shard and Tidal Brake, in place of an Overload Core and Crystal Storm.
- **Abyssal Tide:** Tidal Brake, in place of a Plasma Relay.
- **Hive Bloom:** two Orbit Roots and a Tidal Brake, with Coolant Array and Cryo Vault for more cooling, in place of the Mycelium Tower, Regrowth Pod, Entropy Pulse and the attacks.

**Playtesting orbit (AI simulations).**
- Orbit on its own, with the old decks, threw the balance out: Hive Bloom fell from 48% to 20% and Solar Lancers rose from 54% to 66%. Games got shorter (about 9 rounds).
- The cause is the abundant planet. With its extra card switched off, Bloom recovered to about 41%. Its extra card arrives on turns 4–6 for everyone, just as fast attack decks reload, and Bloom already holds plenty of cards (about 6.5 in hand at the start of its turns), so it gains nothing while every rival speeds up. Bloom was not locked out of its tableau, and reshuffles were not the cause either.
- Two card fixes followed from that:
  - On Sunward Lance and Perihelion Forge, the planet bonus was first a second heat effect, so Solar Flare and attack bonuses counted twice. It is now a scaling bonus, counted once.
  - Coronal Chorus now hits for up to 3, not 4: with orbit's extra plays it reached its cap too easily.
- Hive Bloom got more cooling and harder-hitting payoffs:
  - Canopy cools 1, +1 for every 3 cards you control (was every 2).
  - Spore Cloud and the Brood Queen heat by 2 once you control 4 cards.
  - Orbit Root skips the dead planet.
- **Result (1,000 games):**
  - Shard Overload 58%, Solar Lancers 51%, Hive Bloom 47%, Abyssal Tide 42%.
  - Seats 46/54. Games last about 11–12 rounds. Orbit cards are played about 3 times a game.
  - Before orbit it was Overload 57%, Lancers 54%, Bloom 48%, Tide 39%, so the spread is now slightly tighter.
- **Still open:**
  - Bloom against Overload is the worst matchup (28/72).
  - Tidal Brake is in all four starters, so the starters feel a little alike. A race-specific alternative for each would help.
  - Sunward Lance and Tide Lock are in the card pool but not the starters: they tipped their decks too far in testing.

## Attacks and shields

- **Aiming.** Each card's heat goes where its owner aims it: the rival's sun, or one rival card. A card that heats as it is played is aimed as you play it; a card with only dawn heat asks for nothing when played. Dawn heat is aimed afresh every dawn: your dawn waits while you tap each of your dawn attackers and then its target ("break dawn", or Enter, lets it go; anything unaimed goes at the sun, or the most worn Guard). The dawn step only appears when there is a choice. Heat from other triggers (a card leaving, recovering) goes at the sun or a Guard. [design review: per card and per dawn, so an attack deck can split its heat between clearing a wall and pressing the sun]
- **Defence turns heat aside.** Heat aimed at a card is cut by the card's defence (its slot's, plus Sturdy and Bulwark), point for point, after shields. Pierce heat ignores both. So the middle slot really is safest, and removal cards still matter for well-defended cards.
- Heat on a card wears its **stability** point for point; at 0 the card burns away (its leave effects fire, so killing a Martyr or a card beside Kyr'Vessa has a price, and the AI weighs it).
- **Guard** cards draw heat: while a rival has any, your heat must go at one of them (a Guard that was not aimed at takes it on the most worn Guard). Pierce gets through shields, never past a Guard. Shields still cover cards, so stings and soothes answer heat aimed at a Guard too.
- The day heat limit (8) counts only heat on the sun.
- **Shields** absorb your rival's heat point for point. They fade at your dawn. Heat you deal to your own sun (drawbacks, fatigue, instability) ignores shields. [proposed]

## Command cards

Command cards **lead the tableau**. Each player has **one Command slot**, out in front of their five tableau slots (top right of your tableau; your rival's is bottom left, the board being a mirror), so only one Command card is in play at a time: **a new one replaces the old** (which goes to the discard pile). It takes no tableau slot, has no neighbours, and its slot has defence 2. On the board it lies landscape, and a line round each tableau bumps out round it. [design review]

- **Utility, chosen as you play it.** Every Command card offers **+1 energy** or **draw 1** each dawn, or a **third option of its own**. The card keeps the option picked for as long as it stays; the card shows all three, with the one picked highlighted. [design review: heat and cool options lost to energy almost every time, so the first two are utility for all, and the third varies]
- **A full term.** Every Command card has stability 3, whatever it does, so cards that want a Command card in play can count on one.
- **Never back to your own hand.** Command cards can't be recalled (Phase Shift, Recall Beacon, Shard Recall) or recovered from the discard pile (Salvage Drone and the rest). A rival can still send one back to its owner's hand (Tractor Beam, Event Horizon), and Command Breaker destroys one.

**Heroes.** Every Command card is a hero: a character who leads their race, with their own picture. Each race has two, so a deck's three Command cards can be its own race's (two of one, one of the other).

| Hero | Race | Rarity | Dawn, one of |
| --- | --- | --- | --- |
| Solarch Veyra | Aureline | White Dwarf | +1 energy, draw 1, or 2 shields |
| Sol-Marshal Aurex | Aureline | Stellar | +1 energy, draw 1, or heat 2 |
| Archon Seris | Xel'Naru | White Dwarf | +1 energy, draw 1, or recover your last discarded card |
| Hierarch Vael | Xel'Naru | Stellar | +1 energy, draw 1, or cool 2 |
| Tide-Regent Osshara | Vorthane | White Dwarf | +1 energy, draw 1, or 3 shields |
| The Admiralty (the deep fleet's elders) | Vorthane | Anomaly | +2 energy, draw 2, or 4 shields |
| Hive-Speaker Zyth | Ixquor | White Dwarf | +1 energy, draw 1, or your orbit +1 |
| Broodmother Ul'Kha | Ixquor | Stellar | +1 energy, draw 1, or renew 1 |

(They keep the ids of the Command cards they replaced, so collections and saved decks carry over.)

**Keeping Command cards in play** is rewarded by:
- Standing Orders: draw 1; dawn, draw 1 if you control a Command card.
- Chain of Command: dawn, cool 1, or 2 if you control a Command card.
- Aureline War-Herald: dawn, heat 1; gain 1 shield if you control a Command card.

Only one Command card is in play at a time, so these ask for one, and do something without one.

**Answering Command cards.** Command Breaker destroys a Command card in your target's tableau; Tractor Beam and Event Horizon can send one back to its owner's hand (it can be played again, with a new choice).

**Why the change, and what the simulator says (1000 games).** Permanent upgrades were opaque and snowballed, and a Command card fading after a day made the cards that want one in play weak. As choose-one dawn cards with a full term, they are easier to read. But the upgrades did one useful job: Solar Flare's +1 on every attack was what let attack-heavy decks break through shield decks. Without it, Abyssal Tide sits behind its shields at 0–4 heat (and the AI mostly picks cool 3 for its Commands), so Tide beats Shard Overload about 85% of the time. Tried and kept: Bell Warden 2 shields a dawn (was 3), Shard Reactor heats its own sun by 1 (was 2), Ember Shard 3 heat (was 2), and no extra opening card for the second seat (seats were 43/57 with it, as games run longer now). Result: Tide 60%, Hive 52%, Lancers 49%, Overload 42%; seats 49/51; about 13 rounds a game (was 11). Cool 2 in place of cool 3 sinks Hive Bloom (~20%), which leans on cooling; raising max health to 27 or 30 only made games longer. **Pierce: the counter to shields.** Every mechanic should have a counter. Shields answer heat, Sting and Soothe punish heat into shields, and **Pierce** answers shields: piercing heat goes straight past them (and so sets off no Sting or Soothe), though a Lightspeed card can still cancel it. On Shard Reactor's dawn heat, the Xel'Naru Martyr's burst, and Ignition Protocol. With them, Tide vs Overload went from 85/15 to about 55/45.

**Rarity review.** No card should be strictly worse than a commoner one:
- Chorus of Dawn (Stellar): 1 heat per attack card you control, up to 4 (it was up to 2, worse than a plain Coronal Lance).
- Aureline Lancer (White Dwarf) is a plain dawn heat 2; Aureline War-Herald (Stellar) is dawn heat 1, and with a Command card heat +1 and a shield (it was strictly worse than the Lancer).
- Aurelia, the First Light (Anomaly): dawn heat 1, +1 per attack card you control (up to 5).
- Ommarath, the Deep Bell (Anomaly): dawn 2 shields, Soothe 1.
- The protocols now beat Command Directive's matching option: Ignition heat 1, dawn heat 2 with Pierce; Coolant cool 2, dawn cool 3; Chamber 3 shields, dawn 3 shields.

Result (1000 games): Tide 54%, Lancers 53%, Overload 49%, Hive 44%; seats 49/51; about 12.5 rounds a game.

## Resonance [design review]

Resonance cards power up their neighbours in your tableau (by slot: an empty slot between two cards separates them). The bonus applies to heat, cooling and shields, and only to an effect that already does something. A card's current bonus shows as a violet badge on it.

| Card | Rarity | Resonance |
| --- | --- | --- |
| Resonance Lattice | White Dwarf | +1 to the cards either side |
| Sunforge (Aureline) | Stellar | +1 to attack cards either side, and dawn: heat 1 |
| The Admiralty | Anomaly | +1 to the cards either side (a Command card) |
| Harmonic Singularity | Anomaly | +2 to the cards either side, +1 to the cards two places away |

Some cards count their own neighbours instead:
- Tide Pylon (Vorthane): dawn, 1 shield +1 per defence card next to it.
- Prism Conduit (Xel'Naru): dawn, cool 1, +1 per attack card next to it.

## Recovery, recall and removal [design review]

- **The discard pile** takes every card that leaves play (faded, destroyed or cancelled), so there is nearly always something to recover.
- **Recover** (from your discard pile to your hand). With nothing to recover, each of these draws a card instead, so none is ever dead:
  - Salvage Drone: any card, and cool 1.
  - Xel'Naru Reliquarist: an attack card, then draw 1.
  - Regrowth Pod (Ixquor): a growth card, and cool 1.
  - Sunlit Return (Aureline): cool 1, and an attack card.
  - Returning Tide (Vorthane): gain 2 shields, and a defence card.
  - Compost Cycle (Ixquor): any card, and your other cards regain 1 stability.
- **On recovery**, some cards fire an effect: Ember Shard heats your rival by 1; Spore Husk draws 2.
- **Recall** (from your tableau to your hand, triggering its leave effects, to play it again; it also frees the slot):
  - Phase Shift: and 1 extra play today.
  - Recall Beacon: and draw 1.
  - Shard Recall (Xel'Naru): and heat your rival by 1 (recalling a Martyr fires it too).
- **Removal** of cards in your target's tableau:
  - Ion Cannon destroys a card.
  - Command Breaker heats 2, and destroys a Command card if there is one.
  - Tractor Beam returns a card to its owner's hand, and heats 1.
  - Event Horizon (Anomaly) destroys a card and flings the cards either side of it back to their owner's hand.

## Every card does something on its own [design review]

Cards that only worked alongside others (a count of a card type, Command cards, neighbours, a planet) left hands full of cards that did nothing, and a deck had to be almost all of one type to use them. Now each has a **floor**: it always does something, and its synergy makes it better.

| Card | Before | Now |
| --- | --- | --- |
| Solar Battery | 2 heat with 3+ attack cards, else nothing | 1 heat, or 3 with 3+ attack cards |
| Spore Cloud (Ixquor) | 2 heat with 4+ cards, else nothing | 1 heat, or 3 with 4+ cards |
| Halo Ward (Aureline) | 1 shield per 2 attack cards | 1 shield, +1 per 2 attack cards |
| Aureline Sun-Priest | cool 1 per 2 attack cards (up to 2) | cool 1, or 2 with 2+ attack cards |
| Aurelia, the First Light | 1 heat per 2 attack cards (up to 3) | 1 heat, +1 per 2 attack cards (up to 4) |
| Dawn Beacon (Aureline) | dawn, draw 1 with 3+ attack cards | with 2+ attack cards |
| Prism Conduit (Xel'Naru) | cool 1 per attack card next to it | cool 1, +1 per attack card next to it |
| Standing Orders, Chain of Command, War-Herald | needed one or two Command cards | see Command cards |
| Command Breaker | heat 1, destroy a Command card | heat 2, destroy a Command card if there is one |
| Signal Jammer | cancels a Command card (decks hold 2) | cancels a growth card |
| Dead World Mine | only while the dead planet faces your sun | also cool 1 every day |
| Orbit Root | only while the dead planet faces your sun | also 1 shield every day |
| Recovery cards | nothing with an empty discard pile | draw 1 instead |

## Keywords [design review]

The game's recurring mechanics are **keywords**: a coloured word on the card with its number, always in title case (**Sturdy 1**, **Resonance 2 · 1**, **Erode 2**, **Recover Attack**, **Destroy 2** (2 or less defence)). The three most common effects are **symbols** instead of words, so card text stays very short: **heat** (two red chevrons up), **cool** (two blue chevrons down) and **shields** (a shield), each with its number. "At dawn, heat your rival's sun by 3" reads **Dawn: ⏶3**. Heat goes to the rival's sun unless the card says "to your sun".

Each is explained once, in `src/engine/keywords.ts`: in a game, beside the zoomed card (with no hover pop-up there, since the explanations are already beside it); in the deck builder and the shop, on hover; and on the rules page (How to Play → Keywords), which lists them all. The zoomed card also explains its stability and defence badges, and the rules its text names in plain words (`TEXT_RULES`: choose-one cards, Command cards, leaving the tableau, facing a planet, cancelling, max health).

**How to Play** is a sheet of tabs (Overview, Your Day, Tableau, Sun & Orbit, Card Types, Keywords, Progress), each a handful of short facts rather than paragraphs.

| Keyword | Meaning |
| --- | --- |
| Dawn | At each of your dawns, while in play |
| heat N (symbol) | Heat your rival's sun by N (or the sun the card names) |
| cool N (symbol) | Cool your sun by N |
| shields N (symbol) | Gain N shields |
| Pierce | This card's heat ignores shields (so no absorbing, Sting or Soothe); Lightspeed cards can still answer it |
| sturdy N | +N defence |
| bulwark N (· M) | Cards next to it +N defence (two slots away +M) |
| resonance N (· M) | Cards next to it +N heat, cooling and shields (two places away +M) |
| forge N | Resonance for attack cards only: +N heat |
| anchor | Cards next to it lose no stability |
| erode N / decay N | A rival card / every rival card loses N stability |
| restore N / renew N | Another card / every other card of yours regains N stability |
| recover (type) | A card (of that type) from your discard pile to your hand; with none there, draw |
| recall | Another card of yours from your tableau to your hand |
| destroy N / eject N | Destroy / return to hand a rival card with at most N defence |
| sting N / soothe N | When your shields absorb heat: heat the attacker N / cool your sun N |
| hold N | Your shields don't fade (up to N) |
| overheated | Half your max health or hotter |
| grows N | Grows by 1 each day, up to N |
| plays +N | N extra plays each day |
| orbit ±N | Moves the planets round a sun |
| lightspeed, global | Card types (see below) |

## Lightspeed cards [design review]

Lightspeed cards are played **face down**. They don't take a slot, and **only one can be face down at a time**. Rivals see only that one is set: it lies face down in the Lightspeed slot, right of its owner's five (that slot has no defence), and the owner's pill shows ⚡. The card springs **during an enemy's day** when its trigger happens. It is revealed ("Lightspeed!"), resolves against that enemy ("your target" means them), and goes to your discard pile.

| Card | Rarity | Springs when an enemy… | Effect |
| --- | --- | --- | --- |
| Null Field | Stellar | plays an attack card | Cancel it |
| Signal Jammer | White Dwarf | plays a growth card | Cancel it, draw 1 |
| Frost Snare | White Dwarf | plays a defence card | Cancel it, heat them 1 |
| Solar Mirror | White Dwarf | is about to heat your sun | First gain 3 shields and heat them 1 |
| Decoy Array | White Dwarf | is about to destroy or return one of your cards | Cancel it, draw 1 |
| Riptide Ambushers (Vorthane) | Stellar | is about to heat your sun by 3 or more | Cancel that heat, heat them 2 |
| Temporal Snare | Anomaly | plays any card | Cancel it; they may play no more cards today |

A cancelled card still uses the play and goes to its owner's discard pile. The AI plans without seeing its rivals' face-down cards.

## Rarity [design review]

Every card has a rarity. It shows in two places: a small animated gem on the top corner of the card's picture, and the card stock itself. The gem is a polished cabochon of coloured glass (no rim), with a glowing body inside. The images are rendered by `scripts/render_gems.py`.

| Rarity | Gem | Card stock | Deck limit |
| --- | --- | --- | --- |
| White Dwarf (standard) | Icy blue glass; a searing blue-white point whose glare breathes and twinkles | Pearl, with faint steel-blue circuit traces | 2 copies |
| Stellar | Amber glass; a granulated sun turning slowly in its corona | Warm cream, with faint gold traces and a gold edge | 2 copies |
| Anomaly | Deep violet glass; a black hole whose accretion disk streams around it, never at rest | Lavender, with faint violet traces and a violet edge | **1 copy** (unique) [proposed] |

The card stock is a faint circuit board: thin traces running straight and in 45° bends between solder pads, with vias and the odd chip. It is drawn once per rarity as a tile, and kept light so it never competes with the picture or the text. In the campaign, rarer cards cost more in the armory (3 / 5 / 8 materials, +1 for a race card) and turn up less often there and in mission rewards. The line at the bottom of a card shows only its type and race.

## Card art [design review]

Every card has its own painted picture, in a window at the top of the card. They are drawn procedurally in SVG by `src/ui/cardart.ts`, as placeholders for commissioned art.
- **Palettes:** each race has its own sky (Aureline dawn blue and gold, Xel'Naru rose dusk, Vorthane deep teal sea, Ixquor violet and bio-green). Neutral cards take their palette from their type: attack ember, defence ice blue, growth green, global violet, Command steel, Lightspeed amber.
- **Pictures:** each card has a subject of its own, shaded with gradients and soft glows. A test checks that no card falls back to a default and that no two pictures are the same.

## Characters [design review]

Many race cards are **characters**: people of that race, drawn as individuals, each with their own pose, props, markings and colours.
- **Aureline:** plasma-cloaked beings with one great eye inside tilted halos. They wear plate armour or vestments and carry a lance, a halo shield, a sun staff, a war banner or a star.
- **Xel'Naru:** figures of floating crystal shards around a core of light. There's a blade, a fractured lens, a reliquary, shard capes, a shattering Martyr and a shard crown for the Queen.
- **Vorthane:** bells of living jelly rimmed with eyes. The Bellwarden has a helm and a bronze bell. The Hero of Rathune has a helm and a trident. The Commoners carry lanterns, the choir sings in rings of sound, and the Ambushers are eyes in the kelp.
- **Ixquor:** walking fungal hives with glowing caps and nodes. The Sporecaster casts spores, the Brood-Tender carries brood pods, and the Brood Queen wears a crown of caps.

| Race | Characters |
| --- | --- |
| Aureline | Aureline Lancer, Halo Warden, Chorus of Dawn (Stellar), Aureline Sun-Priest (Stellar), **Aurelia, the First Light** (Anomaly) |
| Xel'Naru | Xel'Naru Martyr (Stellar), Fracture Seer, Xel'Naru Champion (Stellar), **Kyr'Vessa, Prism Queen** (Anomaly) |
| Vorthane | Vorthanian Bellwarden, Vorthanian Commoners, Abyssal Choir (Stellar), Hero of Rathune (Stellar), **Ommarath, the Deep Bell** (Anomaly) |
| Ixquor | Ixquor Sporecaster, Ixquor Brood-Tender (Stellar), **The Brood Queen** (Anomaly) |

Rathune is the Vorthane home tide-world. [proposed lore]

## The card pool [proposed content]

**89 cards:** 41 neutral (27 others, 3 globals, 5 Command cards and 6 Lightspeed cards), and 11–13 for each race. Cards have no cost: the number of plays per turn is the only limit, so no single card is a bomb. The power is in combinations. The full list and exact wording are in `src/engine/cards.ts`. Rarity and characters are set in one table there (`CARD_META`).

| Race | Theme | Its cards |
| --- | --- | --- |
| Aureline | Lancers: many attack cards, each making the others hit harder | Aureline Lancer, Focusing Array (other attack cards +1 at dawn; copies don't stack), Chorus of Dawn (1 heat per attack card you control), Sunspear, Dawn Beacon, Halo Warden, Sun-Priest (cools more with your attack cards), Aurelia (heat that grows with your attack cards), War-Herald (heat, and a shield while you hold a Command card), Sunforge (resonance for attack cards), Sunlit Return (recovers an attack card) |
| Xel'Naru | Overload: big bursts of heat, and run your own sun hot to hit harder | Shard Reactor, Crystal Storm (3 heat, or 4 while you are overheated), Overload Core (harder while overheated), Xel'Naru Martyr (burst when it leaves play), Prism Vent, Fracture Seer, Champion (harder while overheated), Kyr'Vessa (strikes whenever another of your cards leaves play), Ember Shard (burst when recovered), Reliquarist (recovers an attack card), Prism Conduit (cools more with neighbouring attack cards), Shard Recall (recalls a card) |
| Vorthane | Tides: build shields, keep them, and sting attackers | Bellwarden, Stinging Veil (once per attacking card each day), Tidal Bloom, Abyssal Choir (heat from your shields), Deep Current (shields no longer fade), Vorthanian Commoners, Hero of Rathune (shields from your defence cards), Ommarath (cools your sun when your shields absorb a hit), Tide Pylon (shields from neighbouring defence cards), Riptide Ambushers (Lightspeed: turn aside a big hit), Returning Tide (recovers a defence card) |
| Ixquor | The hive: grow, go wide and play more | Mycelium Tower (grows each day), Hive Relay (+1 play), Sporecaster, Rot Bloom and Canopy (both scale with cards in play), Spore Cloud, Brood-Tender (your other cards grow faster), The Brood Queen (+1 play, and hits harder once you're wide), Regrowth Pod (recovers a growth card), Spore Husk (draws when recovered), Compost Cycle (recovers any card, steadies the rest) |

**Neutral cards:**
- Coronal Lance, Plasma Relay, Gravity Sling, Thermal Exchange, Solar Battery, Coolant Array, Cryo Vault, Deflector Grid, Heat Sink and Deep-Space Scanners.
- Removal: Ion Cannon, Tractor Beam, Command Breaker and Event Horizon.
- Resonance: Resonance Lattice and Harmonic Singularity.
- Recovery and recall: Salvage Drone, Phase Shift and Recall Beacon.
- Command synergies: Standing Orders and Chain of Command.
- Defence and stability: Bulwark Plating, Aegis Monolith, Chrono Anchor, Stasis Field, Entropy Pulse and Decay Wave. The race cards are Shard Renewal (Xel'Naru), Undertow (Vorthane) and Hive Rooting (Ixquor).
- Commands and Lightspeed cards: see above.

**Globals:** Solar Storm (every sun heats 1 each day), Ice Age (every sun cools 1 each day) and Solar Maximum (every heat effect +1).

## Balance (AI simulations)

`npm run simulate -- [games]` plays AI-versus-AI 1v1 games with the four starter decks.

**The starter decks** were rebuilt so every race plays with the newer mechanics. [design review: in play, the old starters never used them]

| Deck | Built around |
| --- | --- |
| Solar Lancers | Attack cards that boost each other: a Sunforge and a Focusing Array, Lancer Squadrons and Sunlance Charges; a Halo Sentinel (Guard); Command cards kept in play for the War-Herald; Sunlit Return and a Recall Beacon to bring attack cards back; Ion Cannon; Prism of Dawn set face down |
| Shard Overload | Martyrs, Echo Shard, Prism Wards and Kyr'Vessa paying off as cards leave play; Phase Shift, Shard Echo and Shard Recall to recall and replay them; an Ember Shard and the Reliquarist; Prism Conduit |
| Abyssal Tide | Wardens flanked by Tide Pylons, a Trench-Warden and the Aegis Monolith guarding the line; Undertows to erode rival cards away; Returning Tide to bring a fallen defence card back; a Riptide Ambusher and an Ink Cloud |
| Hive Bloom | The ramp deck: Sporelings, Overgrowth, a Hive Relay and the Brood Queen for more energy, so it can run a higher curve (a Chitin Fortress); Hive Rooting and Compost Cycle to stay wide; Spore Husks recovered (by the Compost Cycle and a Regrowth Pod) to draw more |

How often the newer mechanics come up in an AI game (per game), before and after the rebuild:

| Mechanic | Old starters | New starters |
| --- | --- | --- |
| Lightspeed cards set / sprung | 0.3 / 0.3 | 1.2 / 1.1 |
| Stability restored / eroded | 0 / 0 | 2.2 / 1.2 |
| Cards returned to hand | 0 | 0.7 |
| Resonance and bulwark cards played | 0.8 | 3.3 |
| Cards recovered from the discard pile | 0.07 | 0.14 |

Recovery used to be rare because cards that faded went back into the deck, so the discard pile held only destroyed and cancelled cards. Now every card that leaves play goes there.

**One-time cards last a day (1000 games).** Cards with only a when-played effect now fade at their owner's next dawn (stability 1, was 2; Command Directive was 3). Unchanged, this swung the field to Hive Bloom (67%): with nothing clogging its tableau, its cooling kept it alive, and Tide fell to 41%. Fixes, tried one at a time in the simulator:
- Canopy: +1 cooling per 3 cards you control, not per 2.
- Orbit Root: a shield each dawn in place of its cooling.
- Xel'Naru Martyr: 4 heat when it leaves (was 3), now that it leaves sooner.
- Abyssal Tide's starter deck: Deep Current in place of Tidal Brake (its held shields feed the Abyssal Choirs).

Nerfing Hive's plays or its "cards you control" attacks hardly moved it; its cooling did. Result: Overload 52.5%, Tide 51.1%, Bloom 50.7%, Lancers 46.0%; seats 48/52; games about 11 rounds. Lancers lost the most from Command Directive fading fast (War-Herald and Standing Orders want a Command card in play), and Overload beats it 60/40. The other lopsided matchup is Tide vs Overload (74/26), as before.

**After the discard pile and the card floors (1000 games).** Cards recovered from the discard pile went from 0.2 to 1.7 a game, and cards returned to hand to 1.9. Deck win rates are 46–55%: Lancers 54.7%, Overload 49.0%, Tide 49.6%, Bloom 46.3%. Seats are 49/51, and games last about 11.5 rounds.
- The floors made Solar Lancers far too strong at first (about 80%). Their attack cards now all hit every day, and Focusing Array and Sunforge add to every one of them. Lancers now run one Sunforge (and a Recall Beacon), Coronal Chorus hits for up to 2, Sunlit Return cools 1, the Sun-Priest cools at most 2, and the War-Herald's Command bonus is a shield rather than more heat.
- Abyssal Tide fell to about 25% (it gained little from the floors), so the Abyssal Choir now starts at 2 heat and the Stinging Veil stings for 3. Rot Bloom also starts at 2.
- The widest match-ups are Tide over Overload (74/26) and Lancers over Tide (72/28).

**The energy curve (600 games).** At 3 energy a day, a deck full of 2s plays one card most days. The starters had only 5–7 cards at 0–1 energy (13–14 at 2), so they were rebuilt to 8–12 at 0–1, 8–10 at 2 and a few 3s and 4s, mostly with on-theme 1-cost cards from the second set (new and existing profiles are granted them). Win rates: Lancers 45.5%, Overload 55.8%, Tide 44.0%, Bloom 53.6%; seats 47/53. Tide fell to 35% at first; it got its second Abyssal Choir and Undertow back, and a Trench-Warden.

**Ramp (600 games).** A higher curve is fine for a deck that ramps, so Hive Bloom became the ramp deck (Sporelings, Overgrowth, Hive Relay, the Brood Queen, Chitin Fortress: 6 cards at 1, 10 at 2, three 3–4s). The AI had never ramped: it judged a play by the board it left, and energy still to spend today counted for nothing, so "+energy today" cards looked worthless. It now counts the energy a card gives back, up to what the cards left in its hand can use. Overgrowth's drawback went from 2 heat to 1. Win rates: Lancers 52.9%, Overload 49.2%, Tide 52.4%, Bloom 45.7%. Seats are 44/56: the second seat now wins too often.

**Heroes, recall and pierce (600 games).** A recall card can now be put in the slot of the card it recalls (that card shows "replace" as you place it), not only into a full tableau, and every starter deck runs 2–4 recall cards (new: Tactical Withdrawal, Rally Banner, Spore Return). Abyssal Tide still lost about 89% of games to Shard Overload, so **pierce heat now gets past half the shields in its way** (rounded down) rather than all of them. Win rates: Lancers 53.8%, Overload 51.1%, Tide 42.4%, Bloom 51.0%; seats 46/54; Tide vs Overload 27/73. Lancers swapped its Sunspear for a Dawn Rampart.

**Energy 4, 30-card decks and the Command slot (600 games).** Games got faster (about 13 rounds) and Abyssal Tide fell to 25% (7% against Shard Overload, whose pierce heat ignores its shields). It came back to 43% with more attack cards in its list (two each of Riptide, Brine Lash, Jelly Swarm and Coronal Lance), Abyssal Choir at heat 3 (up to 6), Bell Warden at 3 shields and Tide Pylon at 2; Shard Overload lost its Fracture Burst, Shard Lancer, Searing Core and Shard Mother. Shield buffs alone hardly moved Tide; heat did. Win rates: Lancers 46.5%, Overload 55.5%, Tide 42.8%, Bloom 53.9%; seats 47/53 (with the second seat's extra card). The AI still picks +1 energy for almost every Command card. It also leaves about 1.7 energy unspent a day, often because its five tableau slots are full: with 4 energy a day, the five slots may now be the limit.

**After dawn aiming and defence against heat (300 games).** Win rates: Lancers 53.4%, Overload 51.2%, Tide 47.2%, Bloom 47.4%; seats 45/55; about 15 rounds. The widest match-ups are Lancers over Tide and over Bloom (59/41).

**After aiming and Guard (300 games).** Win rates: Lancers 50.3%, Overload 57.5%, Tide 45.5%, Bloom 45.5%. Seats are 51/49, and games last about 15 rounds (aiming heat at cards slows the race to the sun).
- At first Overload won 71%: a 3-heat Ember Shard kills most cards outright, and it gets recovered. It now deals 2.
- Tide had fallen to 30%, because Guards pulled heat away from its shields and stings never fired. Shields now cover cards too.
- The widest match-up is Lancers over Tide (71/29): Lancers have no Guards to aim at, so Tide's heat all reaches the sun or a lone card.

**1000 games.** Deck win rates are 39–57%. The worst match-up is about 70/30: Overload over Bloom. Games last about 10–11 rounds. Converting the splash and every-enemy cards to plain target heat for 1v1 barely moved the numbers.
- **Seats:** 46/54. The second seat now starts with 1 extra card instead of a cooler sun; the cooler sun was worth too much with these decks.
- **Hive Bloom:** its first draft won 81%. It had three Sporecasters (a card every day each, when everyone else draws one), two Mycelium Towers and a Frost Snare, which cancels defence cards and so shut down Tide. It now has one Sporecaster and one Tower, and no Frost Snare.

| Row beats column | Lancers | Overload | Tide | Bloom |
| --- | --- | --- | --- | --- |
| Solar Lancers | – | 50% | 57% | 60% |
| Shard Overload | 50% | – | 64% | 70% |
| Abyssal Tide | 43% | 36% | – | 39% |
| Hive Bloom | 40% | 30% | 61% | – |

`npm run simulate` also prints how often each mechanic comes up per game.

Balance has been sensitive to single cards, removal above all. Adding two Ion Cannons to the Tide starter once swung it from 45% to 80% overall. `npm run simulate` takes three overrides, so you can experiment without editing the code:
- `DECKS='{"1": [...]}'` for a starter deck change.
- `PATCH='{"card_id": {...}}'` for a card change.
- `BAL='{"maxPlays": 3}'` for a rules number.

## Why regional stability exists

The **regional stability** bar at the top loses one segment each round. From round **10**, every sun heats at its dawn: +1, then +1 more each round after. This guarantees that games end. It works exactly as the old stability bar did; the name distinguishes it from each card's own stability (◷). AI games last about 11 rounds, so it often decides the end. [design review: the stability bar stays, as regional stability]

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

**Ending the day.** Enter ends your day; with plays still left (and a card that could go in), it asks first. [design review]

## Online 1v1 [design review]

Two players, each on their own device. From **Quickplay → play online**, one player creates a room and sends the five-letter code or the invite link; the other joins with it. The game starts as soon as both are in.
- **The server holds the game.** It runs on a Cloudflare Worker with one Durable Object per room, and runs the same engine as the client. Moves are checked there, so a client cannot cheat.
- **Hidden information is hidden in transit, not just on screen.** Each player receives only their view: their own hand and face-down Lightspeed card, the rival's card counts, neither deck's order, and no random seed. Hidden cards also get throwaway ids, since real ids would reveal deck-list positions.
- **On the table**, the rival's moves animate like an AI's: the card they played is shown at the middle right, and a card they set face down shows as a card back.
- **Connections:** a dropped connection reconnects to its seat by itself; reopening the invite link in the same browser also rejoins. A "reconnecting…" pill shows meanwhile.
- **Rematches** alternate who goes first. Rooms delete themselves after a day without play.
- **Code:** `server/room.ts` holds the room logic (tested in `tests/room.test.ts`), `server/worker.ts` the Worker and Durable Object, and `src/ui/online.ts` the client connection.

## Progression, collection and ranks [design review]

Outside a single game, each player has a **profile** (kept on their device): a level, two currencies and a card collection. Players **sign in** (a name and an emblem) before the hub; until there are accounts, that lives on the device too. Their chip sits top right on the hub and in the shop (emblem, name, level, both currencies); tapping it opens the whole profile (level and experience, currencies, rank and record), with **log out**, which returns to the title screen (the hub has no back button: you log out to leave it).
- **The hub** has five small tiles, titles only: campaign, quickplay, collection (the deck builder), shop and options.
- **The shop** has a boosters section: a foil pack for each race and a general one, each with its name and price beneath. Buying one rips it open: the tear strip comes off, the wrapper drops away and the five cards come out. The rules live in `src/engine/progression.ts` (all the numbers in its `PROGRESSION` table), the profile in `src/ui/profile.ts`.
- **Stardust ✦** buys booster packs (and cosmetics, once there are some). **Flux ⟁** crafts cards you don't own.
- **Experience** raises your level (100 for the first, 25 more for each after). Every level brings ✦50 and ⟁10.
- **Every game pays out**, and online pays far more:

| Game | Win | Loss |
| --- | --- | --- |
| Against the AI (quickplay or campaign battle) | ✦20 ⟁5, 40 xp | ✦8 ⟁2, 20 xp |
| Online, with a friend | ✦60 ⟁15, 100 xp | ✦25 ⟁6, 50 xp |
| Ranked (against an equal) | ✦120 ⟁30, 160 xp | ✦50 ⟁12, 80 xp |

  Hot-seat games pay nothing (both players share one profile). Conceding earns half the experience and no currency. The reward shows under the result on the board.

**The collection.** You start with the cards of the four starter decks (enough to play each). The deck builder greys out cards you don't own and lets a deck use only as many copies as you own.
- **The deck builder:** the deck is a column of pills, one per card, each in its card's colours (by rarity) with its picture, type and count; tap one to take a copy out. The card view has a search (name and text) and filters for race (any, this deck's race with neutrals, neutral only, or one race), type, rarity, collection (owned, not owned, or craftable now), characters, and cards already in the deck, sorted by race, name, type or rarity. The ⟁ tag under each card opens crafting. Each card's ⤢ button (or a right-click on any card, anywhere; a long press on touch) shows it large.
- **Card text always fits:** text too long for its card shrinks until it fits (down to half size), on every card everywhere: hands, the table, menus and zoomed views (`src/ui/fittext.ts`). Nothing is cut off.
- **Booster packs (✦100):** one for each race (only that race's cards) and a general one (every card of no race: neutral cards, Command, global and Lightspeed cards). Five cards: three White Dwarfs, a fourth that is Stellar 30% of the time, and a fifth that is Stellar, or an Anomaly 18% of the time. A copy beyond what a deck can use (2, or 1 for an Anomaly) comes as its breakdown value in flux instead.
- **Crafting:** ⟁40 for a White Dwarf, ⟁100 for a Stellar card, ⟁400 for an Anomaly. **Breaking down** returns half (⟁20, ⟁50, ⟁200). Starter cards can't be broken down; extra copies beyond the starter grant can.

**Ranks** (ranked online games only). Six tiers, named after rare matter found in space, lowest first: **Olivine, Cobalt, Iridium, Lonsdaleite, Neutronium, Strange Matter**. Each has three stages, I to III; each stage is 100 rank points. Everyone starts at Olivine I.
- **Matchmaking:** from play online → ranked → find a match. The ladder pairs you with the longest-waiting player at most **one tier** above or below you (an Iridium player can meet any stage of Cobalt, Iridium or Lonsdaleite). The two go to a room made for them: it admits only them, and is one game (no rematch).
- **Rank points:** a win is worth 25 against an equal, a loss costs 20. Each stage of difference changes that by 15%: beating a higher rank climbs further, beating a lower one less; losing to a higher rank costs less, losing to a lower one more. You never drop below Olivine I.
- **Currency and experience** follow the gap too: each stage your rival is above you adds 20% to a win (down to 40% of it against lower ranks). For a loss, each stage they're above you adds 30%; each stage below takes 30% away, and losing to a lower-ranked player at the very bottom of the ladder earns nothing.
- **The server keeps ranks.** A Ladder Durable Object (`server/ladder.ts`, wrapped in `server/worker.ts`) stores every ranked player's standing by profile id and runs the queue. The room reports the result, and the ladder works out both players' rank change and rewards and sends each their own.
- **Not yet:** profiles have no accounts, so a profile is tied to its browser, and currencies and the collection are kept on the device (only ranks are on the server). Cosmetics aren't in yet.

## The battle table

The whole play area is a table seen in perspective, like a tabletop simulator. A flat HUD sits above it:
- **Top left:** player pills, in a column: race emblem, name, cards in hand and deck, and ⚡ if a Lightspeed card is set. The active player glows green.
- **Top centre:** the round and regional stability.
- **Top right:** the global card, skip, the **log** button (the log opens as a popover under it) and the **settings** wheel.
- Tap either player's pill for the players sheet. Closable sheets (settings, log, players, cards) have no "view board" button: that only appears mid-move, while an upgrade or card choice waits for an answer (or hold Space). [design review]

On the table:
- **Suns, large, beside their tableaus.** Your rival's sun is left of their row, and yours is left of yours. Each shows:
  - its heat in the middle, out of max health;
  - a heat arc around it;
  - a blue shield ring around that, with the shield count on the ring.

  The sun burns from pale gold to amber to red as it nears supernova, frosts blue below 0, and pulses when within 4 of supernova. [design review]
- **Hits read clearly.** [design review]
  - A bolt flies from the attacker's sun to their rival's.
  - On landing, the numbers rise off the sun: a red "+3" for heat taken, a blue "−2" for cooling, and "⛨−2" for shields lost.
  - The sun flares and shakes; cooling frosts it; blocked heat flashes the shield ring.
  - When your own sun takes enemy heat, the edges of the screen burn red with a heavy low blow. Heat you deal lands with a bright crack, and shields that block ring with a glassy clang.
  - Numbers on a sun keep their old value until the bolt lands.
- **Dawn forecast, symbols centred between the tableaus.** They show what that player's next dawn will do, net of all their cards. Heat at their rival, shields, cooling, heat to their own sun, extra cards and extra plays, each as a symbol and number. The totals include resonance, Command cards' choices, growth, conditions, the global card, regional instability and the map, before shields or Lightspeed cards answer. Everyone can see what's coming and respond to it. [design review]
- **Removal is shown before it happens.** A glowing white arc draws from the removing card to each card it destroys, returns or erodes. The target glows under it while the arc holds, then a destroyed card dissolves in its slot and a returned card flies back to its owner's hand. [design review]
- The rotating white star lies on the right of the table.
- Your hand fans along the bottom, with your deck and discard piles either side.
- The upgrade rail sits on the left, and the "plays left" pips and End Turn on the right.

When a card needs a choice, you make it on the board and a short prompt appears at the top of the screen:
- which rival card a removal card destroys or returns
- which empty slot a card goes in (each shows its defence; the prompt reminds you the middle is safest)
- which of your cards Phase Shift returns, or Stasis Field restores

Small dialogs handle the other choices:
- Command Directive's upgrade
- what to recover from your discard pile

A face-down Lightspeed card lies in its owner's Lightspeed slot, right of their five, with no defence. You can tap yours to read it; a rival's shows only its back. When one springs, a "Lightspeed!" banner names it and the card is shown at the middle right for a few seconds, then fades. Press and hold any card to read it at the middle right of the screen. [design review]

**Dawn, effect by effect.** When a day starts, its effects play out one after the other, in the order they happen: regional instability (from the top of the screen, striking both suns together as the gauge throbs red), the table, then each card left to right. Each card lights up as it fires, and its effect flies from it to the sun it reaches: a flare of heat to the rival's sun (or its own, for a drawback), a cooling beam or a shield beam to its owner's. That sun's numbers change as it lands, with what changed floating over it. A card on its last turn fires, then fades once the replay is done. The AI waits for its dawn to finish before it plays.

**Reading the rival's cards.** Each card a rival plays (or sets face down) flies in from their side of the board (with a sound) and waits at the middle right with an "OK" button (or press Enter). With **auto-confirm** on (settings), it waits 2 seconds and lands by itself. Its effects only happen once you press it (then the card lands and its heat, cooling and so on play out), and the rival goes on after that, so there is time to read every card. Against the AI, it waits for you. Online, the room holds the player who played the card ("<rival> is reading your card…") until their rival confirms, unless the rival disconnects. Hot-seat games skip this, since both players share the screen. [design review] A removal card on the stage draws a held arc to the card it will destroy, return or erode, until you press OK.

**Placing a card.** Every card that stays in play waits for you to click the slot it goes in, even when only one slot is open, so a misclick never plays a card. Cards that fade at dawn leave one at a time, like the opening hand being dealt in reverse. Each player's hand size shows in a small bar beside their piles (above yours, below theirs).

## Campaign mode

Universe domination on a map of 48 linked solar systems, played with the card game. Code: `src/engine/campaign.ts` (rules) and `src/ui/campaign.ts` (screen).

**Setup.** Choose your race and 1–3 rivals. The rivals are the other races. Your deck starts mostly neutral: 8 neutral pairs, 2 cards of your race and 2 Command Directives.

**The map.**
- 48 systems in loose clusters, linked by routes that never cross, on a tilted 3D plane that you can pan and zoom.
- The map is wide (3500 × 2250) so systems sit well apart. Stars are small, sharp points with only a tight glow, so the map stays readable.
- Tap the turn box (top left) to open the **overview**: every faction's systems held, their share of the map, and the win condition. The map fills the screen: a system's details float in a panel only while it is selected, missions and the log sit behind their buttons, and the settings wheel opens sound, music, AI speed and the way back to the main menu. Entering the campaign flashes a "campaign" banner. [design review]
- Factions start in the corners. Neutral systems are held by sentinels, which get stronger towards the middle of the map.
- Outer sentinels start their battles with hotter suns (+5 heat at tier 1, +2 at tier 2), so early expansion is easier. [proposed]

**Turns, attacks, conquest, missions and winning** work as before:
- One attack per turn, on a system linked to yours. The battle is a 1v1 game: you attack from your system, the defender holds theirs.
- After a win, choose Settle, Absorb or Supernova.
- Damage carries between battles.
- **Fog of war:** you see only your systems and the systems linked to them. About one system in six has a **scanner array**; hold it and you see two links out from it. Routes into unseen space fade out, and anomalies appear once their reach touches a system in view. [design review]
- **Base:** one button opens your deck, the armory and your missions as tabs. The armory restocks every day and whenever you conquer a system. [design review]
- **Fusion (armory):** merge two reserve cards into one that does both, for materials (4 plus both cards' armory prices by rarity). It cannot be undone. The fused card takes the first card's kind, the higher rarity and both texts, and its name joins the two (Coronal Lance + Cryo Vault → Coronal Vault). Command, global and Lightspeed cards can't be fused, a fused card can't be fused again, and two cards that ask for the same kind of choice when played (two removals, say) can't be fused together. Its picture is both cards' pictures split along a glowing seam. [design review]
- **The board:** the systems sit on a board like the battle board: a rounded, translucent slab with a dotted grid, a bright rim and a front edge, the galaxy showing through it. A controlled system's star burns in its faction's colour. [design review]
- **The map's sky** is the heart of the Milky Way, high-key: a faint off-white sky, a lighter band across most of the page with a white core, crisp dust lanes of a slightly deeper off-white (a main rift down its spine and finer filaments), and tiny white stars. Every tone is within a few percent of white. It is painted pixel by pixel (scripts/paint-sky.ts, shipped as src/assets/campaign-sky.webp) and multiplied onto the board. It is a parallax layer: it slides with the systems as you pan, more slowly, and never scales. [design review]
- The campaign lasts 60 turns. You win at 50% of the systems or by eliminating every rival.

**Economy.**
- **Credits** repair damage (1 per point) and **fortify** a system (4, then 8, then 12). Each fortification level gives that system's defender +4 max health.
- **Materials** buy cards in the armory by rarity: 3 for a White Dwarf, 5 for a Stellar, 8 for an Anomaly, +1 for a race card. The armory and mission rewards offer mostly your own race's cards, and Anomalies least often. The fine-tuned Command cards are on offer too, to swap for a standard Command Directive.

**The deck.** Your campaign deck is always a legal 20-card deck. Cards you win or buy wait in your **reserve**. You swap a reserve card in for a deck card, as long as the deck stays legal.

**Garrisons.** Send up to 3 reserve cards to a system you control. They take a day to arrive and a day to return. When the system is attacked, stationed cards **start the battle already in the defender's tableau** (a Command card with its first choice), and a stationed Lightspeed card starts the battle set face down (only one). If the system falls, the conqueror takes them. [design review: garrisoned cards defend a system]

**Anomalies** now give battle modifiers:

| Anomaly | Boon | Cost |
| --- | --- | --- |
| Black Hole | +5 max health | Opening hand 1 card smaller |
| Nebula | +1 shield every day | Sun starts 3 hotter |
| Dark Matter Cluster | Draw 1 extra card every day | Sun heats by 1 every day |
| Pulsar | Sun cools by 1 every day | 4 less max health |

**Balance notes (simulator).**
- With the AI running every faction, campaigns average about 56 turns.
- Race and starting corner matter too much: in 12 all-AI campaigns, Xel'Naru won 8 and Aureline none. This needs tuning next.

## Open design questions

1. **Numbers:** max health 24, 5 slots, slot defence 1-2-3-2-1, stability 3 (1 for one-time cards), a cap of 2 plays and 1 draw a day are all first guesses. Human playtesting should drive them.
2. **Removal:** Ion Cannon is the only way to destroy a card, and it swings match-ups hard. Should there be more removal, or none?
3. **Abyssal Tide** is the weakest starter (about 39%). It needs a stronger finisher or cheaper protection.
4. **Collection:** decks are built from the full pool. A collection to unlock would suit a CCG, but was left for later.
5. **Campaign balance:** some races and corners win far more often in AI-only campaigns.

**Supernova.** A sun keeps its colour until the blow that finishes it lands. Then it explodes: a white-hot flash, three shockwave rings and flung sparks, and the board shudders. Only then do the sun and its half of the board grey out. [design review]

**Dawn and Dusk.** "Dawn" greets the start of your day and "Dusk" its end, each with the round beneath. [design review]

**Game log.** Each line shows the art of the card it is about, or an icon for what happened (heat, cooling, shields, removal, orbit). Card and player names are picked out in colour: you in blue, your rival in red. A chip on the right shows the outcome with an arrow ("→ 14" heat, "→ hand", "→ discard", "→ tableau"). Rows are taller and divided by hairlines, and each new day starts with a header row. [design review]

**The second set (100 cards).** The pool doubles to 201 cards for deck building (`src/engine/cards-expansion.ts`). The starter decks are unchanged and use only the first set. The new cards come from boosters and crafting like the rest. They use only existing mechanics, in new mixes: 25 neutral (a Command pair, War Council and Logistics Command, plus lightspeed traps and cheap removal) and 19 per race. Aureline get stacking lancers, Command payoffs and The Sun Throne, an Anomaly that gives every attack card +1 heat. Xel'Naru get pierce and overheat payoffs. Vorthane get shield scaling, sting and soothe. Ixquor get growth counters, card-count payoffs and extra plays. `npm run simulate:pool` plays AI games between random decks from the whole pool and lists each card's win rate. In 600 games there were no errors, and the spread mostly followed race (random decks favour Aureline). Void Bolt, Overcharge and Refraction Veil were buffed after the first run. [design review]

**Starter decks in the builder.** Tap a deck to open it. A starter opens in the editor like your own decks. Change anything and it saves as a new copy ("Solar Lancers copy"). The starter itself never changes. [design review]

**Extreme decks, and the day's heat limit.** Playtesting a pure-attack Aureline deck (Ignition Protocols, Lancers, Archons, Aurelia, Focusing Array, Chorus, Batteries, Siege Arrays, War-Heralds, Sunforges, Dawnblades) showed it beating every starter deck 99% of the time, in under 9 rounds. Three Aureline dawn cards together dealt about 10 heat at a single dawn by round 3, and 14 by round 4. The new `npm run duel` (two deck lists, head to head) and per-card swaps showed:
- Taking out any one card, or any one synergy group, changed nothing (97–99%). The deck was built from many cards that each scale with the others.
- Toning down the "per attack card" cards on their own still left it at 95% against the starters. So did a higher max health (30), attack cards fading sooner, a self-heat strain for many attack cards, and an AI that counts the heat coming at its next dawn.
- A dedicated wall deck (Chamber Protocols, Stinging Veils, Null Fields, Ion Cannons) did beat it (74% before the changes, 94% after). The counter existed, but the starters couldn't reach it in time.
- What worked was a **day's heat limit**: on a player's own day (their dawn and their plays), at most **8** heat lands on the rival's sun, after shields. Stings and Lightspeed cards on the rival's day are not limited. With the card changes below, the pure-attack deck wins 57% against the starters (it was 99%). It still beats Hive Bloom, loses to Shard Overload, and loses to shields and stings (5/95 against the wall deck). The wall deck is 46% against the starters. The starters themselves sit at 46–53% (500 games), with seats 50/50. The forecast shows at most 8, with the full figure in its tooltip, and the log says when a sun can take no more heat that day.
- Alongside the limit: Focusing Array is now Forge 1 (attack cards next to it +1, not every attack card), Aurelia +1 per 2 attack cards (up to 3), Chorus of Dawn up to 3, Solar Battery +1 with 3+ attack cards, and Siege Array +1 per 3 attack cards (up to 2). Shard Reactor no longer heats its own sun: the limit took the edge off the Xel'Naru burst plan, and Shard Overload fell to 38% without this.

**Card costs.** Each card takes 1 of your day's actions. Anomalies take 2, as do Sunspear (6, pierce) and Fracture Burst (7, pierce), and each is buffed to match. Your first day has only 1 action, so these come out from day 2. The AI weighs the second card it gives up. With costs, the starters sit at 47–53% (400 games), with seats 50/50, and the pure-attack deck is at 50.5% against them.

**Are the starters weak for keeping to one race?** `npm run deck-search` builds random legal decks and plays each against all four starters (16 games each). Random cross-race decks average 44% against the starters, and random single-race decks 46%. So the starters beat an average random deck either way. The best random decks reach 88–100%, and the very best leaned on neutral cards with a mix of races. Mixing races may help, but 16 games a deck is too few to be sure.

**Energy (replaces plays and actions).** Cards cost energy, shown by the gem on each card: green for 1–2, gold for 3, red for 4, grey for 0. You get 1 energy on your first day, 2 on your second, then 3 a day. The industrial planet gives +1 energy (it used to give +1 play), and energy cards add more on top, with no ceiling. "Play N extra cards today" now reads "+N energy today". Costs live in `src/engine/costs.ts`:
- **How they were set:** each card was rated on its raw output (heat, cooling, shields, draw, removal, dawn effects over its stability, passives), then priced: weaker cards 1, stronger ones 2, bombs 3, Commands 2. Relay Station is free.
- **Four 4-cost bombs, which need bonus energy to play:** Fracture Burst (8, pierce), The Sun Throne (draws 2), Harmonic Singularity (Resonance 3/2) and The Brood Queen (heats 2 every dawn).
- **After simulating:** Hive Bloom won 83% at first. Its cheap engine was underpriced, so Rot Bloom, Compost Cycle, Hive Rooting and Spore Husk went to 2, and Hive Relay (+1 energy every day) to 3.
- **Result (AI games):** starters 46–57% (400 games), seats 52/48, games 14 rounds. The expensive synergy-attack deck wins 31% against the starters, a cheap all-attack deck 67%, and the shield/sting wall deck 14% (its key cards now cost 2–3). Curve matters: a deck of bombs can't play them fast enough.

**Command cards: heat, cool or energy.** The draw option was never picked in simulation (0 times a game), so it became **+1 energy** at each dawn. Dawn energy is banked and added once the day's energy is set. The AI values it at an energy's worth, scaled down when it holds fewer than 4 cards to spend it on. In 400 games it picks heat 0.8 times a game, cool 2.9 and energy 1.3. Starters sit at 44–57%, seats 50/50.

**Defence that answers at once.** Walls fell to 14% once energy came in, because their persistent cards cost 2–3 and took days to pay off. Eight new defence cards protect as they land, and keep going:
- Frost Bulwark (2): Cool 2, Shield 2.
- Dawn Rampart (2, Aureline): Shield 2, Cool 1, then Shield 1 each dawn.
- Glacier Shell (3): Shield 3, then Cool 2 each dawn.
- Prism Sanctum (3, Xel'Naru): Cool 4, then cooling each dawn, more while overheated.
- Chitin Fortress (3, Ixquor): Sturdy, Shield 3, then cooling each dawn.
- Stellar Aegis (4): Shield 10, Cool 3, near-unkillable for a day under the 8-heat limit.
- Solar Bastion (4): Shield 6, Cool 2, then Shield 2 and Cool 1 each dawn.
- Leviathan Shell (4, Vorthane): Shield 6 that never fade, then Shield 2 each dawn.

A wall deck built with them wins 50% against the starters and 86% against the cheap all-attack deck (67% against the starters), so aggro has a counter again.

**Supernova flicker.** The explosion's pulse animated `transform: scale(...)` on the sun's holder. That wiped out the `translateY(-50%)` centring it, so the sun dropped half its height for the length of the burst. It now animates `scale` on its own, which adds to the transform instead of replacing it.

**No strictly worse cards.** `npm run dominated` lists every card another card beats outright: no higher cost, every effect at least as strong, no extra drawback, and able to go in the same decks. An unconditional effect counts as covering the same effect with a condition. It found 15 pairs, then 6 more once conditions were counted. Each was fixed by giving the weaker card an edge of its own, not by nerfing the stronger one:
- Focusing Array is Forge 2.
- Coolant Array is free.
- Plasma Relay is Sturdy 1.
- Chorus of Dawn hits up to 5.
- Fracture Seer draws 3.
- Scatter Shot heats 2.
- Survey Probe adds Shield 1.
- The Shardlancer heats 3, pierce.
- Shatter Point destroys at defence 3.
- Crystal Matrix is Resonance 2.
- Hive-Warrior and Searing Core cost 1.
- Fault Line erodes 2.
- The Cantor cools 2 with 3+ attack cards.
- The Tidecaller adds +2 shields with 3+ defence cards.

The check now reports none.

**Energy dumps (X).** Seven cards spend all the energy you have left (at least 1, shown by a purple X gem). Their effects grow with each energy spent:
- Solar Torrent: Heat 1, plus 2 per energy.
- Deep Freeze: Cool 1, plus Cool 2 and Shield 1 per energy.
- Overflow Archive: Draw 1 per energy.
- Radiant Barrage (Aureline): Heat 2 and Shield 1 per energy.
- Meltdown (Xel'Naru): Heat 3 per energy, pierce, plus Heat 2 to your sun.
- Abyssal Rampart (Vorthane): Shield 3 per energy.
- Hive Surge (Ixquor): Draw 1 and Cool 1 per energy.

**Energy pips.** The pips show the day's whole energy, with spent ones left empty, so bonus energy no longer disappears once you play a card. Energy beyond the day's usual amount (from the industrial planet or energy cards) is amber: it is only for today, and it is spent first.
