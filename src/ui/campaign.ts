import {
  ANOMALIES,
  anomalyEffects,
  applyCampaignAction,
  armoryPrice,
  attackOptions,
  CAMPAIGN,
  CAMPAIGN_MISSIONS,
  campaignMissionDef,
  campaignPlayer,
  canGarrison,
  cardDef,
  createCampaign,
  deckSwapProblem,
  factionById,
  factionIncome,
  GameError,
  garrisonBonus,
  MAP_HEIGHT,
  MAP_WIDTH,
  missionProgress,
  nodeAnomalies,
  nodeById,
  ownedNodes,
  fortifyCost,
  RACE_NAMES,
  type Anomaly,
  type CampaignAction,
  type CampaignNode,
  type CampaignState,
  type GameState,
} from '../engine';
import { MENU_ICON } from './menu-icon';
import { cardArt, cardGlyph, KIND_COLOUR, rarityGem, typeLine } from './glyphs';
import { sound } from './sound';
import { toPageDelta } from './viewport';

const KEY = 'blue-loop:campaign:v2';

export function loadCampaign(): CampaignState | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as CampaignState) : null;
    // Campaigns from before the card game was rebuilt cannot be resumed.
    return s && s.version === 2 ? s : null;
  } catch {
    return null;
  }
}
function saveCampaign(s: CampaignState | null) {
  try {
    if (s && !s.winner) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const lower = (t: string) => esc(t.toLowerCase());

import { FACTION_COLOUR, factionAvatar } from './factions';
export { FACTION_COLOUR };
const NEUTRAL = '#c9cbd0';
/** Credits: a solid gold coin. Earned from your systems, battles and missions; spent on repairs and fortifications. */
const CREDITS =
  '<svg class="cur cur-credits" viewBox="0 0 20 20" aria-label="credits"><circle cx="10" cy="10" r="9" fill="#b98f3c"/><circle cx="9.3" cy="9.2" r="8" fill="#d6ae57"/><circle cx="7.4" cy="6.8" r="3.2" fill="#f0d68f" opacity=".55"/><circle cx="10" cy="10" r="6.3" fill="none" stroke="#fff4d6" stroke-width="1.2" opacity=".85"/><path d="M10 5.6 11.2 8.8 14.4 10 11.2 11.2 10 14.4 8.8 11.2 5.6 10 8.8 8.8Z" fill="#fff8e6"/></svg>';
/** Materials: a solid teal crystal. Earned the same ways; spent on buying cards in the armory. */
const MATERIALS =
  '<svg class="cur cur-materials" viewBox="0 0 20 20" aria-label="materials"><path d="M10 1.5 17 6v8l-7 4.5L3 14V6Z" fill="#4f9aa6"/><path d="M10 1.5 17 6 10 9.6 3 6Z" fill="#9fd3d9"/><path d="M10 9.6V18.5L3 14V6Z" fill="#6fb3bc"/><path d="M10 1.5 17 6v8l-7 4.5L3 14V6Z" fill="none" stroke="#2f6f79" stroke-width=".9" stroke-linejoin="round"/></svg>';
/** A stable 0–1 value per id, to spread animation phases so stars never pulse in step. */
function seedOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ((h % 1000) / 1000).toFixed(3);
}
const TRACK_TINT: Record<string, string> = { weapons: '#e2a494', defences: '#a3c3df', economy: '#e0cd94', resources: '#abd2b5' };
/** Each race's style of play, for choosing one. */
const RACE_BLURB = [
  'Lancers of light: many attack cards, each making the others hit harder.',
  'Crystal overloaders: heat every rival, and run your own sun hot to hit harder still.',
  'Tidal bells: stack shields, keep them, and sting whoever strikes them.',
  'The hive: grow, spread wide, and play more cards each turn.',
];

/** What the campaign screen needs from the app that hosts it. */
export interface CampaignHost {
  render(): void;
  toast(text: string): void;
  /** Play a campaign battle on the battle screen. */
  playBattle(game: GameState): void;
  toMenu(): void;
}

type Sheet =
  | { kind: 'deck'; slot?: number }
  | { kind: 'armory' }
  | { kind: 'missions' }
  | { kind: 'log' }
  | { kind: 'station'; nodeId: string }
  | { kind: 'attack'; fromId: string; toId: string }
  | { kind: 'help' };

export class CampaignView {
  state: CampaignState | null = null;
  private selected: string | null = null;
  /** An anomaly whose details are shown in the side panel. */
  private anomaly: string | null = null;
  /** What happened in the last battle or turn, shown once the player is free to read it. */
  private report: { title: string; lines: string[] } | null = null;
  private sheet: Sheet | null = null;
  /** New-campaign setup choices. */
  private setup = { rivals: 3, race: 0 };

  constructor(private host: CampaignHost) {}

  // ---- Lifecycle ------------------------------------------------------------

  /** Open the new-campaign screen. */
  openSetup() {
    this.state = null;
    this.sheet = null;
  }

  resume(): boolean {
    const s = loadCampaign();
    if (!s) return false;
    this.state = s;
    this.sheet = null;
    this.selected = null;
    this.view = null;
    return true;
  }

  /** The battle screen hands back a battle in progress (to save) or finished. */
  saveBattle(game: GameState) {
    if (!this.state?.battle) return;
    this.state.battle.game = game;
    saveCampaign(this.state);
  }

  finishBattle(game: GameState, auto = false) {
    this.withReport('battle report', () => this.apply({ type: 'finishBattle', game, auto }));
  }

  /** Run an action and keep its new log lines as a report. */
  private withReport(title: string, run: () => boolean) {
    const seq = this.state?.log[this.state.log.length - 1]?.seq ?? 0;
    if (!run() || !this.state) return false;
    const lines = this.state.log.filter((l) => l.seq > seq).map((l) => l.text);
    this.report = lines.length ? { title, lines } : null;
    return true;
  }

  get inBattle() {
    return !!this.state?.battle;
  }

  private apply(action: CampaignAction): boolean {
    if (!this.state) return false;
    try {
      this.state = applyCampaignAction(this.state, action);
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
      this.host.toast(err.message);
      sound.error();
      return false;
    }
    saveCampaign(this.state);
    return true;
  }

  // ---- Clicks -----------------------------------------------------------------

  /** Returns true if the click was a campaign action. */
  onClick(act: string, arg: string, el: HTMLElement): boolean {
    const s = this.state;
    const n = () => Number(arg);
    switch (act) {
      case 'cmp-rivals':
        this.setup.rivals = n();
        break;
      case 'cmp-race':
        this.setup.race = n();
        break;
      case 'cmp-start':
        this.state = createCampaign({ seed: (Math.random() * 2 ** 31) | 0, rivals: this.setup.rivals, race: this.setup.race });
        this.selected = null;
        this.view = null;
        saveCampaign(this.state);
        sound.objective();
        break;
      case 'cmp-zoom':
        if (this.view) {
          this.selected = null;
          this.view.zoom *= Number(arg);
          this.clampView();
        }
        break;
      case 'cmp-home-view':
        this.selected = null;
        this.view = this.homeView();
        break;
      case 'cmp-deselect':
        if (this.swallowClick || !this.selected) return true;
        this.selected = null;
        break;
      case 'cmp-anomaly':
        if (this.swallowClick) return true;
        this.anomaly = this.anomaly === arg ? null : arg;
        this.selected = null;
        break;
      case 'cmp-select':
        this.anomaly = null;
        if (this.swallowClick) return true;
        if (this.selected !== arg && this.view) {
          // Zoom out to where the system is, so leaving it returns the camera there.
          const target = nodeById(s!, arg);
          this.view = { ...this.view, x: target.x, y: target.y };
        }
        this.selected = this.selected === arg ? null : arg;
        sound.hover();
        break;
      case 'cmp-sheet':
        this.sheet = { kind: arg as 'deck' | 'armory' | 'missions' | 'log' | 'help' };
        break;
      case 'cmp-close':
        if (this.report && !this.sheet) this.report = null;
        else if (this.sheet?.kind === 'deck' && this.sheet.slot !== undefined) this.sheet = { kind: 'deck' };
        else this.sheet = null;
        break;
      case 'cmp-attack-pick':
        this.sheet = { kind: 'attack', fromId: el.dataset.from!, toId: arg };
        break;
      case 'cmp-fight':
      case 'cmp-auto': {
        if (this.sheet?.kind !== 'attack') break;
        const { fromId, toId } = this.sheet;
        this.sheet = null;
        if (!this.apply({ type: 'attack', fromId, toId })) break;
        sound.flare();
        if (act === 'cmp-auto') this.finishBattle(this.state!.battle!.game, true);
        else this.host.playBattle(this.state!.battle!.game);
        return true;
      }
      case 'cmp-defend':
        this.host.playBattle(s!.battle!.game);
        return true;
      case 'cmp-defend-auto':
        this.finishBattle(s!.battle!.game, true);
        break;
      case 'cmp-conquer':
        if (this.apply({ type: 'conquer', choice: arg as 'settle' | 'absorb' | 'supernova' })) sound.upgrade();
        break;
      case 'cmp-card':
        if (this.apply({ type: 'chooseCard', defId: arg || null })) sound.buy();
        break;
      case 'cmp-heal':
        if (this.apply({ type: 'heal', nodeId: arg })) sound.upgrade();
        break;
      case 'cmp-fortify':
        if (this.apply({ type: 'fortify', nodeId: arg })) sound.upgrade();
        break;
      case 'cmp-buy':
        if (this.apply({ type: 'buyCard', slot: n() })) sound.buy();
        break;
      case 'cmp-slot':
        this.sheet = { kind: 'deck', slot: n() };
        break;
      case 'cmp-swap': {
        if (this.sheet?.kind !== 'deck' || this.sheet.slot === undefined) break;
        if (this.apply({ type: 'deckSwap', slot: this.sheet.slot, reserveIndex: n() })) sound.play();
        this.sheet = { kind: 'deck' };
        break;
      }
      case 'cmp-station-open':
        this.sheet = { kind: 'station', nodeId: arg };
        break;
      case 'cmp-station': {
        if (this.sheet?.kind !== 'station') break;
        if (this.apply({ type: 'station', nodeId: this.sheet.nodeId, index: n() })) sound.play();
        this.sheet = null;
        break;
      }
      case 'cmp-recall':
        if (this.apply({ type: 'recall', nodeId: el.dataset.node!, uid: arg })) sound.play();
        break;
      case 'cmp-end-turn':
        if (this.withReport('turn report', () => this.apply({ type: 'endTurn' }))) {
          sound.endTurn();
          this.selected = null;
        }
        break;
      case 'cmp-menu':
        this.host.toMenu();
        return true;
      case 'cmp-abandon':
        saveCampaign(null);
        this.state = null;
        this.host.toMenu();
        return true;
      default:
        return false;
    }
    this.host.render();
    return true;
  }

  // ---- Rendering ----------------------------------------------------------------

  /** Emblem and colour follow a faction's race (the player may be any of the four). */
  private raceKey(factionId: string): string {
    const f = this.state?.factions.find((x) => x.id === factionId);
    return `f${(f?.race ?? 0) + 1}`;
  }
  private avatarOf(factionId: string, cls = ''): string {
    return factionAvatar(this.raceKey(factionId), cls);
  }
  private colourOf(factionId: string): string {
    return FACTION_COLOUR[this.raceKey(factionId)];
  }

  render(): string {
    if (!this.state) return this.renderSetup();
    const s = this.state;
    const me = campaignPlayer(s);
    const inc = factionIncome(s, me.id);
    return `
      <main class="cmp">
        <header class="cmp-top">
          <div class="cmp-turn"><span class="cmp-turn-n">turn ${s.turn}</span><small>/${CAMPAIGN.turnLimit}</small></div>
          <div class="cmp-purse">
            <span title="Credits: earned from your systems each turn, battles and missions. Spent on repairing damage and upgrading planets."><b>${CREDITS}${me.credits}</b><small>+${inc.credits}/turn</small><em>credits · systems</em></span>
            <span title="Materials: earned from your systems each turn, battles and missions. Spent on buying cards in the armory and upgrading cards."><b>${MATERIALS}${me.materials}</b><small>+${inc.materials}/turn</small><em>materials · cards</em></span>
            <span class="cmp-held">${ownedNodes(s, me.id).length}/${s.nodes.length} systems</span>
          </div>
          <nav class="cmp-nav">
            <button class="pill-btn" data-act="cmp-sheet" data-arg="deck">deck</button>
            <button class="pill-btn" data-act="cmp-sheet" data-arg="armory">armory</button>
            <button class="pill-btn" data-act="cmp-sheet" data-arg="missions">missions</button>
            <button class="pill-btn" data-act="cmp-sheet" data-arg="log">log</button>
            <button class="pill-btn" data-act="cmp-sheet" data-arg="help">?</button>
            <button class="icon-btn" data-act="cmp-menu" aria-label="Menu">${MENU_ICON}</button>
          </nav>
        </header>
        <section class="cmp-map">${this.renderMap()}</section>
        <aside class="cmp-side glass">${
          this.selected ? this.renderNode(nodeById(s, this.selected)) : this.anomaly ? this.renderAnomaly((s.anomalies ?? []).find((a) => a.id === this.anomaly)!) : this.renderOverview()
        }</aside>
        <div class="cmp-end">
          <button class="btn-primary" data-act="cmp-end-turn" ${s.phase !== 'player' ? 'disabled' : ''}>end turn</button>
        </div>
        ${this.renderOverlay()}
      </main>`;
  }

  private renderSetup(): string {
    const races = [0, 1, 2, 3]
      .map(
        (r) => `
        <button class="cmp-home-pick cmp-race-pick ${this.setup.race === r ? 'on' : ''}" data-act="cmp-race" data-arg="${r}">
          ${factionAvatar(`f${r + 1}`, 'cmp-race-emblem')}
          <b>${lower(RACE_NAMES[r])}</b>
          <span>${esc(RACE_BLURB[r])}</span>
        </button>`,
      )
      .join('');
    const rivals = [1, 2, 3]
      .map((r) => `<button class="pill-btn ${this.setup.rivals === r ? 'pill-on' : ''}" data-act="cmp-rivals" data-arg="${r}">${r}</button>`)
      .join('');
    return `
      <main class="cmp-setup setup-page">
        <header class="setup-top">
          <button class="btn btn-small" data-act="cmp-menu">‹ back</button>
          <h2 class="menu-heading">new campaign</h2>
          <span></span>
        </header>
        <div class="setup-body cmp-setup-body">
          <aside class="cmp-setup-aside">
            <div class="cmp-label">universe domination</div>
            <p class="muted">Start from one solar system with a mostly neutral deck. Conquer the systems linked to yours, then Settle, Absorb or Supernova each one; win cards of your race along the way. Hold ${Math.round(CAMPAIGN.dominationShare * 100)}% of the universe, outlast every rival, or hold the most after ${CAMPAIGN.turnLimit} turns.</p>
            <div class="cmp-label">rival factions</div>
            <div class="cmp-rivals">${rivals}</div>
          </aside>
          <div class="cmp-setup-homes">
            <div class="cmp-label">choose your race</div>
            <div class="cmp-home-row cmp-race-row">${races}</div>
          </div>
        </div>
        <footer class="setup-foot"><button class="btn-primary" data-act="cmp-start">begin campaign</button></footer>
      </main>`;
  }

  /**
   * The map is a tilted plane in perspective (CSS 3D). Stars stand upright on
   * it as billboards; links and territory lie flat on the surface. Selecting a
   * system swoops the camera in, and its planets orbit the star.
   */
  private renderMap(): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const targets = new Set(me.attacked || s.phase !== 'player' ? [] : attackOptions(s, me.id).map((o) => o.toId));
    const focus = this.selected ? nodeById(s, this.selected) : null;
    const drawn = new Set<string>();
    const links = s.nodes
      .flatMap((n) =>
        n.links.map((id) => {
          const key = [n.id, id].sort().join('-');
          if (drawn.has(key)) return '';
          drawn.add(key);
          const m = nodeById(s, id);
          const same = n.owner && n.owner === m.owner;
          return `<line x1="${n.x}" y1="${n.y}" x2="${m.x}" y2="${m.y}" class="cmp-link ${same ? 'cmp-link-held' : ''}" ${same ? `style="--fc:${this.colourOf(n.owner!)}"` : ''} />`;
        }),
      )
      .join('');
    // When zoomed in, the links fade out away from the focused system.
    const mask = focus ? `style="--mx:${focus.x}px;--my:${focus.y}px"` : '';
    const nodes = s.nodes
      .map((n) => {
        const colour = n.owner ? this.colourOf(n.owner) : NEUTRAL;
        const far = focus && focus.id !== n.id && Math.hypot(n.x - focus.x, n.y - focus.y) > 250;
        const cls = [
          'cmp-n3',
          n.owner === me.id ? 'cmp-mine' : '',
          n.owner ? 'cmp-owned' : '',
          targets.has(n.id) ? 'cmp-target' : '',
          this.selected === n.id ? 'cmp-selected' : '',
          n.hazard.length ? 'cmp-hazard' : '',
          s.battle?.nodeId === n.id ? 'cmp-contested' : '',
          far ? 'cmp-far' : '',
        ].join(' ');
        const badges = [
          n.garrison.length ? `<i class="cmp-badge">▣${n.garrison.length}</i>` : '',
          n.damage ? `<i class="cmp-badge cmp-dmg">✸${n.damage}</i>` : '',
        ].join('');
        return `
          <div class="${cls}" style="left:${n.x}px;top:${n.y}px;--fc:${colour}">
            <div class="cmp-turf"></div>
            ${targets.has(n.id) ? '<div class="cmp-ring cmp-ring-target"></div>' : ''}
            ${n.hazard.length ? '<div class="cmp-ring cmp-ring-hazard"></div>' : ''}
            ${n.home ? '<div class="cmp-ring cmp-ring-home"></div>' : ''}
            ${this.selected === n.id ? this.renderOrbits(n) : ''}
            <button class="cmp-bb" data-act="cmp-select" data-arg="${n.id}" aria-label="${esc(n.name)}">
              <span class="cmp-badges">${badges}</span>
              <span class="cmp-star" style="--seed:${seedOf(n.id)}"><i class="cmp-core"></i>${
                n.owner ? this.avatarOf(n.owner, 'cmp-owner') : ''
              }</span>
              <span class="cmp-label">${lower(n.name)}</span>
            </button>
          </div>`;
      })
      .join('');
    return `
      <div class="cmp-stage ${focus ? 'cmp-zoomed' : ''}" data-act="cmp-deselect">
        <div class="cmp-plane" style="width:${MAP_WIDTH}px;height:${MAP_HEIGHT}px">
          <div class="cmp-grid"></div>
          <svg class="cmp-links ${focus ? 'cmp-links-focus' : ''}" ${mask} width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">${links}</svg>
          ${this.renderAnomalies(focus)}
          ${nodes}
        </div>
        <div class="cmp-cam">
          <button class="icon-btn" data-act="cmp-zoom" data-arg="1.3" aria-label="Zoom in">+</button>
          <button class="icon-btn" data-act="cmp-zoom" data-arg="0.77" aria-label="Zoom out">−</button>
          <button class="icon-btn" data-act="cmp-home-view" aria-label="Centre on your home" title="Centre on your home">⌂</button>
        </div>
      </div>`;
  }

  /** Anomalies: flat phenomena on the plane (discs, clouds, rings), with an upright marker to tap. */
  private renderAnomalies(focus: CampaignNode | null): string {
    const s = this.state!;
    return (s.anomalies ?? [])
      .map((a) => {
        const def = ANOMALIES[a.kind];
        const far = focus && Math.hypot(a.x - focus.x, a.y - focus.y) > 300;
        const flat = {
          blackHole: '<div class="an-lens"></div>',
          nebula: '<div class="an-cloud an-cloud-a"></div><div class="an-cloud an-cloud-b"></div><div class="an-cloud an-cloud-c"></div>',
          darkMatter: '<div class="an-haze"></div><div class="an-motes"></div>',
          pulsar: '<div class="an-wave"></div><div class="an-wave an-wave-2"></div>',
        }[a.kind];
        const marker = {
          blackHole: '<span class="an-hole"><i class="an-disc"></i></span>',
          nebula: '<span class="an-glint"></span>',
          darkMatter: '<span class="an-cluster"><i></i><i></i><i></i><i></i><i></i></span>',
          pulsar: '<span class="an-pulsar"><i class="an-beam"></i></span>',
        }[a.kind];
        return `
          <div class="cmp-an an-${a.kind} ${far ? 'cmp-far' : ''} ${this.anomaly === a.id ? 'an-on' : ''}" style="left:${a.x}px;top:${a.y}px;--ar:${def.radius}px">
            <div class="an-reach"></div>
            ${flat}
            <button class="cmp-bb an-bb" data-act="cmp-anomaly" data-arg="${a.id}" aria-label="${esc(def.name)}">
              ${marker}
              <span class="cmp-label an-label">${lower(def.name)}</span>
            </button>
          </div>`;
      })
      .join('');
  }

  private renderAnomaly(a: Anomaly): string {
    const s = this.state!;
    const def = ANOMALIES[a.kind];
    const reached = s.nodes.filter((n) => nodeAnomalies(s, n).some((x) => x.id === a.id));
    const rows = reached
      .map((n) => `<div class="cmp-faction" style="--fc:${n.owner ? this.colourOf(n.owner) : NEUTRAL}">${n.owner ? this.avatarOf(n.owner) : '<i></i>'}<span>${lower(n.name)}</span><b>${n.owner ? lower(factionById(s, n.owner).name) : 'neutral'}</b></div>`)
      .join('');
    return `
      <div class="cmp-node-head" style="--fc:#8d92a0"><i class="an-icon an-icon-${a.kind}"></i>
        <div><h3>${lower(def.name)}</h3><small>anomaly</small></div>
        <button class="icon-btn" data-act="cmp-anomaly" data-arg="${a.id}" aria-label="Close">×</button>
      </div>
      <div class="cmp-sys cmp-anom"><b>in battle</b><span>${esc(def.text)}</span></div>
      <p class="cmp-hint">Applies to anyone fighting from a system within its reach: the defender of a system here, or an attacker launching from one.</p>
      <div class="section-label">systems in reach</div>
      <div class="cmp-factions">${rows}</div>`;
  }

  /** The selected system's planets, orbiting its star (sized by level, tinted by track). */
  private renderOrbits(n: CampaignNode): string {
    return n.planets
      .map((pl, j) => {
        const level = 1 + Math.min(2, n.fortification);
        const r = 30 + j * 16;
        const period = 16 + j * 9;
        // Spread the planets around their orbits, deterministically per system.
        const delay = -((n.x * 7 + n.y * 3 + j * 97) % period);
        const size = 7 + level * 2.5;
        return `
          <div class="cmp-orbit-ring" style="--r:${r}px"></div>
          <div class="cmp-orbit" style="--t:${period}s;--d:${delay}s">
            <div class="cmp-arm" style="--r:${r}px">
              <div class="cmp-counter">
                <span class="cmp-orb-planet" style="--pc:${TRACK_TINT[pl.tint]};--ps:${size}px" title="${esc(pl.name)}"><em>${lower(pl.name)}</em></span>
              </div>
            </div>
          </div>`;
      })
      .join('');
  }

  /** Free camera over the map: where it looks (map units) and how far it is zoomed (1 = whole map fits). */
  private view: { x: number; y: number; zoom: number } | null = null;
  /** Last camera transform, so a re-render can animate from where the camera was. */
  private camera: { transform: string; tilt: string } | null = null;
  private drag: { id: number; x: number; y: number; moved: boolean; pinch?: { d: number; zoom: number } } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  /** Set after a drag so the click that ends it does not select or deselect. */
  private swallowClick = false;
  private stageEl: HTMLElement | null = null;

  private static readonly TILT = 44;
  private static readonly FOCUS_TILT = 56;
  private static readonly MAX_ZOOM = 3.5;

  private homeView() {
    const home = ownedNodes(this.state!, this.state!.playerId)[0] ?? this.state!.nodes[0];
    return { x: home.x, y: home.y, zoom: 1.9 };
  }

  /** Fit the map to its stage and move the camera (called after every render and on resize). */
  afterRender(root: HTMLElement) {
    const stage = root.querySelector<HTMLElement>('.cmp-stage');
    this.stageEl = stage;
    if (!stage || !this.state) {
      this.camera = null;
      return;
    }
    if (!stage.dataset.bound) {
      stage.dataset.bound = '1';
      stage.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      stage.addEventListener('pointermove', (e) => this.onPointerMove(e));
      stage.addEventListener('pointerup', (e) => this.onPointerUp(e));
      stage.addEventListener('pointercancel', (e) => this.onPointerUp(e));
      stage.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    }
    this.view ??= this.homeView();
    this.applyCamera(true);
  }

  /** Scale at which the whole map fits the stage, for a given tilt. */
  private fitScale(stage: HTMLElement, tiltDeg: number) {
    const tilt = (tiltDeg * Math.PI) / 180;
    return Math.min(stage.clientWidth / MAP_WIDTH, stage.clientHeight / (MAP_HEIGHT * Math.cos(tilt) + 140));
  }

  private applyCamera(animate: boolean) {
    const stage = this.stageEl;
    const plane = stage?.querySelector<HTMLElement>('.cmp-plane');
    if (!stage || !plane || !this.state || !this.view) return;
    const focus = this.selected ? nodeById(this.state, this.selected) : null;
    const tiltDeg = focus ? CampaignView.FOCUS_TILT : CampaignView.TILT;
    const fit = this.fitScale(stage, CampaignView.TILT);
    // Zoomed on a system: close in on it. Otherwise: the free camera.
    const scale = focus ? Math.max(fit * this.view.zoom, 1) * 2.4 : fit * this.view.zoom;
    const fx = focus ? focus.x : this.view.x;
    const fy = focus ? focus.y : this.view.y;
    const transform = `rotateX(${tiltDeg}deg) scale3d(${scale.toFixed(4)}, ${scale.toFixed(4)}, ${scale.toFixed(4)}) translate(${(-fx).toFixed(1)}px, ${(-fy).toFixed(1)}px)`;
    const next = { transform, tilt: `${tiltDeg}deg` };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate && this.camera && this.camera.transform !== transform && !reduce) {
      // Start from the old camera, then glide to the new one.
      plane.classList.add('cmp-no-anim');
      plane.style.transform = this.camera.transform;
      plane.style.setProperty('--tilt', this.camera.tilt);
      void plane.offsetWidth;
      plane.classList.remove('cmp-no-anim');
    } else if (!animate) plane.classList.add('cmp-no-anim');
    plane.style.transform = transform;
    plane.style.setProperty('--tilt', next.tilt);
    // Stars stay a readable size on screen whatever the zoom.
    plane.style.setProperty('--ui', String(Math.min(2.2, Math.max(0.7, 1 / scale))));
    this.camera = next;
  }

  private clampView() {
    const v = this.view!;
    v.zoom = Math.max(1, Math.min(CampaignView.MAX_ZOOM, v.zoom));
    v.x = Math.max(0, Math.min(MAP_WIDTH, v.x));
    v.y = Math.max(0, Math.min(MAP_HEIGHT, v.y));
  }

  private onPointerDown(e: PointerEvent) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2 && this.view) {
      const [a, b] = [...this.pointers.values()];
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: true, pinch: { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.view.zoom } };
      return;
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.drag || !this.view || !this.stageEl || !this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.drag.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      this.view.zoom = this.drag.pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / this.drag.pinch.d);
      this.clampView();
      this.applyCamera(false);
      return;
    }
    if (e.pointerId !== this.drag.id) return;
    // A finger's movement on screen, turned into the page's own directions (the page may be sideways).
    const { x: dx, y: dy } = toPageDelta(e.clientX - this.drag.x, e.clientY - this.drag.y);
    if (!this.drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!this.drag.moved) {
      this.drag.moved = true;
      // Dragging while zoomed on a system lets go of it and pans from there.
      if (this.selected) {
        const n = nodeById(this.state!, this.selected);
        this.view = { ...this.view, x: n.x, y: n.y };
        this.selected = null;
        this.host.render();
        return;
      }
      this.stageEl.setPointerCapture(e.pointerId);
    }
    const scale = this.fitScale(this.stageEl, CampaignView.TILT) * this.view.zoom;
    const tilt = (CampaignView.TILT * Math.PI) / 180;
    this.view.x -= dx / scale;
    this.view.y -= dy / (scale * Math.cos(tilt));
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.clampView();
    this.applyCamera(false);
  }

  private onPointerUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.drag?.moved) this.swallowClick = true;
    if (this.pointers.size === 0) this.drag = null;
    window.setTimeout(() => (this.swallowClick = false), 0);
  }

  private onWheel(e: WheelEvent) {
    if (!this.view) return;
    e.preventDefault();
    if (this.selected) return;
    this.view.zoom *= Math.exp(-e.deltaY * 0.0015);
    this.clampView();
    this.applyCamera(false);
  }

  private renderOverview(): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const factions = s.factions
      .map((f) => {
        const held = ownedNodes(s, f.id).length;
        return `<div class="cmp-faction ${f.eliminated ? 'out' : ''}" style="--fc:${this.colourOf(f.id)}">${this.avatarOf(f.id)}<span>${f.id === me.id ? 'you' : lower(f.name)}</span><b>${f.eliminated ? 'eliminated' : `${held} system${held === 1 ? '' : 's'}`}</b></div>`;
      })
      .join('');
    const missions = me.missions.map((m) => this.missionRow(m.id, missionProgress(s, me, m))).join('');
    const log = s.log
      .slice(-8)
      .map((l) => `<div>${esc(l.text)}</div>`)
      .join('');
    const canAttack = !me.attacked && s.phase === 'player' && attackOptions(s, me.id).length > 0;
    return `
      <div class="section-label">factions</div>
      <div class="cmp-factions">${factions}</div>
      <p class="cmp-hint">${canAttack ? 'Tap a system with a dashed ring to attack it (one attack per turn). Tap one of yours to manage it.' : me.attacked ? 'You have attacked this turn. Manage your systems, then end the turn.' : 'Manage your systems, then end the turn.'}</p>
      <div class="section-label">missions</div>
      <div class="cmp-missions">${missions}</div>
      <div class="section-label">log</div>
      <div class="cmp-log">${log}</div>`;
  }

  private missionRow(id: string, progress: number): string {
    const def = campaignMissionDef(id);
    return `<div class="cmp-mission"><b>${lower(def.name)}</b><span>${esc(def.text)}</span><em>${progress}/${def.target}</em></div>`;
  }

  private renderNode(n: CampaignNode): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const mine = n.owner === me.id;
    const owner = n.owner ? factionById(s, n.owner) : null;
    const fortCost = fortifyCost(n);
    const fortPips = Array.from({ length: CAMPAIGN.maxFortification }, (_, i) => `<i class="${i < n.fortification ? 'on' : ''}"></i>`).join('');
    const fortify = `
      <div class="cmp-planet"><span>fortification</span><span class="pips">${fortPips}</span>${
        mine && fortCost !== null ? `<button class="pill-btn" data-act="cmp-fortify" data-arg="${n.id}" ${me.credits < fortCost ? 'disabled' : ''}>+1 · ${CREDITS}${fortCost}</button>` : ''
      }</div>
      <p class="cmp-hint">Each level gives this system's defender +${CAMPAIGN.fortifyHealth} max health.</p>`;
    const g = garrisonBonus(n);
    const bonus = [
      g.tableau.length && `${g.tableau.length} card${g.tableau.length > 1 ? 's' : ''} start in play`,
      ...Object.entries(g.upgrades).map(([a, k]) => `+${k} ${a === 'solarFlare' ? 'Solar Flare' : a === 'thermosiphon' ? 'Thermosiphon' : 'Cooling Chamber'} upgrade`),
      n.fortification && `+${n.fortification * CAMPAIGN.fortifyHealth} max health`,
    ].filter(Boolean);
    const garrison = n.garrison
      .map((c) => {
        const def = cardDef(c.defId);
        const state = c.status === 'stationed' ? 'stationed' : c.status === 'arriving' ? 'arrives next turn' : 'leaves next turn';
        const recall = mine && c.status === 'stationed' ? `<button class="pill-btn" data-act="cmp-recall" data-node="${n.id}" data-arg="${c.uid}">recall</button>` : '';
        return `<div class="cmp-gar ${c.status}" style="--kc:${KIND_COLOUR[def.kind]}"><span class="cmp-gar-glyph">${cardGlyph(def.id, def.kind)}</span><span><b>${lower(def.name)}</b><small>${state}</small></span>${recall}</div>`;
      })
      .join('');
    const slotsFree = CAMPAIGN.garrisonSlots - n.garrison.length;
    const froms = !me.attacked && s.phase === 'player' ? attackOptions(s, me.id).find((o) => o.toId === n.id)?.fromIds ?? [] : [];
    const attack = froms.length
      ? `<div class="cmp-actions">${froms.map((f) => `<button class="btn-primary" data-act="cmp-attack-pick" data-arg="${n.id}" data-from="${f}">attack from ${lower(nodeById(s, f).name)}</button>`).join('')}</div>`
      : '';
    const status = n.hazard.length ? '<p class="cmp-warn">Supernova remnant: rivals cannot advance into it this turn.</p>' : '';
    return `
      <div class="cmp-node-head" style="--fc:${n.owner ? this.colourOf(n.owner) : NEUTRAL}">
        ${n.owner ? this.avatarOf(n.owner, 'cmp-head-av') : '<i></i>'}
        <div><h3>${lower(n.name)}</h3><small>${owner ? (mine ? 'your system' : lower(owner.name)) : `neutral · sentinels tier ${n.tier + 1}`}${n.home ? ' · home' : ''}</small></div>
        <button class="icon-btn" data-act="cmp-select" data-arg="${n.id}" aria-label="Close">×</button>
      </div>
      ${status}
      ${attack}
      ${nodeAnomalies(s, n)
        .map((a) => `<div class="cmp-sys cmp-anom"><b>${lower(ANOMALIES[a.kind].name)} nearby</b><span>${esc(ANOMALIES[a.kind].text)}</span></div>`)
        .join('')}
      <div class="cmp-yield">yield ${CREDITS} ${n.yield.credits} · ${MATERIALS} ${n.yield.materials} per turn · ${n.planets.length} planets</div>
      <div class="section-label">defences</div>
      <div class="cmp-planets">${fortify}</div>
      ${
        n.damage || mine
          ? `<div class="cmp-damage"><span>damage ✸ ${n.damage}${n.damage ? ` <small>(its sun starts ${n.damage} hotter)</small>` : ''}</span>${
              mine && n.damage ? `<button class="pill-btn" data-act="cmp-heal" data-arg="${n.id}" ${me.credits < CAMPAIGN.healCostPerPoint ? 'disabled' : ''}>repair 1 · ${CREDITS}${CAMPAIGN.healCostPerPoint}</button>` : ''
            }</div>`
          : ''
      }
      <div class="section-label">garrison <span>${n.garrison.length}/${CAMPAIGN.garrisonSlots}</span></div>
      <div class="cmp-garrison">${garrison || '<p class="muted">No cards stationed.</p>'}</div>
      ${bonus.length ? `<p class="cmp-bonus">If attacked: ${bonus.join(', ')}.</p>` : ''}
      ${mine && slotsFree > 0 ? `<button class="btn" data-act="cmp-station-open" data-arg="${n.id}">send a card</button>` : ''}`;
  }

  // ---- Overlays -------------------------------------------------------------------

  private renderOverlay(): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    if (s.winner) {
      const won = s.winner === me.id;
      return this.modal(
        won ? 'victory' : 'defeat',
        `<div class="center"><h2>${won ? 'the universe is yours' : `${lower(factionById(s, s.winner).name)} dominates`}</h2>
          <p>${won ? `You control ${ownedNodes(s, me.id).length} of ${s.nodes.length} systems after ${s.turn} turns.` : 'Your last system has fallen, or a rival held more of the universe.'}</p>
          <button class="btn-primary" data-act="cmp-abandon">back to menu</button></div>`,
      );
    }
    if (s.battle) {
      const b = s.battle;
      const node = nodeById(s, b.nodeId);
      const attacker = factionById(s, b.attacker);
      const mine = b.attacker === me.id;
      return this.modal(
        mine ? 'battle in progress' : 'incoming attack',
        `<div class="center"><h2>${mine ? `the battle for ${lower(node.name)}` : `${lower(attacker.name)} attacks ${lower(node.name)}`}</h2>
          <p>${mine ? 'Return to the battle, or let your commanders finish it.' : 'Defend your system in battle, or let your commanders resolve it automatically.'}</p>
          ${this.matchup(nodeById(s, b.fromId), node)}
          <div class="menu-actions center-row"><button class="btn-primary" data-act="cmp-defend">${mine ? 'resume battle' : 'defend'}</button><button class="btn" data-act="cmp-defend-auto">auto-resolve</button></div></div>`,
      );
    }
    if (s.conquest) {
      const n = nodeById(s, s.conquest.nodeId);
      const spoils = n.garrison.length ? ` Its garrison (${n.garrison.map((g) => cardDef(g.defId).name).join(', ')}) is yours either way.` : '';
      const opt = (id: string, title: string, text: string) => `<button class="cmp-choice" data-act="cmp-conquer" data-arg="${id}"><b>${title}</b><span>${text}</span></button>`;
      return this.modal(
        `${lower(n.name)} has fallen`,
        `<p class="muted">Decide the system's fate.${esc(spoils)}</p>
         <div class="cmp-choices">
          ${opt('settle', 'settle', `Take control. ${CREDITS} +${n.yield.credits} and ${MATERIALS} +${n.yield.materials} every turn, and a new front to defend.`)}
          ${opt('absorb', 'absorb', `Strip it: ${CREDITS} +${n.yield.credits * CAMPAIGN.absorbTurns} and ${MATERIALS} +${n.yield.materials * CAMPAIGN.absorbTurns} now. It is left neutral and depleted.`)}
          ${opt('supernova', 'supernova', 'Detonate its sun. It is left neutral, and no rival can advance into it for a turn.')}
         </div>`,
      );
    }
    const reward = s.cardRewards[0];
    if (reward) {
      const cards = reward.options.map((id) => `<button class="cmp-pick" data-act="cmp-card" data-arg="${id}">${cardHtml(id)}</button>`).join('');
      return this.modal(
        `★ ${lower(reward.source)} · choose a new card`,
        `<div class="cmp-cards">${cards}</div><p class="muted center-text">It joins your reserve. Put it in your deck from the deck screen.</p>
         <div class="center-row"><button class="btn" data-act="cmp-card" data-arg="">skip</button></div>`,
      );
    }
    const sh = this.sheet;
    if (!sh && this.report) {
      const lines = this.report.lines.map((l) => `<div>${esc(l)}</div>`).join('');
      return this.modal(this.report.title, `<div class="log-list cmp-report">${lines}</div><div class="center-row"><button class="btn-primary" data-act="cmp-close">continue</button></div>`, true);
    }
    if (!sh) return '';
    switch (sh.kind) {
      case 'deck':
        return this.renderDeck(sh.slot);
      case 'armory': {
        const cards = s.armory
          .map(
            (id, i) =>
              `<button class="cmp-pick" data-act="cmp-buy" data-arg="${i}" ${me.materials < armoryPrice(id) ? 'disabled' : ''}>${cardHtml(id)}<span class="cmp-price">${MATERIALS} ${armoryPrice(id)}</span></button>`,
          )
          .join('');
        return this.modal(
          'armory',
          `<div class="cmp-cards">${cards || '<p class="muted">Sold out. New stock arrives next turn.</p>'}</div>
           <p class="muted center-text">Bought cards join your reserve. Stock changes every turn. You have ${MATERIALS} ${me.materials}.</p>`,
          true,
        );
      }
      case 'missions': {
        const active = me.missions.map((m) => this.missionRow(m.id, missionProgress(s, me, m))).join('');
        return this.modal(
          'missions',
          `<div class="cmp-missions">${active || '<p class="muted">All missions complete.</p>'}</div>
           <p class="muted">Each completed mission pays ${CREDITS} ${CAMPAIGN.missionCredits} and ${MATERIALS} ${CAMPAIGN.missionMaterials}, and lets you choose a new card. ${CAMPAIGN_MISSIONS.length} missions in all.</p>`,
          true,
        );
      }
      case 'log':
        return this.modal('campaign log', `<div class="log-list">${s.log.map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`, true);
      case 'help':
        return this.modal(
          'how the campaign works',
          `<div class="cmp-legend">
            <div>${CREDITS}<span><b>Credits</b> run your systems. Earned: each system's yield every turn, winning battles, missions. Spent: repairing damage, fortifying systems.</span></div>
            <div>${MATERIALS}<span><b>Materials</b> build your collection. Earned the same ways. Spent: buying cards in the armory.</span></div>
          </div>
          <ul class="rules">
            <li><b>Attack</b> one system per turn: any system linked to one you control. The battle is a normal game, played from your system against theirs.</li>
            <li><b>Win</b> and choose: <b>Settle</b> it, <b>Absorb</b> its resources, or <b>Supernova</b> it to block rivals for a turn.</li>
            <li>A winner's sun carries its heat home as <b>damage</b> (it starts battles hotter). Repair it with ${CREDITS} credits, and <b>fortify</b> a system for +${CAMPAIGN.fortifyHealth} max health per level when it defends.</li>
            <li>Your battle <b>deck is 20 cards</b> with exactly 2 Command cards. Win cards from missions and buy them in the armory with ${MATERIALS} materials; they wait in your reserve until you swap them into your deck.</li>
            <li><b>Send reserve cards</b> to a system's garrison (up to ${CAMPAIGN.garrisonSlots}) to defend it: they start the battle already in play in its tableau (a Command card gives its upgrade). Cards take a turn to arrive and a turn to return. If the system falls, the conqueror takes them.</li>
          </ul>`,
          true,
        );
      case 'station': {
        const n = nodeById(s, sh.nodeId);
        const cards = me.reserve
          .map((id, i) => (canGarrison(id) ? `<button class="cmp-pick" data-act="cmp-station" data-arg="${i}">${cardHtml(id)}</button>` : ''))
          .join('');
        return this.modal(
          `send a card to ${lower(n.name)}`,
          `<div class="cmp-cards">${cards || '<p class="muted">No reserve cards to send. Win missions or visit the armory for more (global cards cannot garrison).</p>'}</div>
           <p class="muted center-text">It arrives next turn and, from then on, starts in play whenever the system is attacked.</p>`,
          true,
        );
      }
      case 'attack': {
        const from = nodeById(s, sh.fromId);
        const to = nodeById(s, sh.toId);
        return this.modal(
          `attack ${lower(to.name)}`,
          `<div class="center">${this.matchup(from, to)}
            <div class="menu-actions center-row"><button class="btn-primary" data-act="cmp-fight">fight</button><button class="btn" data-act="cmp-auto">auto-resolve</button><button class="btn" data-act="cmp-close">cancel</button></div></div>`,
        );
      }
    }
  }

  private matchup(from: CampaignNode, to: CampaignNode): string {
    const s = this.state!;
    const side = (n: CampaignNode, label: string) => {
      const who = n.owner ? factionById(s, n.owner).name : `${n.name} Sentinels`;
      const fx = anomalyEffects(s, n);
      return `<div class="cmp-side-card" style="--fc:${n.owner ? this.colourOf(n.owner) : NEUTRAL}"><small>${label}</small><b>${n.owner ? this.avatarOf(n.owner, 'fav-inline') : ''}${lower(who)}</b><span>${lower(n.name)}${n.fortification ? ` · fortified ${n.fortification}` : ''}</span>${n.damage ? `<span class="cmp-dmg">✸ ${n.damage} damage</span>` : ''}${
        fx ? fx.conditions.map((c) => `<span class="cmp-anom-tag">${lower(c.name)}</span>`).join('') : ''
      }</div>`;
    };
    const g = garrisonBonus(to);
    const def = g.tableau.map((id) => cardDef(id).name);
    const ups = Object.keys(g.upgrades).length;
    return `<div class="cmp-matchup">${side(from, 'attacker')}<span class="cmp-vs">vs</span>${side(to, 'defender')}</div>${
      def.length || ups ? `<p class="cmp-bonus">The defender starts with ${[def.length ? `${def.join(', ')} in play` : '', ups ? `${ups} garrison upgrade${ups > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ')}.</p>` : ''
    }`;
  }

  private renderDeck(slot?: number): string {
    const me = campaignPlayer(this.state!);
    if (slot !== undefined) {
      const current = me.deck[slot];
      const options = me.reserve
        .map((id, i) => {
          const problem = deckSwapProblem(me, slot, i);
          return `<button class="cmp-pick" data-act="cmp-swap" data-arg="${i}" ${problem ? `disabled title="${esc(problem)}"` : ''}>${cardHtml(id)}${problem ? '<span class="cmp-price">not allowed</span>' : ''}</button>`;
        })
        .join('');
      return this.modal(
        `swap out ${lower(cardDef(current).name)}`,
        `<p class="muted center-text">Choose a reserve card to take its place (${esc(cardDef(current).name)} goes to your reserve). The deck keeps 20 cards, at most 2 of each, and exactly 2 Command cards.</p>
         <div class="cmp-cards">${options || '<p class="muted">Your reserve is empty.</p>'}</div>
         <div class="center-row"><button class="btn" data-act="cmp-close">back</button></div>`,
      );
    }
    const deck = me.deck.map((id, i) => `<div class="cmp-deck-slot"><button class="cmp-pick" data-act="cmp-slot" data-arg="${i}">${cardHtml(id)}</button></div>`).join('');
    const reserve = me.reserve.map((id) => `<div class="cmp-deck-slot">${cardHtml(id)}</div>`).join('');
    return this.modal(
      `battle deck · ${me.deck.length} cards`,
      `<p class="muted center-text">Tap a card to swap a reserve card in for it.</p>
       <div class="cmp-cards cmp-deck">${deck}</div>
       <div class="section-label">reserve · ${me.reserve.length}</div>
       <div class="cmp-cards cmp-deck">${reserve || '<p class="muted">Cards you win or buy wait here until you swap them into your deck.</p>'}</div>`,
      true,
    );
  }

  private modal(title: string, body: string, closable = false): string {
    return `
      <div class="overlay ${closable ? 'overlay-soft' : ''}" ${closable ? 'data-act="cmp-close"' : ''}>
        <div class="modal modal-wide cmp-modal">
          <div class="bar-title">${title}${closable ? '<button class="modal-x" data-act="cmp-close" aria-label="Close">×</button>' : ''}</div>
          <div class="modal-body">${body}</div>
        </div>
      </div>`;
  }
}

/** A small read-only card face. */
function cardHtml(defId: string): string {
  const def = cardDef(defId);
  return `
    <div class="card cmp-card kind-${def.kind} rarity-${def.rarity ?? 'dwarf'}" style="--kc:${KIND_COLOUR[def.kind]}">
      ${rarityGem(def)}
      <div class="card-glyph">${cardArt(def)}</div>
      <div class="card-name">${lower(def.name)}</div>
      <div class="card-text">${esc(def.text)}</div>
      <div class="card-kind">${typeLine(def)}</div>
    </div>`;
}
