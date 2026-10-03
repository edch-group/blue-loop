/**
 * The heroes page's two showpieces: the hero's figure, an outline of their race with their gear worn where
 * it sits on the body; and their skill tree, a constellation that grows up from the hero in two branches,
 * each skill a star (the bigger the skill, the bigger the star).
 */
import type { HeroSkill, Item, SlotKind } from '../engine';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------------------------------------------------------------------------
// The figure: each race's outline, and where on it each slot sits (in % of the figure's box)
// ---------------------------------------------------------------------------

/** Each race's outline (viewBox 0 0 200 300), drawn as soft light. */
const FIGURES: string[] = [
  // Aureline: a tall radiant figure in a flowing robe, a halo behind the head, one arm raised with a lance.
  `<circle class="fig-glow" cx="100" cy="52" r="38"/>
   <circle class="fig-line" cx="100" cy="52" r="34" stroke-dasharray="3 6"/>
   <ellipse class="fig-body" cx="100" cy="58" rx="20" ry="23"/>
   <path class="fig-body" d="M78 92c10-8 34-8 44 0l14 34c4 30 10 70 26 150H38c16-80 22-120 26-150z"/>
   <path class="fig-body" d="M120 98c14 2 26-10 34-30l8 4c-6 26-22 42-38 44z"/>
   <path class="fig-body" d="M80 98c-12 10-18 34-20 58l-9-2c2-28 10-52 25-62z"/>
   <path class="fig-line" d="M100 120v150M74 160c16 10 36 10 52 0"/>`,
  // Xel'Naru: a figure of living crystal, all facets and shards, a bright core in the chest.
  `<path class="fig-glow" d="M100 90l40 40-40 60-40-60z"/>
   <path class="fig-body" d="M100 18l22 26-8 34H86l-8-34z"/>
   <path class="fig-body" d="M84 84h32l30 24-16 26 12 60-42 84-42-84 12-60-16-26z"/>
   <path class="fig-body" d="M146 108l28-18 10 10-26 30z"/>
   <path class="fig-body" d="M54 108l-24-20-10 12 24 28z"/>
   <path class="fig-line" d="M100 84v190M70 134l30 18 30-18M84 84l16 22 16-22"/>`,
  // Vorthane: a great domed head over a ring of tentacles, one curling up round a trident.
  `<ellipse class="fig-glow" cx="100" cy="88" rx="62" ry="54"/>
   <path class="fig-body" d="M42 104c0-48 26-78 58-78s58 30 58 78c0 14-8 24-20 28H62c-12-4-20-14-20-28z"/>
   <circle class="fig-eye" cx="82" cy="98" r="7"/><circle class="fig-eye" cx="118" cy="98" r="7"/>
   <path class="fig-limb" d="M66 132c-14 30-34 50-42 92"/>
   <path class="fig-limb" d="M82 134c-6 40-14 74-20 128"/>
   <path class="fig-limb" d="M100 134c0 44 4 80 0 136"/>
   <path class="fig-limb" d="M118 134c6 40 14 74 20 128"/>
   <path class="fig-limb" d="M134 132c14 30 34 50 42 92"/>
   <path class="fig-limb" d="M146 120c22 0 38-20 40-52"/>`,
  // Ixquor: an insect of the hive, a crested head and antennae, a broad thorax, a swollen abdomen and claws.
  `<ellipse class="fig-glow" cx="100" cy="200" rx="60" ry="70"/>
   <path class="fig-line" d="M86 30c-10-12-20-16-30-14M114 30c10-12 20-16 30-14"/>
   <ellipse class="fig-body" cx="100" cy="50" rx="22" ry="20"/>
   <path class="fig-body" d="M70 78c10-10 50-10 60 0l10 40c-12 14-68 14-80 0z"/>
   <ellipse class="fig-body" cx="100" cy="196" rx="52" ry="68"/>
   <path class="fig-line" d="M54 170c30 12 62 12 92 0M50 200c32 14 68 14 100 0M56 230c28 12 60 12 88 0"/>
   <path class="fig-limb" d="M136 96c24-4 38 6 48-14l8 6c-8 20-24 28-50 26"/>
   <path class="fig-limb" d="M64 96c-20 8-30 24-34 44M62 112c-16 16-20 36-18 54"/>`,
];

/** Where each slot sits on its race's figure: [x%, y%]. */
const SOCKETS: Record<string, [number, number]>[] = [
  { helm: [50, 9], mantle: [32, 33], sigil: [50, 48], weapon: [79, 22] },
  { core: [50, 47], facet1: [33, 34], facet2: [67, 34], weapon: [91, 31] },
  { helm: [50, 9], ring1: [15, 74], ring2: [31, 86], ring3: [69, 86], ring4: [85, 74], weapon: [91, 22] },
  { carapace: [50, 31], gland1: [30, 66], gland2: [70, 66], weapon: [91, 28] },
];

/** A small line drawing for each kind of slot (shown in an empty socket). */
const SLOT_ICON: Record<SlotKind, string> = {
  weapon: '<path d="M6 18 18 6M14 6h4v4M8 14l2 2"/>',
  helm: '<path d="M5 15a7 7 0 0 1 14 0v2H5zM12 5v3"/>',
  mantle: '<path d="M5 8c3-3 11-3 14 0l-2 11H7z"/>',
  sigil: '<path d="M12 4l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z"/>',
  core: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  facet: '<path d="M12 4l7 8-7 8-7-8z"/>',
  ring: '<circle cx="12" cy="13" r="6"/><path d="M10 6l2-2 2 2"/>',
  carapace: '<path d="M6 9c2-4 10-4 12 0l-1 9c-3 2-7 2-10 0z"/>',
  gland: '<path d="M12 4c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
};

const icon = (body: string, cls = '') => `<svg class="hv-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export interface FigureData {
  race: number;
  slots: { id: string; kind: SlotKind; name: string }[];
  gear: Record<string, Item>;
  /** The slot picked (its stores are shown, and a find goes there). */
  picked: string | null;
}

/** The hero's figure, with a socket on the body for each slot: worn gear glows in its rarity. */
export function heroFigure(d: FigureData): string {
  const sockets = d.slots
    .map((sl) => {
      const [x, y] = SOCKETS[d.race]?.[sl.id] ?? [50, 50];
      const it = d.gear[sl.id];
      const cls = ['hv-socket', it ? `full rarity-${it.rarity}` : 'empty', d.picked === sl.id ? 'picked' : ''].join(' ');
      const tip = it ? `${it.name}: ${it.text} (tap to take it off)` : `${sl.name}: empty (tap to see what fits)`;
      return `<button class="${cls}" style="left:${x}%;top:${y}%" data-act="${it ? 'cmp-unequip' : 'cmp-slot-pick'}" data-arg="${sl.id}" title="${esc(tip)}" aria-label="${esc(tip)}">
          ${icon(SLOT_ICON[sl.kind])}<i class="hv-socket-tag">${esc(it ? it.name : sl.name.toLowerCase())}</i>
        </button>`;
    })
    .join('');
  return `
    <div class="hv-figure hv-race-${d.race}">
      <svg class="hv-outline" viewBox="0 0 200 300" aria-hidden="true">${FIGURES[d.race] ?? FIGURES[0]}</svg>
      ${sockets}
    </div>`;
}

// ---------------------------------------------------------------------------
// The skill tree: a constellation
// ---------------------------------------------------------------------------

/** A glyph for each kind of skill. */
const SKILL_ICON: Record<string, string> = {
  mod: '<path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z"/>',
  battle: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
  march: '<path d="M4 17l5-5-5-5M12 17l5-5-5-5"/>',
  sight: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  mend: '<path d="M12 5v14M5 12h14"/>',
  loot: '<path d="M6 9l6-5 6 5-6 11z"/><path d="M6 9h12"/>',
  card: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 8h6M9 12h6"/>',
};

/** Where each star of a branch sits (x%, y%), from the hero at the foot up to the crown of the branch. */
const STARS: Record<0 | 1, [number, number][]> = {
  0: [[30, 68], [20, 41], [29, 13]],
  1: [[70, 68], [80, 41], [71, 13]],
};
const ROOT: [number, number] = [50, 90];
const TIER_NAME = ['', 'minor', 'major', 'legendary'];

export interface TreeData {
  hero: string;
  portrait: string;
  tree: HeroSkill[];
  learned: string[];
  /** Why each skill can't be learned now (null: it can). */
  problem: (id: string) => string | null;
  points: number;
  picked: string | null;
}

/** What kind of skill it is, in words (and when it acts). */
export function skillKind(k: HeroSkill): string {
  const e = k.effect;
  return e.kind === 'battle' ? (e.once ? 'battle · once a battle' : `battle · daily, ${e.cost} energy`) : e.kind === 'mod' ? 'battle · always' : e.kind === 'card' ? 'signature card' : 'campaign map';
}

/** The constellation: the hero at its foot, two branches of stars, and the picked star's details below. */
export function skillTree(d: TreeData): string {
  const state = (k: HeroSkill) => (d.learned.includes(k.id) ? 'learned' : d.problem(k.id) ? 'locked' : 'open');
  const pos = (k: HeroSkill) => STARS[k.branch][k.tier - 1];
  // The lines between stars: from the hero to each branch's first star, then up the branch.
  const lines: string[] = [];
  for (const b of [0, 1] as const) {
    const branch = d.tree.filter((k) => k.branch === b).sort((x, y) => x.tier - y.tier);
    let from = ROOT;
    let lit = true;
    for (const k of branch) {
      const to = pos(k);
      lit = lit && d.learned.includes(k.id);
      const mx = (from[0] + to[0]) / 2 + (b === 0 ? -4 : 4);
      const my = (from[1] + to[1]) / 2;
      lines.push(`<path class="hv-link ${lit ? 'lit' : state(k) === 'open' ? 'next' : ''}" d="M${from[0]} ${from[1]} Q${mx} ${my} ${to[0]} ${to[1]}"/>`);
      from = to;
    }
  }
  // A scatter of faint background stars, the same for every hero (round, whatever the sky's shape).
  const dust = Array.from({ length: 60 }, (_, i) => {
    const x = (i * 37.7) % 100, y = (i * 53.3 + (i % 7) * 11) % 100, r = 0.5 + ((i * 7) % 5) * 0.35;
    return `<i style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--r:${r.toFixed(1)}px;opacity:${(0.2 + ((i * 13) % 6) / 10).toFixed(2)}"></i>`;
  }).join('');
  const stars = d.tree
    .map((k) => {
      const [x, y] = pos(k);
      const st = state(k);
      const rays = k.tier === 3 ? `<svg class="hv-rays" viewBox="0 0 100 100" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<path d="M50 50 L${(50 + 48 * Math.cos((i * Math.PI) / 6)).toFixed(1)} ${(50 + 48 * Math.sin((i * Math.PI) / 6)).toFixed(1)}" />`).join('')}</svg>` : '';
      return `<button class="hv-star tier-${k.tier} ${st} ${d.picked === k.id ? 'picked' : ''}" style="left:${x}%;top:${y}%" data-act="cmp-skill-pick" data-arg="${k.id}" title="${esc(`${k.name}: ${k.text}`)}" aria-label="${esc(`${k.name} (${st}): ${k.text}`)}">
          ${rays}<span class="hv-star-core">${icon(SKILL_ICON[k.effect.kind] ?? SKILL_ICON.mod)}</span>
          <i class="hv-star-name">${esc(k.name)}</i>
        </button>`;
    })
    .join('');
  const pick = d.tree.find((k) => k.id === d.picked) ?? d.tree.find((k) => state(k) === 'open') ?? d.tree[0];
  const pst = pick ? state(pick) : 'locked';
  const why = pick ? d.problem(pick.id) : null;
  const detail = pick
    ? `<div class="hv-detail tier-${pick.tier} ${pst}">
        <span class="hv-detail-icon">${icon(SKILL_ICON[pick.effect.kind] ?? SKILL_ICON.mod)}</span>
        <div class="hv-detail-body">
          <small>${TIER_NAME[pick.tier]} · ${esc(skillKind(pick))}</small>
          <b>${esc(pick.name)}</b>
          <p>${esc(pick.text)}</p>
        </div>
        ${pst === 'learned' ? '<span class="hv-learned">learned</span>' : `<button class="hv-learn" data-act="cmp-learn" data-arg="${pick.id}" ${why ? `disabled title="${esc(why)}"` : ''}>${why ? esc(why.replace(/\.$/, '').toLowerCase()) : 'learn · 1 point'}</button>`}
      </div>`
    : '';
  return `
    <div class="hv-sky">
      <div class="hv-dust" aria-hidden="true">${dust}</div>
      <svg class="hv-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>
      <div class="hv-root" style="left:${ROOT[0]}%;top:${ROOT[1]}%">${d.portrait}${d.points > 0 ? `<i class="hv-root-pts">${d.points}</i>` : ''}</div>
      ${stars}
    </div>
    ${detail}`;
}
