import type { ActionCost, CardDef, Effect, HeroAbility } from './types';

/**
 * The Heroes as they fight. A Hero leads from your Hero slot and never fades: it stays until it is removed,
 * beaten down (its stability: 5, more for the great ones, and some mend their own) or
 * replaced by another Hero. Each has its own
 * way of leading, made of up to three things: a lasting effect on your board (often a buff to its own
 * race's cards), sometimes something at each of your dawns, and abilities: once on each of your days you
 * may use one of them, for the energy shown (like a planeswalker's).
 */

/**
 * An ability. Most are free (once a day, while the Hero leads); the stronger ones cost something, and not only
 * energy: the Hero's own stability, one of your other cards sacrificed, or heat on your own sun.
 */
export const act = (id: string, name: string, text: string, effects: Effect[], cost: ActionCost = {}): HeroAbility => {
  const { energy, ...pay } = cost;
  return { id, name, text, effects, ...(energy ? { cost: energy } : {}), ...(Object.keys(pay).length ? { pay } : {}) };
};
/** A Hero's energy cost, from the cost it was listed at: everything a Hero does once it leads earns it one more. */
export const heroCost = (listed: number) => listed + 1;
/**
 * "{act:Rally} {shield:2}." – an ability as it reads on the card: its effect alone (the name is the game's, not
 * the card's), with its energy cost, if any, first: green dots, then a colon ("● : Heat 3"). `{act}` marks where each one starts.
 */
const payText = (a: HeroAbility) =>
  [a.pay?.stability ? `−${a.pay.stability} stability` : '', a.pay?.sacrifice ? 'Sacrifice a card' : '', a.pay?.selfHeat ? `{heat:${a.pay.selfHeat}} to your sun` : ''].filter(Boolean).join(', ');
const line = (a: HeroAbility) => {
  const pay = payText(a);
  return `{act:${a.name}}${a.cost ? `{cost:${a.cost}}${pay ? ` ${pay}` : ''} : ${a.text}` : pay ? `${pay}: ${a.text}` : a.text}`;
};
/** A Hero's text: what it does as it leads (in play, at dawn or dusk), a divider, then "each turn, one of:" its abilities. */
export const hero = (d: Omit<CardDef, 'kind' | 'text'> & { lead?: string }, abilities: HeroAbility[]): CardDef => {
  const { lead, ...def } = d;
  return { ...def, kind: 'command', abilities, text: [lead, abilities.length ? '{abilities}' : '', ...abilities.map(line)].filter(Boolean).join(' ') };
};

export const HERO_CARDS: Record<string, CardDef> = Object.fromEntries(
  [
    // ---- Aureline: the light, carried home ----
    hero(
      { id: 'command_directive', name: 'Solarch Veyra', race: 0, stability: 5, lead: 'Your Aureline attack cards {heat:+1}.', passive: [{ type: 'kindBonus', kind: 'attack', race: 0, amount: 1 }] },
      [act('rally', 'Rally', '{shield:2}.', [{ type: 'shield', amount: 2 }]), act('counsel', 'Counsel', 'Draw 1.', [{ type: 'draw', amount: 1 }])],
    ),
    hero(
      { id: 'ignition_protocol', name: 'Sol-Marshal Aurex', race: 0, stability: 5, lead: '{dawn}: {heat:1}.', onTurn: [{ type: 'heat', amount: 1, to: 'target' }] },
      [act('strafe', 'Strafe', '{heat:3}.', [{ type: 'heat', amount: 3, to: 'target' }], { selfHeat: 2 }), act('overdrive', 'Overdrive', '{energy:1}.', [{ type: 'plays', amount: 1 }])],
    ),
    hero(
      {
        id: 'empress_solenne',
        name: 'Empress Solenne',
        race: 0,
        stability: 7,
        lead: '{heat:4}, {pierce}. {chosen}: +2 attack to a card.',
        onPlay: [{ type: 'heat', amount: 4, to: 'target', pierce: true }, { type: 'empower', amount: 2 }],
      },
      [act('judgement', 'Judgement', '{heat:3}, {pierce}.', [{ type: 'heat', amount: 3, to: 'target', pierce: true }], { energy: 1 }), act('benediction', 'Benediction', '{renew:1}.', [{ type: 'restore', amount: 1, all: true }])],
    ),
    // ---- Xel'Naru: minds of crystal ----
    hero(
      { id: 'coolant_protocol', name: 'Hierarch Vael', race: 1, stability: 5, lead: "Your Xel'Naru cards {cool:+1}.", passive: [{ type: 'kindBonus', race: 1, stat: 'cool', amount: 1 }] },
      [act('vent', 'Vent', '{cool:2}.', [{ type: 'cool', amount: 2 }]), act('insight', 'Insight', 'Draw 1.', [{ type: 'draw', amount: 1 }])],
    ),
    hero(
      { id: 'war_council', name: 'Archon Seris', race: 1, stability: 5, lead: 'When another of your cards leaves play, {heat:1}.', passive: [{ type: 'allyLeaves', effects: [{ type: 'heat', amount: 1, to: 'target' }] }] },
      [act('archive', 'Archive', '{recover} your last discarded card.', [{ type: 'recover', latest: true }], { stability: 1 }), act('shatter', 'Shatter', '{heat:2}, {pierce}.', [{ type: 'heat', amount: 2, to: 'target', pierce: true }], { sacrifice: true })],
    ),
    hero(
      {
        id: 'the_shardmind',
        name: 'The Shardmind',
        race: 1,
        stability: 7,
        lead: "{cool:4}, {recover}. Your Xel'Naru cards {heat:+1}.",
        onPlay: [{ type: 'cool', amount: 4 }, { type: 'recover', orDraw: 1 }],
        passive: [{ type: 'kindBonus', race: 1, amount: 1, others: true }],
      },
      [act('reckoning', 'Cold Reckoning', '{cool:3}.', [{ type: 'cool', amount: 3 }], { energy: 1 }), act('overload', 'Overload', 'Draw 2. {heat:2} to your sun.', [{ type: 'draw', amount: 2 }, { type: 'selfHeat', amount: 2 }])],
    ),
    // ---- Vorthane: the weight of the deep ----
    hero(
      { id: 'tide_regent', name: 'Tide-Regent Osshara', race: 2, stability: 5, lead: '{dawn}: {shield:2}.', onTurn: [{ type: 'shield', amount: 2 }] },
      [act('swell', 'Swell', '{shield:4}. It regains 1 stability.', [{ type: 'shield', amount: 4 }, { type: 'restore', amount: 1, self: true }]), act('current', 'Current', 'Draw 1.', [{ type: 'draw', amount: 1 }])],
    ),
    hero(
      {
        id: 'the_admiralty',
        name: 'The Admiralty',
        race: 2,
        rarity: 'anomaly',
        stability: 6,
        lead: 'Your Vorthane cards {shield:+1}. {dawn}: {shield:2}.',
        onTurn: [{ type: 'shield', amount: 2 }],
        passive: [{ type: 'kindBonus', race: 2, stat: 'shield', amount: 1, others: true }],
      },
      [act('broadside', 'Broadside', '{heat:1} per 2 shields you have (up to 4).', [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'shields', per: 2 }, max: 4 }], { stability: 1 }), act('muster', 'Muster', '{energy:1}.', [{ type: 'plays', amount: 1 }])],
    ),
    hero(
      {
        id: 'leviathan_thoross',
        name: 'Leviathan Thoross',
        race: 2,
        stability: 7,
        lead: '{shield:6}, {eject:3}. {hold}.',
        onPlay: [{ type: 'shield', amount: 6 }, { type: 'bounce', maxDefence: 3 }],
        passive: [{ type: 'keepShields' }],
      },
      [act('crush', 'Crush', '{heat:1} per 2 shields you have (up to 5).', [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'shields', per: 2 }, max: 5 }], { sacrifice: true }), act('deepcall', 'Deep Call', '{shield:4}. It regains 2 stability.', [{ type: 'shield', amount: 4 }, { type: 'restore', amount: 2, self: true }])],
    ),
    // ---- Ixquor: the hive that does not stop ----
    hero(
      { id: 'chamber_protocol', name: "Broodmother Ul'Kha", race: 3, stability: 5, lead: '{dawn}: your other cards grow 1.', onTurn: [{ type: 'growOthers' }] },
      [act('spawn', 'Spawn', '{plant:1}.', [{ type: 'plant', amount: 1 }]), act('nurture', 'Nurture', '{renew:1}. She regains 2 stability.', [{ type: 'restore', amount: 1, all: true }, { type: 'restore', amount: 2, self: true }])],
    ),
    hero(
      { id: 'logistics_command', name: 'Hive-Speaker Zyth', race: 3, stability: 5, lead: 'Your Ixquor cards {heat:+1}.', passive: [{ type: 'kindBonus', race: 3, amount: 1, others: true }] },
      [act('course', 'Course', 'Your {orbit:+1}.', [{ type: 'orbit', amount: 1, who: 'self' }]), act('forage', 'Forage', 'Draw 1.', [{ type: 'draw', amount: 1 }])],
    ),
    hero(
      {
        id: 'the_worldroot',
        name: 'The Worldroot',
        race: 3,
        stability: 7,
        lead: 'Draw 3, {renew:2}. {dawn}: draw 1; it regains 1 stability.',
        onPlay: [{ type: 'draw', amount: 3 }, { type: 'restore', amount: 2, all: true }],
        onTurn: [{ type: 'draw', amount: 1 }, { type: 'restore', amount: 1, self: true }],
      },
      [act('bloom', 'Bloom', '{plant:2}.', [{ type: 'plant', amount: 2 }]), act('roots', 'Deep Roots', '{renew:2}.', [{ type: 'restore', amount: 2, all: true }])],
    ),
  ].map((h) => [h.id, h]),
);
