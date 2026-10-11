/**
 * The tutorial [direction: challenges akin to the tier 1 dreams, showing the game's mechanics in bite-sized chunks,
 * with Oriel guiding the player through the UI and the rules; core mechanics first, advanced (Lost Races) lessons
 * open once the core is done; progress tracked on a skill-tree-like branch].
 *
 * Each lesson is a set position (a DreamSpec, played as a dream is: win before the day ends, or live through the
 * rival's next day), with Oriel's words before it begins and as it is solved. Every lesson is proven solvable, and
 * not solved by simply ending the day, in tests/lessons.test.ts.
 */
import type { DreamSpec } from './game';
import type { GameMode } from './modes';

/** Something on the battle screen for Oriel to light as he speaks (a CSS selector; `circle`: a ring round it). */
export interface LessonLight {
  sel: string;
  circle?: number;
}

export interface LessonStep {
  text: string;
  light?: LessonLight[];
}

export interface Lesson {
  id: string;
  name: string;
  /** A few words on what it teaches (under its name on the branch). */
  teaches: string;
  track: 'core' | 'advanced';
  /** Lessons to finish first (none: open from the start). */
  after: string[];
  mode: GameMode;
  spec: DreamSpec;
  /** Oriel's words as the lesson begins, step by step. */
  intro: LessonStep[];
  /** Oriel's word once it is solved. */
  done: string;
  /** Solved by holding back: ending the day at once is the answer (the dusk lesson). */
  waiting?: boolean;
}

const RIVAL_SUN = { sel: '.tableau-rival .vitals' };
const MY_SUN = { sel: '.tableau-mine .vitals' };
const HAND = { sel: '.hand' };
const ENERGY = { sel: '.plays' };
const END_DAY = { sel: '.end-turn' };
const mine = (id: string) => ({ sel: `.tableau-mine [data-card="${id}"]` });
const theirs = (id: string) => ({ sel: `.tableau-rival [data-card="${id}"]` });
const inHand = (id: string) => ({ sel: `.hand [data-card="${id}"]` });

/** A lesson's position: a sun of 20 each, and only what is set out. */
function spec(id: string, goal: DreamSpec['goal'], race: number, o: { energy?: number; hand?: string[]; me?: Partial<DreamSpec['me']>; foe?: Partial<DreamSpec['foe']> }): DreamSpec {
  return {
    id: `lesson-${id}`,
    tier: 1,
    goal,
    race,
    energy: o.energy ?? 0,
    hand: o.hand ?? [],
    me: { heat: 0, max: 20, cards: [], ...o.me },
    foe: { heat: 0, max: 20, cards: [], ...o.foe },
  };
}

export const LESSONS: Lesson[] = [
  // ---- The core: the trunk ----------------------------------------------------------------------------------
  {
    id: 'sun',
    name: 'the sun',
    teaches: 'attack a sun',
    track: 'core',
    after: [],
    mode: 'core',
    spec: spec('sun', 'win', 0, { me: { cards: [{ id: 'helio_lancer', slot: 2 }] }, foe: { heat: 17 } }),
    intro: [
      { text: 'Every side has a sun. Heat a rival’s sun to its limit and it goes supernova: the battle is yours.', light: [RIVAL_SUN] },
      { text: 'Theirs stands at 17 of 20.', light: [RIVAL_SUN] },
      { text: 'Your lancer can attack once a day. Tap it, then tap their sun.', light: [mine('helio_lancer')] },
    ],
    done: 'One blow, and a star goes out. Every battle ends this way.',
  },
  {
    id: 'energy',
    name: 'energy',
    teaches: 'play a card',
    track: 'core',
    after: ['sun'],
    mode: 'core',
    spec: spec('energy', 'win', 0, { energy: 1, hand: ['coronal_lance'], foe: { heat: 17 } }),
    intro: [
      { text: 'Cards wait in your hand. Each costs energy, the number on its gem.', light: [HAND] },
      { text: 'This is your energy for the day. It grows as the days pass.', light: [ENERGY] },
      { text: 'Coronal Lance heats a sun by 3 as it is played. Play it at their sun.', light: [inHand('coronal_lance')] },
    ],
    done: 'Cards spend energy; a day’s energy is a day’s choices.',
  },
  {
    id: 'guard',
    name: 'guard',
    teaches: 'what a Guard stops',
    track: 'core',
    after: ['energy'],
    mode: 'core',
    spec: spec('guard', 'win', 0, {
      energy: 1,
      hand: ['coronal_lance'],
      me: { cards: [{ id: 'helio_lancer', slot: 2 }] },
      foe: { heat: 17, cards: [{ id: 'p_bell_sentry', slot: 2 }] },
    }),
    intro: [
      { text: 'A Guard must be attacked first. While it stands, your lancer can’t reach their sun.', light: [theirs('p_bell_sentry')] },
      { text: 'But heat from a card you play goes where you aim it.', light: [inHand('coronal_lance')] },
    ],
    done: 'Guards stop attacks, not aimed heat. Remember which is which.',
  },
  {
    id: 'breach',
    name: 'breaking through',
    teaches: 'defence and stability',
    track: 'core',
    after: ['guard'],
    mode: 'core',
    spec: spec('breach', 'win', 3, {
      me: { cards: [{ id: 'p_lattice_spear', slot: 1 }, { id: 'helio_lancer', slot: 3 }] },
      foe: { heat: 17, cards: [{ id: 'ixquor_broodguard', slot: 0 }] },
    }),
    intro: [
      { text: 'An attack on a card goes through its defence first: its slot’s and its own (Sturdy). What gets past breaks its stability.', light: [theirs('ixquor_broodguard')] },
      { text: 'At no stability left, it is gone. Middle slots defend best; the edges least.', light: [{ sel: '.tableau-rival .tableau-row' }] },
      { text: 'Break the Guard with your strongest attacker, then strike the sun.', light: [mine('p_lattice_spear'), mine('helio_lancer')] },
    ],
    done: 'Order matters: clear the way, then strike.',
  },
  // ---- The core: holding on ------------------------------------------------------------------------------------
  {
    id: 'shields',
    name: 'shields',
    teaches: 'survive with shields',
    track: 'core',
    after: ['breach'],
    mode: 'core',
    spec: spec('shields', 'survive', 2, {
      energy: 1,
      hand: ['deep_hymn'],
      me: { heat: 13 },
      foe: { heat: 8, cards: [{ id: 'p_dawn_lancer', slot: 1 }, { id: 'p_prism_blade', slot: 3 }] },
    }),
    intro: [
      { text: 'Not every battle is won in a day. Their two attackers will hit your sun for 8 tomorrow: 21. Too hot.', light: [theirs('p_dawn_lancer'), theirs('p_prism_blade'), MY_SUN] },
      { text: 'Shields take heat before your sun does. They fade at your next dawn.', light: [inHand('deep_hymn')] },
      { text: 'Raise them, then end your day.', light: [END_DAY] },
    ],
    done: 'You lived. Shields buy you a day; use it.',
  },
  {
    id: 'cooling',
    name: 'cooling',
    teaches: 'survive by cooling',
    track: 'core',
    after: ['shields'],
    mode: 'core',
    spec: spec('cooling', 'survive', 1, {
      energy: 1,
      hand: ['cryo_vault'],
      me: { heat: 14 },
      foe: { heat: 8, cards: [{ id: 'p_dawn_lancer', slot: 1 }, { id: 'p_prism_blade', slot: 3 }] },
    }),
    intro: [
      { text: 'The same threat, and your sun a little hotter.', light: [MY_SUN] },
      { text: 'Cooling takes heat off your sun for good. Play the vault, then end your day.', light: [inHand('cryo_vault')] },
    ],
    done: 'Shields last a day; cooling lasts.',
  },
  {
    id: 'removal',
    name: 'removal',
    teaches: 'destroy a threat',
    track: 'core',
    after: ['cooling'],
    mode: 'core',
    spec: spec('removal', 'survive', 0, {
      energy: 1,
      hand: ['ion_cannon'],
      me: { heat: 15 },
      foe: { heat: 8, cards: [{ id: 'p_lattice_spear', slot: 0 }] },
    }),
    intro: [
      { text: 'Their spear hits for 6 tomorrow. Your sun can’t take it.', light: [theirs('p_lattice_spear')] },
      { text: 'Ion Cannon destroys a card with 2 defence or less, at the price of a little heat on your own sun.', light: [inHand('ion_cannon')] },
      { text: 'A card at the edge has little defence. Aim at the spear.', light: [theirs('p_lattice_spear')] },
    ],
    done: 'The best defence is sometimes taking theirs away.',
  },
  {
    id: 'traps',
    name: 'traps',
    teaches: 'set a trap',
    track: 'core',
    after: ['removal'],
    mode: 'core',
    spec: spec('traps', 'survive', 2, {
      energy: 2,
      hand: ['ink_cloud'],
      me: { heat: 15 },
      foe: { heat: 8, cards: [{ id: 'p_lattice_spear', slot: 2 }] },
    }),
    intro: [
      { text: 'A trap is set face down in this slot. It springs by itself on your rival’s day.', light: [{ sel: '.tableau-mine .slot-ls' }] },
      { text: 'Ink Cloud cancels an attack on your sun. Set it, then end your day.', light: [inHand('ink_cloud')] },
    ],
    done: 'Your rival never saw it coming. Neither will the next.',
  },
  // ---- The core: the four races ----------------------------------------------------------------------------------
  {
    id: 'forge',
    name: 'forge',
    teaches: 'the Aureline: placement',
    track: 'core',
    after: ['breach'],
    mode: 'core',
    spec: spec('forge', 'win', 0, {
      energy: 1,
      hand: ['halo_sentinel'],
      me: { cards: [{ id: 'helio_lancer', slot: 0 }, { id: 'comet_hail', slot: 4 }] },
      foe: { heat: 13 },
    }),
    intro: [
      { text: 'The Aureline fight as one. A card with Forge lends its neighbours’ attacks more heat.', light: [inHand('halo_sentinel')] },
      { text: 'Your two attackers make 6. You need 7. Where you place a card matters.', light: [mine('helio_lancer'), mine('comet_hail')] },
    ],
    done: 'Side by side, they burn brighter.',
  },
  {
    id: 'overheat',
    name: 'overheat',
    teaches: 'the Xel’Naru: run hot',
    track: 'core',
    after: ['forge'],
    mode: 'core',
    spec: spec('overheat', 'win', 1, { energy: 1, hand: ['overcharge', 'shard_storm'], me: { heat: 9 }, foe: { heat: 16 } }),
    intro: [
      { text: 'At half its limit or hotter, your sun is overheated. The Xel’Naru hit harder when it is.', light: [MY_SUN] },
      { text: 'Overcharge gives energy, and heats your own sun. Shard Storm hits harder while you’re overheated. Order matters.', light: [HAND] },
    ],
    done: 'Danger, spent well, is power.',
  },
  {
    id: 'growth',
    name: 'growth',
    teaches: 'the Ixquor: grow',
    track: 'core',
    after: ['overheat'],
    mode: 'core',
    spec: spec('growth', 'win', 3, {
      me: { cards: [{ id: 'chamber_protocol', slot: -1 }, { id: 'hive_warrior', slot: 2 }] },
      foe: { heat: 17 },
    }),
    intro: [
      { text: 'A Hero leads from its own slot. Once a day it may use one of its abilities.', light: [mine('chamber_protocol')] },
      { text: 'Growth adds to a card’s attack, for good. Grow your warrior, then attack.', light: [mine('hive_warrior')] },
    ],
    done: 'The hive only gets bigger.',
  },
  {
    id: 'heroes',
    name: 'heroes',
    teaches: 'an attack, or an ability',
    track: 'core',
    after: ['growth'],
    mode: 'core',
    spec: spec('heroes', 'win', 0, { me: { cards: [{ id: 'ignition_protocol', slot: -1 }] }, foe: { heat: 17 } }),
    intro: [
      { text: 'A Hero acts once a day: an attack, or one of its abilities. Tap it to see them.', light: [mine('ignition_protocol')] },
      { text: 'Three to go. Its attack is 2. Choose well.', light: [RIVAL_SUN] },
    ],
    done: 'A Hero leads every deck. Guard yours.',
  },
  {
    id: 'dusk',
    name: 'dusk',
    teaches: 'dawn, dusk and vigil',
    track: 'core',
    after: ['heroes'],
    mode: 'core',
    spec: spec('dusk', 'win', 0, {
      me: { cards: [{ id: 'aureline_sunset_lancer', slot: 2 }] },
      foe: { heat: 18, cards: [{ id: 'ixquor_broodguard', slot: 2 }] },
    }),
    intro: [
      { text: 'Some cards act at dawn, as your day begins; some at dusk, as it ends.', light: [mine('aureline_sunset_lancer')] },
      { text: 'Vigil acts at dusk only if the card held back that day. Their Guard is too strong to break.', light: [theirs('ixquor_broodguard')] },
      { text: 'Sometimes the strongest move is to wait.', light: [END_DAY] },
    ],
    done: 'Patience is a weapon too. You have learnt the core.',
    waiting: true,
  },
  // ---- Advanced: the Lost Races (open once the core is done) ------------------------------------------------------
  {
    id: 'darkspeed',
    name: 'darkspeed',
    teaches: 'the Nyxari: strike at once',
    track: 'advanced',
    after: ['core'],
    mode: 'lost',
    spec: spec('darkspeed', 'win', 4, { energy: 1, hand: ['nyx_shade_stalker'], foe: { heat: 18 } }),
    intro: [
      { text: 'Cards come into play dimmed: they act from the next day. Not the Nyxari’s.', light: [inHand('nyx_shade_stalker')] },
      { text: 'Darkspeed: play it, and attack the same day.', light: [RIVAL_SUN] },
    ],
    done: 'From the dark, without warning.',
  },
  {
    id: 'consume',
    name: 'consume',
    teaches: 'the Blood Cult: sacrifice',
    track: 'advanced',
    after: ['darkspeed'],
    mode: 'lost',
    spec: spec('consume', 'win', 4, {
      energy: 1,
      hand: ['bc_crimson_rite'],
      me: { cards: [{ id: 'bc_blood_thrall', slot: 2, dimmed: true }] },
      foe: { heat: 12 },
    }),
    intro: [
      { text: 'Consume: to play it, give up one of your own cards in play.', light: [inHand('bc_crimson_rite')] },
      { text: 'Your thrall burns as it leaves. Two fires for the price of one.', light: [mine('bc_blood_thrall')] },
    ],
    done: 'What is given is never wasted.',
  },
  {
    id: 'erode',
    name: 'erode',
    teaches: 'past any defence',
    track: 'advanced',
    after: ['darkspeed'],
    mode: 'lost',
    spec: spec('erode', 'win', 4, {
      energy: 1,
      hand: ['nyx_void_rend'],
      me: { cards: [{ id: 'p_lattice_spear', slot: 2 }] },
      foe: { heat: 14, cards: [{ id: 'kor_iron_sentinel', slot: 2 }] },
    }),
    intro: [
      { text: 'No attack of yours gets through that wall’s defence.', light: [theirs('kor_iron_sentinel')] },
      { text: 'Erode takes stability whatever the defence. Then the way is open.', light: [inHand('nyx_void_rend')] },
    ],
    done: 'Every wall has a weakness.',
  },
  {
    id: 'bulwark',
    name: 'walls as weapons',
    teaches: 'the Korrath: defence is power',
    track: 'advanced',
    after: ['erode'],
    mode: 'lost',
    spec: spec('bulwark', 'win', 5, {
      energy: 1,
      hand: ['kor_molten_pour'],
      me: { cards: [{ id: 'p_iron_bulwark', slot: 2 }, { id: 'p_anvil_guard', slot: 1 }] },
      foe: { heat: 16 },
    }),
    intro: [
      { text: 'The Korrath stack defence on everything they build.', light: [mine('p_iron_bulwark'), mine('p_anvil_guard')] },
      { text: 'Molten Pour heats more for the defence on your cards. Strike, and pour.', light: [inHand('kor_molten_pour')] },
    ],
    done: 'Iron, made into fire.',
  },
  {
    id: 'spend',
    name: 'spend all',
    teaches: 'the Pyrr: all at once',
    track: 'advanced',
    after: ['consume'],
    mode: 'lost',
    spec: spec('spend', 'win', 7, { energy: 4, hand: ['pyr_supernova_charge'], me: { heat: 5 }, foe: { heat: 12 } }),
    intro: [
      { text: 'Spend all: a card that takes every bit of energy you have left, and grows with it.', light: [ENERGY, inHand('pyr_supernova_charge')] },
      { text: 'Four energy. Make it count.', light: [RIVAL_SUN] },
    ],
    done: 'Hold nothing back. You have learnt all I can teach.',
  },
];

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);

/** The core lessons (the advanced open once every one is done). */
export const CORE_LESSONS = LESSONS.filter((l) => l.track === 'core').map((l) => l.id);

/** Whether a lesson is open: its lessons before done ('core': every core lesson). */
export function lessonOpen(id: string, done: readonly string[]): boolean {
  const l = lessonById(id);
  if (!l) return false;
  return l.after.every((a) => (a === 'core' ? CORE_LESSONS.every((c) => done.includes(c)) : done.includes(a)));
}
