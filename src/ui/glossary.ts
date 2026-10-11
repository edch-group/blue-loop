/**
 * The glossary [direction: accurate rules, no dead mechanics; not "here's 12 tiles" but something digestible; card
 * basics explained; screenshots of the board, cards and the UI, with arrows, to explain each part]. Each section is a
 * short read: a line or two, a picture of the thing itself with its parts labelled and arrowed, and a list.
 *
 * The pictures are taken by scripts/glossary-shots.mjs, which also notes where each labelled part stands in them
 * (glossary-figures.json), so the arrows land on the very thing.
 */
import { BALANCE } from '../engine/balance';
import { KEYWORDS, type Keyword } from '../engine/keywords';
import { PROGRESSION, RANK_TIERS } from '../engine/progression';
import { KIND_COLOUR, keywordHtml } from './glyphs';
import FIGURES from './glossary-figures.json';
import boardShot from '../assets/glossary/board.jpg';
import cardShot from '../assets/glossary/card.jpg';
import rowShot from '../assets/glossary/row.jpg';
import sunShot from '../assets/glossary/sun.jpg';

const SHOTS: Record<string, string> = { board: boardShot, card: cardShot, row: rowShot, sun: sunShot };
type Figure = { w: number; h: number; marks: { key: string; x: number; y: number }[] };

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * A picture with its parts labelled: each label sits beside the picture (left or right, whichever its part is
 * nearer) and an arrow runs from it to the part. `labels`: the part's key, its name, a line on it, and (optionally)
 * the side it goes on.
 */
function figure(name: string, labels: [key: string, title: string, text: string, side?: 'l' | 'r'][], caption = ''): string {
  const fig = (FIGURES as Record<string, Figure>)[name];
  const at = new Map(fig.marks.map((m) => [m.key, m]));
  const items = labels
    .filter(([key]) => at.has(key))
    .map(([key, title, text, side], i) => ({ ...at.get(key)!, title, text, n: i + 1, side: side ?? (at.get(key)!.x < 50 ? 'l' : 'r') }));
  const label = (it: (typeof items)[number]) =>
    `<div class="gl-label" data-mark="${it.key}" data-y="${it.y}"><i>${it.n}</i><b>${it.title}</b><span>${it.text}</span></div>`;
  const col = (side: 'l' | 'r') =>
    `<div class="gl-fig-col gl-fig-${side}">${items
      .filter((it) => it.side === side)
      .sort((a, b) => a.y - b.y)
      .map(label)
      .join('')}</div>`;
  return `
    <figure class="gl-fig gl-fig-${name}" style="--ar:${fig.w}/${fig.h}">
      ${col('l')}
      <div class="gl-shot">
        <img src="${SHOTS[name]}" alt="" width="${fig.w}" height="${fig.h}" loading="lazy" decoding="async">
        ${items.map((it) => `<i class="gl-pin" data-pin="${it.key}" style="left:${it.x}%;top:${it.y}%"><b>${it.n}</b></i>`).join('')}
      </div>
      ${col('r')}
      <svg class="gl-arrows" aria-hidden="true"><defs><marker id="gl-head-${name}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z"/></marker></defs></svg>
      ${caption ? `<figcaption>${caption}</figcaption>` : ''}
    </figure>`;
}

/** Rows of a term and what it means: one per line, read top to bottom. */
const terms = (rows: [string, string][]) => `<dl class="gl-terms">${rows.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>`;
const kindDot = (k: keyof typeof KIND_COLOUR) => `<i class="rule-dot" style="--kc:${KIND_COLOUR[k]}"></i>`;
const kw = (id: string, v?: string) => keywordHtml(id, v);

const GROUP_NAMES: Record<Keyword['group'], string> = {
  timing: 'When it acts',
  heat: 'Heat',
  cool: 'Cooling',
  shields: 'Shields',
  defence: 'Defence',
  stability: 'Stability',
  repair: 'Repair',
  removal: 'Removal',
  tempo: 'Energy and cards',
  resonance: 'Neighbours',
  recovery: 'Recovery',
  orbit: 'Orbit',
  lightspeed: 'Lightspeed',
  trap: 'Traps',
  global: 'Global',
};

/** The glossary's sections, in order: [name, contents]. */
export function glossarySections(): Record<string, [string, () => string]> {
  const B = BALANCE;
  return {
    basics: [
      'The table',
      () => `
        <h3>The table</h3>
        <p class="gl-lead">Two suns, two rows of cards. Heat your rival's sun to <b>${B.supernovaAt}</b> and it goes supernova: you win. If yours gets there first, you lose.</p>
        ${figure('board', [
          ['rivalSun', 'Their sun', `Your target: heat it to ${B.supernovaAt}.`],
          ['rivalRow', 'Their tableau', 'The cards your rival has in play.', 'r'],
          ['mySun', 'Your sun', `Keep it under ${B.supernovaAt}.`],
          ['myRow', 'Your tableau', `Your cards in play. ${B.tableauSlots} slots.`, 'r'],
          ['hand', 'Your hand', `Up to ${B.maxHand} cards.`, 'l'],
        ])}
        <p class="gl-lead">Around the edges:</p>
        ${figure('board', [
          ['phases', 'Whose day', 'Whose day it is, and its phase.', 'l'],
          ['hero', 'Your Hero', 'Leads from its own slot.', 'r'],
          ['trap', 'Trap slot', 'One trap, face down.', 'l'],
          ['piles', 'Deck and discard', 'Draw from one, spent cards go to the other.', 'r'],
          ['energy', 'Energy', 'Each dot pays for one point of cost.', 'r'],
          ['endDay', 'End day', 'Ends your day.', 'r'],
        ])}
        ${terms([
          ['Days', 'You and your rival take turns, called days. Each has a dawn, the day itself and a dusk.'],
          ['Cards stay', 'Most cards you play stay in your tableau and keep working, day after day, until they are beaten down or removed.'],
          ['Your deck', `${B.deckSize} to ${B.maxDeckSize} cards. At most ${B.maxCopies} of each, one of an Anomaly, and one Hero per ${B.cardsPerCommand} cards.`],
          ['Your hand', `You start with ${B.openingHand} cards (the second player ${B.openingHand + B.laterSeatCards}) and draw ${B.drawPerTurn} at every dawn after your first.`],
        ])}`,
    ],
    card: [
      'Reading a card',
      () => `
        <h3>Reading a card</h3>
        <p class="gl-lead">Every card says what it costs, what it is and what it does. A card in play also shows how hard it hits and how much it can take.</p>
        ${figure('card', [
          ['type', 'Type', 'Entity, technology, relic, Hero, global or trap.', 'r'],
          ['cost', 'Cost', 'The green dots: energy to play it.', 'l'],
          ['rarity', 'Rarity gem', 'Common to anomaly.', 'l'],
          ['name', 'Name', '', 'r'],
          ['text', 'What it does', 'Keywords and when they act. Dawn: the start of your day.', 'r'],
          ['attack', 'Attack', 'The heat it deals when it attacks.', 'l'],
          ['defence', 'Defence', 'Soaks up hits before stability.', 'l'],
          ['stability', 'Stability', 'How much it can take. At 0 it is gone.', 'r'],
        ])}
        ${terms([
          ['Cost', 'You get energy each day. Playing a card spends its cost.'],
          ['Attack', 'Once a day, a card with attack can strike your rival\'s sun or one of their cards.'],
          ['Defence', `What a card in play can shrug off. It comes from its slot (${B.slotDefence.join(' · ')}, left to right; the Hero's slot ${B.commandSlotDefence}) plus any ${kw('sturdy', '1')} of its own.`],
          ['Stability', 'A card\'s health. Hits past its defence take stability off. At 0 the card goes to your discard pile.'],
          ['Keywords', 'Hover a keyword on a card, or open the card, to read it. Every keyword is in the keywords section.'],
        ])}`,
    ],
    day: [
      'Your day',
      () => `
        <h3>Your day</h3>
        <p class="gl-lead">Each day runs the same way: dawn, then your moves, then dusk. Then it is your rival's day.</p>
        <ol class="gl-steps">
          <li><b>Dawn</b><span>Your shields drop away. The orbit turns a notch. You draw ${B.drawPerTurn} (not on your first day). From round ${B.instabilityStartsRound}, regional instability heats every sun, more each round. Any global card acts. Then every card in your tableau runs its ${kw('dawn')} effect, left to right.</span></li>
          <li><b>Energy</b><span>You get energy equal to the days you have taken: 1 on your first, 2 on your second, up to ${B.maxPlays}. The industrial planet and energy cards add more.</span></li>
          <li><b>Your moves</b><span>In any order: play cards, attack with each ready card once, use your Hero once, set a trap. A card you play comes in dimmed: it can't attack or act until your next day, unless it has ${kw('darkspeed')}.</span></li>
          <li><b>Dusk</b><span>Press end day. Every ${kw('dusk')} effect runs, left to right, except on cards played today. Over ${B.maxHand} cards in hand, you discard down to ${B.maxHand}.</span></li>
          <li><b>Their day</b><span>Energy you didn't spend is banked through their day. With it you can answer once, with a ${kw('lightspeed')} card, when they play a card or attack.</span></li>
        </ol>
        ${figure('board', [
          ['phases', 'Phases', 'Dawn, day, dusk: lit as they pass.'],
          ['energy', 'Energy left', 'Spent as you play.'],
          ['endDay', 'End day', 'Runs your dusk.'],
        ])}`,
    ],
    fighting: [
      'Fighting',
      () => `
        <h3>Fighting</h3>
        <p class="gl-lead">Attack their sun to win, or attack their cards to stop what they do to yours.</p>
        ${figure('row', [
          ['slotDef', 'Slot defence', 'An empty slot shows the defence it gives.', 'l'],
          ['armed', 'Ready to attack', 'Outlined: it can attack now.', 'l'],
          ['guard', 'Guard', 'Attacks must hit it first.', 'r'],
          ['wall', 'Defence', 'Slot plus Sturdy, less any wear.', 'r'],
        ])}
        ${terms([
          ['Attacking a sun', 'Its attack lands as heat on the sun. Shields soak up heat first, 1 each.'],
          ['Attacking a card', `The hit wears its defence first. Wear lasts: only ${kw('repair', '1')} mends it, and it stays in the slot if the card leaves. Past its defence, the hit takes stability. At 0 the card goes to the discard pile.`],
          ['Hitting back', `A card that is attacked hits back with its own attack and any ${kw('sting', '1')}. That wears the attacker the same way.`],
          ['Guard', `While they have a ${kw('guard')} in play, your attacks must hit a Guard. Heat aimed by a card you play, or by your Hero, goes where you choose.`],
          ['Removal', `${kw('destroy', '2')} and the like only reach cards with that much defence or less.`],
          ['A full tableau', 'A new card replaces one of yours, which leaves play. You pick which.'],
        ])}`,
    ],
    sun: [
      'Your sun',
      () => `
        <h3>Your sun</h3>
        <p class="gl-lead">Every sun starts at ${B.startingHeat} heat and goes supernova at ${B.supernovaAt}. It can be cooled as low as ${B.minHeat}.</p>
        ${figure('sun', [
          ['heat', 'Heat', `Now, out of ${B.supernovaAt}.`, 'l'],
          ['planetTag', 'Facing planet', 'Which planet faces you, and for how many more days.', 'l'],
          ['shields', 'Shields', 'Each blocks 1 heat. Gone at your dawn.', 'r'],
          ['planets', 'Orbit', 'Three planets take turns.', 'r'],
        ])}
        ${terms([
          [keywordHtml('heat', undefined, { named: true }), 'Heats your rival\'s sun, unless the card says your own. Heat from a card as it is played can be aimed at one of their cards instead.'],
          [keywordHtml('cool', undefined, { named: true }), 'Takes heat off your sun.'],
          [keywordHtml('shield', undefined, { named: true }), 'Each blocks 1 heat aimed at your sun. They drop away at your dawn.'],
          ['Orbit', `Three planets face your sun in turn, ${B.orbitTurns} days each. Dead: nothing. Abundant: draw ${B.abundantDraw} more. Industrial: ${B.industrialPlays} more energy.`],
          ['Instability', `From round ${B.instabilityStartsRound}, every sun takes heat at dawn, 1 more every few rounds. Games end.`],
          ['An empty deck', `Your discard pile is shuffled back in, free. With both empty, each card you should draw heats your sun ${B.fatigueHeat} instead.`],
        ])}`,
    ],
    types: [
      'Card types',
      () => `
        <h3>Card types</h3>
        <p class="gl-lead">The type is written across the top of every card.</p>
        ${terms([
          [`${kindDot('unit')}Entity`, 'Stays in your tableau. Attacks once a day if it has attack. Its dawn and dusk effects run every day.'],
          [`${kindDot('surge')}Technology`, 'Does its thing as it is played, then goes to your discard pile.'],
          [`${kindDot('relic')}Relic`, `Stays, with no attack: a lasting effect. ${kw('brittle')}.`],
          [`${kindDot('command')}Hero`, `One per ${B.cardsPerCommand} cards in a deck. Leads from its own slot. Once a day: its ability, or an attack.`],
          [`${kindDot('global')}Global`, 'Changes the table for both players. One at a time.'],
          [`${kindDot('trap')}Trap`, 'Set face down in your trap slot, one at a time. Springs on the first thing that triggers it.'],
        ])}`,
    ],
    keywords: [
      'Keywords',
      () => {
        const groups = new Map<Keyword['group'], string[]>();
        for (const [id, k] of Object.entries(KEYWORDS)) (groups.get(k.group) ?? groups.set(k.group, []).get(k.group)!).push(`<div><dt>${keywordHtml(id, undefined, { named: true })}</dt><dd>${esc(k.explain())}</dd></div>`);
        return `
          <h3>Keywords</h3>
          <p class="gl-lead">Hover a keyword on a card, or open the card, to read it there.</p>
          ${[...groups].map(([g, rows]) => `<section class="gl-kw"><h4>${GROUP_NAMES[g] ?? g}</h4><dl class="gl-terms">${rows.join('')}</dl></section>`).join('')}`;
      },
    ],
    progress: [
      'Progress',
      () => `
        <h3>Progress</h3>
        ${terms([
          ['Levels', `Every game earns experience. Each level: ✦${PROGRESSION.levelReward.stardust} and ⟁${PROGRESSION.levelReward.flux}.`],
          ['Stardust ✦', `Buys boosters: ✦${PROGRESSION.boosterPrice} for ${PROGRESSION.boosterSize} cards.`],
          ['Flux ⟁', 'Crafts the cards you want. Breaking one down returns half.'],
          ['Ranks', `${RANK_TIERS.join(' → ')}. Three stages each.`],
          ['Ranked', 'Matches players at most one tier apart. Beat higher ranks for more.'],
          ['Collection', 'You start with every starter card. Boosters and crafting add the rest.'],
        ])}`,
    ],
  };
}

/**
 * Lays out each figure's labels beside its picture, each as near its part as the others let it, and draws the arrows.
 * Run after the glossary is drawn, and again whenever it changes size. On a narrow screen the labels go below the
 * picture as a numbered list, and the numbers sit on the parts.
 */
export function layoutGlossaryFigures(root: ParentNode) {
  for (const fig of root.querySelectorAll<HTMLElement>('.gl-fig')) {
    // (Laid out again once its picture has loaded and has its size.)
    const img = fig.querySelector<HTMLImageElement>('.gl-shot img');
    if (img && !img.complete && !img.dataset.waiting) {
      img.dataset.waiting = '1';
      img.addEventListener('load', () => layoutGlossaryFigures(root), { once: true });
    }
    const shot = fig.querySelector<HTMLElement>('.gl-shot')!;
    const svg = fig.querySelector<SVGSVGElement>('.gl-arrows')!;
    svg.querySelectorAll('path.gl-arrow, circle').forEach((x) => x.remove());
    fig.classList.toggle('gl-fig-narrow', fig.clientWidth < 620);
    if (fig.classList.contains('gl-fig-narrow')) {
      fig.querySelectorAll<HTMLElement>('.gl-label').forEach((l) => (l.style.top = ''));
      continue;
    }
    // (The page may be scaled: everything is worked out in the figure's own pixels.)
    const box = fig.getBoundingClientRect();
    const k = box.width / fig.offsetWidth || 1;
    const sr = shot.getBoundingClientRect();
    const s = { top: sr.top / k, height: sr.height / k };
    // (Labels first, both sides, so the figure has its final height; then the arrows.)
    const cols = [...fig.querySelectorAll<HTMLElement>('.gl-fig-col')];
    for (const col of cols) {
      const labels = [...col.querySelectorAll<HTMLElement>('.gl-label')];
      // Each label as near its part's height as it can be, none overlapping, all inside the column.
      const colTop = col.getBoundingClientRect().top / k;
      const gap = 10;
      const want = labels.map((l) => s.top - colTop + (Number(l.dataset.y) / 100) * s.height - l.offsetHeight / 2);
      const tops: number[] = [];
      labels.forEach((_l, i) => (tops[i] = Math.max(i ? tops[i - 1] + labels[i - 1].offsetHeight + gap : 0, want[i])));
      // (Pulled back up where they would run past the picture's foot, as far as the ones above allow.)
      col.style.minHeight = '';
      const room = col.clientHeight;
      for (let i = labels.length - 1; i >= 0; i--) {
        const limit = i === labels.length - 1 ? room - labels[i].offsetHeight : tops[i + 1] - gap - labels[i].offsetHeight;
        const floor = i ? tops[i - 1] + labels[i - 1].offsetHeight + gap : 0;
        tops[i] = Math.max(floor, Math.min(tops[i], limit));
      }
      labels.forEach((l, i) => (l.style.top = `${tops[i]}px`));
      // (Taller than the picture: the column grows to hold them.)
      const end = labels.length ? tops[labels.length - 1] + labels[labels.length - 1].offsetHeight : 0;
      col.style.minHeight = end > room ? `${end}px` : '';
    }
    // The arrows: from each label's inner edge to its part.
    // (No viewBox: the arrows are drawn in the figure's own pixels, one to one.)
    for (const col of cols) {
      const left = col.classList.contains('gl-fig-l');
      for (const l of col.querySelectorAll<HTMLElement>('.gl-label')) {
        const pin = shot.querySelector<HTMLElement>(`[data-pin="${l.dataset.mark}"]`);
        if (!pin) continue;
        const r = l.getBoundingClientRect();
        const p = pin.getBoundingClientRect();
        const x1 = ((left ? r.right : r.left) - box.left) / k + (left ? 6 : -6);
        const y1 = (r.top - box.top) / k + Math.min(r.height / k / 2, 9);
        const x2 = (p.left + p.width / 2 - box.left) / k;
        const y2 = (p.top + p.height / 2 - box.top) / k;
        const bend = Math.max(30, Math.abs(x2 - x1) * 0.45);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'gl-arrow');
        path.setAttribute('d', `M${x1} ${y1} C${x1 + (left ? bend : -bend)} ${y1} ${x2 + (left ? -bend * 0.4 : bend * 0.4)} ${y2} ${x2} ${y2}`);
        path.setAttribute('marker-end', `url(#gl-head-${[...fig.classList].find((c) => c.startsWith('gl-fig-') && !['gl-fig-narrow'].includes(c))!.slice(7)})`);
        svg.appendChild(path);
      }
    }
  }
}
