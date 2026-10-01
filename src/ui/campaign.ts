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
  migrateGame,
  ensureScanners,
  visibleNodes,
  fusionCost,
  fusionProblem,
  fusedId,
  unfusable,
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
import { cardArt, cardGlyph, cardTextHtml, KIND_COLOUR, stabilityBadge, typeLine } from './glyphs';
import { sound } from './sound';
import { toPageDelta } from './viewport';

const KEY = 'blue-loop:campaign:v2';

export function loadCampaign(): CampaignState | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as CampaignState) : null;
    // Campaigns from before the card game was rebuilt cannot be resumed.
    if (!s || s.version !== 2) return null;
    if (s.battle) migrateGame(s.battle.game);
    ensureScanners(s);
    return s;
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
/** Systems held: a white dwarf, a small hot white star with a pale blue glow. */
const SYSTEMS =
  '<svg class="cur cur-systems" viewBox="0 0 20 20" aria-label="systems"><defs><radialGradient id="wd-glow"><stop offset=".3" stop-color="#9fbcf2" stop-opacity=".75"/><stop offset=".65" stop-color="#b9cff5" stop-opacity=".28"/><stop offset="1" stop-color="#b9cff5" stop-opacity="0"/></radialGradient><radialGradient id="wd-core" cx=".4" cy=".36"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#eef3ff"/><stop offset="1" stop-color="#b4c6ec"/></radialGradient></defs><circle cx="10" cy="10" r="9.8" fill="url(#wd-glow)"/><path d="M10 .8 10.9 7.6 10 9 9.1 7.6ZM10 19.2 9.1 12.4 10 11 10.9 12.4ZM.8 10 7.6 9.1 9 10 7.6 10.9ZM19.2 10 12.4 10.9 11 10 12.4 9.1Z" fill="#a9bfea" opacity=".9"/><circle cx="10" cy="10" r="5.3" fill="url(#wd-core)" stroke="#7f98cc" stroke-width=".7"/></svg>';
/** A scanner array: a dish with two rings of signal. */
const SCANNER =
  '<svg class="cur cur-scanner" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 15.5 9.2 10.3" stroke="#6e7f9f" stroke-width="1.4" stroke-linecap="round"/><path d="M3 11a6 6 0 0 0 6 6L3 11Z" fill="#8fa3c6" stroke="#6e7f9f" stroke-width=".9" stroke-linejoin="round"/><path d="M11.2 6.8a3.4 3.4 0 0 1 2 2M11.6 3.6a6.6 6.6 0 0 1 4.8 4.8" fill="none" stroke="#6fb3bc" stroke-width="1.3" stroke-linecap="round"/><circle cx="9.6" cy="9.9" r="1.2" fill="#6fb3bc"/></svg>';
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
  'Crystal overloaders: big bursts of heat, and run your own sun hot to hit harder still.',
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
  /** The shared settings buttons (sound, music, AI speed), for the campaign's settings sheet. */
  settingsButtons(): string;
  /** The big centred announcement, as on the battle screen's "your turn". */
  banner(text: string, sub: string): void;
}

type Sheet =
  | { kind: 'deck'; slot?: number }
  /** `fuse`: the reserve cards picked for a fusion (up to two). */
  | { kind: 'armory'; fuse?: number[] }
  | { kind: 'missions' }
  | { kind: 'log' }
  | { kind: 'station'; nodeId: string }
  | { kind: 'attack'; fromId: string; toId: string }
  | { kind: 'help' }
  | { kind: 'settings' }
  /** The game overview: every faction, its systems and its share of the universe. */
  | { kind: 'overview' };

export class CampaignView {
  state: CampaignState | null = null;
  private selected: string | null = null;
  /** An anomaly whose details are shown in the side panel. */
  private anomaly: string | null = null;
  /** What happened in the last battle or turn, shown once the player is free to read it. */
  private report: { title: string; lines: string[] } | null = null;
  private sheet: Sheet | null = null;
  /** The base's tab last open (deck, armory or missions). */
  private baseTab: 'deck' | 'armory' | 'missions' = 'deck';
  /** New-campaign setup choices. */
  private setup = { rivals: 3, race: 0 };

  constructor(private host: CampaignHost) {}

  // ---- Lifecycle ------------------------------------------------------------

  /** Open the new-campaign screen. */
  openSetup() {
    this.state = null;
    this.sheet = null;
  }

  /** "turn 12 of 60", for the banner on entering the campaign. */
  turnLine(): string {
    return this.state ? `turn ${this.state.turn} of ${CAMPAIGN.turnLimit}` : '';
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
        // The map is up: announce the campaign (the setup page before it gets none).
        this.host.render();
        this.host.banner('campaign', 'a new galaxy');
        return true;
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
        // "base" reopens the base on the tab last used.
        if (arg === 'base') arg = this.baseTab;
        if (arg === 'deck' || arg === 'armory' || arg === 'missions') this.baseTab = arg;
        this.sheet = { kind: arg as 'deck' | 'armory' | 'missions' | 'log' | 'help' | 'overview' };
        break;
      case 'cmp-fuse-pick': {
        if (this.sheet?.kind !== 'armory') break;
        const i = n();
        const picks = this.sheet.fuse ?? [];
        // Tap to pick, tap again to put back; a third pick replaces the second.
        this.sheet = { kind: 'armory', fuse: picks.includes(i) ? picks.filter((x) => x !== i) : [...picks.slice(0, 1), i] };
        break;
      }
      case 'cmp-fuse': {
        if (this.sheet?.kind !== 'armory' || this.sheet.fuse?.length !== 2) break;
        const [a, b] = this.sheet.fuse;
        if (this.apply({ type: 'fuse', a, b })) {
          sound.upgrade();
          this.sheet = { kind: 'armory' };
        }
        break;
      }
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
        this.sheet = { kind: 'settings' };
        break;
      case 'cmp-exit':
        this.sheet = null;
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
    const html = this.renderCampaign();
    this.lastFocus = this.selected;
    return html;
  }

  /** The system that was focused at the last render and no longer is: its orbits and panel fade out. */
  private leavingFocus(): CampaignNode | null {
    return this.lastFocus && this.lastFocus !== this.selected ? nodeById(this.state!, this.lastFocus) : null;
  }

  private renderCampaign(): string {
    const s = this.state!;
    const leaving = this.leavingFocus();
    const me = campaignPlayer(s);
    const inc = factionIncome(s, me.id);
    return `
      <main class="cmp">
        <div class="cmp-sky" aria-hidden="true"></div>
        <header class="cmp-top">
          <button class="cmp-turn" data-act="cmp-sheet" data-arg="overview" title="Game overview: every faction and its systems"><small>turn</small><b>${s.turn}/${CAMPAIGN.turnLimit}</b><i>›</i></button>
          <div class="cmp-purse">
            <span title="Credits (+${inc.credits} a turn): earned from your systems each turn, battles and missions. Spent on repairing damage and fortifying systems.">${CREDITS}<b>${me.credits}</b><small>(+${inc.credits})</small></span>
            <span title="Materials (+${inc.materials} a turn): earned from your systems each turn, battles and missions. Spent on buying cards in the armory.">${MATERIALS}<b>${me.materials}</b><small>(+${inc.materials})</small></span>
            <span title="Systems you hold, of ${s.nodes.length}">${SYSTEMS}<b>${ownedNodes(s, me.id).length}</b></span>
          </div>
          <nav class="cmp-nav">
            <button class="pill-btn" data-act="cmp-sheet" data-arg="base" title="Your deck, the armory and missions">base</button>
            <button class="pill-btn" data-act="cmp-sheet" data-arg="log">log</button>
            <button class="pill-btn" data-act="cmp-sheet" data-arg="help">?</button>
            <button class="icon-btn" data-act="cmp-menu" aria-label="Settings" title="Settings">${MENU_ICON}</button>
          </nav>
        </header>
        <section class="cmp-map">${this.renderMap()}</section>
        ${
          // A system's (or anomaly's) details float over the map only while it is selected; missions and the log are behind their buttons.
          this.selected
            ? `<aside class="cmp-side glass">${this.renderNode(nodeById(s, this.selected))}</aside>`
            : this.anomaly
              ? `<aside class="cmp-side glass">${this.renderAnomaly((s.anomalies ?? []).find((a) => a.id === this.anomaly)!)}</aside>`
              : leaving
                ? `<aside class="cmp-side glass cmp-side-out" aria-hidden="true">${this.renderNode(leaving)}</aside>`
                : ''
        }
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
          <button class="btn btn-small" data-act="cmp-exit">‹ back</button>
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
    // The focus before this render: systems that change between near and far fade rather than pop.
    const prev = this.lastFocus ? nodeById(s, this.lastFocus) : null;
    const leaving = this.leavingFocus();
    const farFrom = (f: CampaignNode | null, x: number, y: number, id: string, r: number) => !!f && f.id !== id && Math.hypot(x - f.x, y - f.y) > r;
    // Fog of war: only systems linked to yours (two links from a scanner) are drawn; routes into the fog fade out.
    const seen = visibleNodes(s, me.id);
    const drawn = new Set<string>();
    const links = s.nodes
      .flatMap((n) =>
        n.links.map((id) => {
          const key = [n.id, id].sort().join('-');
          if (drawn.has(key)) return '';
          drawn.add(key);
          const m = nodeById(s, id);
          if (!seen.has(n.id) && !seen.has(m.id)) return '';
          if (!seen.has(n.id) || !seen.has(m.id)) {
            const [a, b] = seen.has(n.id) ? [n, m] : [m, n];
            return `<line x1="${a.x}" y1="${a.y}" x2="${(a.x + (b.x - a.x) * 0.45).toFixed(1)}" y2="${(a.y + (b.y - a.y) * 0.45).toFixed(1)}" class="cmp-link cmp-link-fog" />`;
          }
          const same = n.owner && n.owner === m.owner;
          return `<line x1="${n.x}" y1="${n.y}" x2="${m.x}" y2="${m.y}" class="cmp-link ${same ? 'cmp-link-held' : ''}" ${same ? `style="--fc:${this.colourOf(n.owner!)}"` : ''} />`;
        }),
      )
      .join('');
    // When zoomed in, the links fade out away from the focused system.
    const mask = focus ? `style="--mx:${focus.x}px;--my:${focus.y}px"` : '';
    const nodes = s.nodes
      .filter((n) => seen.has(n.id))
      .map((n) => {
        const colour = n.owner ? this.colourOf(n.owner) : NEUTRAL;
        const far = farFrom(focus, n.x, n.y, n.id, 250);
        const wasFar = farFrom(prev, n.x, n.y, n.id, 250);
        const cls = [
          far !== wasFar ? (far ? 'cmp-fade-out' : 'cmp-fade-in') : '',
          leaving?.id === n.id ? 'cmp-leaving' : '',
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
          n.scanner ? `<i class="cmp-badge cmp-scan" title="Scanner array">${SCANNER}</i>` : '',
        ].join('');
        return `
          <div class="${cls}" style="left:${n.x}px;top:${n.y}px;--fc:${colour}">
            <div class="cmp-turf"></div>
            ${targets.has(n.id) ? '<div class="cmp-ring cmp-ring-target"></div>' : ''}
            ${n.hazard.length ? '<div class="cmp-ring cmp-ring-hazard"></div>' : ''}
            ${n.home ? '<div class="cmp-ring cmp-ring-home"></div>' : ''}
            ${this.selected === n.id || leaving?.id === n.id ? this.renderOrbits(n) : ''}
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
          <svg class="cmp-links ${focus ? 'cmp-links-focus' : ''} ${!!focus !== !!prev ? 'cmp-links-fade' : ''}" ${mask} width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">${links}</svg>
          ${this.renderAnomalies(focus, prev, seen)}
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
  private renderAnomalies(focus: CampaignNode | null, prev: CampaignNode | null, seen: Set<string>): string {
    const s = this.state!;
    const farFrom = (f: CampaignNode | null, a: Anomaly) => !!f && Math.hypot(a.x - f.x, a.y - f.y) > 300;
    // An anomaly shows once its reach touches a system in view.
    const inView = (a: Anomaly) => s.nodes.some((n) => seen.has(n.id) && Math.hypot(n.x - a.x, n.y - a.y) <= ANOMALIES[a.kind].radius + 40);
    return (s.anomalies ?? [])
      .filter(inView)
      .map((a) => {
        const def = ANOMALIES[a.kind];
        const far = farFrom(focus, a);
        const fade = far !== farFrom(prev, a) ? (far ? 'cmp-fade-out' : 'cmp-fade-in') : '';
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
          <div class="cmp-an an-${a.kind} ${far ? 'cmp-far' : ''} ${fade} ${this.anomaly === a.id ? 'an-on' : ''}" style="left:${a.x}px;top:${a.y}px;--ar:${def.radius}px">
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
  /** Where the camera is right now (it outlives re-renders, so a glide can start from it). */
  private cam: Cam | null = null;
  /** A glide in progress: where it started and when. */
  private glide: { from: Cam; start: number } | null = null;
  private frame: number | null = null;
  /** The system focused at the last render, to fade out what belonged to it. */
  private lastFocus: string | null = null;
  private drag: { id: number; x: number; y: number; moved: boolean; pinch?: { d: number; zoom: number } } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  /** Set after a drag so the click that ends it does not select or deselect. */
  private swallowClick = false;
  private stageEl: HTMLElement | null = null;

  private static readonly TILT = 44;
  private static readonly FOCUS_TILT = 56;
  private static readonly MAX_ZOOM = 5.5;
  private static readonly GLIDE_MS = 1000;
  /** How far behind the map the sky lies: over the whole map it slides this fraction of the map's fitted width. */
  private static readonly SKY_DEPTH = 0.55;

  private homeView() {
    const home = ownedNodes(this.state!, this.state!.playerId)[0] ?? this.state!.nodes[0];
    return { x: home.x, y: home.y, zoom: 2.8 };
  }

  /** Fit the map to its stage and move the camera (called after every render and on resize). */
  afterRender(root: HTMLElement) {
    const stage = root.querySelector<HTMLElement>('.cmp-stage');
    this.stageEl = stage;
    if (!stage || !this.state) {
      this.cam = null;
      this.glide = null;
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

  /**
   * Where the camera should be: over the focused system (closer and steeper),
   * or wherever the free camera looks.
   */
  private cameraTarget(stage: HTMLElement): Cam {
    const focus = this.selected ? nodeById(this.state!, this.selected) : null;
    const fit = this.fitScale(stage, CampaignView.TILT);
    const v = this.view!;
    // Stars keep a readable size at any free zoom; zooming into a system leaves that alone, so they grow with it.
    const ui = Math.min(2.2, Math.max(0.7, 1 / (fit * v.zoom)));
    return focus
      ? // Zoomed on a system the stars still grow, just not as much as the map (so the star stays on screen).
        { x: focus.x, y: focus.y, scale: Math.max(fit * v.zoom, 1) * 2.4, tilt: CampaignView.FOCUS_TILT, ui: ui * 0.6 }
      : { x: v.x, y: v.y, scale: fit * v.zoom, tilt: CampaignView.TILT, ui };
  }

  /**
   * Move the camera. Zooming into or out of a system glides there (position,
   * zoom and tilt together, with the stars turning and resizing as it goes);
   * pans and pinches follow the finger at once, and a pan during a glide
   * steers it rather than cutting it short.
   */
  private applyCamera(animate: boolean) {
    const stage = this.stageEl;
    if (!stage || !this.state || !this.view) return;
    const target = this.cameraTarget(stage);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate && this.cam && !reduce && !sameCam(this.cam, target)) {
      this.glide = { from: { ...this.cam }, start: performance.now() };
      this.writeCamera(); // the re-rendered plane starts where the old one was, not untransformed
      if (this.frame === null) this.frame = requestAnimationFrame((t) => this.tick(t));
      return;
    }
    if (this.glide) return this.writeCamera(); // mid-glide: keep the fresh plane in place; the next frame heads for the new target
    this.cam = target;
    this.writeCamera();
  }

  private tick(now: number) {
    this.frame = null;
    const stage = this.stageEl;
    if (!stage || !this.state || !this.view || !this.glide) return;
    const target = this.cameraTarget(stage);
    const t = Math.min(1, (now - this.glide.start) / CampaignView.GLIDE_MS);
    // Ease in and out; zoom in log space, so it feels even at every scale.
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    const f = this.glide.from;
    this.cam = {
      x: f.x + (target.x - f.x) * e,
      y: f.y + (target.y - f.y) * e,
      scale: Math.exp(Math.log(f.scale) + (Math.log(target.scale) - Math.log(f.scale)) * e),
      tilt: f.tilt + (target.tilt - f.tilt) * e,
      ui: f.ui + (target.ui - f.ui) * e,
    };
    this.writeCamera();
    if (t < 1) this.frame = requestAnimationFrame((n) => this.tick(n));
    else this.glide = null;
  }

  /**
   * Parallax: the sky is a far-off layer behind the map. It slides with the
   * systems as you pan, the same way but slower, and never scales: zooming
   * moves the map, not the sky. Its size is fixed (the screen plus room to
   * slide), so the picture never stretches.
   */
  private writeSky(c: Cam) {
    const stage = this.stageEl;
    const sky = stage?.closest('.cmp')?.querySelector<HTMLElement>('.cmp-sky');
    if (!stage || !sky) return;
    const page = sky.parentElement!;
    const fit = this.fitScale(stage, CampaignView.TILT);
    // How far the sky slides across the whole map, in screen pixels (independent of zoom).
    const range = { x: MAP_WIDTH * fit * CampaignView.SKY_DEPTH, y: MAP_HEIGHT * fit * CampaignView.SKY_DEPTH * 0.7 };
    const dx = -(c.x / MAP_WIDTH - 0.5) * range.x;
    const dy = -(c.y / MAP_HEIGHT - 0.5) * range.y;
    // Cover the screen at either end of the slide, keeping the painting's 8:5 proportions.
    const w = Math.max(page.clientWidth + range.x, (page.clientHeight + range.y) * 1.6) + 8;
    if (sky.dataset.w !== w.toFixed(0)) {
      sky.dataset.w = w.toFixed(0);
      sky.style.width = `${w.toFixed(0)}px`;
      sky.style.height = `${(w / 1.6).toFixed(0)}px`;
    }
    sky.style.transform = `translate(-50%, -50%) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  }

  private writeCamera() {
    const plane = this.stageEl?.querySelector<HTMLElement>('.cmp-plane');
    const c = this.cam;
    if (!plane || !c) return;
    plane.style.transform = `rotateX(${c.tilt.toFixed(2)}deg) scale3d(${c.scale.toFixed(4)}, ${c.scale.toFixed(4)}, ${c.scale.toFixed(4)}) translate(${(-c.x).toFixed(1)}px, ${(-c.y).toFixed(1)}px)`;
    plane.style.setProperty('--tilt', `${c.tilt.toFixed(2)}deg`);
    plane.style.setProperty('--ui', c.ui.toFixed(4));
    this.writeSky(c);
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
      // Dragging while zoomed on a system lets go of it: the camera glides back out while the drag pans on.
      if (this.selected) {
        const n = nodeById(this.state!, this.selected);
        this.view = { ...this.view, x: n.x, y: n.y };
        this.selected = null;
        this.host.render();
      }
      try {
        this.stageEl!.setPointerCapture(e.pointerId);
      } catch {
        // The pointer has gone; the drag ends with it.
      }
    }
    const scale = this.fitScale(this.stageEl!, CampaignView.TILT) * this.view.zoom;
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
    // Fortification: its notches and what they are worth to the defender, and (on your own systems) the next level's price.
    const fortify = `
      <div class="cmp-fort" title="Fortification: each level gives this system's defender +${CAMPAIGN.fortifyHealth} max health">
        <span class="pips">${fortPips}</span><b>+${n.fortification * CAMPAIGN.fortifyHealth} defence</b>${
          mine && fortCost !== null ? `<button class="pill-btn" data-act="cmp-fortify" data-arg="${n.id}" ${me.credits < fortCost ? 'disabled' : ''} title="Fortify: +${CAMPAIGN.fortifyHealth} defence">+ ${CREDITS}${fortCost}</button>` : ''
        }
      </div>`;
    const g = garrisonBonus(n);
    const bonus = [
      g.tableau.length && `${g.tableau.length} card${g.tableau.length > 1 ? 's' : ''} start in play`,
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
      <div class="cmp-yield" title="Resources this system yields each turn">${CREDITS}<b>${n.yield.credits}</b>${MATERIALS}<b>${n.yield.materials}</b>${n.scanner ? `<span class="cmp-scan-tag" title="Scanner array: whoever holds it sees systems two links away">${SCANNER} scanner</span>` : ''}</div>
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
        return this.base(
          'armory',
          `<div class="cmp-cards">${cards || '<p class="muted">Sold out. New stock arrives next turn, or when you conquer a system.</p>'}</div>
           <p class="muted center-text">Bought cards join your reserve. Stock changes every turn and with every conquest. You have ${MATERIALS} ${me.materials}.</p>
           ${this.renderFusion(sh.fuse ?? [])}`,
        );
      }
      case 'missions': {
        const active = me.missions.map((m) => this.missionRow(m.id, missionProgress(s, me, m))).join('');
        return this.base(
          'missions',
          `<div class="cmp-missions">${active || '<p class="muted">All missions complete.</p>'}</div>
           <p class="muted">Each completed mission pays ${CREDITS} ${CAMPAIGN.missionCredits} and ${MATERIALS} ${CAMPAIGN.missionMaterials}, and lets you choose a new card. ${CAMPAIGN_MISSIONS.length} missions in all.</p>`,
                  );
      }
      case 'log':
        return this.modal('campaign log', `<div class="log-list">${s.log.map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`, true);
      case 'overview': {
        const me = campaignPlayer(s);
        const goal = Math.ceil(s.nodes.length * CAMPAIGN.dominationShare);
        const factions = [...s.factions]
          .sort((a, b) => ownedNodes(s, b.id).length - ownedNodes(s, a.id).length)
          .map((f) => {
            const held = ownedNodes(s, f.id).length;
            const share = Math.round((held / s.nodes.length) * 100);
            return `<div class="cmp-faction ${f.eliminated ? 'out' : ''}" style="--fc:${this.colourOf(f.id)}">${this.avatarOf(f.id)}<span>${f.id === me.id ? 'you' : lower(f.name)}${f.name !== RACE_NAMES[f.race] ? ` <small>${lower(RACE_NAMES[f.race])}</small>` : ''}</span><b>${f.eliminated ? 'eliminated' : `${held} system${held === 1 ? '' : 's'} · ${share}%`}</b></div>`;
          })
          .join('');
        const neutral = s.nodes.filter((n) => !n.owner).length;
        return this.modal(
          `overview · turn ${s.turn} of ${CAMPAIGN.turnLimit}`,
          `<div class="cmp-factions cmp-overview">${factions}</div>
           <p class="muted center-text">${neutral} systems are still neutral. Hold ${goal} of ${s.nodes.length} systems (${Math.round(CAMPAIGN.dominationShare * 100)}%) or outlast every rival to win; otherwise the most systems after turn ${CAMPAIGN.turnLimit} wins.</p>`,
          true,
        );
      }
      case 'settings':
        return this.modal(
          `settings · turn ${s.turn}`,
          `<div class="menu-list">
            ${this.host.settingsButtons()}
            <button class="btn" data-act="cmp-sheet" data-arg="help">how the campaign works</button>
            <button class="btn" data-act="cmp-exit">main menu</button>
          </div>
          <p class="muted center-text">Your campaign is saved; continue it from the main menu.</p>`,
          true,
        );
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
            <li><b>Fog of war:</b> you only see systems linked to yours. Hold a system with a <b>scanner</b> to see two links out from it.</li>
            <li><b>Your base</b> holds your deck, the armory and your missions. The armory restocks every turn and whenever you conquer a system. <b>Fusion</b> merges two reserve cards into one that does both, for ${MATERIALS} materials; it cannot be undone.</li>
            <li><b>Send reserve cards</b> to a system's garrison (up to ${CAMPAIGN.garrisonSlots}) to defend it: they start the battle already in play in its tableau (a Lightspeed card starts set face down). Cards take a turn to arrive and a turn to return. If the system falls, the conqueror takes them.</li>
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
    return `<div class="cmp-matchup">${side(from, 'attacker')}<span class="cmp-vs">vs</span>${side(to, 'defender')}</div>${
      def.length ? `<p class="cmp-bonus">The defender starts with ${def.join(', ')} in play.</p>` : ''
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
    return this.base(
      'deck',
      `<div class="section-label">battle deck · ${me.deck.length} cards</div>
       <p class="muted center-text">Tap a card to swap a reserve card in for it.</p>
       <div class="cmp-cards cmp-deck">${deck}</div>
       <div class="section-label">reserve · ${me.reserve.length}</div>
       <div class="cmp-cards cmp-deck">${reserve || '<p class="muted">Cards you win or buy wait here until you swap them into your deck.</p>'}</div>`,
    );
  }

  /**
   * Fusion, in the armory: pick two reserve cards to merge into one that does
   * both, for materials. It cannot be undone.
   */
  private renderFusion(picks: number[]): string {
    const me = campaignPlayer(this.state!);
    const cards = me.reserve
      .map((id, i) => {
        const on = picks.includes(i);
        // Once one card is picked, cards that cannot fuse with it are marked.
        const problem = picks.length && !on ? fusionProblem(me.reserve[picks[0]], id) : unfusable(id);
        return `<button class="cmp-pick ${on ? 'cmp-pick-on' : ''}" data-act="cmp-fuse-pick" data-arg="${i}" ${problem && !on ? `disabled title="${esc(problem)}"` : ''}>${cardHtml(id)}</button>`;
      })
      .join('');
    let result = '<p class="muted center-text">Pick two reserve cards to fuse.</p>';
    if (picks.length === 2) {
      const [a, b] = picks.map((i) => me.reserve[i]);
      const problem = fusionProblem(a, b);
      const cost = fusionCost(a, b);
      result = problem
        ? `<p class="cmp-warn center-text">${esc(problem)}</p>`
        : `<div class="cmp-fuse-result">
            <div class="cmp-deck-slot">${cardHtml(fusedId(a, b))}</div>
            <div class="cmp-fuse-go">
              <p>${esc(cardDef(a).name)} and ${esc(cardDef(b).name)} become one card that does both. <b>This cannot be undone.</b></p>
              <button class="btn-primary" data-act="cmp-fuse" ${me.materials < cost ? 'disabled' : ''}>fuse · ${MATERIALS} ${cost}</button>
            </div>
          </div>`;
    }
    return `
      <div class="section-label">fusion</div>
      ${result}
      <div class="cmp-cards cmp-deck">${cards || '<p class="muted">Your reserve is empty. Buy or win cards to fuse them.</p>'}</div>
      <p class="muted center-text">Command, global and Lightspeed cards cannot be fused, nor can a fused card be fused again.</p>`;
  }

  /** The base: deck, armory and missions, as tabs of one overlay. */
  private base(tab: 'deck' | 'armory' | 'missions', body: string): string {
    const tabs = (['deck', 'armory', 'missions'] as const)
      .map((t) => `<button class="cmp-tab ${t === tab ? 'cmp-tab-on' : ''}" data-act="cmp-sheet" data-arg="${t}">${t}</button>`)
      .join('');
    return this.modal('base', body, true, `<nav class="cmp-tabs">${tabs}</nav>`);
  }

  private modal(title: string, body: string, closable = false, tabs = ''): string {
    return `
      <div class="overlay ${closable ? 'overlay-soft' : ''}" ${closable ? 'data-act="cmp-close"' : ''}>
        <div class="modal modal-wide cmp-modal">
          <div class="bar-title">${title}${closable ? '<button class="modal-x" data-act="cmp-close" aria-label="Close">×</button>' : ''}</div>
          ${tabs}
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
      <div class="card-glyph">${cardArt(def, true)}</div>${stabilityBadge(def)}
      <div class="card-name">${lower(def.name)}</div>
      <div class="card-text">${cardTextHtml(def.text)}</div>
      <div class="card-kind">${typeLine(def)}</div>
    </div>`;
}

/** The map camera: what it looks at (map units), how far it is zoomed, and how steeply it looks down. */
interface Cam {
  x: number;
  y: number;
  scale: number;
  tilt: number;
  /** Star size factor: counters the free zoom so stars stay readable (see cameraTarget). */
  ui: number;
}

function sameCam(a: Cam, b: Cam): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.scale / b.scale - 1) < 0.001 && Math.abs(a.tilt - b.tilt) < 0.05 && Math.abs(a.ui - b.ui) < 0.001;
}
