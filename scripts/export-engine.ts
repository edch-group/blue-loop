/**
 * Writes what the C# engine (unity/Assets/Scripts/Engine) reads as data: every card as it plays (after the rules
 * applied at load), and the preset decks. Run after changing cards: npm run export-engine.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { CARDS, PRESET_DECKS, registeredCardDefs } from '../src/engine/cards';
import { BOSS_CARDS } from '../src/engine/cards-bosses';
import { COMPANIONS } from '../src/engine/companions';
import { CAPTAIN_SINGULARITIES, SINGULARITIES, singularityLine } from '../src/engine/singularities';
import { CAPTAIN_ABILITIES, CAPTAIN_BASE, CAPTAIN_LEADS, CAPTAIN_SLOT_PRICES, CAPTAIN_STABILITY_STEP, CAPTAIN_START_ABILITY, captainSlots } from '../src/engine/captain';
import { CAPTAIN_TITLES, GATE, TIERS } from '../src/engine/ascent';
import { NYX_MARKS } from '../src/engine/rifts';

const out = 'unity/Assets/Resources/Engine';
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/cards.json`, JSON.stringify(registeredCardDefs()));
writeFileSync(`${out}/decks.json`, JSON.stringify(PRESET_DECKS));
// The rest the battle rules read as data: the Lost Overlords' cards, every Hero's singularity (and the Captain's to
// choose from), and each companion's card.
writeFileSync(
  `${out}/rules.json`,
  JSON.stringify({
    bossIds: BOSS_CARDS.map((c) => c.id),
    singularities: SINGULARITIES,
    captainSingularities: CAPTAIN_SINGULARITIES,
    companionCards: Object.fromEntries(COMPANIONS.map((c) => [c.id, c.card])),
    poolIds: CARDS.map((c) => c.id),
  }),
);
// What built cards (the Captain's, the crew's, marked ones) are made from: see Builds.cs.
writeFileSync(
  `${out}/builds.json`,
  JSON.stringify({
    captain: {
      abilities: CAPTAIN_ABILITIES,
      leads: CAPTAIN_LEADS,
      base: CAPTAIN_BASE,
      stabilityStep: CAPTAIN_STABILITY_STEP,
      startAbility: CAPTAIN_START_ABILITY,
      maxSlots: captainSlots(CAPTAIN_SLOT_PRICES.length),
      titles: CAPTAIN_TITLES,
      singularityLines: Object.fromEntries(Object.entries(CAPTAIN_SINGULARITIES).map(([id, k]) => [id, singularityLine(k)])),
    },
    gate: GATE,
    tiers: TIERS,
    companions: COMPANIONS,
    nyxMarks: NYX_MARKS,
  }),
);
console.log(`${registeredCardDefs().length} cards, ${PRESET_DECKS.length} decks → ${out}`);
