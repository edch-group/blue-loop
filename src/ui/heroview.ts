/**
 * The heroes page's two showpieces: the hero's portrait, their own picture with their gear worn where it
 * sits on the body; and their skill tree, a constellation that grows up from the hero in two branches,
 * each skill a star (the bigger the skill, the bigger the star).
 */
import { cardDef, skillCost, RESEARCH_BRANCHES, type HeroSkill, type Item, type ResearchProject, type SlotKind } from '../engine';
import { cardScene } from './cardart';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------------------------------------------------------------------------
// The figure: the hero's own picture, cropped to a portrait, and where on it each slot sits
// ---------------------------------------------------------------------------

/**
 * Each hero's portrait window into their card scene (the scene is 160 x 100; the window is 80 wide, full
 * height, starting at x0), and where each slot sits on the body, in scene units.
 */
const PORTRAITS: Record<string, { x0: number; at: Record<string, [number, number]> }> = {
  // Aureline: the halo is the helm, the sash the mantle, the heart the sigil, the shield or lance the weapon.
  command_directive: { x0: 30, at: { helm: [64, 13], mantle: [56, 50], sigil: [64, 64], weapon: [96, 48] } },
  ignition_protocol: { x0: 28, at: { helm: [58, 12], mantle: [63, 53], sigil: [56, 70], weapon: [98, 38] } },
  empress_solenne: { x0: 50, at: { helm: [80, 12], mantle: [70, 52], sigil: [80, 68], weapon: [111, 52] } },
  // Xel'Naru: the bright heart is the core, the shards at the shoulders the facets, what they hold the weapon.
  war_council: { x0: 24, at: { core: [62, 41], facet1: [40, 34], facet2: [80, 30], weapon: [94, 58] } },
  coolant_protocol: { x0: 30, at: { core: [68, 42], facet1: [45, 28], facet2: [88, 25], weapon: [104, 42] } },
  the_shardmind: { x0: 40, at: { core: [80, 42], facet1: [60, 28], facet2: [98, 26], weapon: [112, 40] } },
  // Vorthane: the crown is the helm, a ring on each of four tentacles, the trident the weapon.
  tide_regent: { x0: 30, at: { helm: [70, 6], ring1: [53, 64], ring2: [64, 75], ring3: [77, 75], ring4: [88, 64], weapon: [105, 40] } },
  the_admiralty: { x0: 40, at: { helm: [80, 6], ring1: [66, 58], ring2: [74, 70], ring3: [86, 70], ring4: [94, 58], weapon: [108, 22] } },
  leviathan_thoross: { x0: 50, at: { helm: [80, 9], ring1: [62, 62], ring2: [72, 76], ring3: [88, 76], ring4: [98, 62], weapon: [126, 52] } },
  // Ixquor: the cap is the carapace, glands along the stalk, the spores or pods the weapon.
  logistics_command: { x0: 26, at: { carapace: [66, 30], gland1: [60, 58], gland2: [72, 66], weapon: [92, 36] } },
  chamber_protocol: { x0: 32, at: { carapace: [72, 31], gland1: [66, 52], gland2: [78, 62], weapon: [96, 64] } },
  the_worldroot: { x0: 40, at: { carapace: [80, 24], gland1: [74, 52], gland2: [86, 62], weapon: [100, 44] } },
};

const portraitArt = new Map<string, string>();
/** The hero's scene, cropped to their portrait window, as an image. */
function portraitImage(hero: string, x0: number): string {
  let img = portraitArt.get(hero);
  if (!img) {
    const svg = cardScene(cardDef(hero)).replace('<svg class="art"', '<svg xmlns="http://www.w3.org/2000/svg"').replace('viewBox="0 0 160 100"', `viewBox="${x0} 0 80 100"`);
    img = `<img class="hv-portrait" alt="" draggable="false" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" />`;
    portraitArt.set(hero, img);
  }
  return img;
}

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
  hero: string;
  slots: { id: string; kind: SlotKind; name: string }[];
  gear: Record<string, Item>;
  /** The slot picked (its stores are shown, and a find goes there). */
  picked: string | null;
}

/** The hero's portrait, with a socket on the body for each slot: worn gear glows in its rarity. */
export function heroFigure(d: FigureData): string {
  const pic = PORTRAITS[d.hero] ?? { x0: 40, at: {} };
  const sockets = d.slots
    .map((sl, i) => {
      const [sx, sy] = pic.at[sl.id] ?? [pic.x0 + 12 + (i % 3) * 28, 30 + Math.floor(i / 3) * 30];
      const x = ((sx - pic.x0) / 80) * 100;
      const it = d.gear[sl.id];
      const cls = ['hv-socket', it ? `full rarity-${it.rarity}` : 'empty', d.picked === sl.id ? 'picked' : '', x > 70 ? 'tag-left' : x < 30 ? 'tag-right' : ''].join(' ');
      const tip = it ? `${it.name}: ${it.text} (tap to take it off)` : `${sl.name}: empty (tap to see what fits)`;
      return `<button class="${cls}" style="left:${x.toFixed(1)}%;top:${sy}%" data-act="${it ? 'cmp-unequip' : 'cmp-slot-pick'}" data-arg="${sl.id}" title="${esc(tip)}" aria-label="${esc(tip)}">
          ${icon(SLOT_ICON[sl.kind])}<i class="hv-socket-tag">${esc(it ? it.name : sl.name.toLowerCase())}</i>
        </button>`;
    })
    .join('');
  return `
    <div class="hv-figure">
      ${portraitImage(d.hero, pic.x0)}
      ${sockets}
    </div>`;
}

// ---------------------------------------------------------------------------
// The skill tree: a constellation
// ---------------------------------------------------------------------------

/** A glyph for each kind of skill (and of research project). */
export const SKILL_ICON: Record<string, string> = {
  heat: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1.5 1 2 2 2 3 1-2 1-5 1-7z"/>',
  shield: '<path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z"/>',
  ward: '<path d="M5 6h14v5c0 5-3 8-7 9-4-1-7-4-7-9z"/><path d="M9 11l2 2 4-4"/>',
  cool: '<path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"/>',
  draw: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 8h6M9 12h6"/>',
  energy: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
  plant: '<path d="M12 21V10M12 10c0-4 3-6 7-6 0 4-3 6-7 6zM12 13c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
  start: '<path d="M4 17h16l-1.5-9-4.5 4-2-6-2 6-4.5-4z"/><path d="M5 20h14"/>',
  march: '<path d="M4 17l5-5-5-5M12 17l5-5-5-5"/>',
  sight: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  mend: '<path d="M12 5v14M5 12h14"/>',
  hull: '<path d="M3 14h18l-3 5H6zM6 14V9h12v5M9 9V5h6v4"/>',
  loot: '<path d="M6 9l6-5 6 5-6 11z"/><path d="M6 9h12"/>',
  dread: '<path d="M12 3c-4.5 0-7 3-7 7 0 2.5 1.2 4 3 5v3h8v-3c1.8-1 3-2.5 3-5 0-4-2.5-7-7-7z"/><circle cx="9.5" cy="10.5" r="1.3"/><circle cx="14.5" cy="10.5" r="1.3"/><path d="M11 18v2M13 18v2"/>',
};

/** Where each star of a branch sits (x%, y%), from the hero at the foot up to the branch's capstone. */
const STARS: Record<0 | 1 | 2, [number, number][]> = {
  0: [[36, 77], [27, 64], [20, 51], [17, 38], [20, 25], [25, 10]],
  1: [[50, 75], [50, 62], [50, 49], [50, 36], [50, 23], [50, 9]],
  2: [[64, 77], [73, 64], [80, 51], [83, 38], [80, 25], [75, 10]],
};
const ROOT: [number, number] = [50, 91];
const BRANCH_NAME = ['might', 'ward', 'legacy'];
/** How big a skill looks: tiers 1–3 minor, 4–5 major, 6 the capstone. */
const look = (tier: number) => (tier <= 3 ? 1 : tier <= 5 ? 2 : 3);
const TIER_NAME = ['', 'minor', 'major', 'capstone'];

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

/** What kind of skill it is, in words. */
export function skillKind(k: HeroSkill): string {
  return k.effect.kind === 'start' ? 'battle · the hero starts in play' : 'hero card';
}

/**
 * The night behind the tree, the same for every hero: a few hundred pin-prick stars of slightly different
 * colours, thicker along a faint band of the galaxy, a handful of brighter ones with a soft four-point glint,
 * and some that twinkle.
 */
const SKY_DUST = (() => {
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const tints = ['#ffffff', '#dfe9ff', '#c9dbff', '#fff1dc', '#ffe2c4'];
  const out: string[] = [];
  for (let i = 0; i < 220; i++) {
    // Two in three fall near the band, a soft diagonal from bottom left to top right.
    const t = r();
    const band = r() < 0.66;
    const x = band ? t * 100 : r() * 100;
    const y = band ? 92 - t * 84 + (r() + r() + r() - 1.5) * 26 : r() * 100;
    if (y < 0 || y > 100) continue;
    const b = r() ** 3;
    const size = 0.5 + b * 1.4;
    const tint = tints[Math.floor(r() * tints.length)];
    const tw = r() < 0.12 ? ` tw" style="--d:${(2 + r() * 4).toFixed(1)}s;--o:${(0.3 + b * 0.6).toFixed(2)};` : '" style="';
    out.push(`<i class="${tw}left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--s:${size.toFixed(2)}px;--c:${tint};opacity:${(0.25 + b * 0.7).toFixed(2)}"></i>`);
  }
  for (let i = 0; i < 7; i++) {
    out.push(`<b style="left:${(6 + r() * 88).toFixed(1)}%;top:${(4 + r() * 90).toFixed(1)}%;--s:${(9 + r() * 10).toFixed(0)}px;--d:${(3 + r() * 4).toFixed(1)}s"></b>`);
  }
  return out.join('');
})();

/** The constellation: the hero at its foot, two branches of stars, and the picked star's details below. */
export function skillTree(d: TreeData): string {
  const state = (k: HeroSkill) => (d.learned.includes(k.id) ? 'learned' : d.problem(k.id) ? 'locked' : 'open');
  const pos = (k: HeroSkill) => STARS[k.branch][k.tier - 1];
  // The lines between stars: from the hero to each branch's first star, then up the branch.
  const lines: string[] = [];
  for (const b of [0, 1, 2] as const) {
    const branch = d.tree.filter((k) => k.branch === b).sort((x, y) => x.tier - y.tier);
    let from = ROOT;
    let lit = true;
    for (const k of branch) {
      const to = pos(k);
      lit = lit && d.learned.includes(k.id);
      const mx = (from[0] + to[0]) / 2 + (b === 0 ? -3 : b === 2 ? 3 : 0);
      const my = (from[1] + to[1]) / 2;
      lines.push(`<path class="hv-link ${lit ? 'lit' : state(k) === 'open' ? 'next' : ''}" d="M${from[0]} ${from[1]} Q${mx} ${my} ${to[0]} ${to[1]}"/>`);
      from = to;
    }
  }
  const dust = SKY_DUST;
  const stars = d.tree
    .map((k) => {
      const [x, y] = pos(k);
      const st = state(k);
      const rays = look(k.tier) === 3 ? `<svg class="hv-rays" viewBox="0 0 100 100" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<path d="M50 50 L${(50 + 48 * Math.cos((i * Math.PI) / 6)).toFixed(1)} ${(50 + 48 * Math.sin((i * Math.PI) / 6)).toFixed(1)}" />`).join('')}</svg>` : '';
      return `<button class="hv-star tier-${look(k.tier)} ${st} ${d.picked === k.id ? 'picked' : ''}" style="left:${x}%;top:${y}%" data-act="cmp-skill-pick" data-arg="${k.id}" title="${esc(`${k.name}: ${k.text}`)}" aria-label="${esc(`${k.name} (${st}): ${k.text}`)}">
          ${rays}<span class="hv-star-core">${icon(SKILL_ICON[k.icon] ?? SKILL_ICON.ward)}</span>
          <i class="hv-star-name">${esc(k.name)}</i>
        </button>`;
    })
    .join('');
  const pick = d.tree.find((k) => k.id === d.picked) ?? d.tree.find((k) => state(k) === 'open') ?? d.tree[0];
  const pst = pick ? state(pick) : 'locked';
  const why = pick ? d.problem(pick.id) : null;
  const detail = pick
    ? `<div class="hv-detail tier-${look(pick.tier)} ${pst}">
        <span class="hv-detail-icon">${icon(SKILL_ICON[pick.icon] ?? SKILL_ICON.ward)}</span>
        <div class="hv-detail-body">
          <small>${BRANCH_NAME[pick.branch]} ${pick.tier} · ${TIER_NAME[look(pick.tier)]} · ${esc(skillKind(pick))}</small>
          <b>${esc(pick.name)}</b>
          <p>${esc(pick.text)}</p>
        </div>
        ${pst === 'learned' ? '<span class="hv-learned">learned</span>' : `<button class="hv-learn" data-act="cmp-learn" data-arg="${pick.id}" ${why ? `disabled title="${esc(why)}"` : ''}>${why ? esc(why.replace(/\.$/, '').toLowerCase()) : `learn · ${skillCost(pick)} point${skillCost(pick) === 1 ? '' : 's'}`}</button>`}
      </div>`
    : '';
  return `
    <div class="hv-sky">
      <div class="hv-dust" aria-hidden="true">${dust}</div>
      <svg class="hv-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>
      <div class="hv-root" style="left:${ROOT[0]}%;top:${ROOT[1]}%">${d.portrait}${d.points > 0 ? `<i class="hv-root-pts">${d.points}</i>` : ''}</div>
      ${BRANCH_NAME.map((n, i) => `<i class="hv-branch" style="left:${[20, 50, 80][i]}%">${n}</i>`).join('')}
      ${stars}
    </div>
    ${detail}`;
}

// ---------------------------------------------------------------------------
// The research tree: the same night sky, four branches rising from the research core
// ---------------------------------------------------------------------------

/** Where each project of a branch sits (x%, y%), from the core at the foot outward and up. */
const RS_STARS: [number, number][][] = [
  [[31, 75], [21, 58], [13, 41], [8, 23]],
  [[42, 64], [37, 47], [33, 30], [30, 13]],
  [[58, 64], [63, 47], [67, 30], [70, 13]],
  [[69, 75], [79, 58], [87, 41], [92, 23]],
];
const RS_ROOT: [number, number] = [50, 89];
/** The research core at the foot of the tree: an atom of three orbits. */
const RS_CORE = '<svg class="rs-core-art" viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="24" rx="19" ry="7"/><ellipse cx="24" cy="24" rx="19" ry="7" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="19" ry="7" transform="rotate(-60 24 24)"/><circle class="rs-nucleus" cx="24" cy="24" r="4"/></svg>';

export interface ResearchTreeData {
  projects: ResearchProject[];
  done: string[];
  current?: { id: string; left: number };
  /** Why each project can't be started now (null: it can). */
  problem: (id: string) => string | null;
  picked: string | null;
  materialsIcon: string;
}

/** The research constellation: the core at its foot, a branch for each field, and the picked project below. */
export function researchTree(d: ResearchTreeData): string {
  const state = (p: ResearchProject) => (d.done.includes(p.id) ? 'learned' : d.current?.id === p.id ? 'current' : d.problem(p.id) ? 'locked' : 'open');
  const pos = (p: ResearchProject) => RS_STARS[p.branch][p.tier - 1];
  const last = (p: ResearchProject) => !d.projects.some((x) => x.branch === p.branch && x.tier > p.tier);
  const size = (p: ResearchProject) => (last(p) ? 3 : p.tier === 1 ? 1 : 2);
  const lines: string[] = [];
  for (const b of [0, 1, 2, 3]) {
    let from = RS_ROOT;
    let lit = true;
    for (const p of d.projects.filter((x) => x.branch === b).sort((x, y) => x.tier - y.tier)) {
      const to = pos(p);
      const st = state(p);
      lit = lit && st === 'learned';
      const bend = [-4, -2, 2, 4][b];
      lines.push(`<path class="hv-link ${lit ? 'lit' : st === 'open' || st === 'current' ? 'next' : ''}" d="M${from[0]} ${from[1]} Q${(from[0] + to[0]) / 2 + bend} ${(from[1] + to[1]) / 2} ${to[0]} ${to[1]}"/>`);
      from = to;
    }
  }
  const stars = d.projects
    .map((p) => {
      const [x, y] = pos(p);
      const st = state(p);
      const rays = size(p) === 3 ? `<svg class="hv-rays" viewBox="0 0 100 100" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<path d="M50 50 L${(50 + 48 * Math.cos((i * Math.PI) / 6)).toFixed(1)} ${(50 + 48 * Math.sin((i * Math.PI) / 6)).toFixed(1)}" />`).join('')}</svg>` : '';
      const ring = st === 'current' ? `<svg class="rs-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" pathLength="100" style="stroke-dasharray:${Math.round(((p.turns - d.current!.left) / p.turns) * 100)} 100"/></svg><i class="rs-left">${d.current!.left}</i>` : '';
      return `<button class="hv-star tier-${size(p)} ${st} ${d.picked === p.id ? 'picked' : ''}" style="left:${x}%;top:${y}%" data-act="cmp-research-pick" data-arg="${p.id}" title="${esc(`${p.name}: ${p.text}`)}" aria-label="${esc(`${p.name} (${st}): ${p.text}`)}">
          ${rays}${ring}<span class="hv-star-core">${icon(SKILL_ICON[p.icon] ?? SKILL_ICON.ward)}</span>
          <i class="hv-star-name">${esc(p.name)}</i>
        </button>`;
    })
    .join('');
  const pick = d.projects.find((p) => p.id === d.picked) ?? d.projects.find((p) => state(p) === 'current') ?? d.projects.find((p) => state(p) === 'open') ?? d.projects[0];
  const pst = state(pick);
  const why = d.problem(pick.id);
  const action =
    pst === 'learned'
      ? '<span class="hv-learned">researched</span>'
      : pst === 'current'
        ? `<span class="hv-learned rs-under">${d.current!.left} turn${d.current!.left === 1 ? '' : 's'} left</span>`
        : `<button class="hv-learn" data-act="cmp-research" data-arg="${pick.id}" ${why ? `disabled title="${esc(why)}"` : ''}>${why ? esc(why.replace(/\.$/, '').toLowerCase()) : `research · ${d.materialsIcon} ${pick.cost} · ${pick.turns} turns`}</button>`;
  const detail = `<div class="hv-detail tier-${size(pick)} ${pst === 'current' ? 'open' : pst}">
      <span class="hv-detail-icon">${icon(SKILL_ICON[pick.icon] ?? SKILL_ICON.ward)}</span>
      <div class="hv-detail-body">
        <small>${RESEARCH_BRANCHES[pick.branch]} ${pick.tier} · every army · ${pick.cost} materials, ${pick.turns} turns</small>
        <b>${esc(pick.name)}</b>
        <p>${esc(pick.text)}</p>
      </div>
      ${action}
    </div>`;
  return `
    <div class="hv-sky rs-sky">
      <div class="hv-dust" aria-hidden="true">${SKY_DUST}</div>
      <svg class="hv-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>
      <div class="hv-root rs-root ${d.current ? 'busy' : ''}" style="left:${RS_ROOT[0]}%;top:${RS_ROOT[1]}%">${RS_CORE}</div>
      ${RESEARCH_BRANCHES.map((n, i) => `<i class="hv-branch" style="left:${[14, 36, 64, 86][i]}%">${n}</i>`).join('')}
      ${stars}
    </div>
    ${detail}`;
}
