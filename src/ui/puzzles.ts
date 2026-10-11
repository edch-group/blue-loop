/**
 * The tutorial and challenge mode, as menu pages: the tutorial's branch of lessons (Oriel at its root), and the
 * challenges (the Dreams of the Lost, from the third tier up [direction: same as the dreams, starting from a much
 * higher tier since players have the tutorial]). What has been done is kept on this device.
 */
import { LESSONS, lessonById, lessonOpen, CORE_LESSONS, type Lesson } from '../engine/lessons';
import { DREAMS } from '../engine/dreams-data';
import type { DreamSpec } from '../engine/game';
import { RACE_NAMES } from '../engine/races';
import { factionAvatar } from './factions';
import { ORACLE_PORTRAIT } from './campaign';

/** The dream tier challenge mode starts at (tiers 1 and 2 are what the tutorial now teaches). */
export const CHALLENGE_FROM_TIER = 3;

/** The challenges, in order: by tier, then race, then goal. */
export const CHALLENGES: DreamSpec[] = DREAMS.filter((d) => d.tier >= CHALLENGE_FROM_TIER).sort((a, b) => a.tier - b.tier || a.race - b.race || a.goal.localeCompare(b.goal));
export const challengeById = (id: string) => CHALLENGES.find((c) => c.id === id);

// ---- Progress --------------------------------------------------------------------------------------------------

const LESSONS_KEY = 'blue-loop:lessons-done';
const CHALLENGES_KEY = 'blue-loop:challenges-solved';

function readList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function addTo(key: string, id: string) {
  try {
    const list = readList(key);
    if (!list.includes(id)) localStorage.setItem(key, JSON.stringify([...list, id]));
  } catch {
    // (only kept as a convenience)
  }
}
export const lessonsDone = () => readList(LESSONS_KEY);
export const markLesson = (id: string) => addTo(LESSONS_KEY, id);
export const challengesSolved = () => readList(CHALLENGES_KEY);
export const markChallenge = (id: string) => addTo(CHALLENGES_KEY, id);

/** The lesson after this one, if it is open now (the next to take). */
export function nextLesson(id: string): Lesson | undefined {
  const done = lessonsDone();
  const i = LESSONS.findIndex((l) => l.id === id);
  return [...LESSONS.slice(i + 1), ...LESSONS.slice(0, i)].find((l) => !done.includes(l.id) && lessonOpen(l.id, done));
}
export function nextChallenge(id: string): DreamSpec | undefined {
  const i = CHALLENGES.findIndex((c) => c.id === id);
  return CHALLENGES[i + 1];
}

// ---- The tutorial's branch ---------------------------------------------------------------------------------------

/**
 * Where each lesson sits on the branch (in a 100 × 64 box): the trunk rising from Oriel, the core forking at
 * "breaking through" into holding on (left) and the four races (right), and the Lost Races' crown above.
 */
const AT: Record<string, [number, number]> = {
  sun: [50, 50],
  energy: [50, 42],
  guard: [50, 34],
  breach: [50, 26],
  shields: [39, 23],
  cooling: [29, 19],
  removal: [19, 16],
  traps: [9, 13],
  forge: [61, 23],
  overheat: [71, 19],
  growth: [81, 16],
  heroes: [91, 13],
  dusk: [96, 7],
  darkspeed: [50, 16],
  consume: [39, 11],
  erode: [61, 11],
  spend: [28, 6],
  bulwark: [72, 6],
  ahead: [50, 4],
};

/** The tutorial page: back, the title, the branch, and the lesson picked waiting to begin. */
export function tutorialPage(picked: string | null): string {
  const done = lessonsDone();
  const coreDone = CORE_LESSONS.every((id) => done.includes(id));
  const pt = (id: string) => AT[id] ?? [50, 50];
  // The branches: each lesson to those before it (the advanced crown from the trunk's top, once the core is done).
  const links = LESSONS.flatMap((l) =>
    l.after.map((a) => {
      const from = a === 'core' ? pt('breach') : pt(a);
      const [x1, y1] = from;
      const [x2, y2] = pt(l.id);
      const lit = done.includes(l.id);
      const open = lessonOpen(l.id, done);
      return `<path class="tut-link ${lit ? 'lit' : open ? 'open' : ''} ${a === 'core' ? 'tut-link-crown' : ''}" d="M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.max(y1, y2) - 1} ${x2} ${y2}"/>`;
    }),
  ).join('');
  const nodes = LESSONS.map((l, i) => {
    const [x, y] = pt(l.id);
    const isDone = done.includes(l.id);
    const open = lessonOpen(l.id, done);
    const state = isDone ? 'done' : open ? 'open' : 'locked';
    return `<button class="tut-node tut-${state} tut-${l.track} ${picked === l.id ? 'on' : ''}" style="left:${x}%;top:${(y / 64) * 100}%" ${open || isDone ? `data-act="tut-pick" data-arg="${l.id}"` : 'disabled'} aria-label="${l.name}">
      <span class="tut-dot">${isDone ? '✓' : i + 1}</span><b>${l.name}</b>
    </button>`;
  }).join('');
  const pick = picked ? lessonById(picked) : undefined;
  const panel = pick
    ? `<div class="tut-pick"><small>${pick.track === 'core' ? 'core' : 'the lost races'}</small><b>${pick.name}</b><span>${pick.teaches}</span><button class="btn-primary" data-act="lesson-start" data-arg="${pick.id}">${done.includes(pick.id) ? 'again' : 'begin'}</button></div>`
    : `<p class="tut-hint">${coreDone ? 'The lost races await, above.' : done.length ? 'The lost races open once the core is learnt.' : 'Walk with me. Start at the root.'}</p>`;
  return `
    <div class="tut">
      <button class="btn btn-small tut-back" data-act="menu-page" data-arg="hub">‹ back</button>
      <header class="tut-head"><small>with oriel</small><h2>tutorial</h2></header>
      <div class="tut-tree">
        <svg class="tut-links" viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true"><path class="tut-link lit" d="M50 59 L50 50"/>${links}</svg>
        ${nodes}
        <div class="tut-root">${ORACLE_PORTRAIT}</div>
      </div>
      <footer class="tut-foot">${panel}</footer>
    </div>`;
}

// ---- Challenges ----------------------------------------------------------------------------------------------

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** The challenges page: a row of tiles for each tier (from the third dream tier, shown as challenge tier I). */
export function challengesPage(picked: string | null): string {
  const solved = challengesSolved();
  const tiers = [...new Set(CHALLENGES.map((c) => c.tier))];
  const rows = tiers
    .map((t) => {
      const tiles = CHALLENGES.filter((c) => c.tier === t)
        .map((c) => {
          const n = CHALLENGES.indexOf(c) + 1;
          const isSolved = solved.includes(c.id);
          return `<button class="ch-tile ${isSolved ? 'solved' : ''} ${picked === c.id ? 'on' : ''}" data-act="ch-pick" data-arg="${c.id}" aria-label="Challenge ${n}">
            <span class="ch-emblem">${factionAvatar(`f${c.race + 1}`, 'ch-emblem-mark')}</span>
            <b>${n}</b><small>${c.goal === 'win' ? ((c.days ?? 1) > 1 ? `win in ${c.days}` : 'win') : 'survive'}</small>${isSolved ? '<i class="ch-check">✓</i>' : ''}
          </button>`;
        })
        .join('');
      const days = CHALLENGES.find((c) => c.tier === t)?.days ?? 1;
      return `<section class="ch-tier"><h4>tier ${ROMAN[t - CHALLENGE_FROM_TIER + 1] ?? t}${days > 1 ? ` · win in ${days}` : ''}</h4><div class="ch-row">${tiles}</div></section>`;
    })
    .join('');
  const pick = picked ? challengeById(picked) : undefined;
  const panel = pick
    ? `<div class="tut-pick"><small>as the ${RACE_NAMES[pick.race].toLowerCase()} · ${timeLimit(pick)} s</small><b>challenge ${CHALLENGES.indexOf(pick) + 1}</b><span>${pick.goal === 'win' ? ((pick.days ?? 1) > 1 ? `win within ${pick.days} days` : 'win this day') : 'survive their day'}</span><button class="btn-primary" data-act="challenge-start" data-arg="${pick.id}">${solved.includes(pick.id) ? 'again' : 'begin'}</button></div>`
    : `<p class="tut-hint">${solved.length} of ${CHALLENGES.length} solved</p>`;
  return `
    <div class="tut ch">
      <button class="btn btn-small tut-back" data-act="menu-page" data-arg="hub">‹ back</button>
      <header class="tut-head"><small>dreams of the lost</small><h2>challenges</h2></header>
      <div class="ch-tiers">${rows}</div>
      <footer class="tut-foot">${panel}</footer>
    </div>`;
}

/** A challenge's time limit, in seconds, over all its days (as a dream's: a minute, and 20 seconds more a tier). */
export const timeLimit = (spec: DreamSpec) => 60 + 20 * spec.tier;
