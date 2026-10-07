/**
 * Game modes. Core is the simple game: four races, each with one mechanic of its own, on top of the
 * fundamentals every card shares (attack, heat, cooling, defence, stability, energy, drawing, and Guard).
 * Lost Races is everything: all eight races, their sub-races and every mechanic.
 */
import type { CardDef, Count, Effect, Passive } from './types';

export type GameMode = 'core' | 'lost';

export const GAME_MODES: Record<GameMode, { name: string; blurb: string }> = {
  core: { name: 'Core', blurb: 'Four races, one mechanic each. Every card does one or two things.' },
  lost: { name: 'Lost Races', blurb: 'All eight races and every mechanic.' },
};

/** A deck saved without a mode is from before modes: everything was legal then. */
export const modeOf = (deck: { mode?: GameMode }): GameMode => deck.mode ?? 'lost';

/**
 * The rules in force: in Core there are no race traits, and the core races' cards play their core versions
 * (cards-core.ts). Set as a game starts and as each move is made (from the game's own mode), and by screens
 * that show cards for a mode (the deck builder).
 */
let RULES: GameMode = 'lost';
export const rulesMode = (): GameMode => RULES;
export function setRulesMode(mode: GameMode | undefined) {
  RULES = mode ?? 'lost';
}
/** Runs `f` under a mode's rules, then puts the rules back. */
export function underRules<T>(mode: GameMode | undefined, f: () => T): T {
  const was = RULES;
  RULES = mode ?? 'lost';
  try {
    return f();
  } finally {
    RULES = was;
  }
}

/** Mechanics beyond the fundamentals, as the card classifier names them. */
export type Mechanic =
  | 'forge' | 'overheat' | 'shields' | 'growth'
  | 'resonance' | 'bulwark' | 'pierce' | 'removal' | 'erode' | 'restore' | 'repair' | 'recall' | 'recover'
  | 'shift' | 'plant' | 'orbit' | 'attune' | 'lightspeed' | 'fusion' | 'spendAll' | 'global' | 'leave'
  | 'consume' | 'sting' | 'anchor' | 'thermosiphon' | 'darkspeed' | 'empower' | 'halt' | 'relic';

/** The one mechanic each core race is built round: Aureline, Xel'Naru, Vorthane, Ixquor. */
export const CORE_SIGNATURE: Record<number, Mechanic> = { 0: 'forge', 1: 'overheat', 2: 'shields', 3: 'growth' };
export const CORE_RACES = [0, 1, 2, 3];

const MECHANIC_NAME: Record<Mechanic, string> = {
  forge: 'Forge', overheat: 'Overheat', shields: 'Shields', growth: 'Growth', resonance: 'Resonance', bulwark: 'Bulwark',
  pierce: 'Pierce', removal: 'Removal', erode: 'Erode', restore: 'Restore', repair: 'Repair', recall: 'Recall',
  recover: 'Recover', shift: 'Shift', plant: 'Plant', orbit: 'Orbit', attune: 'Attune', lightspeed: 'Lightspeed',
  fusion: 'Fusion', consume: 'Consume', spendAll: 'Spend all', global: 'Global', leave: 'Leaving play', sting: 'Sting', anchor: 'Anchor',
  thermosiphon: 'Thermosiphon', darkspeed: 'Darkspeed', empower: 'Chosen', halt: 'Halt', relic: 'Relic',
};
export const mechanicName = (m: Mechanic) => MECHANIC_NAME[m];

function ofCount(c: Count | undefined, add: (m: Mechanic) => void) {
  if (!c) return;
  if (c.of === 'growth') add('growth');
  else if (c.of === 'shields') add('shields');
  else if (c.of === 'adjacent') add('forge');
  else if (c.of === 'planet') add('orbit');
  else if (c.of === 'spent') add('spendAll');
  else if (c.of === 'cold') add('thermosiphon');
  else if (c.of === 'defence') add('bulwark');
  else if (c.of === 'rested') add('darkspeed');
}

function ofEffect(e: Effect, add: (m: Mechanic) => void) {
  if (e.if && 'overheated' in e.if) add('overheat');
  if (e.if && 'planet' in e.if) add('orbit');
  if ('plus' in e) ofCount(e.plus, add);
  switch (e.type) {
    case 'heat': if (e.pierce) add('pierce'); break;
    case 'selfHeat': add('overheat'); break;
    case 'shield': add('shields'); break;
    case 'grow': case 'growOthers': add('growth'); break;
    case 'destroy': case 'bounce': add('removal'); break;
    case 'erode': add('erode'); break;
    case 'restore': add('restore'); break;
    case 'repair': add('repair'); break;
    case 'empower': add('empower'); break;
    case 'plant': add('plant'); break;
    case 'recall': add('recall'); break;
    case 'shift': add('shift'); break;
    case 'recover': add('recover'); break;
    case 'halt': add('halt'); break;
    case 'orbit': add('orbit'); break;
    default: break; // heat, cool, draw, plays: the fundamentals
  }
}

function ofPassive(p: Passive, add: (m: Mechanic) => void) {
  switch (p.type) {
    case 'kindBonus': if (p.stat === 'shield') add('shields'); break; // (a plain buff to heat or cooling is a fundamental)
    case 'keepShields': case 'tidewall': case 'absorbCool': add('shields'); break;
    case 'retaliate': add('sting'); break;
    case 'catalyst': add('growth'); break;
    case 'field': add('global'); break;
    case 'allyLeaves': add('leave'); break;
    case 'adjacent': add(p.kind === 'attack' ? 'forge' : 'resonance'); break;
    case 'guard': add('bulwark'); break;
    case 'anchor': add('anchor'); break;
    case 'eatPlanets': add('orbit'); break;
    default: break; // taunt (Guard) and extraPlay (energy) are fundamentals
  }
}

/** The mechanics a card uses, beyond the fundamentals. */
export function cardMechanics(def: CardDef): Set<Mechanic> {
  const out = new Set<Mechanic>();
  const add = (m: Mechanic) => out.add(m);
  for (const list of [def.onPlay, def.onTurn, def.onDusk, def.onLeave, def.onRecover, def.lightspeed?.effects, ...(def.choices ?? []).map((c) => c.onTurn), ...(def.abilities ?? []).map((a) => a.effects)]) {
    for (const e of list ?? []) ofEffect(e, add);
  }
  for (const p of def.passive ?? []) ofPassive(p, add);
  if (def.onLeave?.length) add('leave');
  if (def.onRecover?.length) add('recover');
  if (def.lightspeed) add('lightspeed');
  if (def.fusion) add('fusion');
  if (def.consume) add('consume');
  if (def.spendAll) add('spendAll');
  if (def.attune) add('attune');
  if (def.kind === 'global') add('global');
  if (def.kind === 'relic') add('relic');
  for (const a of def.abilities ?? []) if (a.pay?.selfHeat) add('overheat');
  return out;
}

/** How many things a card does: each trigger's effects of one type count once, and each passive once. */
export function cardThings(def: CardDef): number {
  let n = 0;
  for (const list of [def.onPlay, def.onTurn, def.onDusk, def.onLeave, def.lightspeed?.effects]) n += new Set((list ?? []).map((e) => e.type)).size;
  n += (def.passive ?? []).length;
  return n;
}

/** Why a card can't be played in this mode (null if it can). */
export function modeProblem(def: CardDef, mode: GameMode): string | null {
  if (mode === 'lost') return null;
  if (def.race !== undefined && !CORE_RACES.includes(def.race)) return 'Lost Races only.';
  const own = def.race !== undefined ? CORE_SIGNATURE[def.race] : undefined;
  const extra = [...cardMechanics(def)].filter((m) => m !== own);
  if (extra.length) return `${extra.map(mechanicName).join(', ')}: Lost Races only.`;
  if (def.kind !== 'command' && cardThings(def) > 2) return 'Does too much for Core.';
  return null;
}

export const inMode = (def: CardDef, mode: GameMode) => modeProblem(def, mode) === null;
