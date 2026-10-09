/**
 * The research tab: a blueprint, read left to right. Each of the four fields is a lane, its projects chips
 * joined by traces in the order they must be researched; done ones are filled in the lane's colour, the one
 * under way fills as it progresses, the ones you can start are outlined. The project picked is shown below.
 */
import { RESEARCH_BRANCHES, type ResearchProject } from '../engine';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** The research upgrades' marks, by icon name. */
const SKILL_ICON: Record<string, string> = {
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

const icon = (k: string) => `<svg class="rt-ico" viewBox="0 0 24 24" aria-hidden="true">${SKILL_ICON[k] ?? SKILL_ICON.ward}</svg>`;

/** Each lane's colour, and the glyph at its head. */
const LANES: { colour: string; icon: string; note: string }[] = [
  { colour: '#d8902e', icon: 'energy', note: 'energy and heat' },
  { colour: '#4f7fb8', icon: 'hull', note: 'health and repair' },
  { colour: '#b4505c', icon: 'dread', note: 'battle and conquest' },
  { colour: '#2f9a8c', icon: 'march', note: 'sight and marching' },
];

export interface ResearchTreeData {
  projects: ResearchProject[];
  done: string[];
  current?: { id: string; left: number };
  /** Why each project can't be started now (null: it can). */
  problem: (id: string) => string | null;
  picked: string | null;
  materialsIcon: string;
}

export function researchTree(d: ResearchTreeData): string {
  const state = (p: ResearchProject) => (d.done.includes(p.id) ? 'done' : d.current?.id === p.id ? 'current' : d.problem(p.id) ? 'locked' : 'open');
  const progress = (p: ResearchProject) => (d.current?.id === p.id ? Math.round(((p.turns - d.current.left) / p.turns) * 100) : 0);
  const pick = d.projects.find((p) => p.id === d.picked) ?? d.projects.find((p) => state(p) === 'current') ?? d.projects.find((p) => state(p) === 'open') ?? d.projects[0];
  const lanes = RESEARCH_BRANCHES.map((name, b) => {
    const lane = LANES[b];
    const list = d.projects.filter((p) => p.branch === b).sort((x, y) => x.tier - y.tier);
    const done = list.filter((p) => state(p) === 'done').length;
    const nodes = list
      .map((p, i) => {
        const st = state(p);
        // The trace in from the one before: lit once that one is done.
        const lit = i === 0 || state(list[i - 1]) === 'done';
        const left = d.current?.id === p.id ? d.current.left : 0;
        return `<span class="rt-trace ${lit ? 'lit' : ''}" aria-hidden="true"></span>
          <button class="rt-node ${st} ${pick.id === p.id ? 'picked' : ''}" data-act="cmp-research-pick" data-arg="${p.id}" title="${esc(`${p.name}: ${p.text}`)}">
            <span class="rt-node-top">${icon(p.icon)}<b>${esc(p.name)}</b></span>
            <small>${st === 'done' ? 'researched' : st === 'current' ? `${left} turn${left === 1 ? '' : 's'} left` : `${d.materialsIcon} ${p.cost} · ${p.turns} turns`}</small>
            ${st === 'current' ? `<span class="rt-bar"><i style="width:${progress(p)}%"></i></span>` : ''}
          </button>`;
      })
      .join('');
    return `<div class="rt-lane" style="--lc:${lane.colour}">
        <div class="rt-head">${icon(lane.icon)}<span><b>${name}</b><small>${lane.note} · ${done}/${list.length}</small></span></div>
        <div class="rt-track">${nodes}</div>
      </div>`;
  }).join('');
  const pst = state(pick);
  const why = d.problem(pick.id);
  const action =
    pst === 'done'
      ? '<span class="rt-tag">researched</span>'
      : pst === 'current'
        ? `<span class="rt-tag">${d.current!.left} turn${d.current!.left === 1 ? '' : 's'} left</span>`
        : `<button class="btn-primary rt-go" data-act="cmp-research" data-arg="${pick.id}" ${why ? `disabled title="${esc(why)}"` : ''}>${why ? esc(why.replace(/\.$/, '')) : `research · ${d.materialsIcon} ${pick.cost} · ${pick.turns} turns`}</button>`;
  return `
    <div class="rt-board">${lanes}</div>
    <div class="rt-detail ${pst}" style="--lc:${LANES[pick.branch].colour}">
      <span class="rt-detail-ico">${icon(pick.icon)}</span>
      <div><small>${RESEARCH_BRANCHES[pick.branch]} · step ${pick.tier} · shared by every army</small><b>${esc(pick.name)}</b><p>${esc(pick.text)}</p></div>
      ${action}
    </div>`;
}
