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
- Cooling can take a sun down to **−10**. [direction: the deep cold is Absolute Zero's whole point; a balance pass had cut it to −5, then −3]

## Decks

- A deck is **30 to 40 cards**, with **at most 2 copies** of any card and **one Hero per 10 cards** (3 in a 30-card deck, 4 in 40), so a deck runs at least two different Heroes. The starter decks are 30. [design review: 30–40 cards so a deck has room for a balanced curve and its big cards; proposed: 2 copies]
- Players build decks in the **deck builder** (Quickplay → deck builder) from the whole card pool, or pick one of the **ten starter decks**: four race decks (Solar Lancers, Shard Overload, Abyssal Tide, Hive Bloom: also the campaign's) and six mixed-race decks, each built round one mechanic:
  - **Orbit Riders:** attunement. Attuned cards take their bonus from where the Orbit stands; steer yours onto the industrial planet, knock your rival's off.
  - **Ambush:** Lightspeed. A trap face down against attack cards, Guards that spring from the Lightspeed slot, forged Aureline attack cards behind them.
  - **Demolition:** removal. Destroy, eject, erode and decay the rival's tableau.
  - **Absolute Zero:** Thermosiphon. Run your sun far below zero; the colder it is, the harder its cards hit and shield.
  - **Graftworks:** Fusion. Sturdy hosts loaded with grafts, so the hand never jams for want of a slot.
  - **Overcharge:** Spend All. Build a big day of energy, then spend it all at once. The builder shows real cards, always the same shape and size as on the table. The AI plays the starters. [design review]
- Each deck carries a race emblem. Cards can be mixed freely across races. [proposed]

## Attunement

An attuned card gains, at each of its owner's dawns, the bonus of where their Orbit stands: nine positions, three facing each planet, one a day (orbit cards move it on or back). Each planet has its own kind of bonus, growing as the planet comes fully round (`src/engine/attunement.ts`):

| Orbit | Planet | Bonus |
|---|---|---|
| 0 | dead | Shields 1 |
| 1 | dead | Shields 1, Cool 1 |
| 2 | dead | Shields 2, Cool 1 |
| 3 | abundant | Cool 1 |
| 4 | abundant | Draw 1 |
| 5 | abundant | Draw 1, Cool 1 |
| 6 | industrial | Heat 1 |
| 7 | industrial | Heat 1 |
| 8 | industrial | Heat 2, Shields 1 |

**Attunement ×2** doubles every number. With its planets eaten (Orion), a sun counts as at the same step of the dead planet. The attuned cards: Orrery (just attunement), Ecliptic Lance (Heat 2), Solstice Choir (Aureline: your Orbit +1), Precession Engine (Xel'Naru: attunement ×2), Moon Warden (Vorthane: Guard, Sturdy 1), Seasonal Bloom (Ixquor: Plant 1), and the Grand Orrery (Anomaly: your Orbit +3, attunement ×2). Steering is the skill: Orbital Slingshots, Gravity Assists and the Solstice Choir bring the industrial planet round; Gravity Wells and Tidal Brakes knock a rival's off theirs.

## Turns

1. **Dawn.** In this order:
   - Your shields fade (unless Deep Current holds them).
   - Draw **1 card**. Your opening hand of 5 covers your first day.
   - At the first dawn of each round, once regional stability has run out, regional instability heats **every sun at once** by the same amount, past shields. If that finishes every sun, they all go supernova together: a draw. In the campaign a draw is no loss (the attack is simply repelled); any loss there ends the run.
   - The global card applies, if there is one.
   - Your tableau's **dawn effects** trigger, left to right.
   - Cards don't lose anything with the days: they stand until beaten down or removed. (Anchor mends its neighbours 1 now.)
2. **Play cards** with your **energy**: 1 on your first day, then 2, 3, 4, and **5 a day** from your fifth day. The industrial planet, Hero abilities and cards like Hive Relay add more on top, with no ceiling. [direction: the cap went from 4 to 5, so bigger cards can be made]
3. **End day.** Unplayed cards stay in your hand. [proposed]

**Second seat head start** [proposed]: the second player starts with 1 extra card (with 4 energy and 30-card decks the first seat won 55–58% without it; with it, seats are about 48/52). The old head start (2 cooler, 1 extra card, 1 extra play) let the second seat win 68%; a sun 1 cooler was still worth too much with the current decks. With 1 extra card, seats are 46/54.

**The discard pile** takes every card that leaves play: cards that fade, and cards destroyed or cancelled (cards returned or recalled go to hand). Recovery cards draw from it. **An empty deck** is refilled by shuffling the discard pile into a new deck. Each reshuffle heats your sun by 2 (unblockable). Only with both deck and discard pile empty does each card you should have drawn heat your sun by 2 instead. [design review: cards are discarded for reuse; proposed: 2 heat]

## The tableau

**Units and surges.** Every card that stays in play is a **unit**, one kind for all (Relics apart; Heroes, Lightspeed and global cards keep their own). A card that resolves as it is played and goes to the discard pile is a **surge**. There are no attack or defence cards any more: a unit attacks if it has 1+ attack, and one with none can gain some (growth, gear). Words that named the old kinds now say what they mean: an **armed card** is a card with 1+ attack, a **Sturdy card** one with Sturdy; a Lightspeed card that answered "an attack card" springs on an armed card or a heat surge, and one that answered "a support card" on a surge.

- Played cards **stay in play** in your tableau, which has **5 slots**. [design review: 5 slots]
- **You choose the slot.** With every slot full, a new card **replaces** one of yours (you pick it; it leaves play) and takes its slot; a recall card can instead take the place of the card it recalls. [direction: cards no longer fade, so a full tableau must never lock] (Was: no replacing, until a card faded.)
- **Defence** comes from the slot: **1, 2, 3, 2, 1** from left to right. The middle is the safest place for the card you most want to keep. [design review]
  - Sturdy cards add their own defence (Bellwarden and Hero of Rathune +1, Aegis Monolith +2). (They used to mend that much more worn defence each dawn too: a guard with Sturdy grafts fused onto it mended 5 a day and could not be worn down, so Sturdy is now defence only.)
  - Repair cards mend worn defence on your side, the most worn cards first: Bulwark Plating, Tide Pylon and Hero of Rathune 1 at each dawn, Aegis Monolith 2.
  - Bulwarks guard their neighbours: Bulwark Plating gives +1 to the cards either side. Aegis Monolith (Anomaly) gives +2 either side and +1 two slots away.
  - Removal can only reach cards with low enough defence:
    - Ion Cannon: 2 or less.
    - Tractor Beam and Command Breaker: 3 or less.
    - Event Horizon (Anomaly): any.
- **Stability** is what a card in play can take: attacks, stings, aimed heat past its defence, and Erode wear it down, and at 0 the card burns away into your discard pile (its leave effects fire). [direction: no more fading; stability, the old name, is now what health was, as it always was on Heroes]
  - **By cost:** 1 + its energy cost, +1 for a defence card, from 2 to 8; then its race's trait (Aureline and Korrath none, Xel'Naru and Seren −1, Nyxari −2, Ixquor +1; at least 1). A Fusion card in a slot of its own is a plain card, a point of stability lighter than a plain card of its cost. A Hero's is the stability it is listed with.
  - **Cards never fade.** A full tableau isn't stuck: a new card **replaces** one of yours (you pick it; it leaves play, leave effects and all) and takes its slot. The AI only replaces for a clear gain.
  - **Mending it:** Restore / Renew (Stasis Field, Shard Renewal, Hive Rooting...) and Anchor (its neighbours regain 1 at your dawn), never past a card's full stability (its printed value, or more with gear).
  - **Wearing it:** Erode / Decay (Entropy Pulse, Decay Wave...) take stability whatever the defence; a Hero stands up to them. Relics are Brittle: nothing mends them.
  - **The clock:** with nothing fading, regional instability (every sun heats at its dawn, more each round) now starts at round 8 so games can't stall behind walls of cooling.
- Every card that stays in play shows its attack (a garnet, bottom left) and stability (a topaz, bottom right) in your hand, zoomed and in the deck builder too; in play, the live values (stability turns ruby at 1), and its defence as a silver shield standing on its foot (reddened while worn).
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
| Orbital Slingshot | Support | Your orbit +3 (the next planet swings round). Draw 1 card. |
| Tidal Brake | Defence | Gain 2 shields. Your rival's orbit −2. |
| Dead World Mine | Support | Dawn: cool your sun by 1. While your dead planet faces your sun, also draw 1 card. |
| Perihelion Forge (Stellar) | Attack | Dawn: heat your rival by 1, or by 3 while your industrial planet faces your sun. |
| Sunward Lance (Aureline) | Attack | Heat your rival by 1, or by 3 while your industrial planet faces your sun. Your orbit +1. |
| Comet Shard (Xel'Naru) | Attack | Heat your rival by 3. Your rival's orbit −1. Heat your own sun by 1. |
| Tide Lock (Vorthane) | Defence | Dawn: gain 1 shield, or 3 while your abundant planet faces your sun. |
| Orbit Root (Ixquor, Stellar) | Support | Dawn: gain 1 shield. While your dead planet faces your sun, your orbit +2 (it moves on in a day, not three). |

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

- **Passive heat at dawn, cooling at dusk; one-off heat is aimed.** (Plain dawn heat is now attack: see Dawn heat became attack.) A card's remaining dawn heat (scaling or conditional) always strikes the rival's sun, past their shields: there is nothing to aim at dawn. Heat a card deals as it is played, or a Hero's ability deals, is aimed as it is used: at the rival's sun or one rival card (Guards first). Passive cooling comes at **dusk**, as your day ends, so it lands before your rival's day rather than after it. (A Hero's dawn choice, and attunement's orbit bonus, still resolve at dawn.) Heat from other triggers (a card leaving, recovering) strikes the sun. [design review: aiming every dawn's heat was a chore; the passive pressure goes on the sun, the choices are in what you play and attack]
- **The sun's ward.** [direction: encourage board play; a sun shield that replenishes] Every sun soaks the first **3** rival heat each day (`sunWard`), before its shields, and the ward is whole again at its owner's dawn: a glowing ring of three segments round the sun, each going dark as it soaks a point. It is not shields: nothing counts it (Riptide, Abyssal Choir, Broadside, Crush), shield cards keep their worth, Tidewall and Stinging Veil are untouched. **Pierce** goes past it (breaking defences is pierce's job), as do regional instability and a sun's own heat (Overheat). Chip attacks at the sun now do nothing: a strong enough board breaks through, otherwise the cards in the way get fought. The AI counts it in the heat it expects to land. AI games run longer: Core 7.7 → 9.5 rounds, Lost Races about 10 (the round-8 clock still ends them).
- **Walls guard.** [direction: force card attacks, and attacks on Heroes] Any card with **3 or more defence** (its slot's, Sturdy, Bulwark) is a **Guard** while that defence holds: a Sturdy 1 card in a 2-defence slot, anything in the middle slot (3), and every Hero (its slot is ⛨3). Wear it below 3 and it stops guarding. Cards with Guard of their own guard whatever their defence.
- **Defence never mends by itself** (`defenceMend` 0): it is a one-shot wall, worn down over the game, and only **Repair** builds it back. Wear on a slot stays in the slot.
- **Growth hits harder:** each point a card has grown adds 1 to its attack, even a card with no attack of its own (`growthAttack`, `growthAttackAll`). "Your other cards grow 1" (Broodmother Ul'Kha, Brood Warden, Catalyst...) grows every other card of yours but a Hero, whether it has a Grow of its own or not, up to `maxGrowth` 5 (a card's own Grow still stops at its own limit). [direction: it used to reach only cards with a dawn Grow, so it often did nothing] The attack shows on the card's garnet as it grows; the growth counter sits on the picture's top right.
- **Defence takes the blow first, and the wear lasts.** An attack or aimed heat on a card hits its defence (its slot's, plus Sturdy and Bulwark) point for point; what gets past wears its stability. The wear stays: each card mends only **1 a day** (at its owner's dawn), plus any Repair. Wear on the slot's own defence stays in the slot when the card leaves, so the next card there starts worn too (an empty slot mends 1 a day as well; the card's own plating, Sturdy and Bulwark, goes with it). So chip damage adds up: a single small attack is never wasted, and worn cards fall within reach of removal. [design review: replaces defence that was whole again every day, which made walls spring back and left many days with nothing worth doing]
- Heat on a card wears its **stability** point for point; at 0 the card burns away (its leave effects fire, so killing a Martyr or a card beside Kyr'Vessa has a price, and the AI weighs it).
- **Guard** cards draw attacks and aimed heat: while a rival has any, those can only target one of them (not the sun, nor the cards behind). Dawn heat goes past Guards to the sun.
- **Shields guard the sun.** They absorb your rival's heat point for point (so stings and soothes answer heat at your sun). **Tidewall** (rare and dear: the Vorthanian Bellwarden at 5 energy, the Tide Pearl relic at 4) spreads them over your cards too, against heat aimed at them (not attacks, stings or pierce heat, which all get through), while the Tidewall card is in play: answered by taking that card down, attacking, or pierce. [direction: Tidewall guards against heat only] They fade at your dawn. Heat you deal to your own sun (drawbacks, fatigue, instability) ignores shields.

## Attack and Dimmed [design review]

Control over what a card does each day, alongside the dawn effects that happen by themselves.

- **Attack** (bottom left of a card, beside its stability at the bottom right). Once on each of its controller's days, a card with attack above 0 can attack the rival's sun or one rival card (Guards first). At a sun the attack lands as heat, past shields; on a card it meets defence first, then wears its stability, and the card hits back with its own attack and Sting. Click the card, then its target.
- **Hitting back.** A card attacked hits the attacker's stability with its own attack plus its **Sting** (straight to stability, past defence). Sting is how a card with no attack fights back (Stinging Veil: Guard, Sting 3). Sting no longer fires off shields.
- **Dimmed.** A card that acts (attacks, or a Hero that uses an ability) is dimmed until its controller's next dawn. New cards enter dimmed, so nothing attacks or uses an ability on the day it lands. Dawn effects do not dim and still happen every dawn.
- **Who has attack.** Attack cards that stay in play: attack = cost − plain dawn heat, between 1 and 3 (so a card with dawn heat 2 never also has attack 2). A few are set by hand (Ignition Protocol 2, Empress Solenne 3, Leviathan Thoross 2). Defence, cooling and shield cards have none and rely on Sting, Guard and defence.
- **One-shot cards go straight to the discard pile.** A card with nothing left to do after it is played (no dawn effect, passive, leave effect, attack or attunement) resolves and goes to the discard pile, instead of sitting in a slot at stability 1.
- First 600-game sim with attacks (AI attacks about 10 times a game): mean distance from 50% 7.9. Lancers 47.5, Shard Overload 63.1, Tide 54.3, Hive 54.7, Orbit Riders 53.0, Ambush 51.8, Demolition 57.3, Absolute Zero 38.3, Graftworks 29.6, Overcharge 39.4.
- Next: activated abilities on ordinary cards (they will dim too).

## Dawn, day and dusk [design review]

Every player's turn runs in three parts, each announced with a banner ("dawn", "day", "dusk" for your own; "<name>'s dawn" and so on for a rival's): a phase's effects play out only once its banner has gone, the next banner comes when they are done, and the AI makes its first move only once the day's banner has gone. [direction: actions at dusk/dawn wait for the banner; the AI too]
- **Dawn**: your cards un-dim, dawn effects resolve (dawn heat strikes the rival's sun), Anchor mends, you get the day's energy.
- **Day**: you play cards, attack, and use your Hero.
- **Dusk**: as you end your day, your cards' **dusk** effects resolve, left to right, once you have acted (all passive cooling comes now). A card **played today** rests instead (unless it has Darkspeed): its dusk first works at the dusk after the day it lands, as a dawn card first works at the next dawn. Attacking or acting does not stop a card's dusk (it used to, which left Nightfall, a 1-stability Darkspeed attacker, with a dusk that could never fire once it attacked). Its effects replay on the board just before the next player's dawn.
- **Hand limit**: after your dusk you may hold at most 5 cards (`maxHand`); you pick the cards over that to discard (any you don't pick, the costliest go, a Hero kept while none leads your tableau). Drawing past 5 is wasted unless the cards are played, so draw is worth less to a deck that can't spend it.

Dusk is the opposite of dawn: it comes after your choices, so it can reward them. Some dusk cards count your cards that **held back** (not dimmed today), a reason to keep an attacker home (Gloaming Battery, Vesper Bell). Dusk heat counts against a card's attack exactly as dawn heat does. There are twelve dusk cards (cards-dusk.ts): four neutral (Twilight Sentry, Evening Star, Gloaming Battery, Vesper Bell) and one per race (Vesper Knight, Twilight Shard, Ebb Tide, Night Bloom, Nightfall, Banked Forge, Evening Vigil, Banked Embers). Wildfire runs Banked Embers.

**Dawn heat became attack.** [direction: dawn/dusk heat was about half of all damage, unblockable and uninteractive] A card's plain dawn heat at the rival (no condition, no scaling) is now that much more **attack** (dawn-attack.ts): it strikes a card or the sun by its owner's choice each day, Guards drawing it, rather than heating the sun by itself. What scales or depends on something stays a dawn effect (Riptide's heat per 3 shields, Overload Core's while overheated). A converted card keeps the short term its dawn heat had (`stabilityDawnHeat`). Cards left beaten outright by another at their cost got +1 attack (Helio Lancer +2, Overload Core, Skirmisher, Stargazer, Sunforge, Dawnstar Cannon, Ash-Walker; Cinder Brute and Solar Tyrant +2; Overcharge gives 2 energy), Riptide and Abyssal Choir +1 (Deep Tide fell to 25% without it), Archon and Aurelia −1 (Forge stacks on attack, so the Aureline deck ran hot).

**Vigil.** [direction: with dawn heat gone, dawn/day/dusk needed their own jobs: dawn is the engine, day the choices, dusk rewards restraint] `{vigil}: …` is a dusk effect that fires only if the card **held back** today (didn't attack or act, so isn't dimmed): every Vigil card is an attacker, so each day asks "strike now, or keep it home for its dusk?". It's a fundamental (legal in Core). Eight cards, two per core race, in cards-dusk.ts: Dusk Watchkeeper (cool 3) and Sunset Lancer (heat 3); Banked Star (heat 2, heats your own sun at dawn) and Still Flame (draw 1, heat 1 to your sun); Tide Watcher (shield 3) and Deepwatch (heat 1 per 2 shields, up to 4); Waiting Brood (grows, then heat equal to its growth) and Brood Warden (your other growing cards grow). Each Core starter runs three. The AI charges an attack with a Vigil card what its Vigil would have done tonight. A dusk with nothing to do (a Vigil card that attacked) shows no banner.

## Heroes

Heroes **lead the tableau**. Each player has **one Hero slot**, out in front of their five tableau slots (top right of your tableau; your rival's is bottom left, the board being a mirror), so only one Hero is in play at a time: **a new one replaces the old** (which goes to the discard pile). It takes no tableau slot, has no neighbours, and its slot has defence 3. On the board it lies landscape, and a line round each tableau bumps out round it. [design review]

- **They lead for good.** A Hero never fades: it stays until it is removed (Command Breaker, removal that reaches its defence), sent back (Tractor Beam, Event Horizon), beaten down by heat (its stability is its health: heat past its defence wears it down. It is 8, 9 for the Admiralty and 12 for the bombs, and some Heroes mend their own) or replaced by your next Hero. Mending can take a card past the usual cap of 6, up to its own full stability. [direction: heroes as planeswalkers]
- **Abilities, chosen each day.** Every Hero has two abilities. Once on each of your days, while it leads, you may use one. Most are **free**; the strongest cost something, and not only energy: **−1 stability** (from the Hero itself, never its last), **sacrifice a card** (you choose which of your other cards in play goes to your discard pile: the board asks "sacrifice a card" and lights them up, then the ability is aimed, if it heats; the AI gives up its weakest), or **heat on your own sun** (never enough to send it supernova). The cost reads before the ability on the card ("Sacrifice a card: Heat 3"). The same costs (types.ts ActionCost) are meant for any action, not only Heroes'. They show as buttons above End Day, and on the card as coloured names (`{act:Name}`; the keyword **Act** explains them).
- **A way of leading of its own.** On top of its abilities, most Heroes change your board: a lasting buff (often to their own race's cards: "your Aureline attack cards heat +1", "your Vorthane cards shield +1"; the `kindBonus` passive now takes a race and heat, cooling or shields), a dawn effect, or both.
- **Never back to your own hand.** Heroes can't be recalled or recovered from the discard pile. A rival can still send one back to its owner's hand.

| Hero | Race | Leads with | Abilities (one a day) |
| --- | --- | --- | --- |
| Solarch Veyra | Aureline | Your Aureline attack cards heat +1 | Rally: 2 shields · Counsel: draw 1 |
| Sol-Marshal Aurex | Aureline | Dawn: heat 1 | Strafe (1⚡): heat 3 · Overdrive: +1 energy |
| Empress Solenne (bomb) | Aureline | As it enters: heat 4, pierce. **Chosen**: +2 attack to one of your cards (while it stays in play) | Judgement (1⚡): heat 3, pierce · Benediction: renew 1 |

*Empress Solenne's "your attack cards heat +1" made any deck of cheap attackers far too strong (a community Darkspeed deck: 83% against Abyssal Tide, 60% across the starters). Chosen +2 brings it to 60% and 50%.* [direction: replace it with Chosen +2 attack]
| Hierarch Vael | Xel'Naru | Your Xel'Naru cards cool +1 | Vent: cool 2 · Insight: draw 1 |
| Archon Seris | Xel'Naru | When another of your cards leaves play, heat 1 | Archive (1⚡): recover your last discarded card · Shatter (1⚡): heat 2, pierce |
| The Shardmind (bomb) | Xel'Naru | As it enters: cool 4, recover. Your Xel'Naru cards heat +1 | Cold Reckoning (1⚡): cool 3 · Overload: draw 2, heat 2 to your sun |
| Tide-Regent Osshara | Vorthane | Dawn: 2 shields | Swell: 4 shields, it regains 1 stability · Current: draw 1 |
| The Admiralty (Anomaly) | Vorthane | Your Vorthane cards shield +1. Dawn: 2 shields | Broadside (1⚡): heat 1 per 2 shields (up to 4) · Muster: +1 energy |
| Leviathan Thoross (bomb) | Vorthane | As it enters: 6 shields, eject 3. Hold | Crush (1⚡): heat 1 per 2 shields (up to 5) · Deep Call: 4 shields, it regains 2 stability |
| Broodmother Ul'Kha | Ixquor | Dawn: your other growing cards grow by 1 | Spawn: plant 1 · Nurture: renew 1, she regains 2 stability |
| Hive-Speaker Zyth | Ixquor | Your Ixquor cards heat +1 | Course: your orbit +1 · Forage: draw 1 |
| The Worldroot (bomb) | Ixquor | As it enters: draw 3, renew 2. Dawn: draw 1, it regains 1 stability | Bloom: plant 2 · Deep Roots: renew 2 |

Balancing the change (600 games a test, all ten starters): the AI first ignored Heroes (it valued a card by its dawn effects and days left), then valued them (abilities, lasting buffs, a whole horizon of play) and Demolition rose to 83%. Its engines were the Shardmind's free daily Cool 3 (12 points) and Command Breaker destroying Heroes for 2 energy now that they are a lasting investment (13 points): Cold Reckoning and Archive now cost 1, Command Breaker costs 3. Overdrive lost its self-heat; Osshara gained a dawn shield and a bigger Swell; Overcharge leads with the Admiralty (Muster: +1 energy) in place of the Broodmother, Orbit Riders with Osshara in place of Veyra. Where it stands (600 games): mean distance from 50% 8.4 (it was 3.7 before Heroes changed). Solar Lancers 61.9%, Shard Overload 47.7%, Abyssal Tide 42.9%, Hive Bloom 53.3%, Orbit Riders 33.0%, Ambush 48.2%, Demolition 64.5%, Absolute Zero 50.4%, Graftworks 43.7%, Overcharge 31.0%. Still to do: Veyra's buff carries Solar Lancers; Overcharge and Orbit Riders miss the old Heroes' daily energy.

Counters: each bomb is still a Hero, so Tractor Beam and Event Horizon send it back to hand (4 energy wasted) and Command Breaker destroys it.

(They keep the ids of the Heroes they replaced, so collections and saved decks carry over.)

**Heroes speak.** As a Hero takes the field, one of its hero's lines appears as a caption beside the card (src/ui/voice.ts). Text only for now; recorded voice lines may come later.

**Keeping Heroes in play** is rewarded by:
- Standing Orders: draw 1; dawn, draw 1 if you control a Hero.
- Chain of Command: dawn, cool 1, or 2 if you control a Hero.
- Aureline War-Herald: dawn, heat 1; gain 1 shield if you control a Hero.

Only one Hero is in play at a time, so these ask for one, and do something without one.

**Answering Heroes.** Command Breaker (3 energy) destroys a Hero in your target's tableau; Tractor Beam and Event Horizon can send one back to its owner's hand; an attack on a Hero wears its defence, then its stability.

**Why the change, and what the simulator says (1000 games).** Permanent upgrades were opaque and snowballed, and a Hero fading after a day made the cards that want one in play weak. As choose-one dawn cards with a full term, they are easier to read. But the upgrades did one useful job: Solar Flare's +1 on every attack was what let attack-heavy decks break through shield decks. Without it, Abyssal Tide sits behind its shields at 0–4 heat (and the AI mostly picks cool 3 for its Commands), so Tide beats Shard Overload about 85% of the time. Tried and kept: Bell Warden 2 shields a dawn (was 3), Shard Reactor heats its own sun by 1 (was 2), Ember Shard 3 heat (was 2), and no extra opening card for the second seat (seats were 43/57 with it, as games run longer now). Result: Tide 60%, Hive 52%, Lancers 49%, Overload 42%; seats 49/51; about 13 rounds a game (was 11). Cool 2 in place of cool 3 sinks Hive Bloom (~20%), which leans on cooling; raising max health to 27 or 30 only made games longer. **Pierce: the counter to shields.** Every mechanic should have a counter. Shields answer heat, Sting and Soothe punish heat into shields, and **Pierce** answers shields: piercing heat goes straight past them (and so sets off no Sting or Soothe), though a Lightspeed card can still cancel it. On Shard Reactor's dawn heat, the Xel'Naru Martyr's burst, and Ignition Protocol. With them, Tide vs Overload went from 85/15 to about 55/45.

**Rarity review.** No card should be strictly worse than a commoner one:
- Chorus of Dawn (Stellar): 1 heat per attack card you control, up to 4 (it was up to 2, worse than a plain Coronal Lance).
- Aureline Lancer (White Dwarf) is a plain dawn heat 2; Aureline War-Herald (Stellar) is dawn heat 1, and with a Hero heat +1 and a shield (it was strictly worse than the Lancer).
- Aurelia, the First Light (Anomaly): dawn heat 1, +1 per attack card you control (up to 5).
- Ommarath, the Deep Bell (Anomaly): dawn 2 shields, Soothe 1.
- The protocols now beat Command Directive's matching option: Ignition heat 1, dawn heat 2 with Pierce; Coolant cool 2, dawn cool 3; Chamber 3 shields, dawn 3 shields.

Result (1000 games): Tide 54%, Lancers 53%, Overload 49%, Hive 44%; seats 49/51; about 12.5 rounds a game.

## Orion, Galaxy Eater [design review]

A neutral Anomaly, cost 5 (a day's bonus energy, or the industrial planet, to play it), sturdy 1. While it is in play, every rival's planets count as the dead planet: no Industry energy and no Abundance cards from them, and planet conditions on their cards read "dead". The sun gauge's planet tag reads "eaten" while it lasts. Its own owner's planets are untouched.

Counter: it does nothing on its own, so removal answers it cleanly (its defence is only 1), and a deck that doesn't lean on its planets barely notices it.

## Thermosiphon [design review]

A sun runs from −10 to its max health, and starts at 0. **Thermosiphon** cards draw on the cold: the number beside the keyword is **per 2 points your sun is below zero** (up to 5 times at −10). Every Thermosiphon card also does something warm, so a rival who heats you out of the cold blunts the deck without silencing it. [direction: the cards should still do something when the sun is warm] In play, the card shows the total its number now comes to. (Thermosiphon was once an action that cooled your sun; it now names the payoff for getting there.)

It gives cooling decks a way to win, and a new kind of defensive deck: cool hard, then sit behind shields that grow with the cold.

| Card | Race | Cost | Rarity | Text |
| --- | --- | --- | --- | --- |
| Absolute Zero | Xel'Naru | 4 | Anomaly | Cool 2. Dawn: heat 1; Thermosiphon heat 1 (up to 6 heat a dawn at −10) |
| Cryo Lance | Xel'Naru | 2 | White Dwarf | Heat 2, pierce; Thermosiphon heat 1, pierce |
| Frostbound Sentinel | Xel'Naru | 2 | White Dwarf | Guard, sturdy 1. Dawn: 1 shield; Thermosiphon shield 1 |
| Rime Bastion | Neutral | 2 | White Dwarf | Sturdy 2. Dawn: 1 shield; Thermosiphon shield 1 |
| Glacier Hull | Vorthane | 3 | Stellar | 2 shields, hold. Dawn: 1 shield; Thermosiphon shield 1 |
| Thaw Beam | Neutral | 1 | White Dwarf | Heat 1, pierce; +1 per 2 points the target's sun is below zero |

**Counters.** Any heat that lands warms a cold sun, so every point of heat through the shields also weakens its Thermosiphon cards; pierce is the natural answer. Thaw Beam is the direct one: cheap, piercing, and stronger the colder its target.

## Resonance [design review]

Resonance cards power up their neighbours in your tableau (by slot: an empty slot between two cards separates them). The bonus applies to heat, cooling and shields, and only to an effect that already does something. A card's current bonus shows as a violet badge on it.

| Card | Rarity | Resonance |
| --- | --- | --- |
| Resonance Lattice | White Dwarf | +1 to the cards either side |
| Sunforge (Aureline) | Stellar | +1 to attack cards either side, and dawn: heat 1 |
| The Admiralty | Anomaly | +1 to the cards either side (a Hero) |
| Harmonic Singularity | Anomaly | +2 to the cards either side, +1 to the cards two places away |

Some cards count their own neighbours instead:
- Tide Pylon (Vorthane): dawn, 1 shield +1 per defence card next to it.
- Prism Conduit (Xel'Naru): dawn, cool 1, +1 per attack card next to it.

## Recovery, recall and removal [design review]

**Offering (Aureline) and Rootbreak (Ixquor).** Boards weren't clearing: the Aureline and Ixquor had almost no removal. Each now has its own, in surges (cards-removal.ts). **Offering**: one of your armed cards that hasn't acted today gives up its attack for the rest of the day (it reads 0, unless something gives it more before dusk), and a rival card of your choice loses that much stability, past its defence; best at dawn, before the card strikes. Solar Tithe (1: Offering), Dawn's Judgement (2: Offering, draw 1), Sunbreak Rite (3: Offering twice over). **Rootbreak**: roots growing out through the cracks; one of your cards that has grown splits a rival card's defence by its growth (Canopy Breach: their sun's shields instead), and split defence stays split. Through the Cracks (1), Rootfall (2: twice over), Canopy Breach (1: shields, draw 1). Both need a card of yours to draw on: with none, they can't be played. The Sunforge starter runs Solar Tithe ×2 and Dawn's Judgement; Living Hive runs Through the Cracks ×2 and Rootfall.

- **The discard pile** takes every card that leaves play (faded, destroyed or cancelled), so there is nearly always something to recover.
- **Recover** (from your discard pile to your hand). With nothing to recover, each of these draws a card instead, so none is ever dead:
  - Salvage Drone: any card, and cool 1.
  - Xel'Naru Reliquarist: an attack card, then draw 1.
  - Regrowth Pod (Ixquor): a support card, and cool 1.
  - Sunlit Return (Aureline): cool 1, and an attack card.
  - Returning Tide (Vorthane): gain 2 shields, and a defence card.
  - Compost Cycle (Ixquor): any card, and your other cards regain 1 stability.
- **On recovery**, some cards fire an effect: Ember Shard heats your rival by 1; Spore Husk draws 2.
- **Recall** (from your tableau to your hand, triggering its leave effects, to play it again; it also frees the slot):
  - Phase Shift: and 1 extra play today.
  - Recall Beacon: and draw 1.
  - Shard Recall (Xel'Naru): and heat your rival by 1 (recalling a Martyr fires it too).
- **Shift** (move one of your cards to another slot; into an occupied slot, the two swap places) and **Displace** (the same, to a card in your rival's tableau). Position matters: slot defence (1/2/3/2/1), neighbours' resonance, Bulwark and Forge, and where a removal or attack can reach. A Hero leads from its own slot and can't be moved. The card to move is chosen, then the slot.
  - Gravity Tether (neutral, 1): Shift, shields 2.
  - Orbital Tug (neutral, 2): Displace, heat 3.
  - Umbral Drift (Nyxari, 1): Displace, draw 1.
  - Realignment (Seren, 2): Shift, cool 3, draw 1.
  - Wall Rotation (Korrath, 1): Shift, repair 3.
- **Removal** of cards in your target's tableau:
  - Ion Cannon destroys a card.
  - Command Breaker heats 2, and destroys a Hero if there is one.
  - Tractor Beam returns a card to its owner's hand, and heats 1.
  - Event Horizon (Anomaly) destroys a card and flings the cards either side of it back to their owner's hand.

## Every card does something on its own [design review]

Cards that only worked alongside others (a count of a card type, Heroes, neighbours, a planet) left hands full of cards that did nothing, and a deck had to be almost all of one type to use them. Now each has a **floor**: it always does something, and its synergy makes it better.

| Card | Before | Now |
| --- | --- | --- |
| Solar Battery | 2 heat with 3+ attack cards, else nothing | 1 heat, or 3 with 3+ attack cards |
| Spore Cloud (Ixquor) | 2 heat with 4+ cards, else nothing | 1 heat, or 3 with 4+ cards |
| Halo Ward (Aureline) | 1 shield per 2 attack cards | 1 shield, +1 per 2 attack cards |
| Aureline Sun-Priest | cool 1 per 2 attack cards (up to 2) | cool 1, or 2 with 2+ attack cards |
| Aurelia, the First Light | 1 heat per 2 attack cards (up to 3) | 1 heat, +1 per 2 attack cards (up to 4) |
| Dawn Beacon (Aureline) | dawn, draw 1 with 3+ attack cards | with 2+ attack cards |
| Prism Conduit (Xel'Naru) | cool 1 per attack card next to it | cool 1, +1 per attack card next to it |
| Standing Orders, Chain of Command, War-Herald | needed one or two Heroes | see Heroes |
| Command Breaker | heat 1, destroy a Hero | heat 2, destroy a Hero if there is one |
| Signal Jammer | cancels a Hero (decks hold 2) | cancels a support card |
| Dead World Mine | only while the dead planet faces your sun | also cool 1 every day |
| Orbit Root | only while the dead planet faces your sun | also 1 shield every day |
| Recovery cards | nothing with an empty discard pile | draw 1 instead |

## Keywords [design review]

The game's recurring mechanics are **keywords**: a coloured word on the card with its number, always in title case (**Sturdy 1**, **Resonance 2 · 1**, **Erode 2**, **Recover Attack**, **Destroy 2** (2 or less defence)). The three most common effects are **symbols** instead of words, so card text stays very short: **heat** (two red chevrons up), **cool** (two blue chevrons down) and **shields** (a shield), each with its number. "At dawn, heat your rival's sun by 3" reads **Dawn: ⏶3**. Heat goes to the rival's sun unless the card says "to your sun".

Each is explained once, in `src/engine/keywords.ts`: in a game, beside the zoomed card (with no hover pop-up there, since the explanations are already beside it); in the deck builder and the shop, on hover; and on the rules page (How to Play → Keywords), which lists them all. The zoomed card also explains its stability and defence badges, and the rules its text names in plain words (`TEXT_RULES`: choose-one cards, Heroes, leaving the tableau, facing a planet, cancelling, max health).

**How to Play** is a sheet of tabs (Overview, Your Day, Tableau, Sun & Orbit, Card Types, Keywords, Progress), each a handful of short facts rather than paragraphs.

**Support, not Growth.** The type of card that draws, recovers, ramps and plays more was called Growth, which read as if it had to do with the Grow mechanic (the Ixquor saplings' growth counters), though most of them don't grow at all. It is shown as **Support** now (the type badge, the type line, the deck builder's filter, How to Play and card text such as Recover Support); the internal id stays `growth`, so saves and decks are unchanged. Grow and growth keep their meaning: a card's growth counter.

| Keyword | Meaning |
| --- | --- |
| Dawn | At each of your dawns, while in play |
| heat N (symbol) | Heat your rival's sun by N (or the sun the card names) |
| cool N (symbol) | Cool your sun by N |
| shields N (symbol) | Gain N shields |
| Pierce | This card's heat ignores shields (so no absorbing, Sting or Soothe); Lightspeed cards can still answer it |
| sturdy N | +N defence, and it mends N more worn defence at each of your dawns |
| repair N | Mend N worn defence on your side, the most worn cards first |
| bulwark N (· M) | Cards next to it +N defence (two slots away +M) |
| resonance N (· M) | Cards next to it +N heat, cooling and shields (two places away +M) |
| forge N | Resonance for attack cards only: +N heat |
| anchor | Cards next to it regain 1 stability at your dawn |
| erode N / decay N | A rival card / every rival card loses N stability, whatever its defence |
| restore N / renew N | Another card / every other card of yours regains N stability |
| recover (type) | A card (of that type) from your discard pile to your hand; with none there, draw |
| abundance +N | Draw N more at each of your dawns, while the card is in play (a one-off draw just says "Draw N"). |
| industry +N | N more energy every day, while the card is in play (a one-off boost reads "Gain" and a green energy dot per energy). A Hero's energy option is Industry, and its draw option Abundance, since a Hero's choice repeats at every dawn. |
| recall | Another card of yours from your tableau to your hand |
| destroy N / eject N | Destroy / return to hand a rival card with at most N defence |
| sting N / soothe N | Sting: when a rival card attacks this card, the attacker takes N to its stability / Soothe: when your shields absorb heat, cool your sun N |
| hold N | Your shields don't fade (up to N) |
| tidewall | While it is in play, your shields guard your cards too (against heat aimed at them; attacks and pierce get through), not just your sun |
| plant N | Put N Saplings (tokens) in your empty slots, the least defended first |
| catalyst | Whenever this grows, your other growing cards grow too |
| fusion | Played onto one of your cards in play, not into a slot: it gains this card's dawn effects, Sturdy and stability |
| overheated | Half your max health or hotter |
| grows N | Grows by 1 each day, up to N |
| plays +N | N extra plays each day |
| orbit ±N | Moves the planets round a sun |
| lightspeed, global | Card types (see below) |

## Fusion [design review]


**Fusion cards are cards first.** A Fusion card can be played like any other card, into an empty slot, where it is a plain card (attack and stability, nothing more); fusing it onto one of your cards in play is the option (no slot needed, so it can go in when the tableau is full). As it is played, the empty slots and the cards it could fuse onto light up together: tap either.
**Fused** onto one of your cards in play (instead of into a slot), a Fusion card gives its host one fixed bonus, the words after "Fusion:" on the card (Fusion: Dawn: heat 1; Fusion: Sturdy 2...), and nothing else of it: no stability, attack or other abilities. Any part of the bonus for now (Data Splice's draw, Sap Graft's growth) resolves as it fuses. A card can carry 2. When the host leaves play, its Fusion cards go with it (their leave effects fire too). It gives decks that draw more cards than they have slots for (Abyssal Tide above all) somewhere to put them, and lets a strong card be built up, at the risk of losing it all at once. With nothing in play to fuse onto, a Fusion card can't be played.

| Card | Race | Cost | Fused, it adds |
|---|---|---|---|
| Thermal Graft | Neutral | 1 | Dawn: heat 1. Stability 2 |
| Shield Lattice | Neutral | 1 | Dawn: shield 1. Stability 2 |
| Reinforced Plating | Neutral | 1 | Sturdy 2. Stability 3 |
| Coolant Shunt | Neutral | 1 | Dawn: cool 1. Stability 2 |
| Data Splice | Neutral | 1 | Draw 1 (as played). Stability 2 |
| Sunforged Lens | Aureline | 2 | Dawn: heat 2. Stability 2 |
| Shard Splice | Xel'Naru | 2 | Dawn: heat 1, cool 1. Stability 1 |
| Tidal Graft | Vorthane | 2 | Dawn: shield 2. Stability 2 |
| Barnacle Shell | Vorthane | 1 | Sturdy 1, dawn: repair 1. Stability 3 |
| Siphon Tendril | Vorthane | 2 | Dawn: heat 1 per 2 shields (up to 3). Stability 2 |
| Spore Graft | Ixquor | 1 | Dawn: draw 1. Stability 2 |

Abyssal Tide plays two Tidal Grafts and a Siphon Tendril (for its Sunken Bells and a Coronal Lance): 38% → 50% in 600 AI games.

## Saplings and growth [design review]

The hive's answer to losing its board. **Saplings** are tokens: a card in play with nothing of its own (stability 3) that counts towards "cards you control" and the 4+ card thresholds, and is a ready host for Fusion cards. They are never in a deck, shop or collection; when one leaves play it is simply gone. **Plant N** puts N Saplings in your empty slots, the least defended first: Seed Burst (plant 2, draw 1) and Ixquor Sporelings (now also plant 1).

Growth fusion: **Sap Graft** and **Thorn Graft** fuse onto a card and make it **grow at once**; from then on it grows each dawn (up to 3) and cools (Sap) or heats (Thorn) by its growth. A sapling grafted this way becomes a real card without taking another slot. Growth never shrinks a card: a lower limit from a graft leaves a higher growth alone. **Spore Catalyst** (growth, cost 2, stability 4) grows each dawn and cools by its growth, and is a **Catalyst**: whenever it grows, your other growing cards grow too.

Hive Bloom plays Sap Graft ×2, Seed Burst ×2 and the Spore Catalyst (for its Orbit Roots, Spore Returns and Recall Beacon): 36% → 45% in 600 AI games (against Solar Lancers 23% → 36%). Field: Lancers 48.9%, Overload 61.4%, Tide 42.8%, Bloom 45.1%.

**Shard Overload tuned (400 games a variant, then 600).** With wear lasting, pierce (which skips defence) got stronger, and Overload rose to 61%. Tried: Shard Reactor dawn pierce 1 (was 2), Prism Colossus pierce 2 (was 3), Shard Reactor without pierce, and pierce getting past less of shields (no effect: the edge was the defence it skips, not the shields). Kept: **Shard Reactor dawn: heat 1, pierce**. Field: Lancers 55.4%, Overload 50.8%, Tide 44.4%, Bloom 48.0%.

## Relics [design review]

Relics (cards-relics.ts, teal) have no attack and never fade: their bonus lasts the whole game. Every one is **Brittle**: nothing restores it (Restore and Renew pass it by), nothing fuses onto it or it onto anything, and removal reaches it whatever its defence (an Ion Cannon takes one beside a Bulwark). Otherwise it stands like any card: its slot's defence, and 3 stability.

The counterplay is to hit them: attacks and aimed heat wear one down over a few days, and removal ends it at once. The AI values one as lasting its whole horizon (as a Hero), so it goes after them.

**Play-testing them (168 AI games, all starters).** As first written (no defence, 1 stability: any point of anything broke them), Relics were far too squishy: most lasted 1.4 rounds (gone at the rival's next day, to a free attack), the Crown under one; only Tide Pearl, its Tidewall shields guarding it, lasted (4.7). 3 stability alone helped a little (Ember Idol still 1.75, the Crown 0.9). With their slot's defence too (removal still reaching them), they last 2.2-5 rounds (Ember Idol 2.25, Crown 2.9, Frost Reliquary 4.0, Aegis Idol 4.75, Tide Pearl 5.1), more of them falling to removal, the answer meant for them; and the spread from 50% goes 8.6 → 7.1 (84 games a deck: Solar Lancers 51.2, Shard Overload 50.0, Abyssal Tide 71.4, Hive Bloom 51.2, Night Court 51.2, Forge Clans 39.3, Starwatch 53.6, Wildfire 32.1).

| Relic | Cost | Bonus |
|---|---|---|
| Ember Idol | 3 | Your attack cards heat +1 (their attacks too) |
| Frost Reliquary | 2 | Your cards cool +1 |
| Aegis Idol | 2 | Your cards shield +1 |
| Chrono Stone | 2 | Anchor |
| Warden Totem | 2 | Bulwark 2 (+2 defence beside it, +1 two slots away) |
| Tide Pearl | 4 | Tidewall |
| Astral Orrery (Stellar) | 4 | +1 energy a day |
| Crown of the First Sun (Anomaly) | 4 | Your cards heat, cool and shield +1 |

The dominance check doesn't compare Relics with other kinds (lasting but brittle is a trade it can't price). Each starter runs one (Wildfire two): see Balancing the races.

## Lightspeed cards [design review]

Lightspeed cards are played **face down**. They don't take a slot, and **only one can be face down at a time**. Rivals see only that one is set: it lies face down in the Lightspeed slot, right of its owner's five (that slot has no defence), and the owner's pill shows ⚡. The card springs **during an enemy's day** when its trigger happens. It is revealed ("Lightspeed!"), resolves against that enemy ("your target" means them), and goes to your discard pile.

| Card | Rarity | Springs when an enemy… | Effect |
| --- | --- | --- | --- |
| Null Field | Stellar | plays an attack card | Cancel it |
| Signal Jammer | White Dwarf | plays a support card | Cancel it, draw 1 |
| Frost Snare | White Dwarf | plays a defence card | Cancel it, heat them 1 |
| Solar Mirror | White Dwarf | is about to heat your sun | First gain 3 shields and heat them 1 |
| Decoy Array | White Dwarf | is about to destroy or return one of your cards | Cancel it, draw 1 |
| Riptide Ambushers (Vorthane) | Stellar | is about to heat your sun by 3 or more | Cancel that heat, heat them 2 |
| Temporal Snare | Anomaly | plays any card | Cancel it; they may play no more cards today |

A cancelled card still uses the play and goes to its owner's discard pile. The AI plans without seeing its rivals' face-down cards.

**Lightspeed guards.** Blink Bulwark (neutral), Sunflash Aegis (Aureline) and Riptide Sentinel (Vorthane) are Guards that can be played either way: into a slot as an ordinary Guard, or set face down in the Lightspeed slot for **1 more energy**. Face down, one springs when an enemy's attack or aimed heat is about to strike one of your cards: it lands in your safest free slot and takes it instead (on its defence first). With no free slot it can't land and stays face down. It answers the way Guards do, but unseen, so aiming at a rival's weak cards is never quite safe.

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
- **Palettes:** each race has its own sky (Aureline dawn blue and gold, Xel'Naru rose dusk, Vorthane deep teal sea, Ixquor violet and bio-green). Neutral cards take their palette from their type: attack ember, defence ice blue, support green, global violet, Command steel, Lightspeed amber.
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

**89 cards:** 41 neutral (27 others, 3 globals, 5 Heroes and 6 Lightspeed cards), and 11–13 for each race. Cards have no cost: the number of plays per turn is the only limit, so no single card is a bomb. The power is in combinations. The full list and exact wording are in `src/engine/cards.ts`. Rarity and characters are set in one table there (`CARD_META`).

| Race | Theme | Its cards |
| --- | --- | --- |
| Aureline | Lancers: many attack cards, each making the others hit harder | Aureline Lancer, Focusing Array (other attack cards +1 at dawn; copies don't stack), Chorus of Dawn (1 heat per attack card you control), Sunspear, Dawn Beacon, Halo Warden, Sun-Priest (cools more with your attack cards), Aurelia (heat that grows with your attack cards), War-Herald (heat, and a shield while you hold a Hero), Sunforge (resonance for attack cards), Sunlit Return (recovers an attack card) |
| Xel'Naru | Overload: big bursts of heat, and run your own sun hot to hit harder | Shard Reactor, Crystal Storm (3 heat, or 4 while you are overheated), Overload Core (harder while overheated), Xel'Naru Martyr (burst when it leaves play), Prism Vent, Fracture Seer, Champion (harder while overheated), Kyr'Vessa (strikes whenever another of your cards leaves play), Ember Shard (burst when recovered), Reliquarist (recovers an attack card), Prism Conduit (cools more with neighbouring attack cards), Shard Recall (recalls a card) |
| Vorthane | Tides: build shields, keep them, and sting attackers | Bellwarden, Stinging Veil (once per attacking card each day), Tidal Bloom, Abyssal Choir (heat from your shields), Deep Current (shields no longer fade), Vorthanian Commoners, Hero of Rathune (shields from your defence cards), Ommarath (cools your sun when your shields absorb a hit), Tide Pylon (shields from neighbouring defence cards), Riptide Ambushers (Lightspeed: turn aside a big hit), Returning Tide (recovers a defence card) |
| Ixquor | The hive: grow, go wide and play more | Mycelium Tower (grows each day), Hive Relay (+1 play), Sporecaster, Rot Bloom and Canopy (both scale with cards in play), Spore Cloud, Brood-Tender (your other cards grow faster), The Brood Queen (+1 play, and hits harder once you're wide), Regrowth Pod (recovers a support card), Spore Husk (draws when recovered), Compost Cycle (recovers any card, steadies the rest) |

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

`npm run simulate -- [games]` plays AI-versus-AI 1v1 games with the starter decks.

`npm run gauntlet -- [games]` plays one deck (`NAME='Orbit Riders'`, or `DECK='[...]'`) against each of the four race starters, seats alternating: a quick check of a deck list against a fixed benchmark.

**Straight heat (balance pass, 600–1000 games a test across all ten starters).** Measured as the mean distance of the ten starters' win rates from 50%: 12.8 before, 8.7 after the card changes, **4.9** with the deck swaps too (games 12.5 → 13.9 rounds). Final (1000 games): Solar Lancers 47.6%, Shard Overload 48.1%, Abyssal Tide 46.5%, Hive Bloom 44.6%, Orbit Riders 42.2%, Ambush 50.0%, Demolition 49.8%, Absolute Zero 62.7%, Graftworks 60.2%, Overcharge 54.5%. Absolute Zero (cold) and Graftworks (Fusion) are still the strongest: the next places to look. Each change was tested on its own first (the simulator's `PATCH`/`BAL`), then together:
- **Straight heat lasts a day less.** A card whose dawn heat comes with no conditions now has 2 stability, not 3 (`BALANCE.stabilityDawnHeat`; 20 cards: Plasma Relay, Helio Lancer, the Dawnstar Cannon, Shard Reactor...). The single biggest lever: alone it took the mean distance 12.8 → 11.8, lifting the decks that out-think rather than out-heat (Orbit Riders 27 → 55%, Abyssal Tide 33 → 47%). Keeping it for pierce heat only, or for the Ixquor scalers, made things worse.
- **Fusion grafts give less stability.** A graft's stability is added to its host, so stacked grafts kept a host (and all its dawn heat) in play for ever. Heat grafts now add 1 (Thermal Graft, Sunforged Lens, Shard Splice), the rest 2 (Reinforced Plating and Barnacle Shell were 3). With none at all, Graftworks fell from 76% to 8%: the stability is the whole engine, so it was trimmed, not removed.
- **Suns can't go below −3** (was −5). Thermosiphon counts every point below zero: at −5 a Rime Bastion gave 5 shields a dawn for 2 energy. Frostbound Sentinel lost its dawn cooling (a Guard that cooled every day fed the engine); Absolute Zero's dawn heat is Thermosiphon 1, not 2. (Ablation: without Frostbound Sentinels, Absolute Zero lost 15 points; without Absolute Zero itself, 8.)
- **Meltdown: 2 heat per energy spent, not 3.** Spend All is straight heat too, all at once: with dawn heat trimmed, Overcharge rose to 75%; this brought it to ~50%.
- **Lightspeed traps cost 1 less** (the 1-energy ones are free). A trap sits idle until the rival walks into it.
- **Attunement:** the industrial planet's bonus is Heat 1, Heat 1, then Heat 2 and Shields 1 (it was 1/2/3: Orbit Riders won 72% with a stronger top step, 36% with attuned cards lasting only 2 days).
- **Deck swaps after:** Shard Overload trades its Shard Reactors for Precession Engines and its Shard Mother for a Crystal Storm (36 → ~42% against the field); Hive Bloom its Hive Colossus and Great Mycelium for two Seasonal Blooms (40 → ~55%); Ambush a Plasma Relay for an Ecliptic Lance (38 → ~53%).

**Ten starters, before the straight-heat pass (1000 games, decks swapped only, no card changed).** Solar Lancers 49.7%, Shard Overload 50.9%, Abyssal Tide 34.1%, Hive Bloom 45.5%, Orbit Riders 26.6%, Ambush 44.1%, Demolition 45.4%, Absolute Zero 75.5%, Graftworks 74.6%, Overcharge 62.8%; seats 49.7/50.3, about 12.5 rounds. The mechanic decks are there to show up tactics that are too strong or too weak:
- **Too strong:** Thermosiphon (Absolute Zero beats Abyssal Tide 96%, Demolition 97%) and Fusion (Graftworks beats Shard Overload 83%, Abyssal Tide 85%, Ambush 93%), both from stacked dawn effects that come back every day. Spend All (Overcharge) is strong too. Their lists were left as built, so the field shows it.
- **Lightspeed traps are weak:** the Ambush list with eight traps won 23% against the race starters; the same deck with no traps at all won 68%, and with four (as now) 45–49%. No deck swap can make a trap deck work: the traps themselves (or the AI's use of them) need looking at.
- **Orbit cards are weak on their own:** Orbit Riders with mostly orbit cards won 9%; trading its weakest orbit cards (Survey Probes, Tide Locks, Orbit Root, Dead World Mine, Fusion Reactor, Orion) for plain heat and cooling took it to 43% against the race starters, but it still loses most games to the strong mechanic decks.
- A plain deck of neutral dawn heat, Guards and cooling beats the race starters about two games in three: steady dawn heat is worth more than most synergies.

**The starter decks** were rebuilt so every race plays with the newer mechanics. [design review: in play, the old starters never used them]

| Deck | Built around |
| --- | --- |
| Solar Lancers | Attack cards that boost each other: a Sunforge and a Focusing Array, Lancer Squadrons and Sunlance Charges; a Halo Sentinel (Guard); Heroes kept in play for the War-Herald; Sunlit Return and a Recall Beacon to bring attack cards back; Ion Cannon; Prism of Dawn set face down |
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

Nerfing Hive's plays or its "cards you control" attacks hardly moved it; its cooling did. Result: Overload 52.5%, Tide 51.1%, Bloom 50.7%, Lancers 46.0%; seats 48/52; games about 11 rounds. Lancers lost the most from Command Directive fading fast (War-Herald and Standing Orders want a Hero in play), and Overload beats it 60/40. The other lopsided matchup is Tide vs Overload (74/26), as before.

**After the discard pile and the card floors (1000 games).** Cards recovered from the discard pile went from 0.2 to 1.7 a game, and cards returned to hand to 1.9. Deck win rates are 46–55%: Lancers 54.7%, Overload 49.0%, Tide 49.6%, Bloom 46.3%. Seats are 49/51, and games last about 11.5 rounds.
- The floors made Solar Lancers far too strong at first (about 80%). Their attack cards now all hit every day, and Focusing Array and Sunforge add to every one of them. Lancers now run one Sunforge (and a Recall Beacon), Coronal Chorus hits for up to 2, Sunlit Return cools 1, the Sun-Priest cools at most 2, and the War-Herald's Command bonus is a shield rather than more heat.
- Abyssal Tide fell to about 25% (it gained little from the floors), so the Abyssal Choir now starts at 2 heat and the Stinging Veil stings for 3. Rot Bloom also starts at 2.
- The widest match-ups are Tide over Overload (74/26) and Lancers over Tide (72/28).

**The energy curve (600 games).** At 3 energy a day, a deck full of 2s plays one card most days. The starters had only 5–7 cards at 0–1 energy (13–14 at 2), so they were rebuilt to 8–12 at 0–1, 8–10 at 2 and a few 3s and 4s, mostly with on-theme 1-cost cards from the second set (new and existing profiles are granted them). Win rates: Lancers 45.5%, Overload 55.8%, Tide 44.0%, Bloom 53.6%; seats 47/53. Tide fell to 35% at first; it got its second Abyssal Choir and Undertow back, and a Trench-Warden.

**Ramp (600 games).** A higher curve is fine for a deck that ramps, so Hive Bloom became the ramp deck (Sporelings, Overgrowth, Hive Relay, the Brood Queen, Chitin Fortress: 6 cards at 1, 10 at 2, three 3–4s). The AI had never ramped: it judged a play by the board it left, and energy still to spend today counted for nothing, so "+energy today" cards looked worthless. It now counts the energy a card gives back, up to what the cards left in its hand can use. Overgrowth's drawback went from 2 heat to 1. Win rates: Lancers 52.9%, Overload 49.2%, Tide 52.4%, Bloom 45.7%. Seats are 44/56: the second seat now wins too often.

**Dented defence (600 games).** With defence dented for the day, decks that hit many times a day (Solar Lancers) rose to 64% and Shard Overload fell to 42%. Lancers lost a Dawnblade, a Sunlance Charge and a Lancer Squadron (for a Helio Bastion, an Aureline Cantor and a Solar Aegis); Shard Overload got a Shard Mother and a Searing Core back (for a Heat Bleed and an Oracle). Win rates: Lancers 50.2%, Overload 54.8%, Tide 45.2%, Bloom 48.7%; seats 44.5/55.5.

**Heroes, recall and pierce (600 games).** A recall card can now be put in the slot of the card it recalls (that card shows "replace" as you place it), not only into a full tableau, and every starter deck runs 2–4 recall cards (new: Tactical Withdrawal, Rally Banner, Spore Return). Abyssal Tide still lost about 89% of games to Shard Overload, so **pierce heat now gets past half the shields in its way** (rounded down) rather than all of them. Win rates: Lancers 53.8%, Overload 51.1%, Tide 42.4%, Bloom 51.0%; seats 46/54; Tide vs Overload 27/73. Lancers swapped its Sunspear for a Dawn Rampart.

**Energy 4, 30-card decks and the Hero slot (600 games).** Games got faster (about 13 rounds) and Abyssal Tide fell to 25% (7% against Shard Overload, whose pierce heat ignores its shields). It came back to 43% with more attack cards in its list (two each of Riptide, Brine Lash, Jelly Swarm and Coronal Lance), Abyssal Choir at heat 3 (up to 6), Bell Warden at 3 shields and Tide Pylon at 2; Shard Overload lost its Fracture Burst, Shard Lancer, Searing Core and Shard Mother. Shield buffs alone hardly moved Tide; heat did. Win rates: Lancers 46.5%, Overload 55.5%, Tide 42.8%, Bloom 53.9%; seats 47/53 (with the second seat's extra card). The AI still picks +1 energy for almost every Hero. It also leaves about 1.7 energy unspent a day, often because its five tableau slots are full: with 4 energy a day, the five slots may now be the limit.

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

## Health and stability

A card in play has three numbers:

- **Defence** wears first. It comes from its slot plus its own Sturdy, and is mended 1 a day and by Repair.
- **Health** is what heat past its defence wears down: attacks, stings and aimed heat. At 0 the card burns away. Health is 1 + the card's cost, +1 for a defence card, and at least 2 (`baseHealth`). A card can list its own.
- **Stability** only counted the days before the card faded into the discard pile.

(Superseded: cards no longer fade, and the one stat left is called stability, with health's job. See Stability above.)

How the other rules touch them:

- **Erode and Decay** take days, not health. They are 1 stronger than they were listed with (`ERODE_EXTRA`), to make up for no longer finishing off a card worn down by heat.
- **Restore and Renew** add days. A Hero's self-mending heals its health.
- **Heroes** never fade, so they have health only: the stability they are listed with is their health. Paying "−1 health" for an ability takes it from there. Gear that gives a campaign hero stability gives health.
- **Older saves** (game version 5) get full health on load.

## The Blood Cult (Nyxari, Lost Races)

The Blood Cult is the Nyxari's third sub-race. Its cards consume their own and pay off whenever a card leaves play.

- **Consume** (`CardDef.consume`) is a play cost. To play the card, you give up another of your cards in play: your choice, any card but your Hero, Saplings included. The consumed card leaves play like any card does, so its own "when this leaves your tableau" effects fire, and so do your cards that answer another leaving. The card played can take the consumed card's slot, so it can be played into a full tableau.
- **The cards:**
  - Consume cards: Blood Offering (0: draw 2), Crimson Rite (1: heat 5), Bloodfeast (1: +2 energy), Exsanguinate (2: destroy 3).
  - Fodder that pays off as it leaves: Blood Thrall (heat 3), Willing Vessel (draw 2), Martyr's Chalice (4 shields).
  - Payoffs whenever another of your cards leaves: Hemomancer (heat 2), Sanguine Priest (a Guard; cool 1).
  - The Hero, Sanguis, the Blood Saint: she mends 1 health whenever another of your cards leaves. Abilities: sacrifice a card to draw 2, or pay 1 health for heat 3.
- **The starter:** Blood Rite, a Lost Races deck. In AI games against the eight Lost Races race starters it wins about 46% overall.
- Consume is a Lost Races mechanic, so these cards are never legal in Core.

## Game modes: Core and Lost Races

Every deck is built for one of two modes, and every game is played in one.

- **Core** is the simple game. It has the four core races, each built around one mechanic of its own:
  - Aureline: **Forge**, which boosts neighbouring attack cards.
  - Xel'Naru: **Overheat**, running their own sun hot for cards that hit harder while it is.
  - Vorthane: **Shields**.
  - Ixquor: **Growth**.

  On top of those are the fundamentals every card shares: attack, heat, cooling, defence, health, stability, energy, drawing, **Guard** (always there), and plain **removal**, destroying a card or returning it to its owner's hand.

  Removal is a basic so that Core has answers to what the rival builds. The neutral cards with it are now Core-legal: Ion Cannon, Tractor Beam, Command Breaker, Void Bolt and Star Breaker. So are two race cards that pair it with their race's mechanic: Shatter Point (Xel'Naru, Overheat) and Tidebreaker (Vorthane, Shields). Event Horizon does too much for Core. Each Core starter runs one or two removal cards (Ion Cannon, Shatter Point, two Tidebreakers, Void Bolt), and in AI games about one card a game is removed.

  A core-race card uses only its race's own mechanic, and a neutral card uses only the fundamentals. Most cards do one or two things. Race traits apply in both modes: they belong to the race, not the mode.

  **A card is the same card in every mode.** [direction: cards shouldn't differ between modes] The core races' simplified cards (`src/engine/cards-core.ts`: their Heroes, a few more Forge cards for Aureline, more Growth cards for Ixquor, Growth cards at cost 2 lasting 4 days) are those cards everywhere, Lost Races included; a mode only decides which cards a deck may hold. (The richer Lost versions of those Heroes went: Archive, Chosen and the like live on with other races' Heroes, or not at all.)

  The rules check is in `src/engine/modes.ts`. `cardMechanics` names what each card uses, and `modeProblem` says why a card can't be in a Core deck. There are four Core starters: Sunforge, Red Shift, Deep Tide and Living Hive.
- **Lost Races** is everything: all eight races, their sub-races, every mechanic and the race traits. Every card that exists is legal here, and all the earlier race and mechanic starters live in this mode.

How the mode is used across the game:

- **Rules in force.** The rules come from the game state (`GameState.mode`). `createGame` and `applyAction` set them, and so does any screen that shows cards for a mode, such as the deck builder.
- **Decks.** A deck saved before modes existed is a Lost Races deck.
- **Online.** A room plays Core only when both decks are Core decks. Ranked matchmaking only pairs players queued for the same mode.
- **Campaign.** A run as a core race is played in Core: core starters, core-legal card offers and armouries, and Core rules in battle. Anything else in its decks is swapped for a plain neutral card. The Lost Races are unlocked with Stellari petals, and a run as one of them is played in Lost Races.

## The eight races [design review]

Each player is one of eight races (races.ts). [direction: race traits never change a card's numbers; they only give existing keywords, written on the card] A race's **trait** is one existing keyword on each of its cards (where it applies), wherever they are played. There are no nerfs. Aureline, Xel'Naru and Ixquor have none: Forge, Overheat and Growth are their identity.

| Race | Theme | Trait | Sub-races |
| --- | --- | --- | --- |
| Aureline | Lancers of light: attack cards that power each other | none (Forge) | |
| Xel'Naru | Crystal overloaders: run hot | none (Overheat) | |
| Vorthane | Tidal bells: shields, kept, and stinging | Sting 1 on their cards that stay (written into each card's own Sting) | |
| Ixquor | The hive: go wide, ramp, grow | none (Growth) | |
| Nyxari | Void-stalkers | Darkspeed: their attackers and Heroes can attack or act the day they come into play | |
| Korrath | Forge-smiths | Sturdy 2 on their cards that stay (written into each card's own Sturdy) | |
| Seren | Star-readers | Star-charted: attuned cards attune once more | Tidecaster (orbit), Seer (draw, recover, attune) |
| Pyrr | Flare-born | Sting 1 on their cards that stay (fire burns what strikes it) | |

(Was: a bonus and a nerf each, many of them hidden changes to attack, defence or stability: Aureline's +1 attack, Pyrr's +1/+2 attack and self-heating, Xel'Naru's Shatter, and −1/−2 stability, attack or defence nerfs. All gone. With the Aureline +1 attack gone, the Sunforge starter's total attack went 52 → 40, still the most of any Core deck: its Forge count is the next thing to look at.)

**Plain cards.** [direction: a lot more cards with no abilities, just attack and defence; they still take race buffs] 45 cards with no text but their numbers (cards-plain.ts): five per race (costs 1–5) and five neutral, each on a profile. **Stat budget:** every plain card spends 2c+2 points of attack, Sturdy and stability at cost c: **striker** (c+1 attack, c+1 stability), **glass** (c+2 attack, c stability), **brute** (c attack, c+2 stability), **guardian** (c−1 attack, Sturdy 2, c+1), **veteran** (c attack, Sturdy 1, c+1), **wall** (no attack, Sturdy 3, so a Guard by its walls, 2c−1). A unit with abilities gets 2c+1 at most (anything over comes off its stability, then attack, then its own Sturdy), and Korrath pay for their trait's Sturdy 2 out of the same budget; a test (tests/value.test.ts) holds every card to it. (Before, plain cards ran about three points over: Chitin Hulk was 2/6 for 2, now 2/4.) Each race leans on its own (Aureline strikers and veterans, Xel'Naru glass, Vorthane walls and brutes, Ixquor brutes, Nyxari glass, Korrath veterans and guardians, Seren veterans, Pyrr strikers; neutral walls and haulers). They carry their race's trait (Sting, Darkspeed, Sturdy +2, shown in their text) and its buffs; a Korrath plain card pays for its +2 Sturdy with a point of attack, so it never simply beats a neutral one. The cards that were plain already (Aureline Lancer, Plasma Relay, Dawnstar Cannon, Dreadnought) took a profile too. Every Core starter runs three pairs of its race's. [direction: fewer ability cards, not just more cards] Twenty-one common cards whose ability was small, conditional or the same as another's lost it and took a profile: Ember Drone, Comet Hail, Chain of Command; Aureline Skirmisher, Vanguard, Vesper Knight; Shard Reactor, Echo Shard, Searing Core; Tidal Bloom; Hive Warrior, Brood Chamber, Fruiting Body; Shade Stalker, Dusk Raider; Shieldwall, Iron Sentinel; Stargazer; Flare Imp, Cinder Brute, Ash-Walker. (Kept: what carries a race's mechanic, removal, the cooling and shield engines, dusk and Vigil cards, Heroes and the rarer cards.) Korrath plain cards pay for Sturdy +2 with a point of stability, and of attack where they have 2 or more. A second round took the abilities off fourteen cards whose only job was a little cooling or shielding: Frost Lattice, Glacier Shell, Halo Ward, Prism Vent, Prism Ward, Tide Lock, Undertow Shrine, Canopy, Ixquor Broodguard, Thorn Hedge, Husk Shell, Bastion-kin Shieldbearer, Orrery Keeper, Heat Bloom (Coolant Array stays: the free cooler). Art: the race's figure, bigger with cost, carrying what its profile is (a lance, a shield...); neutral ones are ships and stations. (Riptide and Abyssal Choir gave back their extra attack point: they out-hit plain cards of their cost.)

**Forge on three cards only.** [direction: fewer cards should have Forge, so no deck can stack it] Sunforge, Focusing Array (both Stellar) and Halo Sentinel (a Guard): at most 6 in a deck (it was 7 Aureline cards, 13 a deck). Gilded Lens (draw 1, dusk cool 1), Solar Aegis (Sturdy 2, cool 2), Helio Bastion (Guard, Sturdy 2, dusk cool 1) and Dawn Rampart (Sturdy 2, dusk cool 2) lost theirs. Attack outliers from the dawn-heat conversion trimmed: the Aureline Lancer is now a 1-energy card, attack 3 and stability 1 (it was 2 energy, attack 5); Dawnstar Cannon 5 → 4 attack; Siege Ram 4 → 3 (it had gained a point when the Korrath lost their −1). Sunforge still wins about 80% of AI starter games after all this: what remains is its many attack-count synergies (Aurelia, War-Herald, Sun-Priest, Cantor, Lancer Squadron) rather than Forge or raw attack. Swapping each out of Sunforge (12 games a pairing) showed which: War-Herald −21 points, Aurelia −14, Empress Solenne −12, Lancer Squadron −11, Sun-Priest −4, Cantor 0. So War-Herald's attack 3 → 2, Aurelia heat 1 per 2 attack cards (up to 3; was 1 per card, up to 5), Lancer Squadron up to 3 (was 4). Sunforge 78% → 69%; Lost Races starters 40–58%. Left in Core: Living Hive high (76%, the growth attack) and Red Shift low (21%).

The newer races have 17–19 cards each (cards-races.ts), with three Heroes (a 2, a 3 and a cost-4 Anomaly bomb), and a starter each: Night Court, Forge Clans, Starwatch, Wildfire. All eight are in the campaign: any race can lead, and the rivals are drawn at random (seeded) from the other seven, each with generals, skill trees, gear, ships and emblems of their own.

**Balancing the races (1000-game sims, all 14 starters).** The traits as first written put the field at 12.1 mean distance from 50%: Night Court 70.5%, Wildfire 14.5%.
- Night Court: swapping Phantom Strikes and Unravels for neutral cards was not enough (68%). Ambush alone carried it (without Ambush: 20%), so Fleeting became −2 stability (53%).
- Night Court, playable traps: only one card can be face down at a time, so a deck of seven Lightspeed-only cards jammed its hand. Umbral Snare (Sting 1, dawn shield 1), Mirror Veil (dawn shield 2) and Night Ambush (dawn heat 1, no attack: with Darkspeed it would strike the day it lands) now go into the tableau as ordinary cards, or face down for 1 more energy as before. Only Null Shroud is still Lightspeed-only. Night Court stays at 51.6% (182 games).
- Night Court, less draw and a live ambush: the deck is cheap but drew far more than it could play (AI games peaked at a 12.5-card hand on average, up to 19), so Eclipse Rite, Deep Scanners and both Gravity Slings make way for Phantom Strike, Photon Drill, Plasma Relay and Unravel (peak hand 8.7, up to 13). Night Ambush face down waited for an enemy to destroy or return one of your cards, which almost never comes; it now springs when an enemy attacks one of your cards or aims heat at it, cancelling the blow and heating them 2. Night Court: 53.1% (240 games).
- Dusk rests dimmed cards, and a hand limit of 5: the mean distance from 50% goes 9.5 → 8.6, games a little shorter (9.9 → 9.2 rounds), 84 games a deck. Draw-heavy decks lose most (Shard Overload 63.1 → 42.9, Hive Bloom 58.3 → 44.0); Abyssal Tide gains (51.2 → 69.0) and Wildfire (28.6 → 36.9). The dusk rule on its own changes the spread little (9.5).
- Big cards (cards-big.ts), for the days with five energy: four at 5 (Coronal Storm: heat 6, decay 1; Furnace Engine: Sturdy 2, dawn heat 3 pierce; Bulwark Prime: Guard, Sturdy 3, shield 4, dawn shield 3; Zenith Array: your attack cards deal +2 heat) and four at 6, Anomalies, one to a deck, playable only with a day's bonus energy (Supernova Lance: heat 12 pierce; Great Collapse: decay 3, heat 4; Dyson Sphere: shield 10, cool 5, hold, dawn shield 2; Black Sun: Sturdy 3, dawn heat 5). Each starter swaps one or two cheap duplicates for them; the spread from 50% stays 8.6 → 9.2 (84 games a deck), within the noise. Costs of 4 or more show their dots in two columns (the sixth amber, past the day's most energy).
- Relics: one in each starter (Solar Lancers: Ember Idol; Shard Overload: Astral Orrery; Abyssal Tide: Tide Pearl; Hive Bloom: Chrono Stone; Night Court: Aegis Idol; Forge Clans: Warden Totem; Starwatch: Frost Reliquary; Wildfire: Ember Idol and Crown of the First Sun), each for a spare copy. The spread from 50% goes 9.2 → 8.6 (84 games a deck): Solar Lancers 47.6, Shard Overload 52.4, Abyssal Tide 75.0, Hive Bloom 52.4, Night Court 47.6, Forge Clans 38.1, Starwatch 54.8, Wildfire 32.1. Abyssal Tide (high) and Wildfire and Forge Clans (low) are still the outliers.
- Wildfire: swaps (cooling for its self-heat cards) and even removing its self-heat did nothing; the deck lacked pressure and cooling. The Pyrr bonus became +1 attack (+2 while overheated), and the Dancer, Flare Burst, Ember Guard, Pyre Shield and Heat Bloom were strengthened; Radiator Fins replaced its Relay Stations. The AI now prices self-heat by how close the sun is to supernova.
- Forge Clans: Siege Arrays in place of Tempers (39% → 45%), then +2 defence, now written as +2 Sturdy on each card (53%).
- The dominance check ignores a race's trait (the trait is the race's price, not the card's).
- Where it stands (1000 games): mean distance 8.8 (from 12.1). Solar Lancers 44.5, Shard Overload 55.1, Abyssal Tide 58.5, Hive Bloom 58.6, Orbit Riders 60.2, Ambush 42.8, Demolition 61.1, Absolute Zero 37.3, Graftworks 54.1, Overcharge 39.8, Night Court 56.8, Forge Clans 46.7, Starwatch 58.6, Wildfire 28.2. Still to do: Wildfire, Absolute Zero and Overcharge are low.
- Night Court, no shield cards: Darkspeed (acting the day they land) only helps cards that attack, and in play the deck's shield cards were the ones you never wanted to play. Both Umbral Snares, the Mirror Veil, the Veil Lantern and the Aegis Idol make way for two Nightfalls, a third Shade Stalker, a second Phantom Strike and the Ember Idol (in place of a second Coronal Lance). Night Court against the other 13 starters (40 games each): 35.0% → 45.6%. [play-test]
- Costs that match what a card does, and no cheap card lasting three days. The Vorthanian Bellwarden (Guard, Sturdy 1, Tidewall, 3 shields every dawn and Sting 1) cost 2: a rough points audit of every card put it at 2.65× the median card of its cost, the most overloaded card in the game, and level with the 4–5 energy cards. It now costs **5**; the Riptide Sentinel (Guard, Sturdy, 2 shields a dawn, Lightspeed) goes 2 → 3. Sap Graft and Spore Graft go 1 → 2, like the Thorn Graft (they take no slot of their own). And a card costing 1 energy or less never has more than 2 stability, its race's trait included (`BALANCE.cheapMaxStability`). Repricing Korrath's cheap guards too was tried and dropped: Forge Clans, already the weakest deck, fell 26 → 20%. Deck swaps for the decks the stability cap hit: Hive Bloom's Sap Grafts for Creeping Vines (42.7 → 48.1% against the field), Absolute Zero's Frost Lattices for Glacier Shells (26.5 → 28.3%), Ambush's Sunflash Aegis pair and Riptide Sentinel for a Xel'Naru Warden, a Twilight Sentry and a Gravity Sling (40.0 → 46.9%). The field (1400 games): spread from 50% 9.5 → 9.3; Abyssal Tide 69.2 → 60.6%, Wildfire 36.1 → 42.8%, Hive Bloom 51.0 → 46.9%, Absolute Zero 28.2 → 25.0% (no swap rescues it: it needs a fix of its own). [direction: cards with many abilities cost more; 1-energy cards never have 3 stability]
- **Tidewall made rare, and the deep cold back.** Tidewall (your shields guard your cards) was too easy to get for what it does: the Tide-Regent, a 2-energy Hero in four starters, gave it for good (Heroes never fade), and Bastion Node, a 2-energy neutral card, put it in any deck. The Tide-Regent now leads with 2 shields a dawn and no Tidewall; Bastion Node loses it (Sturdy 3 in its place); the Tide Pearl relic costs 4 (was 2); the Bellwarden costs 5. And suns cool down to **−10** again (a balance pass had cut it to −3, which left Absolute Zero nothing to build towards), with Thermosiphon counting per 2 points below zero, and every Thermosiphon card doing something warm too (Cryo Lance heat 2, pierce; Absolute Zero dawn heat 1; the shield cards 1 shield a dawn). Ambush takes Archon Seris in place of its Tide-Regent (43.7 → 46.2% against the field). The field (1400 games): Absolute Zero 25.0 → 59.7%, Abyssal Tide 60.6 → 45.5%, Graftworks 51.9 → 39.3%, Ambush 50.8 → 41.6%, spread from 50% 9.3 → 8.6. [direction: Tidewall too easy to get; Absolute Zero needs the deep cold, and its cards should still do something warm]
- **Forge Clans: walls become weapons.** Korrath stacks defence (Sturdy on every card) but had nothing to do with it, and dealt too little damage to win (26.8%). Its damage cards now hit harder for the defence on its cards in play: Siege Ram's dawn heat, Molten Pour and Slag Graft are each heat 1, +1 per 4 defence on your cards (up to 3 in all). The count is the defence as it stands, so wearing Korrath's cards down (chip attacks, heat aimed at them) or removing them blunts its attacks as well as its walls. Forge Clans: 28.3 → 51.3% against the other starters; in the field (1400 games) 26.8 → 52.9%, and the spread from 50% 8.6 → 7.7. Per 3 or per 5 defence came out the same (the cap does most of the work). [direction: Forge Clans adding damage from their defences]
- **Tidewall guards against heat only.** Its shields now cover your cards only against heat aimed at them; attacks, stings and pierce heat get through (pierce went through only in part before). In the field (1400 games): Abyssal Tide 45.5 → 42.4%, the spread from 50% 7.7 → 7.5. [direction: Tidewall protects from heat, not attacks; attacks and pierce breach it]
- **The AI held good cards (play-test: "not playing cards with 5 in hand").** `npm run ai-holds` sorts every day the AI ends holding 4+ cards by reason. Of 1901 in 150 games, 436 were the AI choosing to hold with energy and empty slots to spare (Abyssal Tide on 6 energy and 5 free slots passing on Tide Pearl, Aegis Monolith and The Admiralty). Two faults: every energy past the first was charged as if it could have bought another card (2.5 a point, 10 for a 5-energy card), though energy left at day's end is lost; and a Guard was worth nothing to it. Now energy is charged only against what the other cards in hand would want of it today, and only to rank moves against each other (ending the day beats moving only when every move hurts in itself), and a Guard is worth more the more cards stand behind it. Holds: 436 → 69 (those left: cooling an already cold sun, heating its own, replacing a Hero, no free slot). The new AI beats the old 65.3% of 784 paired games. Its decks, played properly, shift: Overcharge (spend-all energy cards the old AI shied from) 48.1 → 80.7%, Orbit Riders 63.0 → 46.6%, Night Court 50.8 → 63.1%, Abyssal Tide 42.4 → 51.5%; spread from 50% 7.5 → 9.2 (to rebalance).
- **Pay-X cards toned down.** With the AI spending its energy properly, Overcharge's spend-all cards ran away with it (80.7%): several gave more than 2 per energy, against 1.2-2 for the big cards of a set cost, and grew with every energy Overcharge ramps into. Now: Radiant Barrage 1 heat and 1 shield per energy (was 2 heat and 1 shield); Meltdown heat 2, pierce, +1 per energy (was 2 per energy); Deep Freeze cool 1, +1 cool and 1 shield per energy (was +2 cool); Abyssal Rampart 2 shields per energy (was 3). Solar Torrent (heat 1, +2 per energy) keeps its rate: it is the pure heat one, and with it cut too Overcharge fell to 33%. The draw cards (Overflow Archive, Hive Surge) and Wildfire's (already a base plus 1 per energy) stay. Overcharge against the other starters: 79.2 → 50.8%; in the field (1400 games) 80.7 → 50.4%, spread from 50% 9.2 → 7.2. [direction: the pay-X cards themselves are the problem]

## Always landscape

The game is landscape from the game mode menu on. The landing and sign-in pages lie whichever way the screen does, so a player can sign up holding the phone upright.
- **Native iOS app** (`ios/`): allows portrait for the landing and sign-in pages, then locks to landscape from the game mode menu on.
- **Web version held upright** (browsers can't lock orientation on iPhone): past the sign-in page it asks the player to turn the device. It waits for the device to turn (with a note to switch off rotation lock). It re-measures until a rotation settles, then re-lays out the hand and map.
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

## Accounts

Everyone plays with an account: there is no guest play. Sign up with an email and a password, or with Apple or Google; a new account must tick that it agrees to the **Terms of Service** and the **Privacy Policy** (`public/terms.html`, `public/privacy.html`), and the server records which versions it agreed to, and when.
- **Two kinds of progress.** The **save** (name, decks, campaign, settings) is the player's own: the device keeps a copy and syncs it to the account a couple of seconds after each change, and takes up a newer copy from another device on opening. The **economy** (level, experience, stardust, flux, the collection, rank, record) is the **server's alone**: the device only shows a copy, and every change is asked of the server.
- **The server does the economy's actions.** It opens boosters (with the game's own rules, running on the server), crafts and breaks down cards, and pays rewards. Editing a device's storage changes nothing that counts: the server never reads the economy from a device.
- **Rewards.** Online games are paid by the room that ran them (unranked: once the game has gone at least 3 rounds; ranked: by the ladder, which also keeps the rank). A game against the AI (quickplay or a campaign battle) is noted by the server as it starts; its reward is claimed once, when it ends, and paid only if it lasted at least a minute (and no more than a day), up to 40 rewarded games a day. That game runs on the device, so its result is still the device's word; these limits keep what a forged result could earn small.
- **New accounts** start with the starter cards and the price of a first booster. Progress from before accounts (a device's old local economy) isn't carried over, as it couldn't be trusted.
- **Ranked** keeps its rank on the account; the server takes who you are from your session, never from the device.
- **Password reset** by email (Resend): a one-hour, one-use link; setting the new password signs out every other session. Without the email settings, the game doesn't offer it.
- **Sign in with Apple or Google:** their signed ID tokens are checked on the server (the provider's public keys, our app id, expiry, and a nonce from this sign-in). A verified email that already has an account joins that account. Not in the native app yet (Apple and Google don't allow their web sign-ins in an app's web view: that needs a native plugin).
- **Signing out** takes the account's progress off the device. **Deleting the account** (profile → delete account; with the password, or by typing DELETE for an Apple or Google account) removes it and everything in it.
- **Security:** PBKDF2-SHA-256 password hashes (100,000 rounds, a salt each); session tokens stored only as hashes, in an HTTP-only cookie (the native app sends a Bearer header); attempts rate-limited per email and per address; the account API is never served from the offline cache.
- **Code:** `server/accounts.ts` (the API), `server/auth.ts` (hashing, tokens, ID-token checks), `server/economy.ts` (the economy's rules), `migrations/` (the D1 schema), `src/ui/account.ts` (the client). Tests: `tests/accounts.test.ts`, `tests/economy.test.ts`.

## Progression, collection and ranks [design review]

Outside a single game, each player has a **profile** (kept on their device): a level, two currencies and a card collection. Players **sign in** (a name) before the hub. Each account is dealt a **picture** at random when it is made: a card's artwork (any card in the pool, not a token), cropped to a circle, kept by the server (`users.avatar`; an account from before pictures is dealt one the next time it loads). Their chip sits top right on the hub and in the shop (picture, name, level, both currencies); tapping it opens the whole profile (level and experience, currencies, rank and record), with **log out**, which returns to the title screen (the hub has no back button: you log out to leave it).
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

**The collection.** Every card is unlocked: every player has every card, as many copies as a deck can hold (two, or one of an Anomaly). Saved collections are topped up to the full set on load (on the client and the server). Boosters and crafting still work, but every copy now comes as flux.
- **The deck builder:** the deck is a column of pills, one per card, each in its card's colours (by rarity) with its picture, type and count; tap one to take a copy out. The card view has a search (name and text) and filters for race (any, the races this deck's cards come from with neutrals, neutral only, or one race), type, rarity, collection (owned, not owned, or craftable now), characters, and cards already in the deck, sorted by race, name, type or rarity. The ⟁ tag under each card opens crafting. **Deck codes:** each deck's share button shows its code (`BL1-…`, the name and cards as text) to copy and send; **import** on the decks page takes one in. **Community decks:** a finished deck of your own can be shared to the community page (not a starter, nor a starter's cards as they come), credited to the name its player goes by in the game, with a note; anyone can look through it or save a copy (each player counts once towards how often it was saved), and take down their own. A deck can be saved with cards you don't own yet, as something to work towards: its box says how many are still to collect, the builder marks those rows (dashed, "need 1") and totals the flux to craft them, and it isn't offered to play until it's complete. Names players go by, and shared decks' names and notes, pass a **profanity filter** (`src/engine/profanity.ts`: whole words with common endings, look-alike letters and stretched or spaced-out spellings caught, innocent words like Scunthorpe or Dickens left alone): a name is turned down as it's chosen (and, should one get past, shown to others as a plain one), a deck is turned down as it's shared. [direction: share decks in the game, credited, so players needn't go to other sites; save a list and work towards it; no starters; profanity filtered] Each card's ⤢ button (or a right-click on any card, anywhere; a long press on touch) shows it large.
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
  - a blue shield ring around that. While shields are up, a **dome of hexagons** stands over the sun (ray-traced into the board's perspective like the sun: its far side under the sun, its near side over it), brighter the more shields are up, shimmering faintly. The shield count is a badge by the sun, beside the planet tag, drawn as the shields symbol printed in card text (outlined in the shields blue, the number inside); it pops when shields go up, and is pale and faint at none. [direction: the hex lattice shields; shield icons back by the sun]

  The sun burns from pale gold to amber to red as it nears supernova, frosts blue below 0, and pulses when within 4 of supernova. [design review]
- **Hits read clearly.** [design review]
  - A bolt flies from the attacker's sun to their rival's.
  - On landing, the numbers rise off the sun: a red "+3" for heat taken, a blue "−2" for cooling, and "⛨−2" for shields lost.
  - The sun flares and shakes; cooling frosts it; blocked heat flashes the shield ring.
  - When your own sun takes enemy heat, the edges of the screen burn red with a heavy low blow. Heat you deal lands with a bright crack, and shields that block ring with a glassy clang.
  - Numbers on a sun keep their old value until the bolt lands.
- **Dawn forecast, symbols centred between the tableaus.** They show what that player's next dawn will do, net of all their cards. Heat at their rival, shields, cooling, heat to their own sun, extra cards and extra plays, each as a symbol and number. The totals include resonance, Heroes' choices, growth, conditions, the global card, regional instability and the map, before shields or Lightspeed cards answer. Everyone can see what's coming and respond to it. [design review]
- **Removal is shown before it happens.** A glowing white arc draws from the removing card to each card it destroys, returns or erodes. The target glows under it while the arc holds, then a destroyed card dissolves in its slot and a returned card flies back to its owner's hand. [design review]
- The rotating white star lies on the right of the table.
- Your hand fans along the bottom, with your deck and discard piles either side.
- Discard piles (yours and your rival's) can be looked through. Decks can't, your own included: with 30–40 cards, knowing exactly what is left to draw was too easy an edge. The board shows only how many cards are left. [design review]
- The upgrade rail sits on the left, and the "plays left" pips and End Turn on the right.

When a card needs a choice, you make it on the board and a short prompt appears at the top of the screen:
- which rival card a removal card destroys or returns
- which empty slot a card goes in (each shows its defence; the prompt reminds you the middle is safest)
- which of your cards Phase Shift returns, or Stasis Field restores

Small dialogs handle the other choices:
- Command Directive's upgrade
- what to recover from your discard pile

A face-down Lightspeed card lies in its owner's Lightspeed slot, right of their five, with no defence. You can tap yours to read it; a rival's shows only its back. When one springs, a "Lightspeed!" banner names it. The card that sprang it is shown where a played card is (middle right), plain and readable, and the Lightspeed card beside it on the left at the same size, tagged and glowing, with a caption saying what happened ("X springs Null Field in answer to this"); after a few seconds both fade. Press and hold any card to read it at the middle right of the screen. [design review]

**Dawn, effect by effect.** When a day starts, its effects play out one after the other, in the order they happen: regional instability (from the top of the screen, striking both suns together as the gauge throbs red), the table, then each card left to right. Each card lights up as it fires, and its effect flies from it to the sun it reaches: a flare of heat to the rival's sun (or its own, for a drawback), a cooling beam or a shield beam to its owner's. That sun's numbers change as it lands, with what changed floating over it. A card on its last turn fires, then fades once the replay is done. The AI waits for its dawn to finish before it plays.

**Reading the rival's cards.** Each card a rival plays (or sets face down) flies in from their side of the board (with a sound) and waits at the middle right with an "OK" button (or press Enter). With **auto-confirm** on (settings), it waits 2 seconds and lands by itself. Its effects only happen once you press it (then the card lands and its heat, cooling and so on play out), and the rival goes on after that, so there is time to read every card. Against the AI, it waits for you. Online, the room holds the player who played the card ("<rival> is reading your card…") until their rival confirms, unless the rival disconnects. Hot-seat games skip this, since both players share the screen. [design review] A removal card on the stage draws a held arc to the card it will destroy, return or erode, until you press OK.

**Placing a card.** Every card that stays in play waits for you to click the slot it goes in, even when only one slot is open, so a misclick never plays a card. A card is **placed first, before any of its abilities are chosen**: it then stands in its slot (glowing, not yet down) while you pick its option, the rival card it removes, or where its heat goes, and the heat it would deal is previewed on each target from where it stands (its slot's forge and resonance counted). The exceptions are recall cards, which pick the card they recall first (they may take its place), and Fusion cards, which pick the card they fuse onto. While a card waits, clicking anything that isn't its next step puts it back in your hand, and clicking another card in your hand plays that one instead. Cards that fade at dawn leave one at a time, like the opening hand being dealt in reverse. Each player's hand size shows in a small bar beside their piles (above yours, below theirs).

## Campaign mode

A roguelite run through dying universes, played with the card game. Code: `src/engine/campaign.ts` (rules), `src/engine/meta.ts` (petals and lasting upgrades), `src/engine/story.ts` (story and dialogue) and `src/ui/campaign.ts` (screen). Saves under `blue-loop:campaign:v6` (older saves can't be resumed); lasting progress under `blue-loop:runs:v1`, both synced to the account.

**The loop.**
- Each universe is a thin strip: you arrive at a lone system in the middle of the near end, with a route into each of **3 lanes**; the lanes run 7 columns, and the wormhole lies in the middle past the far end, so it is about 8 moves away, linked along the lanes, by non-crossing diagonals and by rungs between lanes. You begin in column 0; the **wormhole** lies past the far end. Move freely, backwards too.
- **Every move is a turn.** There is no end-turn: when the flagship has made its move (and any battle or card choice it brought on is settled), the raiders move and the collapse comes on at once. **Wait** holds position for a move. Changing the deck or repairing costs no move. (Fold drive gives two steps to a move.)
- **Regional stability** runs down one with every move (8 moves in universe 1, 2 fewer in each universe after, never below 3; +1 a level of Anchored space). Once it is spent, **the collapse takes one whole column with every move** from the near edge. A collapsed system is gone, with any army in it; if the flagship is caught, the run is over.
- The **Stellari** open the wormhole. Its guardian (the Wardens) must be beaten to cross: a boss battle that grows with the universe.
- Crossing takes you to the next universe: stronger garrisons (tier +2 a universe), better loot, and stability that runs out sooner. The loop never ends; every run ends in death.
- **Petals:** at each wormhole you grab 3 + 12 x (share of the strip's systems you conquered) petals (+20% a level of Petal pouch). They are banked at once and survive the run.
- **No rival empires:** only garrisons in the systems. (There are no raiders: they were removed, and any in an older save are cleared out.)
- **Conquest:** beat a system's defenders and it is yours, with no choice to make: it pays its yield once, your flagship moves in, and it counts toward petals. There is no supernova, no settling, no income by the turn, and nothing to manage in a system you hold (no garrisons, reinforcements, fortifications or repairs). Research still builds each turn. Some planets carry a **bonus** of credits or research, paid on capture.
- **Finds, and the unknown:** what a system holds is never shown: no rewards or numbers over the stars, and its popover reads "unknown" (with what its star suggests). Flying in reveals it: either defenders (the battle opens as the ship arrives) or a find, taken with no fight (a toast says what): a drifting treasury (credits), a depot (materials), an archive (research) or a derelict (a card to choose from three). Only the wormhole's guardian, and raiders seen standing in a system, are known foes, attacked after a look at the matchup.
- **The star tells the odds** (STAR_FINDS): an ordinary yellow star is a find about 1 time in 5 (anything); a red dwarf about half the time (mostly materials); a white dwarf 2 in 5 (mostly research); a brown dwarf more often than not (mostly a derelict's cards; guarded ones have +3 max health); a neutron star rarely (cards or research, and its battles are volatile).
- **The map** is the whole strip, shown whole when the campaign opens (and on recentre), which the player can then orbit, zoom and pan (see Navigating, below). Every star is the same small size (its kind shows in its colour and light); the Stellari is the home screen's flower, small (thin white petals, translucent), just above the wormhole's star. Ships are small, with no portrait over them. Routes are drawn flat over the map between the stars as they stand on screen, so the lines of light stay crisp. There are no names anywhere on it: systems are their stars, sitting on the nodes where the routes of light meet, and anomalies are only what surrounds them (no labels, and tapping one tells nothing: what it does shows in a battle fought in its reach). The strip lies **in a landscape**, in 3D (src/ui/nebula3d.ts, nebula-geometry.ts): a mesh of soft hills and ridged mountains in the board's paper, softly lit, with a fine ink mesh drawn into it and faint splashes of gold, rose and sea blue here and there. It lies low in a shallow valley under the strip, rises into mountains behind it, hills at its ends and lower ones in front, and fades into the paper at its edges and far off. Stars hang over it (mostly ink, a few in colour, twinkling) and comets streak across the sky now and then. **Instability breaks it**: the ground is cut in advance into shards, and the column marked to collapse cracks along their borders (glowing with the colours beneath, the shards shivering); as columns collapse, the land up to them breaks away shard by shard, turning and falling, and exposes a starry sky beneath in full colour (stars at several depths over drifting clouds of magenta and blue on deep space), seen through every hole from any angle. The map's things are 3D objects in the same space (src/ui/nebula-objects.ts): each system's star a shaded sphere in its kind's colour with a soft glow (ringed in its holder's colour when held; greyed when dimmed, a small ember when gone), a black hole a black sphere in a turning gold accretion disc, a pulsar a white core with two beams wheeling round (a neutron star's beams too), dark matter dark motes orbiting nothing, and a nebula anomaly pale puffs turning slowly. Gas between the eye and any of them hides it. The routes are paper-white lines edged in ink, the rings where the flagship can go dashed paper, and the marks over systems small round paper tokens. The strip lies on a flat plane through the gas: its stars, rings and ships are laid on that plane from the nebula's own camera, the stars turned to face it, and the routes drawn between them; gas between the eye and a system veils it (drawn lighter over the map). **Navigating:** a drag orbits round the strip, the wheel or a pinch zooms toward the pointer, a right-drag (or shift-drag, or two fingers) slides over it; a recentre button (bottom left) glides back to the whole strip. Each universe has its own nebula (seeded), worked out in a worker. Where WebGL is unavailable the strip lies flat on the page, fitted to the screen, as before. There is **no fog**: every system and route to the wormhole is in view from the start. Each system's star is the stellar gem's sun (as on the cards), its disc turning slowly inside a breathing corona; red dwarfs are smaller and red, brown dwarfs dim embers, white dwarfs and neutron stars the white dwarf gem's searing point. Held routes are tinted in the holder's colour. Little else moves: target rings are still, pulsar beams and nebulae turn slowly.
- The strip carries 2 armouries, 2 research stations, 2 anomalies and 3 bonus planets; scanners widen what you see.

**Lasting upgrades** (between runs, on the setup screen, bought with petals):
- **A stronger start:** War chest (+3 credits), Stockpile (+3 materials), Old charts (+2 research), Veterans (another race card in the deck), Requisition (choose a card for the deck).
- **A tougher flagship:** Reinforced hull, Shield emitters, Armoured rooms (+1 room defence), Fold drive (one more move a turn).
- **Perks:** Anchored space (stability holds a turn longer), Trade friends (armoury cards 1 material cheaper), Petal pouch, Scavengers (one more salvage choice).
- **Unlocks:** the first four races and each race's first hero are free; the other races cost 10 petals each, later heroes 6.

**The story.** The universe is dying: star by star the light is failing. The Stellari, the last flowers of light, open wormholes to younger universes, and each run is a flagship racing the collapse to reach one.
- The **Aureline** were the flower's first keepers. They called it **Vitalia** ("life-giver"), lost it, and were nearly wiped out in the war that followed. What is left of them is coming home.
- The Xel'Naru need light for the crystal that holds their memories; the Vorthane's oceans are freezing; the Ixquor hive is starving.
- The guide is **Oriel the Wanderer**, a neutral oracle who speaks to every race alike. Oriel opens the campaign and comments at each moment that matters: the first conquest, a Stellari bloom sighted, claimed or wilted, the first star to dim, the Heart sighted, an army broken, a rival race met or fallen, victory and defeat. Generals speak too: on joining, and when a rival race is first met (its general taunts, yours answers). **[Oriel no longer speaks on the map, and her guided tours (of the map and the first campaign battle) are gone: only the generals' lines show.]**
- One thing at a time, at most: the guidance panel shows a single line (a portrait, the speaker and the line) with an always-visible × to dismiss it, never blocking play. A newer word replaces an unread older one.

**Setup** (titled "a dying universe", as is its tile on the menu). The races run down the left (locked ones show their price in petals). On the right, the picked race's card (its style, bonus and nerf) beside its sub-race cards, and below them its three heroes, each a card with its art, rarity, sub-race and ability. The petal button (top right) opens the upgrade shop and the best run. Begin run starts with the race and hero picked, once both are unlocked.


**The flagship.**
- Each faction flies **one flagship**, led by its **hero** (one of the race's Hero cards: the two leaders, or the race's bomb Hero, Empress Solenne, The Shardmind, Leviathan Thoross or The Worldroot). There is no recruiting.
- Its deck **starts with 10 cards**: the hero, two each of the race's first two attacks and first defence, and three plain neutral cards (Coronal Lance, Deflector Grid, Heat Sink). It grows with every card found: salvage goes straight in, and cards from space stations and mission rewards wait in the reserve until put in. It has no most, and 10 is its least. No other Hero may come aboard; the hero can't be taken out.
- **Ships.** On the map each flagship is a little 3D ship of its race (an Aureline sun-barque of white metal and gold, its sun carried between two pylons, a bridge forward and twin engines astern; a Xel'Naru shard of dark faceted crystal under crystal spires; a Vorthane living raft under a great glassy bell; an Ixquor chitin seed pod on spined legs with a glowing cap; the Lost Races fly holed, rusted derelicts), built in static CSS 3D, trimmed in its faction's colour, with its hero's portrait above it. Every move is sailed: a move glides down the route; an attack runs halfway down the route before the battle opens, then sails on into the system if it falls, or turns round and comes home if it doesn't.
- **One move a turn.** The flagship steps along a route into one of your own systems, or attacks a linked system. Tap it to pick it: its routes light up.
- **Damage** stays with the flagship (its sun starts battles hotter). Repair it for 1 credit a point, or all at once.
- **Refitting** (the deck, repairs) costs no move.
- Beaten, it **falls back** to a free system you hold next door, else any open neighbour (further along first). The run ends when the flagship is lost.

**The hero** (the base's hero tab) grows with the flagship:
- **Experience:** 20 for a battle won (defending: 16), 6 for one lost or a system that surrenders. **21 levels**, each a little further than the last (10, 22, 36, 52 … 580 experience); each level after the first gives a skill point, 20 in all.
- **Training:** a skill point can go into the hero's own **attack** or **defence** (+1 each in battle, up to 5 each). The hero starts with +2 defence (they always sit in the command room) and their card's own attack; training attack lets even a hero without one fight.
- **Skill trees: the hero's own card.** Every skill is a **boon on the hero's card**: an ability it carries while it is in play (like a Fusion card's), lost when it leaves. Each of the twelve heroes has **18 skills: three branches of six**, learned in order up a branch. **Might** is the card's attack (dawn heat, heat as it is played, piercing), **Ward** its defence (Sturdy, stability, shields, Bulwark, repair), and **Legacy** the race's way (Aureline shields and energy, Xel'Naru draw, Vorthane shields and Tidewall, Ixquor Saplings). Tiers 1–5 are the race's; the tier-6 capstones of Might and Ward are the hero's own and change the battle (Solar Judgement: dawn heat 3; Endless Tide: dawn 5 shields and Tidewall; Singularity: +2 energy a day; Brood Mother: plants 3 Saplings...), and Legacy's is **Herald**: the hero starts every battle in play, instead of being drawn and played. Tiers 1–3 cost 1 point, 4–5 cost 2, capstones 3: the whole tree costs 30, so with 20 points a hero masters about two branches. Army-wide effects (energy, marching, sight, repair, Dread) are research now. (Older saves get their heroes' points back.)
- **Gear** is boons on the hero's card too. Every hero has a weapon slot (dawn heat 1, 2, or 2 piercing), and their race's armour: the Aureline a helm (Sturdy), a mantle (dawn shields) and a sigil (cards, then energy); the Xel'Naru a core (cooling) and two facets (stability, heat, pierce); the Vorthane a helm and four rings (a ring on each of many tentacles: stability, a shield, repair); the Ixquor a carapace (Sturdy) and two glands (cooling, then Saplings). Gear comes in three qualities (worn, bright, starforged); better gear gives more.
- **Finding gear:** the flagship, taking a system, finds gear 35% of the time (more with Salvage Crews research), better the deeper the system lies. It waits in the faction's stores until a hero wears it.
- **The hero tab:** the hero and their training on the left; the hero in the middle, drawn as their race's outline (robed Aureline, crystal Xel'Naru, a domed, many-tentacled Vorthane, an insect Ixquor) with a socket for each slot where it sits on the body (a Vorthane's rings on its tentacles), worn gear glowing in its quality, and their stores beneath (tap an empty socket to see what fits it); and on the right their skill tree, drawn as a constellation in a night sky: the hero at its foot, three branches of six stars rising from them (Might, Ward, Legacy), each skill a star with its kind's glyph, bigger for bigger skills (the capstones spiked diamonds in turning rays), the learn button showing its cost. Learned stars and the lines between them burn gold; the next ones you can learn pulse blue; the rest are faint. Tap a star for its details and to learn it.
- The AI's heroes learn and equip too.

**Stations.** 2 armouries and 2 research stations lie in columns 2 to 6 of each strip, shown by a crate or a ringed flask on the system and in its popover. Bring the flagship to one (it has to stand there, so the system must be yours) and **visit** it.
- **Space stations** stock **6 different cards, each sold once**, for materials: 3 for a White Dwarf, 5 for a Stellar, 8 for an Anomaly, +1 for a race card. Mostly dwarf cards, with a fair chance (60%) of one rare (Stellar, or now and then an Anomaly) among them; a quarter of space stations are nothing but dwarfs. **Within an anomaly's reach** the odds are better: almost always a rare, often two, more often an Anomaly. Its keepers recycle and fuse too (below). A sold-out space station shows as such.
- **Research stations** have **one upgrade** each, taken once by whoever pays for it first, in **Wisdom** (which builds 1 a turn): 3, 5, 8 or 12 by its tier. Upgrades are the old research projects: **Power** Cryo Reserves (sun starts 1 cooler), Fusion Cells and Stellar Taps (+1 energy a day each); **Armour** Hardened Hulls (+2 max health), Field Repair (repairs 2 heat a turn), Stellar Plating (+3 more), Nanite Swarms (2 more repair); **Command** Salvage Crews (gear more often), Battle Doctrine (+1 opening-hand card), Terror Broadcasts and Shadow of Empire (Dread: weak neutral systems surrender without a battle); **Navigation** Deep Scanners (sight), Jump Lanes and Fold Drives (a route further each turn). Each station's is different while they last. Stations far from anomalies have early (tier 1–2) upgrades; those within an anomaly's reach, deeper ones (tier 2–4). A taken station shows as such.
- The AI makes for stations it can use, buys the best cards it can afford, and takes research when it has the Wisdom.

**The ship** (the base's ship tab): the flagship drawn large, its five rooms (where its cards stand in battle, left to right as on the board) and its command room (the hero's) beneath. Pick a room to upgrade its **walls** (+1 defence for the card in it, up to 3) or its **guns** (+1 attack for a card in it that attacks, up to 2); the command room's **bulkheads** (+1 defence for the hero, up to 3 more; it starts at +1, so 3 in all with the slot's own 2); and the ship's **shields** (up as each battle begins, up to 3) and **hull** (+1 max health a level, up to 4). Each costs credits: 4, then 4 more for each level built. The AI upgrades its command room and middle room first.

**Battles** are the card game, on its own board and by its own rules (cards fade, a destroyed card goes to the discard pile, an empty deck shuffles it back in, Draw draws). Only a few things are the campaign's (`GameSetup.campaign`, game.ts):
- **Ship to ship.** Each card stands in a room of its ship (the tableau's five slots): the room's walls and guns add to its defence and attack. The **hero leads from the command room** (the Hero slot) once played, with the room's and their training's defence.
- **A small deck reshuffles straight away.** An empty deck takes its discard pile back at once, as in the card game. (It used to wait a day for every card it was under 10; small decks were unworkable.) [direction: remove the wait]
- **The rooms show on the board:** an empty slot carries its room's walls, guns and module as marks; once a card stands there, the card carries them along its top edge.
- **Small decks.** A campaign deck can be small: with nothing left to draw or shuffle back, it gives no more, without the strain (its sun would burn out before the battle began).
- **The base on a phone held sideways:** the deck pool shows one row of readable cards a page (it would show two on a taller screen); the hero tab keeps the training buttons under the portraits; the ship tab shrinks its room buttons to fit inside the rooms and puts the modules beside the ship.
- **Losing:** your sun goes supernova.
- **Who defends:** the flagship standing in the system, if there is one, else a hero of the owner's one route away. Otherwise the system fights as a **station**: a deck that starts at 10 cards, as the player's does, and grows by 2 a tier up to 20 (the wormhole's guardian 12 and more each universe), walls as thick as its tier (+0 to +2 defence in every room), its garrison and its fortifications, and **no hero**. A held system's station has its owner's race's cards among them. The Lost Races fight with their leader and a few cards.
- After a win the system is taken at once (see the loop).
- **The attack dialog:** your flagship against the defender (portraits and names), then a few plain lines on whatever tips the fight, and three buttons: fight, auto, back. Defending shows the same, from your side.
- Battle modifiers stack: the system's anomaly, the Wardens and the core (below), and the ship's hull.

**The map.**
- The strip (above), all of it in view: no fog, and no scanners.
- **Defending a neighbour:** a system with no army in it is defended by its owner's hero **one route away**, if there is one (the least battered, if several). They come to its aid: if they lose, they go home battered (full damage) rather than being routed. [direction: heroes defend systems one move away]
- **Sun health rises along the strip.** In a campaign battle both suns start from the same max health, set by the garrison's tier (see Depth); the wormhole's guardian has 2 more.
- **Depth:** garrison tier rises along the strip and with each universe, and with it the defenders' decks, rooms and sun health (10 + 3 per tier, at most 30).
- **Enter ends the turn** on the map; while an army could still move it asks first ("end your turn?", naming them): Enter again ends it, Escape keeps playing. [direction: enter should end turn in the campaign, with a warning]
- **Tutorial:** none in the campaign any more (Oriel's tours of the map and the battle board were removed, with their settings).
- **Ship modules:** one-of-a-kind items fitted into the flagship's rooms (the ship tab: pick a room, fit a module from your stores, swap or remove it), one to a room. In battle, whichever card stands in a room carries its module's power, the way a hero carries their gear: Coolant Loop (cool at dawn), Shield Emitter (shields at dawn), Targeting Array (piercing dawn heat), Overcharged Lances (dawn heat), Autoloader (heat as a card is played into the room), Ablative Plating (Sturdy), Repair Drones (repair at dawn), Bulwark Projector (Bulwark for its neighbours) and Decoy Beacon (Guard). Each comes worn, bright or starforged (1, 2 or 3).
- **Finds:** the winner of a battle searches the wreckage: gear for its hero (35%, more with Salvage Crews) and a ship module (35%), finer the deeper the system lies. The player's are shown on the battle's result, above the salvage pick, and go to their stores; the AI wears and fits its own at once. (Gear is no longer found on taking a system after a battle, only on one taken without a fight.)
- **The hero is in the deck.** A flagship's hero is drawn and played like any card (only one who has learned **Herald** starts the battle in play), so their own play effect and their "as it is played" boons fire as they are played.
- **Salvage:** after a battle you win, still on the battle screen, you're shown up to **3 different cards from the beaten side's deck** (never a Hero) and take one (or leave it). It goes **straight into the flagship's deck** (into your reserve only if the deck may not take another copy). A flagship's deck has **no most**: once it reaches 10 cards, 10 is its **least**, and cards come out of it down to 10, no further. [direction: every card into the deck; 10 becomes the minimum] A battle auto-resolved offers the same choice on the map.
- **Kinds of star** (about 42% of systems; never the home or the wormhole). Each has a gift and a cost:

| Star | Gift | Cost |
| --- | --- | --- |
| Red dwarf | Never dims; the last of its ring to collapse | 1 credit less |
| White dwarf | +2 materials | Battles there are long: every sun starts 2 cooler |
| Brown dwarf | Its defender has +3 max health | 1 less of each |
| Neutron star | +2 credits, +1 material; its holder sees two links out | Battles there are volatile: every sun heats 1 a day |

  On the map, an unheld star takes its kind's colour, and the kinds differ in size; a neutron star's beam sweeps round.
- **Raiders:** removed (none roam the strip).
- **Fog of war:** you see your systems, the systems around your armies, and those linked to them. About one system in six has a **scanner array**; hold it and you see two links out from it.
- Selecting a system no longer moves the camera: the system shows its planets orbiting where it stands, and the map around it stays as it was.
- **The others' turns:** after you end your turn, the other factions move one at a time. Those in sight (any of their systems or armies in view) are shown on a waiting card (who is moving, and a short feed of what they do that you can see); those out of sight move unseen and at once, so with none in sight the next turn simply begins. You only learn what happens within your sight lines: every log entry names the systems it happened at and who acted. A battle against you pauses the others; finishing it carries on.
- **End turn** pulses once nothing is left to do (the flagship has moved, is refitting, or has nowhere to go).
- **Base** is a larger button at the bottom middle of the map, with a house icon (on hover it lifts and the house hops), tagged "new" when your hero has skill points to spend or gear to wear. There is no log button, and no zoom or home buttons on the map (pinch, scroll and drag).
- Tap the turn box (top left) to open the **overview**. Beside it, the regional stability meter (the same height); the resources and your armies' portraits are centred; the buttons sit on the right.
- **Guidance:** story lines appear in a small panel under the turn box, never blocking play: read on, or dismiss. While a dialog is open (a battle, a conquest, a sheet) the panel waits; it never sits over one.
- **Conquest:** a small dialog of three choices, each with one line (what it pays); the rest is in its tooltip. (Oriel no longer speaks on the map.) Settings could once turn Oriel off entirely (generals still speak).
- The board, the Milky Way sky and the settings work as before.

**Winning.** There is no winning a run, only going further: cross as many wormholes as you can and bank petals for the next.

**Economy.**
- **Credits** upgrade the ship and repair the flagship.
- **Materials** buy cards at space stations (each card once) and fuse them.
- **Wisdom** builds 1 a turn and buys research stations' upgrades.
- **Your turn:** each of your turns opens with a "your turn" banner (the battle's dawn banner), once the other factions have moved.
- **Map popovers:** tapping a system, an army's ship or an anomaly opens a small popover beside it (no side panel). A system's facts are a row of icon chips (yield, star type, garrison, damage, scanner, bloom, hazards, anomalies in reach); tap or hover a chip for its words. Below them are what you can do there: attack, visit its station (with your flagship there), its flagship, its garrison (tap a card to recall it), fortify, repair, station a card. An army's popover sits on the far side from its routes, so they stay clear to tap.
- **Base:** a full-screen view with four tabs. **Deck** is the main deck builder (filters, pages, card sizes) on the flagship's deck: its pool is that deck plus your reserve, and each tap moves one card in or out at once. **Hero** and **Ship** are above. **Missions** lists your missions. A space station, visited, opens the same full-screen builder without the deck list: the side panel holds its keeper and the card picked.
- **Armoury keepers:** Quartermaster Hesk sells the stock; Mother Tallow recycles and fuses. Each greets you with a line on the state of the universe (quietly echoing our own: spent resources, recycling, warming), a different one each visit.
- **Recycle (at an armoury):** break a reserve card down for half its armory price in materials (at least 1). The counter to a reserve full of cards you won't use.
- **Fusion (at an armoury):** merge two reserve cards into one that does both, for materials (4 plus both cards' armory prices by rarity). It cannot be undone. A fused card costs both its parts' energy together (a pair costing more than 4, a day's most, can't be fused, nor can cards that spend all your energy). Command, global and Lightspeed cards can't be fused, a fused card can't be fused again, and two cards that ask for the same kind of choice can't be fused together.

**Systems you hold** are not managed: no garrisons, fortifications or repairs. (Garrisons and fortifying were removed with the roguelite loop.)

**Anomalies** give battle modifiers:

| Anomaly | Boon | Cost |
| --- | --- | --- |
| Black Hole | +2 max health | Opening hand 1 card smaller |
| Nebula | +1 shield every day | Sun starts 1 hotter |
| Dark Matter Cluster | Draw 1 extra card every day | Sun heats by 1 every day |
| Pulsar | Sun cools by 1 every day | 2 less max health |

**Balance notes (simulator).**
- A run bot (auto-battles, always pushing forward, no upgrades) crossed universe 1 in 4 of 12 seeds (6 petals each) and died in universe 2 every time. Upgrades are meant to carry later runs further.

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
- **The limit is gone (later).** It read as a bug in play: a card played after a big dawn simply did nothing. Without it, 400 starter games run 11.8 rounds (12.3 with it) and the starters' win rates move by a point or two. A pure-attack Aureline deck (2 Sol-Marshal Aurex, Solarch Veyra, Lancers, Archons, Focusing Arrays, Chorus, War-Heralds, Sunforges, Dawnblades, Siege Arrays, Squadrons) goes from 56% to 64% against the starters (100 games each, about 8 rounds): Solar Lancers 66%, Shard Overload 76%, Hive Bloom 83%, and Abyssal Tide still beats it 70% of the time. Its counters are shields with Sting and Soothe, Guards and Lightspeed guards, and cooling.
- Alongside the limit: Focusing Array is now Forge 1 (attack cards next to it +1, not every attack card), Aurelia +1 per 2 attack cards (up to 3), Chorus of Dawn up to 3, Solar Battery +1 with 3+ attack cards, and Siege Array +1 per 3 attack cards (up to 2). Shard Reactor no longer heats its own sun: the limit took the edge off the Xel'Naru burst plan, and Shard Overload fell to 38% without this.

**Card costs.** Each card takes 1 of your day's actions. Anomalies take 2, as do Sunspear (6, pierce) and Fracture Burst (7, pierce), and each is buffed to match. Your first day has only 1 action, so these come out from day 2. The AI weighs the second card it gives up. With costs, the starters sit at 47–53% (400 games), with seats 50/50, and the pure-attack deck is at 50.5% against them.

**Are the starters weak for keeping to one race?** `npm run deck-search` builds random legal decks and plays each against all four starters (16 games each). Random cross-race decks average 44% against the starters, and random single-race decks 46%. So the starters beat an average random deck either way. The best random decks reach 88–100%, and the very best leaned on neutral cards with a mix of races. Mixing races may help, but 16 games a deck is too few to be sure.

**Energy (replaces plays and actions).** Cards cost energy, shown by the gem on each card: green for 1–2, gold for 3, red for 4, grey for 0. You get 1 energy on your first day, 2 on your second, then 3 a day. The industrial planet gives +1 energy (it used to give +1 play), and energy cards add more on top, with no ceiling. "Play N extra cards today" now reads "+N energy today". Costs live in `src/engine/costs.ts`:
- **How they were set:** each card was rated on its raw output (heat, cooling, shields, draw, removal, dawn effects over its stability, passives), then priced: weaker cards 1, stronger ones 2, bombs 3, Commands 2. Relay Station is free.
- **Four 4-cost bombs, which need bonus energy to play:** Fracture Burst (8, pierce), The Sun Throne (draws 2), Harmonic Singularity (Resonance 3/2) and The Brood Queen (heats 2 every dawn).
- **After simulating:** Hive Bloom won 83% at first. Its cheap engine was underpriced, so Rot Bloom, Compost Cycle, Hive Rooting and Spore Husk went to 2, and Hive Relay (+1 energy every day) to 3.
- **Result (AI games):** starters 46–57% (400 games), seats 52/48, games 14 rounds. The expensive synergy-attack deck wins 31% against the starters, a cheap all-attack deck 67%, and the shield/sting wall deck 14% (its key cards now cost 2–3). Curve matters: a deck of bombs can't play them fast enough.

**Heroes: heat, cool or energy.** The draw option was never picked in simulation (0 times a game), so it became **+1 energy** at each dawn. Dawn energy is banked and added once the day's energy is set. The AI values it at an energy's worth, scaled down when it holds fewer than 4 cards to spend it on. In 400 games it picks heat 0.8 times a game, cool 2.9 and energy 1.3. Starters sit at 44–57%, seats 50/50.

**Defence that answers at once.** Walls fell to 14% once energy came in, because their persistent cards cost 2–3 and took days to pay off. Eight new defence cards protect as they land, and keep going:
- Frost Bulwark (2): Cool 2, Shield 2.
- Dawn Rampart (2, Aureline): Shield 2, Cool 1, then Shield 1 each dawn.
- Glacier Shell (3): Shield 3, then Cool 2 each dawn.
- Prism Sanctum (3, Xel'Naru): Cool 4, then cooling each dawn, more while overheated.
- Chitin Fortress (3, Ixquor): Sturdy, Shield 3, then cooling each dawn.
- Stellar Aegis (4): Shield 10, Cool 3.
- Solar Bastion (4): Shield 6, Cool 2, then Shield 2 and Cool 1 each dawn.
- Leviathan Shell (4, Vorthane): Shield 6 that never fade, then Shield 2 each dawn.

A wall deck built with them wins 50% against the starters and 86% against the cheap all-attack deck (67% against the starters), so aggro has a counter again.

**Supernova flicker.** The explosion's pulse animated `transform: scale(...)` on the sun's holder. That wiped out the `translateY(-50%)` centring it, so the sun dropped half its height for the length of the burst. It now animates `scale` on its own, which adds to the transform instead of replacing it.

**Race cards over neutral ones (second sweep).** A race card that does everything a neutral card does, and more, for the same energy makes the neutral card dead weight in that race's decks (Shard Splice was Thermal Graft with a free Cool 1). `RACE=1 npm run dominated` now counts those too (and attunement), and found 19 pairs; `tests/dominance.test.ts` keeps it at none. Where the race card was simply too good for its cost, it costs more; otherwise the neutral card got an edge of its own:
- **Cost more:** Shard Splice 2 (was 1: beat Thermal Graft), Tidal Graft 2 (beat Shield Lattice), Bell Warden 2 (Guard, Sturdy, Tidewall and 3 shields a dawn for 1), Bastion Node 2 (beat the Trench-Warden). Cheaper: Solar Battery 1 (beaten by the Helio Lancer), Fusion Reactor 2 (beaten by the Hive Relay; it keeps its drawback).
- **An edge of their own:** Shard Reactor Sturdy 2, Deflector Grid Sturdy 1, Rime Bastion Sturdy 2, Orrery Sturdy 1, Precession Engine Sturdy 2; Heat Sink also Shields 1; Mirror Plating Shields 4; Star Chart also Cool 1; Stasis Field Restore 2 and Cool 1 (no self-heat); Decay Wave's heat goes to the rival, not your own sun.
- Cheaper fusion was part of why Graftworks was so strong: with Shard Splice and Tidal Graft at 2 it fell to 36%; it now plays Coolant Shunts and Barnacle Shells instead of Tidal Grafts. A first try made the Shard Reactor cost 1 and Heat Sink cool 2, and Absolute Zero (which plays both) jumped from 63% to 78%: those fixes were changed to ones that don't feed the cold.
- Result (1000 games): mean distance from 50% **3.7** (was 4.9). Solar Lancers 47.9%, Shard Overload 47.6%, Abyssal Tide 48.1%, Hive Bloom 49.2%, Orbit Riders 45.7%, Ambush 51.1%, Demolition 50.2%, Absolute Zero 64.1%, Graftworks 41.5%, Overcharge 51.2%. Absolute Zero is the one left standing out.

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

**Across races too, and at most two things at 1 energy.** The check now also runs across races (`ANY=1 npm run dominated`, and the test does both): a race's card should never be outright worse than another race's, even though they never share a deck (Fracture Seer drew 3 for 1 heat to your sun, Eclipse Rite 3 for 2). It found 8 pairs, each made equal or a real trade: Fracture Seer is now 2 heat to your sun; Rally Banner loses its shield (Shard Recall's equal); Flarekin Dancer takes 1 heat to your sun (Glory Charge's equal); Sporelings drops its draw; Stinging Coral is Sting 2 (Umbral Snare trades it for its Lightspeed); Astral Lance drops its heat (Solstice Choir's equal); Cinder Brute's dawn heat is 3 for its heat to your sun; Vesper Knight's bonus is +2. And a one-off 1-energy card does at most two things (a drawback aside), worth about 3 heat (heat 3, or heat 2 and a small rider, cool 2 and draw 1, draw 2): Heat Sink is cool 2 and draw 1; Deep Hymn shields 3 and draws 1; Star Chart restores 2 and draws 1; Survey Probe is orbit +3 and cool 1; Pressure Wave heats 2 and shields 1; Eclipse Caster is the rival's orbit −2 and draw 1; Tide-Turner is orbit +2 and cool 2. `npm run power` gives a rough points budget per card, by cost, for spotting the rest. 

**Training the AI on players' games.** The AI weighs every move it could make a step ahead and picks the best, by a handful of weights (ai.ts, `aiWeights`). Games on a device (against the AI, or pass and play) are now kept whole with their anonymous summary: the state they began in and every move, compressed (stats.ts `trace`, sent as `trace64`). The game is deterministic, so they replay exactly. `TRACES=file.json npm run train-ai` replays them, asks the AI at each of the players' choices what it would have done, measures how often it agrees (and how high it ranks the player's move), nudges its weights to agree more, then plays the trained AI against the current one: a change goes in only if it also wins more. (Checked on made-up games whose "player" was the AI with one weight changed: the trainer found that weight, and the win check showed copying it was no gain.) Pass-and-play games against yourself are the best teaching: both sides are a player. Weights can only teach what the AI already measures; where players and the AI disagree for a reason it can't see (re-playing a Hero into removal over and over), the disagreements show what it needs to learn to see.

**What the first recorded games showed.** Two games (a player's Darkspeed deck against the AI's Abyssal Tide) replayed move by move. The AI's Tide cast The Admiralty and Tide-Regent five times between them, 3–4 energy each, and each was destroyed or bounced within a day or two by 2–3 energy removal; it never aimed at the player's Empress or Nyxara, the engines winning the game; and it ended days with 2 energy and nothing it could afford (two Bellwardens at 5, Tide Pearl, Leviathan, Titan). The AI valued a Hero as if it lasted about three and a half days, though a Hero never fades, and never asked whether what it played would simply be removed. Now a Hero counts 2.5 days more (`HERO_DAYS`), and every card's worth is cut by the removal its owner's rival has shown, in their discard pile or in play, that can reach it: a quarter for each, up to half (`RISK_PER`, `removalRisk`). Replayed, the AI builds its board instead of re-casting Heroes into the removal. Against the AI playing the Darkspeed deck it wins about as often as before (69% → 71.5%, within noise): the player beats the AI's Tide because the player pilots Darkspeed far better than the AI does, which is the AI's to learn next. [direction: starter win rates mean little until the AI plays well; look at the AI's decisions]

**Heroes cost what they do.** A Hero never fades and gives an ability every day, so: every ability costs 1 energy more than it did (one that gives energy stays free: paying 1 to get 1 is pointless), and every Hero costs 1 more (leaders 3, the stronger 4, the bombs 5: a bomb needs a day's bonus energy). A 2-energy Hero with an entrance and a free choice of two abilities every day was worth far more than any 2-energy card. [direction: heroes overpowered; Empress and the like should cost more]

**Energy for power, persistent cards too.** Two measures, and a card changes only where both agree. `npm run power` scores each card in points (a dawn effect counts once per point of stability, a dusk effect and an attack one time fewer, later uses a little less), against about 2.5 points an energy. `npm run simulate:pool` (SEED, OUT) plays random legal decks and gives each card's win rate when it is in a deck, judged against its own race's decks (12,000 games). Too strong on both: Abyssal Choir (dawn heat 2, +1 per 2 shields, up to 5), Siege Ram (heat 1, dawn bonus up to 2), Hive Tyrant and Hollow Reaper (up to 2), Riptide (capped at 3), Fruiting Body (heat 2 as it leaves), Ecliptic Lance (heat 1), Focusing Array (3 energy). Too weak on both: Evening Star, Sun Priest, Dawn Beacon and Brood Tender cost 1; Bulwark Prime 4; Hive Relay 2; Fusion Reactor loses its heat to your sun; Tactical Withdrawal is orbit +3. Then four 1-energy cards the budget put clearly at 2, though the pool didn't single them out, go to 2: Trench-Warden (Guard, Sturdy 3, a dawn shield and its race's Sting: Bastion Node's card, which costs 2), Tide Pylon, Vorthane Tidecaller and Searing Core. ("Both must agree" was too cautious for cards this plain.) Some card-economy cards test weak with the AI but are strong in a player's hands (Relay Station, Eclipse Rite, Phase Shift): left as they are. The pool also shows the races apart (Pyrr decks win 35%, Seren and Aureline 57%): a race-level job, not a card one. [direction: energy to power across persistent cards] The 600-game starter spread is unchanged within noise. [direction: no objectively weaker cards; uneven 1-cost cards]

The check now reports none.

**Energy dumps (X).** Seven cards spend all the energy you have left (at least 1, shown by a purple X gem). Their effects grow with each energy spent:
- Solar Torrent: Heat 1, plus 2 per energy.
- Deep Freeze: Cool 1, plus Cool 2 and Shield 1 per energy.
- Overflow Archive: Draw 1 per energy.
- Radiant Barrage (Aureline): Heat 2 and Shield 1 per energy.
- Meltdown (Xel'Naru): Heat 2 per energy, pierce, plus Heat 2 to your sun.
- Abyssal Rampart (Vorthane): Shield 3 per energy.
- Hive Surge (Ixquor): Draw 1 and Cool 1 per energy.

**Energy pips.** The pips show the day's whole energy, with spent ones left empty, so bonus energy no longer disappears once you play a card. Energy beyond the day's usual amount (from the industrial planet or energy cards) is amber: it is only for today, and it is spent first.
