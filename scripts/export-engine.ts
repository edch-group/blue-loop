/**
 * Writes what the C# engine (unity/Assets/Scripts/Engine) reads as data: every card as it plays (after the rules
 * applied at load), and the preset decks. Run after changing cards: npm run export-engine.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { CARDS, PRESET_DECKS, registeredCardDefs } from '../src/engine/cards';
import { BOSS_CARDS, LOST_LORDS, OVERLORDS } from '../src/engine/cards-bosses';
import { ENIGMA_CARDS } from '../src/engine/cards-enigma';
import { COMPANIONS } from '../src/engine/companions';
import { CAPTAIN_SINGULARITIES, SINGULARITIES, singularityLine } from '../src/engine/singularities';
import { CAPTAIN_ABILITIES, CAPTAIN_BASE, CAPTAIN_LEADS, CAPTAIN_SLOT_PRICES, CAPTAIN_STABILITY_STEP, CAPTAIN_START_ABILITY, captainSlots } from '../src/engine/captain';
import { CAPTAIN_TITLES, GATE, TIERS } from '../src/engine/ascent';
import { BOONS } from '../src/engine/boons';
import { GEAR_NAMES, RACE_SLOTS, SKILL_TREES, SLOT_NAME } from '../src/engine/heroes';
import { plainText } from '../src/engine/keywords';
import { CAPTAIN_TREE, COMPANION_TREES } from '../src/engine/ascent';
import { ARMORY_PRICE, CAMPAIGN, CAMPAIGN_MISSIONS, CHALLENGES, FROST_LINES, GALAXIES, GALAXY_KINDS, OFFER_WEIGHT, STAR_FINDS, STAR_TYPES } from '../src/engine/campaign';
import { NYX_MARKS, RIFTS, RIFT_JUMPS, RIFT_KINDS } from '../src/engine/rifts';
import { ARRIVAL_LINES, GENERALS, GENERAL_LINES, HERO_BIOS, LOST_RACES, MOTIVE, QUARTERMASTER, QUARTERMASTER_LINES, RECYCLER, RECYCLER_LINES, STRUGGLE_LINES } from '../src/engine/story';
import { RACE_NAMES, RACE_TRAITS, SUBRACES } from '../src/engine/races';
import { HUNTERS } from '../src/engine/encounters';
import { RESEARCH, RESEARCH_BRANCHES, RETIRED_RESEARCH } from '../src/engine/research';
import { SHIP_PARTS, SHIP_SLOTS } from '../src/engine/parts';
import { DREAMS } from '../src/engine/dreams-data';
import { LESSONS } from '../src/engine/lessons';
import { FELLOWSHIP_BOOST, HERO_UNLOCK_STARS, KINSHIP_BOOST, META_UPGRADES, STARTER_OFFERS, STARTING_RACES, TREE_PETALS, type MetaUpgrade } from '../src/engine/meta';

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
// Heroes' gear slots and skill trees, gear names, and each boon's words (heroes.ts: see Heroes.cs).
writeFileSync(
  `${out}/heroes.json`,
  JSON.stringify({
    raceSlots: RACE_SLOTS,
    slotName: SLOT_NAME,
    skillTrees: SKILL_TREES,
    gearNames: GEAR_NAMES,
    boonText: Object.fromEntries(BOONS.map((b) => [b.id, plainText(b.text)])),
  }),
);
// The Captain's and the companions' ascent trees (ascent.ts: see Ascent.cs).
writeFileSync(`${out}/ascent.json`, JSON.stringify({ captainTree: CAPTAIN_TREE, companionTrees: COMPANION_TREES }));
// The campaign's tuning and tables (Campaign.cs).
writeFileSync(
  `${out}/campaign.json`,
  JSON.stringify({
    tuning: CAMPAIGN,
    armoryPrice: ARMORY_PRICE,
    offerWeight: OFFER_WEIGHT,
    starTypes: STAR_TYPES,
    // (Each star's finds as [kind, weight] pairs, in order: the order they are rolled in.)
    starFinds: Object.fromEntries(Object.entries(STAR_FINDS).map(([k, v]) => [k, { find: v.find, kinds: Object.entries(v.kinds) }])),
    galaxies: GALAXIES,
    galaxyKinds: GALAXY_KINDS,
    challenges: CHALLENGES,
    frostLines: FROST_LINES,
    overlords: OVERLORDS,
    lostLords: LOST_LORDS,
    enigmaIds: ENIGMA_CARDS.map((c) => c.id),
    missions: CAMPAIGN_MISSIONS.map(({ id, name, text, target, counting }) => ({ id, name, text, target, counting })),
  }),
);
// The world around the battles, as data: the story's words, the races, the rifts, encounters' hunters, research, ship
// parts, the dreams and the lessons (see World.cs).
writeFileSync(
  `${out}/world.json`,
  JSON.stringify({
    story: {
      generals: GENERALS,
      motive: MOTIVE,
      heroBios: HERO_BIOS,
      generalLines: GENERAL_LINES,
      struggleLines: STRUGGLE_LINES,
      arrivalLines: ARRIVAL_LINES,
      quartermaster: QUARTERMASTER,
      recycler: RECYCLER,
      quartermasterLines: QUARTERMASTER_LINES,
      recyclerLines: RECYCLER_LINES,
      lostRaces: LOST_RACES,
    },
    races: { names: RACE_NAMES, traits: RACE_TRAITS.map((t) => t ?? null), subraces: SUBRACES },
    rifts: { rifts: RIFTS, kinds: RIFT_KINDS, jumps: RIFT_JUMPS },
    hunters: HUNTERS,
    research: { projects: RESEARCH, branches: RESEARCH_BRANCHES, retired: [...RETIRED_RESEARCH] },
    parts: { slots: SHIP_SLOTS, parts: SHIP_PARTS },
    dreams: DREAMS,
    lessons: LESSONS,
  }),
);
// The loop's lasting progress, as data (see Meta.cs): the skill tree and unlocks (each price as a base and a step a
// level: every one is flat or rising), the cards each race can buy into its starting deck, and the small tables.
const metaUpgradeData = ({ cost, ...u }: MetaUpgrade) => ({ ...u, costBase: cost(0), costStep: cost(1) - cost(0) });
writeFileSync(
  `${out}/meta.json`,
  JSON.stringify({
    upgrades: META_UPGRADES.map(metaUpgradeData),
    starterOffers: STARTER_OFFERS,
    treePetals: TREE_PETALS,
    kinshipBoost: KINSHIP_BOOST,
    fellowshipBoost: FELLOWSHIP_BOOST,
    startingRaces: STARTING_RACES,
    heroUnlockStars: HERO_UNLOCK_STARS,
  }),
);
console.log(`${registeredCardDefs().length} cards, ${PRESET_DECKS.length} decks → ${out}`);
