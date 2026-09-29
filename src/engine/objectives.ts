import type { GlobalEffectId, PlayerState } from './types';
import { BALANCE } from './balance';
import { cardDef } from './cards';
import { playerModifiers } from './systems';

export interface ObjectiveDef {
  id: string;
  name: string;
  text: string;
  /** Checked after every action on the player's own turn. */
  isMet(player: PlayerState): boolean;
}

function allCards(p: PlayerState) {
  return [...p.deck, ...p.hand, ...p.inPlay, ...p.discard];
}
const totalUpgrades = (p: PlayerState) => p.upgrades.solarFlare + p.upgrades.thermosiphon + p.upgrades.coolingChamber;
const planetLevels = (p: PlayerState) => p.planets.reduce((s, pl) => s + pl.level, 0);

/**
 * Global objectives. A few are face up at a time; the FIRST player to meet
 * one claims it (nobody else can) and it is replaced from the pool.
 * Claiming earns a reward choice.
 */
export const OBJECTIVES: ObjectiveDef[] = [
  { id: 'deep_freeze', name: 'Deep Freeze', text: 'Have your sun at -5 or colder.', isMet: (p) => p.heat <= -5 },
  { id: 'firestorm', name: 'Firestorm', text: 'Deal 4 or more heat to enemy suns in one turn.', isMet: (p) => p.turn.heatDealt >= 4 },
  { id: 'collector', name: 'Collector', text: 'Own 5 or more cards bought from the display.', isMet: (p) => allCards(p).filter((c) => cardDef(c.defId).copies > 0).length >= 5 },
  { id: 'big_spender', name: 'Big Spender', text: 'Spend 10 or more money in one turn.', isMet: (p) => p.turn.moneySpent >= 10 },
  { id: 'brinkmanship', name: 'Brinkmanship', text: 'Have your sun within 3 of your max health.', isMet: (p) => p.heat >= maxHealth(p) - 3 },
  { id: 'industrialist', name: 'Industrialist', text: 'Reach 4 total planet levels.', isMet: (p) => planetLevels(p) >= 4 },
  { id: 'shieldwall', name: 'Shieldwall', text: 'Block 3 or more heat with shields in one round.', isMet: (p) => p.blockedSinceTurnStart >= 3 },
  { id: 'arsenal', name: 'Arsenal', text: 'Have 3 action upgrades in total.', isMet: (p) => totalUpgrades(p) >= 3 },
  { id: 'cold_front', name: 'Cold Front', text: 'Cool your sun by 4 or more in one turn.', isMet: (p) => p.turn.cooled >= 4 },
  { id: 'trade_baron', name: 'Trade Baron', text: 'Buy 3 cards in one turn.', isMet: (p) => p.turn.cardsBought >= 3 },
  { id: 'overdrive', name: 'Overdrive', text: 'Play 7 or more cards in one turn.', isMet: (p) => p.turn.cardsPlayed >= 7 },
];

/**
 * Missions: personal objectives on cards bought from the display. Playing
 * one puts it in front of you; when its condition is met (on your turn) you
 * earn a reward and the mission card is removed from the game.
 */
export const MISSIONS: ObjectiveDef[] = [
  { id: 'm_ignition', name: 'Ignition', text: 'Deal 3 or more heat to enemy suns in one turn.', isMet: (p) => p.turn.heatDealt >= 3 },
  { id: 'm_absolute_zero', name: 'Absolute Zero', text: 'Have your sun at -3 or colder.', isMet: (p) => p.heat <= -3 },
  { id: 'm_supply_run', name: 'Supply Run', text: 'Buy 2 cards in one turn.', isMet: (p) => p.turn.cardsBought >= 2 },
  { id: 'm_overclock', name: 'Overclock', text: 'Launch 3 Solar Flares in one turn.', isMet: (p) => p.turn.flares >= 3 },
  { id: 'm_stockpile', name: 'Stockpile', text: 'Have 8 or more money at once.', isMet: (p) => p.money >= 8 },
  { id: 'm_fortify', name: 'Fortify', text: 'Have 3 or more shields at once.', isMet: (p) => p.shields >= 3 },
];

const BY_ID = new Map([...OBJECTIVES, ...MISSIONS].map((o) => [o.id, o]));

export function objectiveDef(id: string): ObjectiveDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown objective: ${id}`);
  return def;
}

/** Max health (supernova threshold): kept here too so objectives can use it without a cycle. */
function maxHealth(p: PlayerState): number {
  return (
    BALANCE.supernovaAt + p.upgrades.coolingChamber * BALANCE.coolingChamberHealthPerUpgrade + (playerModifiers(p).maxHealthDelta ?? 0)
  );
}

export type RewardId =
  | 'command'
  | 'requisition'
  | 'purge'
  | 'vent'
  | 'wide_sensors'
  | 'stellar_mint'
  | 'plasma_focus'
  | 'deep_coolant'
  | 'aegis_lattice'
  | 'flare_focus';

export interface RewardDef {
  id: RewardId;
  name: string;
  text: string;
  /** Permanent buffs stay for the rest of the game; the rest happen once, immediately. */
  permanent: boolean;
  /** Extra choice the player must make when taking it. */
  needs?: 'upgrade' | 'slot';
}

/**
 * Objective rewards. When you claim an objective or complete a mission you are
 * offered a few of these at random and pick one. Each player can take each
 * reward only once per game.
 */
export const REWARDS: RewardDef[] = [
  { id: 'command', name: 'Command Upgrade', text: 'Upgrade one action or planet right now.', permanent: false, needs: 'upgrade' },
  { id: 'requisition', name: 'Requisition', text: 'Take any card from the display for free.', permanent: false, needs: 'slot' },
  { id: 'purge', name: 'Purge', text: 'Remove up to 2 Stardust from your deck and discard pile for good.', permanent: false },
  { id: 'vent', name: 'Emergency Vent', text: 'Cool your sun by 4 right now.', permanent: false },
  { id: 'wide_sensors', name: 'Wide Sensors', text: 'Permanent: draw 1 extra card each turn.', permanent: true },
  { id: 'stellar_mint', name: 'Stellar Mint', text: 'Permanent: +1 money at the start of each turn.', permanent: true },
  { id: 'plasma_focus', name: 'Plasma Focus', text: 'Permanent: your attack cards deal +1 heat.', permanent: true },
  { id: 'deep_coolant', name: 'Deep Coolant', text: 'Permanent: Thermosiphon and your cooling cards cool 1 more.', permanent: true },
  { id: 'aegis_lattice', name: 'Aegis Lattice', text: 'Permanent: +1 shield each turn.', permanent: true },
  { id: 'flare_focus', name: 'Flare Focus', text: 'Permanent: your first Solar Flare each turn costs 1 less.', permanent: true },
];

const REWARD_BY_ID = new Map(REWARDS.map((r) => [r.id, r]));
export function rewardDef(id: RewardId): RewardDef {
  const def = REWARD_BY_ID.get(id);
  if (!def) throw new Error(`Unknown reward: ${id}`);
  return def;
}

export interface GlobalDef {
  id: GlobalEffectId;
  name: string;
  text: string;
  /** Whether it also applies to the player who played it. */
  affectsCaster: boolean;
}

/**
 * Global cards change the board for everyone, equally, for FIELD_ROUNDS full
 * rounds. Only one is active at a time: a new global replaces it.
 */
export const FIELD_ROUNDS = 3;

export const GLOBALS: Record<GlobalEffectId, GlobalDef> = {
  solarStorm: { id: 'solarStorm', name: 'Solar Storm', text: 'Every sun heats by 1 at the start of its turn.', affectsCaster: true },
  iceAge: { id: 'iceAge', name: 'Ice Age', text: 'Every sun cools by 1 at the start of its turn.', affectsCaster: true },
  tradeBoom: { id: 'tradeBoom', name: 'Trade Boom', text: 'Every player gains +1 money at the start of their turn.', affectsCaster: true },
  magneticStorm: { id: 'magneticStorm', name: 'Magnetic Storm', text: 'Every Solar Flare costs 1 more.', affectsCaster: true },
  solarMaximum: { id: 'solarMaximum', name: 'Solar Maximum', text: 'Every Solar Flare deals +1 heat.', affectsCaster: true },
  nebulaDrift: { id: 'nebulaDrift', name: 'Nebula Drift', text: 'Display cards cost 1 less for everyone (minimum 1).', affectsCaster: true },
};
