/**
 * The research tab: a blueprint, read left to right. Each of the four fields is a lane, its projects chips
 * joined by traces in the order they must be researched; done ones are filled in the lane's colour, the one
 * under way fills as it progresses, the ones you can start are outlined. The project picked is shown below.
 */
import { RESEARCH_BRANCHES, type ResearchProject } from '../engine';
import { SKILL_ICON } from './heroview';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
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
