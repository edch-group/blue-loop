/**
 * Writes what the C# engine (unity/Assets/Scripts/Engine) reads as data: every card as it plays (after the rules
 * applied at load), and the preset decks. Run after changing cards: npm run export-engine.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { CARDS, PRESET_DECKS, registeredCardDefs } from '../src/engine/cards';
import { BOSS_CARDS } from '../src/engine/cards-bosses';
import { COMPANIONS } from '../src/engine/companions';
import { CAPTAIN_SINGULARITIES, SINGULARITIES } from '../src/engine/singularities';

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
console.log(`${registeredCardDefs().length} cards, ${PRESET_DECKS.length} decks → ${out}`);
