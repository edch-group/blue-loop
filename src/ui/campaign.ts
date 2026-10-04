import {
  ANOMALIES,
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
  migrateCampaign,
  armyDeckProblems,
  visibleNodes,
  armiesOf,
  armyAt,
  armyById,
  armyMoves,
  recruitCost,
  regionalStability,
  heroState,
  heroLevel,
  nextLevelXp,
  skillPoints,
  learnProblem,
  SKILL_TREES,
  RACE_SLOTS,
  SLOT_NAME,
  XP_LEVELS,
  battleOdds,
  logInSight,
  collapsesPerTurn,
  stabiliseProblem,
  GENERALS,
  HEART_NAME,
  ORACLE_NAME,
  STELLARIA_NAME,
  QUARTERMASTER,
  armyLeader,
  STAR_TYPES,
  QUARTERMASTER_LINES,
  RECYCLER,
  RECYCLER_LINES,
  recycleValue,
  type Army,
  type StoryScene,
  fusionCost,
  fusionProblem,
  fusedId,
  createCampaign,
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
  RESEARCH,
  researchProblem,
  researchProject,
  researchBonus,
  heroBonus,
  boonsText,
} from '../engine';
import { markDirty } from './account';
import { DeckBuilder, type BuilderMode } from './builder';
import { heroFigure, skillTree } from './heroview';
import { researchTree } from './researchview';
import { shipModel } from './ships';
import { stellariaFlower } from './art';
import { MENU_ICON } from './menu-icon';
import { cardArtLite, cardGlyph, cardTextHtml, KIND_COLOUR, stabilityBadge, typeLine } from './glyphs';
import { sound } from './sound';
import { toPageDelta } from './viewport';

const KEY = 'blue-loop:campaign:v3';

export function loadCampaign(): CampaignState | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as CampaignState) : null;
    // Campaigns from before armies (version 2 and older) cannot be resumed.
    if (!s || s.version !== 3) return null;
    if (s.battle) migrateGame(s.battle.game);
    return migrateCampaign(s);
  } catch {
    return null;
  }
}
function saveCampaign(s: CampaignState | null) {
  try {
    if (s && !s.winner) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
    markDirty();
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
/** A Finite Stellari bloom: a small six-petalled flower. */
const BLOOM =
  '<svg class="cur cur-bloom" viewBox="0 0 20 20" aria-hidden="true">' +
  [0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="10" cy="5.2" rx="2.6" ry="4.4" fill="#f2b8e6" stroke="#c97bc0" stroke-width=".6" transform="rotate(${a} 10 10)"/>`).join('') +
  '<circle cx="10" cy="10" r="2.6" fill="#fff4b0" stroke="#e0b450" stroke-width=".6"/></svg>';

/** A hero's portrait: their card's picture, cropped round. */
function portrait(cardId: string): string {
  return `<span class="cmp-portrait">${cardArtLite(cardDef(cardId))}</span>`;
}

/** The base button's icon: a little house. */
const HOME_ICON = '<svg class="cmp-home-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v8.5h11V10"/><path d="M10.2 18.5v-4.6h3.6v4.6"/></svg>';

/** One of the Lost Races: a faded figure, half gone into the dark. */
const LOST_PORTRAIT = `<span class="cmp-portrait cmp-portrait-lost"><svg viewBox="0 0 80 80" aria-hidden="true">
  <defs><radialGradient id="lost-bg" cx=".5" cy=".35"><stop offset="0" stop-color="#4a4658"/><stop offset="1" stop-color="#15131c"/></radialGradient>
  <linearGradient id="lost-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9c4dc" stop-opacity=".85"/><stop offset="1" stop-color="#c9c4dc" stop-opacity="0"/></linearGradient></defs>
  <rect width="80" height="80" fill="url(#lost-bg)"/>
  <path d="M40 20c-10 0-15 8-15 18 0 8-6 18-12 42h54c-6-24-12-34-12-42 0-10-5-18-15-18z" fill="url(#lost-fade)"/>
  <circle cx="35.5" cy="37" r="1.4" fill="#fff" opacity=".8"/><circle cx="44.5" cy="37" r="1.4" fill="#fff" opacity=".8"/>
  ${[[14, 16], [64, 22], [22, 58], [60, 54]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.9" fill="#fff" opacity=".35"/>`).join('')}
</svg></span>`;

/** An army's face: its general, or (one of the Lost Races) a faded figure. */
function armyFace(a: Army): string {
  return a.lost ? LOST_PORTRAIT : portrait(a.general);
}

/** The Lost Races' colour on the map: a pale, washed-out violet. */
const LOST_COLOUR = '#9a94b0';

/** Oriel the Wanderer: a hooded figure carrying a lantern, under a scatter of failing stars. */
const ORACLE_PORTRAIT = `<span class="cmp-portrait cmp-portrait-oracle"><svg viewBox="0 0 80 80" aria-hidden="true">
  <defs>
    <radialGradient id="or-sky" cx=".5" cy=".3"><stop offset="0" stop-color="#2c2550"/><stop offset="1" stop-color="#0d0b1c"/></radialGradient>
    <radialGradient id="or-lamp"><stop offset="0" stop-color="#fffbe6"/><stop offset=".4" stop-color="#ffd98a"/><stop offset="1" stop-color="#ffb04a" stop-opacity="0"/></radialGradient>
    <linearGradient id="or-cloak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d6a9c"/><stop offset="1" stop-color="#2a2748"/></linearGradient>
  </defs>
  <rect width="80" height="80" fill="url(#or-sky)"/>
  ${[[12, 14, 0.9], [66, 10, 0.6], [58, 26, 0.4], [20, 34, 0.5], [70, 44, 0.7], [8, 54, 0.4]].map(([x, y, o]) => `<circle cx="${x}" cy="${y}" r="0.9" fill="#fff" opacity="${o}"/>`).join('')}
  <path d="M40 18c-11 0-17 10-17 22 0 6-3 14-9 40h52c-6-26-9-34-9-40 0-12-6-22-17-22z" fill="url(#or-cloak)"/>
  <path d="M40 22c-7 0-11 7-11 15 0 4 4 7 11 7s11-3 11-7c0-8-4-15-11-15z" fill="#14122a"/>
  <circle cx="36.5" cy="36" r="1.2" fill="#bfe6ff"/><circle cx="43.5" cy="36" r="1.2" fill="#bfe6ff"/>
  <path d="M58 44v10" stroke="#c9b27a" stroke-width="1.2"/>
  <circle cx="58" cy="60" r="11" fill="url(#or-lamp)"/>
  <rect x="55" y="55" width="6" height="9" rx="1.5" fill="#fff3c4" stroke="#c9b27a" stroke-width="1"/>
</svg></span>`;

/** The armoury's quartermaster: a broad figure in work goggles, behind a crate, under a hanging lamp. */
const QUARTERMASTER_PORTRAIT = `<span class="cmp-portrait cmp-portrait-keeper"><svg viewBox="0 0 80 80" aria-hidden="true">
  <defs>
    <linearGradient id="qm-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3a2c"/><stop offset="1" stop-color="#1c1510"/></linearGradient>
    <radialGradient id="qm-lamp" cx=".5" cy="0"><stop offset="0" stop-color="#ffd28a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd28a" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="80" height="80" fill="url(#qm-bg)"/>
  <rect width="80" height="60" fill="url(#qm-lamp)"/>
  <path d="M14 80c2-16 12-24 26-24s24 8 26 24z" fill="#7a5a3c"/>
  <path d="M30 58l10 8 10-8" fill="none" stroke="#5a4029" stroke-width="2"/>
  <circle cx="40" cy="38" r="14" fill="#c99a74"/>
  <path d="M26 34c2-10 26-10 28 0" fill="#3a2a1e"/>
  <rect x="27" y="33" width="26" height="7" rx="3.5" fill="#2a2420"/>
  <circle cx="34" cy="36.5" r="3.2" fill="#9fd4e8" stroke="#c9a46a" stroke-width="1.2"/>
  <circle cx="46" cy="36.5" r="3.2" fill="#9fd4e8" stroke="#c9a46a" stroke-width="1.2"/>
  <path d="M33 46c4 3 10 3 14 0" fill="none" stroke="#6b4632" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M30 48c3 6 17 6 20 0" fill="#8a6a50" opacity=".7"/>
  <rect x="48" y="62" width="26" height="18" rx="2" fill="#9a7b4f" stroke="#5a4029" stroke-width="1.5"/>
  <path d="M48 70h26M61 62v18" stroke="#5a4029" stroke-width="1.2"/>
</svg></span>`;

/** The recycler: an old woman in a patched hood and scarf, a ring of salvage glowing behind her. */
const RECYCLER_PORTRAIT = `<span class="cmp-portrait cmp-portrait-keeper"><svg viewBox="0 0 80 80" aria-hidden="true">
  <defs>
    <radialGradient id="rc-bg" cx=".5" cy=".4"><stop offset="0" stop-color="#2f4a3a"/><stop offset="1" stop-color="#101a14"/></radialGradient>
  </defs>
  <rect width="80" height="80" fill="url(#rc-bg)"/>
  <circle cx="40" cy="36" r="27" fill="none" stroke="#8fd1a4" stroke-width="2" stroke-dasharray="10 5" opacity=".55"/>
  ${[0, 120, 240].map((r) => `<path d="M40 7l4 5h-8z" fill="#8fd1a4" opacity=".7" transform="rotate(${r} 40 36)"/>`).join('')}
  <path d="M16 80c2-18 11-26 24-26s22 8 24 26z" fill="#6d6458"/>
  <path d="M22 62c6 6 30 6 36 0l-3 8c-8 4-22 4-30 0z" fill="#b5623e"/>
  <path d="M40 18c-12 0-18 10-18 22 0 4 2 8 4 10h28c2-2 4-6 4-10 0-12-6-22-18-22z" fill="#857a6a"/>
  <circle cx="40" cy="40" r="11" fill="#d8b49a"/>
  <path d="M33 39q2-2 4 0M43 39q2-2 4 0" fill="none" stroke="#4a3426" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M35 46q5 3 10 0" fill="none" stroke="#7a4c3a" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M30 34q3-3 6-2M44 32q3-1 6 2" fill="none" stroke="#efe6da" stroke-width="1.2" stroke-linecap="round"/>
  <rect x="29" y="24" width="7" height="5" rx="1" fill="#a39684" transform="rotate(-12 32 26)"/>
</svg></span>`;

const STELLARIA = STELLARIA_NAME;

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
  /** Show a card large. */
  zoom(id: string): void;
}

type ArmoryTab = 'buy' | 'recycle' | 'fuse';

type Sheet =
  /** The base, full screen: an army's deck (the first army's if none is named), in the deck builder. */
  | { kind: 'deck'; armyId?: string }
  /** Raising a new army in a system. */
  | { kind: 'recruit'; nodeId: string }
  /** The base's armoury: buying, recycling or fusing; the card picked (or, fusing, the two). */
  | { kind: 'armory'; tab: ArmoryTab; pick?: string; fuse?: string[] }
  | { kind: 'missions' }
  /** The base's research: army-wide projects, one at a time. */
  | { kind: 'research' }
  /** The base's heroes: one hero at a time (their skills and gear). */
  | { kind: 'heroes'; hero?: string }
  | { kind: 'log' }
  | { kind: 'station'; nodeId: string }
  | { kind: 'attack'; armyId: string; toId: string }
  | { kind: 'help' }
  | { kind: 'settings' }
  /** The game overview: every faction, its systems and its share of the universe. */
  | { kind: 'overview' };

/** Map stages already listening for drags and zooms (kept through redraws, which no longer rebuild them). */
const boundStages = new WeakSet<HTMLElement>();

/** Whether the guide, Oriel, speaks (a setting, remembered on this device). */
function guideOn(): boolean {
  try {
    return localStorage.getItem('blue-loop:guide') !== 'off';
  } catch {
    return true;
  }
}
function setGuide(on: boolean) {
  try {
    localStorage.setItem('blue-loop:guide', on ? 'on' : 'off');
  } catch {
    // only a convenience
  }
}

export class CampaignView {
  state: CampaignState | null = null;
  private selected: string | null = null;
  /** The army picked to march: its routes light up, and tapping one sends it. */
  private army: string | null = null;
  /** The line reached in the story scene on screen. */
  private storyLine = 0;
  /** An anomaly whose details are shown in the side panel. */
  private anomaly: string | null = null;
  /** What happened in the last battle or turn, shown once the player is free to read it. */
  private report: { title: string; lines: string[] } | null = null;
  private sheet: Sheet | null = null;
  /** The base's tab last open (deck, armory or missions). */
  /** In the research tab: the project picked. */
  private researchPick: string | null = null;
  private baseTab: 'deck' | 'heroes' | 'research' | 'armory' | 'missions' = 'deck';
  /** New-campaign setup choices. */
  private setup = { rivals: 3, race: 0 };
  /** The other factions' turns, as they happen: whose it is, and what of it can be seen. */
  private waiting: { factionId: string | null; lines: string[] } | null = null;
  /** In the heroes tab: the skill and the gear slot picked. */
  private skillPick: string | null = null;
  private slotPick: string | null = null;
  /** Visits to the armoury's keepers (each visit, they say something else). */
  private keeperVisit = 0;
  /** The base's deck and armoury: the main deck builder, put to the campaign's use. */
  readonly builder = new DeckBuilder({
    render: () => this.host.render(),
    toast: (text) => this.host.toast(text),
    zoom: (id) => this.host.zoom(id),
    done: () => {
      this.sheet = null;
      this.host.render();
    },
  });

  constructor(private host: CampaignHost) {}

  // ---- Lifecycle ------------------------------------------------------------

  /** Open the new-campaign screen. */
  openSetup() {
    this.state = null;
    this.sheet = null;
    this.ships.clear();
  }

  /** "turn 12 of 60", for the banner on entering the campaign. */
  turnLine(): string {
    return this.state ? `turn ${this.state.turn} of ${CAMPAIGN.turnLimit}` : '';
  }

  resume(): boolean {
    const s = loadCampaign();
    if (!s) return false;
    this.state = s;
    this.ships.clear();
    this.sheet = null;
    this.selected = null;
    this.view = null;
    this.skipSilentScenes();
    // Left while the others were moving: they carry on.
    if (s.phase === 'ai' && s.aiStepwise && !s.battle) window.setTimeout(() => void this.runOthers(), 0);
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
    // A defence over: the others carry on with their turns.
    if (this.state?.phase === 'ai' && this.state.aiStepwise && !this.state.battle) window.setTimeout(() => void this.runOthers(), 0);
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
    this.skipSilentScenes();
    saveCampaign(this.state);
    return true;
  }

  /** The lines of a scene that are shown: all of them, or (with the guide turned off) only the generals'. */
  private shownLines(scene: StoryScene) {
    return guideOn() ? scene.lines : scene.lines.filter((l) => l.speaker.kind !== 'oracle');
  }

  /** Scenes with nothing left to show (the guide turned off) are passed over. */
  private skipSilentScenes() {
    while (this.state && this.state.story.queue[0] && !this.shownLines(this.state.story.queue[0]).length) {
      this.state = applyCampaignAction(this.state, { type: 'readStory' });
      this.storyLine = 0;
    }
  }

  /**
   * The other factions take their turns one at a time. Those in sight are shown moving, on a waiting
   * screen, with whatever they do that can be seen; those out of sight move unseen and at once (so with
   * none in sight, the next turn simply begins). A battle against the player pauses it; finishing the
   * battle carries on.
   */
  private async runOthers() {
    const pause = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const begun = this.state;
    if (!begun) return;
    const turn = begun.turn;
    for (;;) {
      const s = this.state;
      if (!s || s.phase !== 'ai' || s.battle || s.winner || s.turn !== turn) break;
      const next = s.aiQueue[0] ?? null;
      const inSight = next !== null && this.factionInSight(next);
      if (inSight) {
        this.waiting = { factionId: next, lines: this.waiting?.lines ?? [] };
        this.host.render();
        await pause(700);
        if (this.state !== s) break;
      }
      const seq = s.log[s.log.length - 1]?.seq ?? 0;
      const seen = visibleNodes(s, s.playerId);
      if (!this.apply({ type: 'aiStep' })) break;
      const now = this.state!;
      // Only what happened in sight (before or after the move) is known.
      const after = visibleNodes(now, now.playerId);
      const lines = now.log.filter((l) => l.seq > seq && l.turn === turn && (logInSight(now, l, now.playerId, seen) || logInSight(now, l, now.playerId, after))).map((l) => l.text);
      if (inSight) {
        this.waiting = { factionId: next, lines: [...(this.waiting?.lines ?? []), ...lines].slice(-6) };
        this.host.render();
        await pause(lines.length ? 1100 : 500);
      } else if (lines.length && this.waiting) {
        this.waiting.lines = [...this.waiting.lines, ...lines].slice(-6);
      }
    }
    this.waiting = null;
    const s = this.state;
    // Like the dawn in battle: every new turn of yours is announced.
    if (s && s.turn !== turn && !s.winner) this.host.banner('your turn', `turn ${s.turn}`);
    this.host.render();
  }

  /** Whether a faction can be seen at all: any of its systems or armies in sight. */
  private factionInSight(factionId: string): boolean {
    const s = this.state!;
    const seen = visibleNodes(s, s.playerId);
    return s.nodes.some((n) => n.owner === factionId && seen.has(n.id)) || s.armies.some((a) => a.owner === factionId && seen.has(a.nodeId));
  }

  /** The waiting screen while the others move: who is moving, and what of it can be seen. */
  private renderWaiting(): string {
    const w = this.waiting!;
    const s = this.state!;
    const f = w.factionId ? s.factions.find((x) => x.id === w.factionId) : null;
    const name = f ? (f.lost ? 'the lost races' : lower(f.name)) : 'the others';
    return `
      <div class="cmp-waiting" aria-live="polite">
        <div class="cmp-waiting-card" style="--fc:${f ? this.colourOf(f.id) : NEUTRAL}">
          <div class="cmp-waiting-head">${f ? this.avatarOf(f.id, 'cmp-waiting-av') : ''}<div><small>the other factions move</small><b>${esc(name)}</b></div><span class="cmp-waiting-dots"><i></i><i></i><i></i></span></div>
          ${w.lines.length ? `<ul class="cmp-waiting-feed">${w.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>`;
  }

  /** Nothing left to do this turn: no army can move (each has marched, is refitting, or has nowhere to go). */
  private nothingLeft(): boolean {
    const s = this.state!;
    if (s.phase !== 'player' || s.battle || s.conquest || s.cardRewards.length) return false;
    return armiesOf(s, s.playerId).every((a) => armyMoves(s, a).length === 0);
  }

  /** The armoury's stock as last seen (to tag the base "new" when it changes). */
  private armoryKey(): string {
    const s = this.state!;
    return `${s.turn}:${s.armory.join(',')}`;
  }
  private armoryIsNew(): boolean {
    if (!this.state?.armory.length) return false;
    try {
      const seen = localStorage.getItem('blue-loop:armory-seen');
      return seen !== null ? seen.split(':').slice(1).join(':') !== this.state.armory.join(',') : true;
    } catch {
      return false;
    }
  }
  private markArmorySeen() {
    try {
      localStorage.setItem('blue-loop:armory-seen', this.armoryKey());
    } catch {
      // only a convenience
    }
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
        this.skipSilentScenes();
        saveCampaign(this.state);
        sound.objective();
        this.army = null;
        this.storyLine = 0;
        // The map is up: announce the campaign (the setup page before it gets none).
        this.host.render();
        this.host.banner('campaign', 'a dying universe');
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
        if (this.swallowClick || (!this.selected && !this.army)) return true;
        this.selected = null;
        this.army = null;
        break;
      case 'cmp-anomaly':
        if (this.swallowClick) return true;
        this.anomaly = this.anomaly === arg ? null : arg;
        this.selected = null;
        break;
      case 'cmp-army': {
        if (this.swallowClick) return true;
        const army = armyById(s!, arg);
        // Your own army: pick it to march (tap again to put it down), keeping the map wide so its routes
        // show. Anyone else's: show the system it stands in.
        this.anomaly = null;
        if (army.owner === s!.playerId) {
          this.army = this.army === arg ? null : arg;
          this.selected = null;
          // Frame the army and every system it can reach, so its routes are in view.
          if (this.army) this.view = this.frameArmy(army);
        } else this.selected = army.nodeId;
        sound.hover();
        break;
      }
      case 'cmp-guide':
        setGuide(!guideOn());
        this.skipSilentScenes();
        if (this.state) saveCampaign(this.state);
        break;
      case 'cmp-story-next': {
        const scene = s?.story.queue[0];
        if (!scene) break;
        if (this.storyLine < this.shownLines(scene).length - 1) this.storyLine++;
        else {
          this.storyLine = 0;
          this.apply({ type: 'readStory' });
        }
        sound.hover();
        break;
      }
      case 'cmp-story-skip':
        this.storyLine = 0;
        this.apply({ type: 'readStory' });
        break;
      case 'cmp-recruit-open':
        this.sheet = { kind: 'recruit', nodeId: arg };
        break;
      case 'cmp-recruit': {
        if (this.sheet?.kind !== 'recruit') break;
        const nodeId = this.sheet.nodeId;
        if (this.apply({ type: 'recruit', general: arg, nodeId })) {
          sound.hero();
          this.sheet = null;
          this.army = armiesOf(this.state!, this.state!.playerId).find((a) => a.general === arg)?.id ?? null;
        }
        break;
      }
      case 'cmp-stabilise':
        if (this.apply({ type: 'stabilise', nodeId: arg })) sound.shield();
        break;
      case 'cmp-heal-army':
        if (this.apply({ type: 'healArmy', armyId: arg, all: el.dataset.all === '1' })) el.dataset.all === '1' ? sound.upgrade() : sound.repair();
        break;
      case 'cmp-deck-army':
        this.baseTab = 'deck';
        this.sheet = { kind: 'deck', armyId: arg };
        break;
      case 'cmp-hero-open':
        this.baseTab = 'heroes';
        this.sheet = { kind: 'heroes', hero: arg };
        break;
      case 'cmp-research':
        if (this.apply({ type: 'research', id: arg })) sound.upgrade();
        break;
      case 'cmp-research-pick':
        this.researchPick = arg;
        sound.hover();
        break;
      case 'cmp-hero':
        this.sheet = { kind: 'heroes', hero: arg };
        this.skillPick = this.slotPick = null;
        sound.hover();
        break;
      case 'cmp-skill-pick':
        this.skillPick = arg;
        sound.hover();
        break;
      case 'cmp-slot-pick':
        this.slotPick = arg || null;
        sound.hover();
        break;
      case 'cmp-learn':
        if (this.sheet?.kind === 'heroes' && this.apply({ type: 'learnSkill', hero: this.pickedHero(), skill: arg })) sound.upgrade();
        break;
      case 'cmp-equip': {
        if (this.sheet?.kind !== 'heroes') break;
        const me = campaignPlayer(s!);
        const hero = this.pickedHero();
        const item = (me.items ?? []).find((x) => x.id === arg);
        const h = heroState(me, hero);
        // Into an empty slot of its kind, else the first of its kind (swapping).
        const fit = RACE_SLOTS[me.race].filter((x) => item && x.kind === item.slot);
        const slot = fit.find((x) => x.id === this.slotPick) ?? fit.find((x) => !h.gear[x.id]) ?? fit[0];
        if (slot && this.apply({ type: 'equip', hero, itemId: arg, slot: slot.id })) sound.shield();
        break;
      }
      case 'cmp-unequip':
        if (this.sheet?.kind === 'heroes') {
          const me = campaignPlayer(s!);
          const hero = this.pickedHero();
          if (me && this.apply({ type: 'unequip', hero, slot: arg })) sound.hover();
        }
        break;
      case 'cmp-armory-tab':
        if (arg === 'buy' || arg === 'recycle' || arg === 'fuse') {
          this.sheet = { kind: 'armory', tab: arg };
          this.keeperVisit++;
        }
        break;
      case 'cmp-buy': {
        const slot = s!.armory.indexOf(arg);
        if (slot >= 0 && this.apply({ type: 'buyCard', slot })) {
          sound.buy();
          if (this.sheet?.kind === 'armory') this.sheet = { kind: 'armory', tab: 'buy', pick: this.state!.armory.includes(arg) ? arg : undefined };
        }
        break;
      }
      case 'cmp-recycle':
        if (this.apply({ type: 'recycle', defId: arg })) {
          sound.shuffle();
          if (this.sheet?.kind === 'armory') this.sheet = { kind: 'armory', tab: 'recycle', pick: campaignPlayer(this.state!).reserve.includes(arg) ? arg : undefined };
        }
        break;
      case 'cmp-tip':
        this.popTip = this.popTip === el.dataset.tip ? null : el.dataset.tip ?? null;
        break;
      case 'cmp-select':
        this.anomaly = null;
        this.popTip = null;
        if (this.swallowClick) return true;
        // With an army picked, tapping one of its routes sends it (into battle, after a look at the matchup).
        if (this.army && s) {
          const army = s.armies.find((a) => a.id === this.army);
          const move = army ? armyMoves(s, army).find((m) => m.toId === arg) : undefined;
          if (army && move) {
            if (move.battle) this.sheet = { kind: 'attack', armyId: army.id, toId: arg };
            else if (this.apply({ type: 'move', armyId: army.id, toId: arg })) {
              sound.play();
              this.selected = arg;
              this.army = null;
            }
            break;
          }
        }
        // (The camera stays where it is: a focused system just shows its planets.)
        this.selected = arg;
        sound.hover();
        break;
      case 'cmp-sheet':
        // "base" reopens the base on the tab last used.
        if (arg === 'base') arg = this.baseTab;
        if (arg === 'deck' || arg === 'heroes' || arg === 'research' || arg === 'armory' || arg === 'missions') this.baseTab = arg;
        if (arg === 'heroes') {
          this.sheet = { kind: 'heroes', hero: this.sheet?.kind === 'heroes' ? this.sheet.hero : undefined };
          break;
        }
        if (arg === 'armory') {
          this.keeperVisit++;
          this.markArmorySeen();
          this.sheet = { kind: 'armory', tab: 'buy' };
        } else if (arg === 'deck') this.sheet = { kind: 'deck', armyId: this.sheet?.kind === 'deck' ? this.sheet.armyId : undefined };
        else this.sheet = { kind: arg as 'missions' | 'research' | 'log' | 'help' | 'overview' };
        break;
      case 'cmp-fuse': {
        if (this.sheet?.kind !== 'armory' || this.sheet.fuse?.length !== 2) break;
        const reserve = campaignPlayer(s!).reserve;
        const [x, y] = this.sheet.fuse;
        const a = reserve.indexOf(x);
        const b = reserve.findIndex((id, k) => id === y && k !== a);
        if (a >= 0 && b >= 0 && this.apply({ type: 'fuse', a, b })) {
          sound.upgrade();
          this.sheet = { kind: 'armory', tab: 'fuse' };
        }
        break;
      }
      case 'cmp-close':
        if (this.report && !this.sheet) this.report = null;
        else this.sheet = null;
        break;
      case 'cmp-attack-pick':
        this.sheet = { kind: 'attack', armyId: el.dataset.army!, toId: arg };
        break;
      case 'cmp-fight':
      case 'cmp-auto': {
        if (this.sheet?.kind !== 'attack') break;
        const { armyId, toId } = this.sheet;
        this.sheet = null;
        this.army = null;
        // The army's ship sets out down the route first; the battle opens as it gets halfway.
        this.advance = { armyId, toId };
        sound.flare();
        this.host.render();
        setTimeout(() => {
          this.advance = null;
          if (!this.state || this.state.battle || !this.apply({ type: 'move', armyId, toId })) return this.host.render();
          if (act === 'cmp-auto') {
            this.finishBattle(this.state!.battle!.game, true);
            // (Auto-resolved here, so the map redraws with the result.)
            this.host.render();
          } else this.host.playBattle(this.state!.battle!.game);
        }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1150);
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
        if (this.apply({ type: 'heal', nodeId: arg, all: el.dataset.all === '1' })) el.dataset.all === '1' ? sound.upgrade() : sound.repair();
        break;
      case 'cmp-fortify':
        if (this.apply({ type: 'fortify', nodeId: arg })) sound.upgrade();
        break;
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
        if (this.apply({ type: 'endTurn', stepwise: true })) {
          sound.endTurn();
          this.selected = null;
          this.army = null;
          this.sheet = null;
          void this.runOthers();
          return true;
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
    return factionId === 'lost' ? `<span class="fav ${cls} fav-lost">${LOST_PORTRAIT}</span>` : factionAvatar(this.raceKey(factionId), cls);
  }
  private colourOf(factionId: string): string {
    return factionId === 'lost' ? LOST_COLOUR : FACTION_COLOUR[this.raceKey(factionId)];
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
    // A dialog up (a battle, a conquest, a sheet) takes the stage: the guide waits until it closes.
    const overlay = this.renderOverlay();
    // Ships hold still under a dialog, and sail once it closes (so a march after a battle is seen).
    this.fleetHeld = !!overlay && !this.waiting;
    const scene = !overlay && s.story.queue[0] && this.shownLines(s.story.queue[0]).length ? s.story.queue[0] : null;
    const me = campaignPlayer(s);
    const inc = factionIncome(s, me.id);
    return `
      <main class="cmp">
        <div class="cmp-sky" aria-hidden="true"></div>
        <header class="cmp-top">
          <div class="cmp-top-left">
            <button class="cmp-turn" data-act="cmp-sheet" data-arg="overview" title="Game overview: every faction and its systems"><small>turn</small><b>${s.turn}/${CAMPAIGN.turnLimit}</b><i>›</i></button>
            ${this.renderStability()}
            ${scene ? this.renderStory(scene) : ''}
          </div>
          <div class="cmp-purse">
            <span title="Credits (+${inc.credits} a turn): earned from your systems each turn, battles and missions. Spent on repairing damage and fortifying systems.">${CREDITS}<b>${me.credits}</b><small>(+${inc.credits})</small></span>
            <span title="Materials (+${inc.materials} a turn): earned from your systems each turn, battles and missions. Spent on cards in the armoury.">${MATERIALS}<b>${me.materials}</b><small>(+${inc.materials})</small></span>
            <span title="Systems you hold, of ${s.nodes.length}">${SYSTEMS}<b>${ownedNodes(s, me.id).length}</b></span>
            <span class="cmp-purse-armies" title="Your armies: ${armiesOf(s, me.id).filter((a) => !a.moved).length} still to march this turn">${armiesOf(s, me.id)
              .map((a) => `<i class="cmp-mini-army ${a.moved ? 'moved' : ''}" data-act="cmp-army" data-arg="${a.id}" style="--ac:${this.colourOf(a.owner)}">${armyFace(a)}</i>`)
              .join('')}</span>
          </div>
          <nav class="cmp-nav">
            <button class="pill-btn" data-act="cmp-sheet" data-arg="help">?</button>
            <button class="icon-btn" data-act="cmp-menu" aria-label="Settings" title="Settings">${MENU_ICON}</button>
          </nav>
        </header>
        <section class="cmp-map">${this.renderMap()}</section>
        ${this.renderPop()}
        <div class="cmp-base-dock"><button class="cmp-base-btn" data-act="cmp-sheet" data-arg="base" title="Your armies' decks, the armoury and missions">${HOME_ICON}<span>base</span>${this.armoryIsNew() ? '<i class="cmp-new">new</i>' : ''}</button></div>
        <div class="cmp-end">
          <button class="btn-primary ${this.nothingLeft() ? 'cmp-end-pulse' : ''}" data-act="cmp-end-turn" ${s.phase !== 'player' ? 'disabled' : ''}>end turn</button>
        </div>
        ${this.waiting ? this.renderWaiting() : overlay}
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
            <div class="cmp-label">a dying universe</div>
            <p class="muted">The stars are going out. Four races fight over the last warm worlds, and every one of them is marching on ${esc(HEART_NAME)}, the vast star at the centre of everything, where the ${esc(STELLARIA)} is said to grow: a flower whose bloom gives energy without end.</p>
            <p class="muted">Lead armies, each under one of your race's heroes with a deck of their own. Take systems for their resources, find the lesser Stellari blooms on the way, and claim the Heart to win. Holding ${Math.round(CAMPAIGN.dominationShare * 100)}% of the universe wins too.</p>
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

  /** Regional stability: the lead-up's turns draining away, then how fast the universe is collapsing. */
  private renderStability(): string {
    const s = this.state!;
    const left = regionalStability(s);
    const total = CAMPAIGN.stabilityTurns;
    const segments = Array.from({ length: total }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('');
    const rate = collapsesPerTurn(s);
    const title = left
      ? `Regional stability: ${left} turn${left === 1 ? '' : 's'} left. Then solar systems start to collapse, from the rim inwards, one a turn, each marked a turn before it goes.`
      : `Regional stability has failed: ${rate} system${rate === 1 ? '' : 's'} collapse${rate === 1 ? 's' : ''} each turn, from the rim inwards. Marked systems go next turn: get out of them, or stabilise one you hold (${CAMPAIGN.stabiliseCost} materials, once).`;
    return `
      <div class="cmp-stability ${left ? '' : 'unstable'}" title="${title}">
        <span class="stability-label">${left ? `regional stability ${left}` : `collapsing · ${rate} a turn`}</span>
        <div class="stability-bar">${segments}</div>
      </div>`;
  }

  /**
   * The map is a tilted plane in perspective (CSS 3D). Stars stand upright on
   * it as billboards; links and territory lie flat on the surface. Selecting a
   * system swoops the camera in, and its planets orbit the star.
   */
  private renderMap(): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    // The picked army's routes: battles ringed in red, marches in its colour.
    const picked = this.army ? s.armies.find((a) => a.id === this.army) ?? null : null;
    const moves = picked && s.phase === 'player' && !s.battle ? armyMoves(s, picked) : [];
    const targets = new Set(moves.filter((m) => m.battle).map((m) => m.toId));
    const marches = new Set(moves.filter((m) => !m.battle).map((m) => m.toId));
    // Focusing a system no longer zooms the camera into it, so nothing else on the map fades away from it
    // either (no "far" systems, no links masked out): the focused system just shows its planets.
    const focus = null as CampaignNode | null;
    const prev = null as CampaignNode | null;
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
          if (n.collapsed || m.collapsed) return `<line x1="${n.x}" y1="${n.y}" x2="${m.x}" y2="${m.y}" class="cmp-link cmp-link-gone" />`;
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
        // ('cmp-n3' first: it is what the element is, so a redraw keeps the same element for the same system.)
        const cls = [
          'cmp-n3',
          far !== wasFar ? (far ? 'cmp-fade-out' : 'cmp-fade-in') : '',
          leaving?.id === n.id ? 'cmp-leaving' : '',
          n.owner === me.id ? 'cmp-mine' : '',
          n.owner ? 'cmp-owned' : '',
          n.heart ? 'cmp-heart' : '',
          n.dimmed ? 'cmp-dim' : '',
          n.star ? `cmp-st-${n.star}` : '',
          n.collapsing ? 'cmp-collapsing' : '',
          n.collapsed ? 'cmp-collapsed' : '',
          targets.has(n.id) ? 'cmp-target' : '',
          marches.has(n.id) ? 'cmp-march' : '',
          this.selected === n.id ? 'cmp-selected' : '',
          n.hazard.length ? 'cmp-hazard' : '',
          s.battle?.nodeId === n.id ? 'cmp-contested' : '',
          far ? 'cmp-far' : '',
        ].join(' ');
        const badges = [
          n.garrison.length ? `<i class="cmp-badge">▣${n.garrison.length}</i>` : '',
          n.damage ? `<i class="cmp-badge cmp-dmg">✸${n.damage}</i>` : '',
          n.scanner ? `<i class="cmp-badge cmp-scan" title="Scanner array">${SCANNER}</i>` : '',
          n.collapsing ? `<i class="cmp-badge cmp-doom" title="Collapsing: gone next turn">⚠</i>` : '',
          (n.stellaria ?? 0) > 0 ? `<i class="cmp-badge cmp-bloom" title="A Finite Stellari bloom: +${CAMPAIGN.stellariaCredits} credits and +${CAMPAIGN.stellariaMaterials} materials a turn to whoever holds it, for ${n.stellaria} more turn${n.stellaria === 1 ? '' : 's'}">${BLOOM}${n.stellaria}</i>` : '',
        ].join('');
        return `
          <div class="${cls}" data-key="sys-${n.id}" style="left:${n.x}px;top:${n.y}px;--fc:${colour}">
            <div class="cmp-turf"></div>
            ${targets.has(n.id) ? '<div class="cmp-ring cmp-ring-target"></div>' : ''}
            ${marches.has(n.id) ? '<div class="cmp-ring cmp-ring-march"></div>' : ''}
            ${n.heart ? `<div class="cmp-heart-glow"></div><div class="cmp-stellaria" title="The ${esc(STELLARIA)}">${stellariaFlower()}</div>` : ''}
            ${n.hazard.length ? '<div class="cmp-ring cmp-ring-hazard"></div>' : ''}
            ${n.collapsing ? '<div class="cmp-ring cmp-ring-collapse"></div>' : ''}
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
          ${this.renderFleet(seen)}
        </div>
      </div>`;
  }

  /** The picked army: its general, its state, and what tapping the map will do with it. */
  private renderArmy(a: Army): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const here = nodeById(s, a.nodeId);
    const moves = s.phase === 'player' && !s.battle ? armyMoves(s, a) : [];
    const fights = moves.filter((m) => m.battle).length;
    const marches = moves.length - fights;
    const hint = a.moved
      ? 'This army has marched this turn. It can refit or move again next turn.'
      : a.refit
        ? 'This army is refitting this turn (its deck or repairs). It can march next turn.'
      : moves.length
        ? `Tap a system next to ${esc(here.name)}: ${marches ? `a <b class="cmp-hint-march">green</b> ring to march there` : ''}${marches && fights ? ', or ' : ''}${fights ? `a <b class="cmp-hint-fight">red</b> ring to fight for it` : ''}.`
        : 'No route is open to this army.';
    const lvl = a.lost ? '' : `level ${heroLevel(heroState(me, a.general).xp)} · `;
    return `
      <div class="pop-head pop-head-army" style="--fc:${this.colourOf(a.owner)}">
        ${armyFace(a)}
        <div><h3>${lower(armyLeader(a))}</h3><small>${lvl}${a.deck.length} cards · in ${lower(here.name)}${a.damage ? ` · ✸${a.damage}` : ''}</small></div>
        <button class="pop-x" data-act="cmp-deselect" aria-label="Close">×</button>
      </div>
      <p class="cmp-hint">${hint}</p>
      <div class="pop-row">${a.damage && here.owner === me.id ? this.repairButtons('cmp-heal-army', a.id, a.damage, CAMPAIGN.armyHealCost, a.moved ? 'It has marched this turn: repair it next turn.' : '') : ''}<button class="pill-btn" data-act="cmp-deck-army" data-arg="${a.id}">deck</button>${a.owner === me.id ? `<button class="pill-btn ${skillPoints(heroState(me, a.general)) > 0 ? 'pill-on' : ''}" data-act="cmp-hero-open" data-arg="${a.general}">hero${skillPoints(heroState(me, a.general)) > 0 ? ' ●' : ''}</button>` : ''}<button class="pill-btn" data-act="cmp-select" data-arg="${here.id}">its system</button></div>`;
  }

  /** Repair one point, or all of it (as far as the credits go). */
  private repairButtons(act: string, id: string, damage: number, cost: number, blocked: string): string {
    const credits = campaignPlayer(this.state!).credits;
    const all = Math.min(damage, Math.floor(credits / cost));
    const dis = (need: number) => (blocked ? `disabled title="${esc(blocked)}"` : credits < need ? 'disabled' : '');
    return `<button class="pill-btn" data-act="${act}" data-arg="${id}" ${dis(cost)}>repair 1 · ${CREDITS}${cost}</button>${
      damage > 1 ? `<button class="pill-btn" data-act="${act}" data-arg="${id}" data-all="1" ${dis(cost)}>repair all · ${CREDITS}${Math.max(1, all) * cost}</button>` : ''
    }`;
  }

  /** Where each army's ship was last drawn, and the way it faces (radians), to sail it on from there. */
  private ships = new Map<string, { node: string; angle: number; x: number; y: number; dur: number; out?: boolean }>();
  /** Ships to set sailing once the map is drawn: where to, and how long it takes. */
  private sails = new Map<string, { x: number; y: number }>();
  /** An army setting out to attack: its ship runs halfway down the route before the battle opens. */
  private advance: { armyId: string; toId: string } | null = null;
  /** The words of the chip last tapped in the popover (shown under its chips). */
  private popTip: string | null = null;
  /** Where the popover was last placed (in the map's box), so a redraw doesn't jump it. */
  private popPos: { x: number; y: number } | null = null;
  /** What the popover was last about (a new subject is placed afresh, not where the last one was). */
  private popKey: string | null = null;
  /** A dialog is up: ships stay where they were drawn. */
  private fleetHeld = false;

  /**
   * The armies' ships, lying on the map beside their systems with their generals' portraits flying above.
   * A ship rests just short of its star on the route it came in by, facing the star; when its army moves,
   * the ship sails down the route to its new system (drawn where it was, then sent on in afterRender).
   */
  private renderFleet(seen: Set<string>): string {
    const s = this.state!;
    const DOCK = 62;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const live = new Set<string>();
    const out = s.armies
      .filter((a) => seen.has(a.nodeId))
      .map((a) => {
        live.add(a.id);
        const n = nodeById(s, a.nodeId);
        const mem = this.ships.get(a.id);
        if (mem && this.fleetHeld) return this.shipHtml(a, mem.x, mem.y, mem.angle, mem.dur);
        const from = mem && mem.node !== a.nodeId ? s.nodes.find((m) => m.id === mem.node) : undefined;
        let angle = mem?.angle ?? -Math.PI / 2;
        if (from) angle = Math.atan2(n.y - from.y, n.x - from.x);
        // Back from an attack that didn't take the system: it turns round and comes home up the same route.
        else if (mem?.out && this.advance?.armyId !== a.id) angle += Math.PI;
        let x = n.x - Math.cos(angle) * DOCK;
        let y = n.y - Math.sin(angle) * DOCK;
        // Setting out to attack: halfway down the route, facing the enemy.
        const adv = this.advance?.armyId === a.id ? s.nodes.find((m) => m.id === this.advance!.toId) : undefined;
        if (adv) {
          angle = Math.atan2(adv.y - n.y, adv.x - n.x);
          x = n.x + (adv.x - n.x) * 0.5;
          y = n.y + (adv.y - n.y) * 0.5;
        }
        let shown = { x, y };
        let dur = mem?.dur ?? 1;
        if (mem && (mem.x !== x || mem.y !== y) && !reduce && (from ? seen.has(from.id) : true)) {
          dur = Math.min(1.8, Math.max(0.9, Math.hypot(x - mem.x, y - mem.y) / 180));
          shown = { x: mem.x, y: mem.y };
          this.sails.set(a.id, { x, y });
        }
        this.ships.set(a.id, { node: a.nodeId, angle, x, y, dur, out: !!adv });
        return this.shipHtml(a, shown.x, shown.y, angle, dur);
      })
      .join('');
    for (const id of [...this.ships.keys()]) if (!live.has(id) && !s.armies.some((a) => a.id === id)) this.ships.delete(id);
    return out;
  }

  /** One army's ship (and the portrait flying above it), drawn at (x, y) facing angle. */
  private shipHtml(a: Army, x: number, y: number, angle: number, dur: number): string {
    const s = this.state!;
    const mine = a.owner === s.playerId;
    const cls = ['cmp-ship', mine ? 'cmp-ship-mine' : '', a.lost ? 'cmp-ship-lost' : '', this.army === a.id ? 'cmp-ship-on' : '', this.sails.has(a.id) ? 'sailing' : ''].join(' ');
    const race = a.lost ? 0 : factionById(s, a.owner).race;
    return `<div class="${cls}" data-key="ship-${a.id}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--rot:${((angle * 180) / Math.PI).toFixed(1)}deg;--dur:${dur.toFixed(2)}s;--ac:${this.colourOf(a.owner)}">
        <div class="cmp-ship-hull" data-act="cmp-army" data-arg="${a.id}"><i class="cmp-ship-shadow"></i><div class="cmp-ship-float">${shipModel(race, !!a.lost)}</div></div>
        <div class="cmp-ship-bb">${this.armyToken(a)}</div>
      </div>`;
  }

  /** Send the ships drawn where they were on to where they are going (the CSS transition does the sailing). */
  private sailShips(root: HTMLElement) {
    for (const [id, to] of this.sails) {
      const el = root.querySelector<HTMLElement>(`[data-key="ship-${id}"]`);
      if (!el) continue;
      void el.offsetWidth;
      el.classList.add('sailing');
      el.style.left = `${to.x.toFixed(1)}px`;
      el.style.top = `${to.y.toFixed(1)}px`;
      const done = () => el.classList.remove('sailing');
      el.addEventListener('transitionend', (e) => e.propertyName === 'left' && done(), { once: false });
      setTimeout(done, 2200);
    }
    this.sails.clear();
  }

  /** An army on the map: its general's portrait in a ring of its faction's colour (dimmed once it has moved). */
  private armyToken(a: Army): string {
    const mine = a.owner === this.state!.playerId;
    const cls = ['cmp-army', mine ? 'cmp-army-mine' : '', a.lost ? 'cmp-army-lost' : '', a.moved || (mine && a.refit) ? 'cmp-army-moved' : '', this.army === a.id ? 'cmp-army-on' : ''].join(' ');
    const title = a.lost
      ? `${armyLeader(a)}: one of the Lost Races. Beat them for their relics.`
      : `${armyLeader(a)}'s army${mine ? (a.moved ? ' (has moved this turn)' : a.refit ? ' (refitting this turn)' : ': tap to march') : ` (${factionById(this.state!, a.owner).name})`}${a.damage ? `, ${a.damage} damage` : ''}`;
    return `<span class="${cls}" style="--ac:${this.colourOf(a.owner)}" data-act="cmp-army" data-arg="${a.id}" title="${esc(title)}">${armyFace(a)}${a.damage ? `<i class="cmp-army-dmg">${a.damage}</i>` : ''}</span>`;
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
          <div class="cmp-an an-${a.kind} ${far ? 'cmp-far' : ''} ${fade} ${this.anomaly === a.id ? 'an-on' : ''}" data-key="an-${a.id}" style="left:${a.x}px;top:${a.y}px;--ar:${def.radius}px">
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
  private static readonly MAX_ZOOM = 5.5;
  private static readonly GLIDE_MS = 1000;
  /** How far behind the map the sky lies: over the whole map it slides this fraction of the map's fitted width. */
  private static readonly SKY_DEPTH = 0.55;

  /** A view centred between an army and the systems linked to its own, zoomed so they all fit. */
  private frameArmy(a: Army): { x: number; y: number; zoom: number } {
    const s = this.state!;
    const here = nodeById(s, a.nodeId);
    const pts = [here, ...here.links.map((id) => nodeById(s, id))];
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2;
    // Room for the spread, with a margin (and the side panel), in the map's own proportions.
    const spread = Math.max((Math.max(...xs) - Math.min(...xs)) / MAP_WIDTH, (Math.max(...ys) - Math.min(...ys)) / MAP_HEIGHT, 0.08);
    return { x, y, zoom: Math.max(1, Math.min(3, 0.55 / spread)) };
  }

  private homeView() {
    const home = ownedNodes(this.state!, this.state!.playerId)[0] ?? this.state!.nodes[0];
    return { x: home.x, y: home.y, zoom: 2.8 };
  }

  /** Fit the map to its stage and move the camera (called after every render and on resize). */
  afterRender(root: HTMLElement) {
    const stage = root.querySelector<HTMLElement>('.cmp-stage');
    this.stageEl = stage;
    if (stage) this.sailShips(stage);
    else this.sails.clear();
    requestAnimationFrame(() => this.placePop());
    if (!stage || !this.state) {
      this.cam = null;
      this.glide = null;
      return;
    }
    if (!boundStages.has(stage)) {
      boundStages.add(stage);
      stage.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      stage.addEventListener('pointermove', (e) => this.onPointerMove(e));
      stage.addEventListener('pointerup', (e) => this.onPointerUp(e));
      stage.addEventListener('pointercancel', (e) => this.onPointerUp(e));
      stage.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    }
    this.view ??= this.homeView();
    this.applyCamera(true);
    this.placePop();
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
    const fit = this.fitScale(stage, CampaignView.TILT);
    const v = this.view!;
    // Stars keep a readable size at any zoom. (Focusing a system no longer moves the camera.)
    const ui = Math.min(2.2, Math.max(0.7, 1 / (fit * v.zoom)));
    return { x: v.x, y: v.y, scale: fit * v.zoom, tilt: CampaignView.TILT, ui };
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
    this.placePop();
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

  /** What is picked on the map (a system, an army or an anomaly), in a popover beside it. */
  private renderPop(): string {
    const s = this.state!;
    let key = '';
    let body = '';
    if (this.selected) {
      key = `n-${this.selected}`;
      body = this.renderNode(nodeById(s, this.selected));
    } else if (this.army && s.armies.some((a) => a.id === this.army)) {
      key = `a-${this.army}`;
      body = this.renderArmy(armyById(s, this.army));
    } else if (this.anomaly) {
      const an = (s.anomalies ?? []).find((a) => a.id === this.anomaly);
      if (an) {
        key = `x-${an.id}`;
        body = this.renderAnomaly(an);
      }
    }
    if (!body) {
      this.popPos = null;
      this.popKey = null;
      return '';
    }
    if (this.popKey !== key) this.popPos = null;
    this.popKey = key;
    const at = this.popPos ? `left:${this.popPos.x}px;top:${this.popPos.y}px` : 'left:0;top:0;visibility:hidden';
    return `<aside class="cmp-pop glass" data-key="pop-${key}" style="${at}">${body}</aside>`;
  }

  /**
   * Where a point of the map's plane (lifted this many pixels, upright, as a star stands on it) shows on the
   * stage: the plane's own transform (translate, scale, tilt about its origin at 50% 54%), then the stage's
   * perspective (1500px, seen from 50% 40%). The same sums the browser does to draw it.
   */
  private project(w: number, h: number, px: number, py: number, lift: number): { x: number; y: number } {
    const c = this.cam!;
    const t = (c.tilt * Math.PI) / 180;
    const X = w * 0.5 + c.scale * (px - c.x);
    const Y = c.scale * (py - c.y);
    const z = Y * Math.sin(t);
    const y0 = h * 0.54 + Y * Math.cos(t);
    const ox = w * 0.5, oy = h * 0.4, d = 1500;
    const f = d / (d - z);
    return { x: ox + (X - ox) * f, y: oy + (y0 - oy) * f - lift * c.ui * c.scale * f };
  }

  /** Put the popover beside what it is about: to its right if there is room, else to its left, kept on screen. */
  private placePop() {
    const stage = this.stageEl;
    const pop = stage?.closest('.cmp')?.querySelector<HTMLElement>('.cmp-pop');
    if (!stage || !pop) return;
    // Where the subject is: worked out from the camera, as the map itself is drawn (measuring elements inside
    // the tilted 3D plane is unreliable in some browsers, which put the popover by the wrong system).
    const s = this.state;
    const node = this.selected && s ? s.nodes.find((n) => n.id === this.selected) : undefined;
    const ship = !node && this.army ? this.ships.get(this.army) : undefined;
    const an = !node && !ship && this.anomaly && s ? (s.anomalies ?? []).find((a) => a.id === this.anomaly) : undefined;
    const at = node ? { x: node.x, y: node.y, lift: 24 } : ship ? { x: ship.x, y: ship.y, lift: 6 } : an ? { x: an.x, y: an.y, lift: 16 } : null;
    const box = pop.offsetParent as HTMLElement | null;
    if (!at || !box || !this.cam) return;
    // Everything in the popover's own CSS pixels: the page may be zoomed (body zoom), so screen measurements
    // are scaled back by how much bigger the popover's box is drawn than it is laid out.
    const st = stage.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const bw = box.offsetWidth || b.width;
    const bh = box.offsetHeight || b.height;
    const zx = b.width / bw || 1;
    const zy = b.height / bh || 1;
    const lw = stage.offsetWidth || st.width;
    const lh = stage.offsetHeight || st.height;
    const proj = (x: number, y: number, lift: number) => {
      const q = this.project(lw, lh, x, y, lift);
      // The stage's layout pixels, drawn on screen, then back into the box's layout pixels.
      return { x: ((q.x * st.width) / lw + st.left - b.left) / zx, y: ((q.y * st.height) / lh + st.top - b.top) / zy };
    };
    const p = proj(at.x, at.y, at.lift);
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    // Clear of the planets' orbits round a selected star.
    const gap = this.selected ? 70 : 34;
    const cx = p.x;
    const cy = p.y;
    // An army's popover goes on the far side from its routes, so they stay clear to tap.
    let right = true;
    if (this.army && !this.selected) {
      const army = s?.armies.find((a) => a.id === this.army);
      const ends = s && army && s.phase === 'player' ? armyMoves(s, army).map((m) => nodeById(s, m.toId)) : [];
      if (ends.length) right = ends.reduce((t, n) => t + proj(n.x, n.y, 0).x, 0) / ends.length < cx;
    }
    let x = right ? cx + gap : cx - gap - w;
    if (x + w > bw - 12) x = cx - gap - w;
    if (x < 12) x = cx + gap;
    x = Math.max(12, Math.min(bw - w - 12, x));
    const y = Math.max(64, Math.min(bh - h - 84, cy - h / 2));
    this.popPos = { x: Math.round(x), y: Math.round(y) };
    pop.style.left = `${this.popPos.x}px`;
    pop.style.top = `${this.popPos.y}px`;
    pop.style.visibility = '';
  }

  /**
   * The selected system's popover, beside its star: a header, then what is true of it as a row of icon chips
   * (tap one, or hover, for its words), then what you can do there.
   */
  private renderNode(n: CampaignNode): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const mine = n.owner === me.id;
    const owner = n.owner ? factionById(s, n.owner) : null;
    const fortCost = fortifyCost(n);
    const chip = (body: string, tip: string, tone = '') => `<button class="pop-chip ${tone}" data-act="cmp-tip" data-tip="${esc(tip)}" title="${esc(tip)}">${body}</button>`;
    const icon = (body: string) => `<svg class="pi" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
    const g = garrisonBonus(n);
    const ringHp = n.heart ? 0 : CAMPAIGN.coreHealth[n.ring ?? 99] ?? 0;
    const chips = [
      chip(`${CREDITS}<b>${n.yield.credits}</b>${MATERIALS}<b>${n.yield.materials}</b>`, `Yields ${n.yield.credits} credits and ${n.yield.materials} materials a turn to whoever holds it.`),
      n.star ? chip(`<i class="pop-star pop-star-${n.star}"></i><b>${lower(STAR_TYPES[n.star].name)}</b>`, `${STAR_TYPES[n.star].name}. ${STAR_TYPES[n.star].text} + ${STAR_TYPES[n.star].boon} − ${STAR_TYPES[n.star].cost}`) : '',
      n.heart ? chip(`${icon('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5"/>')}<b>heart</b>`, `The oldest star, at the centre of everything. Whoever claims it wins the campaign.${n.owner ? '' : ` Guarded by the Heart Wardens: +${CAMPAIGN.heartWardenHealth} max health.`}`, 'gold') : '',
      ringHp > 0 ? chip(`${icon('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/>')}<b>${n.ring}</b>`, `${n.ring} route${n.ring === 1 ? '' : 's'} from the Heart: richer worlds (+${CAMPAIGN.coreYield[n.ring!] ?? 0} of each a turn) and deeper defences (+${ringHp} max health to whoever defends it).`) : '',
      chip(`${icon('<path d="M8 1.8 13.5 4v4c0 3.4-2.4 5.6-5.5 6.4C4.9 13.6 2.5 11.4 2.5 8V4z"/>')}<b>+${n.fortification * CAMPAIGN.fortifyHealth}</b>`, `Fortification ${n.fortification}/${CAMPAIGN.maxFortification}: its defender has +${n.fortification * CAMPAIGN.fortifyHealth} max health. Each level adds ${CAMPAIGN.fortifyHealth}.`),
      chip(`${icon('<rect x="4" y="2" width="8" height="12" rx="1.6"/><path d="M6.5 6h3"/>')}<b>${n.garrison.length}/${CAMPAIGN.garrisonSlots}</b>`, n.garrison.length ? `Garrison: ${n.garrison.map((c) => cardDef(c.defId).name).join(', ')}. If attacked, ${g.tableau.length} start${g.tableau.length === 1 ? 's' : ''} in play.` : 'Garrison: no cards stationed.'),
      n.damage ? chip(`${icon('<path d="M8 1.5 9.4 6 14 4.6 10.6 8 14 11.4 9.4 10 8 14.5 6.6 10 2 11.4 5.4 8 2 4.6 6.6 6z"/>')}<b>${n.damage}</b>`, `Damage ${n.damage}: its defender's sun starts ${n.damage} hotter.`, 'bad') : '',
      n.scanner ? chip(SCANNER, 'Scanner array: whoever holds it sees systems two links away.') : '',
      (n.stellaria ?? 0) > 0 ? chip(`${BLOOM}<b>${n.stellaria}</b>`, `A Finite Stellari bloom: +${CAMPAIGN.stellariaCredits} credits and +${CAMPAIGN.stellariaMaterials} materials a turn to whoever holds it, for ${n.stellaria} more turn${n.stellaria === 1 ? '' : 's'}.`, 'good') : '',
      n.dimmed ? chip(icon('<path d="M10.5 2.5a5.5 5.5 0 1 0 3 9 5 5 0 0 1-3-9z"/>'), 'Its star has guttered: it yields less than it did.', 'muted') : '',
      n.hazard.length ? chip(icon('<path d="M8 2 14.5 13.5h-13z"/><path d="M8 6.5v3.2M8 11.6v.1"/>'), 'Supernova remnant: rivals cannot advance into it this turn.', 'bad') : '',
      n.collapsing ? chip(`${icon('<path d="M8 2 14.5 13.5h-13z"/><path d="M8 6.5v3.2M8 11.6v.1"/>')}<b>collapsing</b>`, 'Collapsing: regional stability has failed here, and it will be gone next turn, with anything still in it.', 'bad') : '',
      (n.stableUntil ?? 0) > s.turn ? chip(`${icon('<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>')}<b>${n.stableUntil}</b>`, `Stabilised: it holds until turn ${n.stableUntil}.`, 'good') : '',
      ...nodeAnomalies(s, n).map((x) => chip(`<i class="an-icon an-icon-${x.kind}"></i>`, `${ANOMALIES[x.kind].name} nearby: ${ANOMALIES[x.kind].text}`)),
    ].join('');
    // What you can do here.
    const attackers = s.phase === 'player' && !s.battle ? attackOptions(s, me.id).find((o) => o.toId === n.id)?.armyIds ?? [] : [];
    const attack = attackers.map((id) => `<button class="btn-primary pop-attack" data-act="cmp-attack-pick" data-arg="${n.id}" data-army="${id}">${armyFace(armyById(s, id))}attack</button>`).join('');
    const here = armyAt(s, n.id);
    const army = here
      ? `<div class="pop-army" style="--ac:${this.colourOf(here.owner)}">
          ${armyFace(here)}<span><b>${lower(armyLeader(here))}</b><small>${here.owner === me.id ? (here.moved ? 'marched this turn' : here.refit ? 'refitting' : 'ready') : here.lost ? 'lost race' : lower(factionById(s, here.owner).name)}${here.damage ? ` · ✸${here.damage}` : ''}</small></span>
          ${
            here.owner === me.id
              ? `<span class="pop-acts">${!here.moved && !here.refit && s.phase === 'player' ? `<button class="pill-btn ${this.army === here.id ? 'pill-on' : ''}" data-act="cmp-army" data-arg="${here.id}">march</button>` : ''}${
                  here.damage && mine ? this.repairButtons('cmp-heal-army', here.id, here.damage, CAMPAIGN.armyHealCost, here.moved ? 'It has marched this turn: repair it next turn.' : '') : ''
                }<button class="pill-btn" data-act="cmp-deck-army" data-arg="${here.id}">deck</button></span>`
              : ''
          }
        </div>`
      : '';
    const garrison = mine
      ? n.garrison
          .map((c) => {
            const def = cardDef(c.defId);
            const state = c.status === 'stationed' ? 'stationed' : c.status === 'arriving' ? 'arrives next turn' : 'leaves next turn';
            const recall = c.status === 'stationed' ? ` data-act="cmp-recall" data-node="${n.id}" data-arg="${c.uid}"` : '';
            return `<button class="pop-gar ${c.status}" style="--kc:${KIND_COLOUR[def.kind]}"${recall} title="${esc(`${def.name}: ${state}${recall ? ' (tap to recall)' : ''}`)}">${cardGlyph(def.id, def.kind)}</button>`;
          })
          .join('')
      : '';
    const acts = mine
      ? [
          fortCost !== null ? `<button class="pill-btn" data-act="cmp-fortify" data-arg="${n.id}" ${me.credits < fortCost ? 'disabled' : ''} title="Fortify: +${CAMPAIGN.fortifyHealth} defence">fortify · ${CREDITS}${fortCost}</button>` : '',
          n.damage ? this.repairButtons('cmp-heal', n.id, n.damage, CAMPAIGN.healCostPerPoint, '') : '',
          n.garrison.length < CAMPAIGN.garrisonSlots ? `<button class="pill-btn" data-act="cmp-station-open" data-arg="${n.id}">station a card</button>` : '',
          !here && s.phase === 'player' && !s.battle ? `<button class="pill-btn" data-act="cmp-recruit-open" data-arg="${n.id}">recruit</button>` : '',
          n.collapsing ? `<button class="pill-btn" data-act="cmp-stabilise" data-arg="${n.id}" ${stabiliseProblem(me, n) ? `disabled title="${esc(stabiliseProblem(me, n)!)}"` : ''}>stabilise · ${MATERIALS}${CAMPAIGN.stabiliseCost}</button>` : '',
        ].join('')
      : '';
    const tip = this.popTip ? `<p class="pop-tip">${esc(this.popTip)}</p>` : '';
    return `
      <div class="pop-head" style="--fc:${n.owner ? this.colourOf(n.owner) : NEUTRAL}">
        ${n.owner ? this.avatarOf(n.owner, 'cmp-head-av') : '<i></i>'}
        <div><h3>${lower(n.name)}</h3><small>${owner ? (mine ? 'yours' : lower(owner.name)) : n.heart ? 'heart wardens' : `neutral · tier ${n.tier + 1}`}${n.home ? ' · home' : ''}</small></div>
        <button class="pop-x" data-act="cmp-deselect" aria-label="Close">×</button>
      </div>
      <div class="pop-chips">${chips}</div>
      ${tip}
      ${attack ? `<div class="pop-row">${attack}</div>` : ''}
      ${army}
      ${garrison ? `<div class="pop-gars">${garrison}</div>` : ''}
      ${acts ? `<div class="pop-row">${acts}</div>` : ''}`;
  }

  // ---- Overlays -------------------------------------------------------------------

  private renderOverlay(): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    if (s.winner) {
      const won = s.winner === me.id;
      const heart = s.nodes.find((n) => n.heart);
      const byHeart = !!heart && heart.owner === s.winner;
      return this.modal(
        won ? 'victory' : 'defeat',
        `<div class="center"><h2>${won ? (byHeart ? `the ${lower(STELLARIA)} is yours` : 'the universe is yours') : byHeart ? `${lower(factionById(s, s.winner).name)} claims the heart` : `${lower(factionById(s, s.winner).name)} dominates`}</h2>
          <p>${won ? (byHeart ? `You reached ${esc(HEART_NAME)} after ${s.turn} turns.` : `You control ${ownedNodes(s, me.id).length} of ${s.nodes.length} systems after ${s.turn} turns.`) : byHeart ? `They reached ${esc(HEART_NAME)} first.` : 'Your last system has fallen, or a rival held more of the universe.'}</p>
          <button class="btn-primary" data-act="cmp-abandon">back to menu</button></div>`,
      );
    }
    if (s.battle) {
      const b = s.battle;
      const node = nodeById(s, b.nodeId);
      const attacker = factionById(s, b.attacker);
      const mine = b.attacker === me.id;
      const army = s.armies.find((a) => a.id === b.armyId);
      return this.modal(
        mine ? `the battle for ${lower(node.name)}` : `${lower(army ? armyLeader(army) : attacker.name)} attack${army?.lost ? '' : 's'} ${lower(node.name)}`,
        `${this.matchup(b.armyId, node, b.defender === s.playerId)}
          <div class="cmp-attack-go"><button class="btn-primary" data-act="cmp-defend">${mine ? 'back to it' : 'defend'}</button><button class="btn" data-act="cmp-defend-auto" title="Let the battle play itself out">auto</button></div>`,
        false,
        '',
        'cmp-modal-narrow cmp-attack',
      );
    }
    if (s.conquest) {
      const n = nodeById(s, s.conquest.nodeId);
      const spoils = n.garrison.length ? ` Its garrison (${n.garrison.map((g) => cardDef(g.defId).name).join(', ')}) is yours either way.` : '';
      // One short line each; the whole story is in the tooltip.
      const opt = (id: string, title: string, line: string, more: string) => `<button class="cmp-choice" data-act="cmp-conquer" data-arg="${id}" title="${esc(more)}"><b>${title}</b><span>${line}</span></button>`;
      return this.modal(
        `${lower(n.name)} has fallen`,
        `<div class="cmp-choices">
          ${opt('settle', 'settle', `${CREDITS}+${n.yield.credits} ${MATERIALS}+${n.yield.materials} a turn`, 'Take control: it pays every turn, and is a new front to defend. Your army marches in.')}
          ${opt('absorb', 'absorb', `${CREDITS}+${n.yield.credits * CAMPAIGN.absorbTurns} ${MATERIALS}+${n.yield.materials * CAMPAIGN.absorbTurns} now`, 'Strip it: it pays at once, and is left neutral and depleted.')}
          ${opt('supernova', 'supernova', 'bars rivals a turn', 'Detonate its sun: it is left neutral, and no rival can advance into it for a turn.')}
         </div>
         ${spoils ? `<p class="muted center-text">${esc(spoils.trim())}</p>` : ''}`,
        false,
        '',
        'cmp-modal-narrow',
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
      case 'heroes':
      case 'armory':
      case 'missions':
      case 'research':
        return this.renderBase(sh);
      case 'recruit': {
        const n = nodeById(s, sh.nodeId);
        const rows = GENERALS[me.race]
          .map((g) => {
            const cost = recruitCost(s, me, g);
            const leading = s.armies.some((a) => a.owner === me.id && a.general === g);
            return `<button class="cmp-recruit" data-act="cmp-recruit" data-arg="${g}" ${cost === null || me.credits < cost ? 'disabled' : ''}>
              ${portrait(g)}
              <span><b>${lower(cardDef(g).name)}</b><small>${leading ? 'already leads an army' : `${CREDITS} ${cost}`}</small></span>
              <span class="cmp-recruit-text">${cardTextHtml(cardDef(g).text)}</span>
            </button>`;
          })
          .join('');
        return this.modal(
          `recruit a general in ${lower(n.name)}`,
          `<p class="muted center-text">Each general leads an army of their own, with a deck built round them. A new army can march next turn. You have ${CREDITS} ${me.credits}.</p>
           <div class="cmp-recruits">${rows}</div>`,
          true,
        );
      }
      case 'log':
        return this.modal('campaign log', `<div class="log-list">${s.log.map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`, true);
      case 'overview': {
        const me = campaignPlayer(s);
        const goal = Math.ceil(s.nodes.length * CAMPAIGN.dominationShare);
        const factions = s.factions
          .filter((f) => !f.lost)
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
            <button class="btn" data-act="cmp-guide" title="Oriel the Wanderer's guidance, under the turn count">${esc(ORACLE_NAME.toLowerCase())}: ${guideOn() ? 'on' : 'off'}</button>
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
            <div>${MATERIALS}<span><b>Materials</b> build your collection. Earned the same ways. Spent: cards in the armoury.</span></div>
          </div>
          <ul class="rules">
            <li><b>The goal:</b> claim ${esc(HEART_NAME)}, the star at the centre of the universe, where the ${esc(STELLARIA)} grows. Its Wardens are the strongest defenders anywhere (+${CAMPAIGN.heartWardenHealth} max health). Holding ${Math.round(CAMPAIGN.dominationShare * 100)}% of all systems, or outlasting every rival, wins too; otherwise the most systems after ${CAMPAIGN.turnLimit} turns.</li>
            <li><b>Armies</b> march one route a turn. Tap an army, then a system next to it: into one you hold, it simply moves; into any other, it fights. One army to a system.</li>
            <li>Each turn an army either <b>marches</b> or <b>refits</b> (its deck changed, or repaired), not both. Buying, recycling and fusing cards are for your whole people, and don't tie up an army.</li>
            <li><b>Stars</b> differ. ${(['red', 'white', 'brown', 'neutron'] as const).map((k) => `<b>${STAR_TYPES[k].name}:</b> ${esc(STAR_TYPES[k].boon)} ${esc(STAR_TYPES[k].cost)}`).join(' ')}</li>
            <li><b>The Lost Races</b> are the last of peoples the dimming has already taken. They wander unheld space and raid held systems beside them, stripping them. Beat one for its relics: ${MATERIALS} ${CAMPAIGN.lostRelicMaterials} and a card.</li>
            <li>Each army is led by a <b>general</b>, one of your race's heroes, and fights with its own <b>deck</b> (30 cards, the general's card among them). Recruit more generals in your systems with ${CREDITS} credits; each army costs more than the last.</li>
            <li>A system with no army defends itself with its race's plain deck, its garrison and its fortifications. Neutral systems have sentinels, stronger towards the centre.</li>
            <li><b>Win</b> and choose: <b>Settle</b> it (your army marches in), <b>Absorb</b> its resources, or <b>Supernova</b> it to block rivals for a turn. A beaten army falls back to a free system of yours next door, or is broken.</li>
            <li>An army's sun carries its heat on as <b>damage</b> (it starts battles hotter). Repair it with ${CREDITS} credits in a system you hold. <b>Fortify</b> a system for +${CAMPAIGN.fortifyHealth} max health per level when it defends.</li>
            <li>${BLOOM} <b>Finite Stellari</b> bloom on a few systems: +${CAMPAIGN.stellariaCredits} ${CREDITS} and +${CAMPAIGN.stellariaMaterials} ${MATERIALS} a turn to whoever holds one, for ${CAMPAIGN.stellariaTurns} turns. Then they wilt.</li>
            <li><b>The universe is dying:</b> every ${CAMPAIGN.dimEvery} turns a star gutters, and its system yields less.</li>
            <li><b>Regional stability</b> lasts ${CAMPAIGN.stabilityTurns} turns. Then solar systems collapse, from the rim inwards: one a turn, one more every ${CAMPAIGN.collapseRamp} turns. Each is marked (⚠) a turn before it goes, and anything still in it is lost, so keep moving towards the Heart. Stabilise a marked system you hold for ${CAMPAIGN.stabiliseCost} materials to hold it ${CAMPAIGN.stabiliseTurns} turns more (once per system).</li>
            <li>Win cards from missions and buy them in the armoury with ${MATERIALS} materials; they wait in your reserve until you put them in an army's deck. A deck that falls short of 30 cards (or its Heroes) can still march, but not fight.</li>
            <li><b>Fog of war:</b> you only see systems linked to yours. Hold a system with a <b>scanner</b> to see two links out from it.</li>
            <li><b>Your base</b> holds your armies' decks (in the deck builder), the armoury and your missions. ${esc(QUARTERMASTER.name)} sells new stock every turn and whenever you conquer a system. ${esc(RECYCLER.name)} breaks reserve cards down for half their price, and fuses two into one that does both, for ${MATERIALS} materials (that cannot be undone).</li>
            <li><b>Your first route:</b> home has one way out, to a cut-off system whose sentinels start ${CAMPAIGN.gateHeat} hotter. Take it.</li>
            <li><b>${esc(ORACLE_NAME)}</b> offers guidance under the turn count. Read it or dismiss it; turn it off in settings.</li>
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
        const to = nodeById(s, sh.toId);
        return this.modal(
          `attack ${lower(to.name)}?`,
          `${this.matchup(sh.armyId, to)}
           <div class="cmp-attack-go"><button class="btn-primary" data-act="cmp-fight">fight</button><button class="btn" data-act="cmp-auto" title="Let the battle play itself out">auto</button><button class="btn" data-act="cmp-close">back</button></div>`,
          false,
          '',
          'cmp-modal-narrow cmp-attack',
        );
      }
    }
  }

  /** The two sides of a battle, and, in a few plain words, whatever tips it. */
  private matchup(armyId: string, to: CampaignNode, defending = false): string {
    const s = this.state!;
    const attacker = s.armies.find((a) => a.id === armyId) ?? null;
    const guard = armyAt(s, to.id);
    const defender = guard && guard.id !== armyId ? guard : null;
    const side = (army: Army | null, n: CampaignNode) => {
      const name = army ? armyLeader(army) : n.owner ? `${factionById(s, n.owner).name} guard` : n.heart ? 'the Heart Wardens' : `${n.name} sentinels`;
      const face = army ? armyFace(army) : n.owner ? this.avatarOf(n.owner, 'cmp-vs-av') : '<span class="cmp-portrait cmp-vs-blank"></span>';
      const colour = army ? this.colourOf(army.owner) : n.owner ? this.colourOf(n.owner) : NEUTRAL;
      return `<div class="cmp-vs-side" style="--fc:${colour}">${face}<b>${lower(name)}</b></div>`;
    };
    // What tips the fight, said plainly: each side's sun and modifiers, as the battle would start them.
    const tips: string[] = [];
    // (Said from the player's side: attacking, or defending.)
    const odds = attacker ? battleOdds(s, attacker, to) : null;
    const sides = odds ? ([[defending ? 'They' : 'You', defending ? 'Their' : 'Your', odds.attacker], [defending ? 'You' : 'They', defending ? 'Your' : 'Their', odds.defender]] as const) : [];
    for (const [who, whose, side] of sides) {
      const mine = (who === 'You') === true;
      const tone = (good: boolean) => (good === mine ? 'good' : 'bad');
      const m = side.mods;
      if (side.heat > 0) tips.push(`<li class="${tone(false)}">${whose} sun starts ${side.heat} hotter${!mine && to.gate && !to.owner && !defending ? ': they are weakened' : ''}.</li>`);
      if (side.heat < 0) tips.push(`<li class="${tone(true)}">${whose} sun starts ${-side.heat} cooler.</li>`);
      if (m.maxHealthDelta) tips.push(`<li class="${tone(m.maxHealthDelta > 0)}">${who} ${who === 'You' ? 'have' : 'have'} ${m.maxHealthDelta > 0 ? '+' : ''}${m.maxHealthDelta} health.</li>`);
      if (m.shieldPerTurn) tips.push(`<li class="${tone(true)}">${who} gain ${m.shieldPerTurn} shield${m.shieldPerTurn === 1 ? '' : 's'} every day.</li>`);
      if (m.coolPerTurn) tips.push(`<li class="${tone(true)}">${whose} sun cools by ${m.coolPerTurn} every day.</li>`);
      if (m.heatPerTurn) tips.push(`<li class="${tone(false)}">${whose} sun heats by ${m.heatPerTurn} every day.</li>`);
      if (m.extraDraw) tips.push(`<li class="${tone(m.extraDraw > 0)}">${who} draw ${Math.abs(m.extraDraw)} ${m.extraDraw > 0 ? 'more' : 'fewer'} every day.</li>`);
      if (m.openingHand) tips.push(`<li class="${tone(m.openingHand > 0)}">${who} start with ${Math.abs(m.openingHand)} ${m.openingHand > 0 ? 'more' : 'fewer'} card${Math.abs(m.openingHand) === 1 ? '' : 's'} in hand.</li>`);
    }
    const g = garrisonBonus(to);
    const held = g.tableau.length + (g.lightspeed ? 1 : 0);
    if (held) tips.push(`<li class="${defending ? 'good' : 'bad'}">${held} of ${defending ? 'your' : 'their'} cards start in play.</li>`);
    if (defender?.lost) tips.push(`<li class="good">Win to take their relics: ${MATERIALS} ${CAMPAIGN.lostRelicMaterials} and a card.</li>`);
    const why = odds ? [...new Set([...odds.attacker.sources, ...odds.defender.sources])] : [];
    if (why.length) tips.push(`<li class="cmp-tips-why">From: ${esc(why.join(', '))}.</li>`);
    return `
      <div class="cmp-vs-row">${side(attacker, attacker ? nodeById(s, attacker.nodeId) : to)}<span class="cmp-vs">vs</span>${side(defender, to)}</div>
      <ul class="cmp-tips">${tips.join('') || '<li>An even fight.</li>'}</ul>`;
  }

  /** A story scene, one line at a time: the speaker's portrait, name and words. */
  private renderStory(scene: StoryScene): string {
    const s = this.state!;
    const lines = this.shownLines(scene);
    const i = Math.min(this.storyLine, lines.length - 1);
    const line = lines[i];
    const sp = line.speaker;
    const who =
      sp.kind === 'oracle'
        ? { name: ORACLE_NAME, sub: 'the guide', face: ORACLE_PORTRAIT, colour: '#8f86c9' }
        : (() => {
            const f = s.factions.find((x) => x.id === sp.faction);
            return { name: cardDef(sp.card).name, sub: f ? (f.id === s.playerId ? `your general · ${RACE_NAMES[f.race]}` : RACE_NAMES[f.race]) : '', face: portrait(sp.card), colour: f ? this.colourOf(f.id) : NEUTRAL };
          })();
    const last = i >= lines.length - 1;
    const more = s.story.queue.length - 1;
    // Guidance, not a gate: it sits under the turn count, and the game goes on around it.
    return `
      <aside class="cmp-guide ${sp.kind === 'oracle' ? 'cmp-guide-oracle' : ''}" data-key="guide:${esc(scene.id)}:${i}" style="--sc:${who.colour}">
        <div class="cmp-guide-face">${who.face}</div>
        <div class="cmp-guide-body">
          <small class="cmp-guide-who"><b>${esc(who.name.toLowerCase())}</b> · ${esc(who.sub.toLowerCase())}</small>
          <p class="cmp-guide-text">${esc(line.text)}</p>
          <div class="cmp-guide-foot">
            <small>${lower(scene.title)}${lines.length > 1 ? ` · ${i + 1}/${lines.length}` : ''}${more > 0 ? ` · ${more} more` : ''}</small>
            <button class="link-btn" data-act="cmp-story-skip" title="Dismiss">dismiss</button>
            <button class="pill-btn" data-act="cmp-story-next">${last ? 'ok' : 'next ›'}</button>
          </div>
        </div>
      </aside>`;
  }

  /**
   * The base, full screen: a tab for each army's deck and the armoury (both in the main deck builder),
   * and the missions.
   */
  private renderBase(sh: Extract<Sheet, { kind: 'deck' | 'heroes' | 'research' | 'armory' | 'missions' }>): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const points = GENERALS[me.race].some((g) => skillPoints(heroState(me, g)) > 0);
    const idle = !me.research?.current && RESEARCH.some((r) => researchProblem(me.research, me.materials, r.id) === null);
    const tabs = (['deck', 'heroes', 'research', 'armory', 'missions'] as const)
      .map((t) => `<button class="cmp-tab ${t === sh.kind ? 'cmp-tab-on' : ''}" data-act="cmp-sheet" data-arg="${t}">${t === 'armory' ? 'armoury' : t}${(t === 'heroes' && (points || (me.items ?? []).length)) || (t === 'research' && idle) ? '<i class="cmp-tab-dot"></i>' : ''}</button>`)
      .join('');
    let body: string;
    if (sh.kind === 'missions') {
      const active = me.missions.map((m) => this.missionRow(m.id, missionProgress(s, me, m))).join('');
      body = `<div class="cmp-base-missions">
          <div class="cmp-missions">${active || '<p class="muted">All missions complete.</p>'}</div>
          <p class="muted">Each completed mission pays ${CREDITS} ${CAMPAIGN.missionCredits} and ${MATERIALS} ${CAMPAIGN.missionMaterials}, and lets you choose a new card. ${CAMPAIGN_MISSIONS.length} missions in all.</p>
        </div>`;
    } else if (sh.kind === 'heroes') {
      body = this.renderHeroes(this.pickedHero());
    } else if (sh.kind === 'research') {
      body = this.renderResearch();
    } else if (sh.kind === 'deck' && !armiesOf(s, me.id).length) {
      body = '<div class="cmp-base-missions"><p class="muted center-text">You have no armies. Recruit a general in one of your systems to raise one.</p></div>';
    } else {
      this.builder.setMode(sh.kind === 'deck' ? this.deckMode(sh.armyId ?? armiesOf(s, me.id)[0].id) : this.armoryMode(sh));
      body = this.builder.render();
    }
    return `
      <div class="cmp-base">
        <header class="cmp-base-top">
          <nav class="cmp-tabs">${tabs}</nav>
          <div class="cmp-purse"><span title="Credits">${CREDITS}<b>${me.credits}</b></span><span title="Materials">${MATERIALS}<b>${me.materials}</b></span><span title="Cards in your reserve, waiting for a deck">▤<b>${me.reserve.length}</b></span></div>
          <button class="icon-btn" data-act="cmp-close" aria-label="Back to the map" title="Back to the map">×</button>
        </header>
        ${body}
      </div>`;
  }

  /**
   * Research: what every one of your armies shares. The project under way (and how long it has left), what
   * is done, and what can be started: each paid for in materials when it starts, one at a time.
   */
  private renderResearch(): string {
    const me = campaignPlayer(this.state!);
    const r = me.research ?? { done: [] };
    const b = researchBonus(r);
    const sums = [
      b.mods.extraPlays ? `+${b.mods.extraPlays} energy a day` : '',
      b.march ? `+${b.march} march` : '',
      b.mods.maxHealthDelta ? `+${b.mods.maxHealthDelta} max health` : '',
      b.mods.openingHand ? `+${b.mods.openingHand} opening hand` : '',
      b.mods.startingHeat ? `suns start ${-b.mods.startingHeat} cooler` : '',
      b.mend ? `repair ${b.mend} a turn` : '',
      b.sight ? 'farther sight' : '',
      b.loot ? 'more gear found' : '',
      b.dread ? 'the weak surrender' : '',
    ].filter(Boolean);
    const cur = r.current ? researchProject(r.current.id) : undefined;
    const head = cur ? `researching <b>${esc(cur.name)}</b> · ${r.current!.left} turn${r.current!.left === 1 ? '' : 's'} left` : 'nothing under way: pick a star to research. One project at a time, paid for when it starts.';
    return `<div class="cmp-research">
        <p class="cmp-rs-head">${head}</p>
        <section class="rt">
          ${researchTree({ projects: RESEARCH, done: r.done, current: r.current, problem: (id) => researchProblem(r, me.materials, id), picked: this.researchPick, materialsIcon: MATERIALS })}
        </section>
        <p class="cmp-rs-sum">${sums.length ? `Every army: ${sums.join(' · ')}` : 'What is researched, every one of your armies shares.'}</p>
      </div>`;
  }

  /** The hero shown in the heroes tab: the one picked, else the first army's general, else the first. */
  private pickedHero(): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    return (this.sheet?.kind === 'heroes' && this.sheet.hero) || armiesOf(s, me.id)[0]?.general || GENERALS[me.race][0];
  }

  /**
   * The heroes: each of your race's generals on the left (level, experience, points to spend); the one
   * picked on the right, with their gear (weapon and race's armour) and their skill tree.
   */
  private renderHeroes(pick: string): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const bar = (xp: number) => {
      const lvl = heroLevel(xp);
      const lo = XP_LEVELS[lvl - 1] ?? 0;
      const hi = nextLevelXp(xp);
      return hi === null ? '<span class="cmp-xp"><i style="width:100%"></i></span>' : `<span class="cmp-xp" title="${xp} / ${hi} experience"><i style="width:${Math.round(((xp - lo) / (hi - lo)) * 100)}%"></i></span>`;
    };
    const list = GENERALS[me.race]
      .map((g) => {
        const h = heroState(me, g);
        const army = s.armies.find((a) => a.owner === me.id && a.general === g);
        const pts = skillPoints(h);
        return `<button class="cmp-hero-row ${g === pick ? 'on' : ''}" data-act="cmp-hero" data-arg="${g}">
          ${portrait(g)}
          <span><b>${lower(cardDef(g).name)}</b><small>level ${heroLevel(h.xp)} · ${army ? 'in the field' : 'at rest'}</small>${bar(h.xp)}</span>
          ${pts > 0 ? `<i class="cmp-points" title="Skill points to spend">${pts}</i>` : ''}
        </button>`;
      })
      .join('');
    const h = heroState(me, pick);
    const pts = skillPoints(h);
    const slots = RACE_SLOTS[me.race].map((sl) => ({ ...sl, name: SLOT_NAME[sl.kind] }));
    const picked = this.slotPick && slots.some((x) => x.id === this.slotPick) ? this.slotPick : null;
    const pickedKind = picked ? slots.find((x) => x.id === picked)!.kind : null;
    const items = (me.items ?? []).filter((it) => !pickedKind || it.slot === pickedKind);
    const stores = items
      .map((it) => `<button class="hv-item rarity-${it.rarity}" data-act="cmp-equip" data-arg="${it.id}" title="Put it on ${esc(cardDef(pick).name)}"><small>${lower(SLOT_NAME[it.slot])}</small><b>${esc(it.name)}</b><span>${esc(it.text)}</span></button>`)
      .join('');
    return `
      <div class="cmp-heroes">
        <aside class="cmp-hero-list">${list}</aside>
        <section class="hv-gear">
          <div class="hv-gear-head"><b>${lower(cardDef(pick).name)}</b><small>level ${heroLevel(h.xp)} · ${h.xp} xp${nextLevelXp(h.xp) !== null ? ` · next at ${nextLevelXp(h.xp)}` : ''}</small>${bar(h.xp)}</div>
          ${heroFigure({ hero: pick, slots, gear: h.gear, picked })}
          <p class="hv-boons">${(() => {
            const hb = heroBonus(pick, h);
            return hb.boons.length ? `<small>on ${esc(cardDef(pick).name)}'s card in battle</small>${esc(boonsText(hb.boons))}` : `<small>on ${esc(cardDef(pick).name)}'s card in battle</small>Nothing yet: skills and gear add to the hero's own card while it is in play.`;
          })()}</p>
          <div class="hv-stores-head"><span>${picked ? `stores · ${lower(SLOT_NAME[pickedKind!])}` : 'stores'}</span>${picked ? '<button class="link-btn" data-act="cmp-slot-pick" data-arg="">show all</button>' : ''}</div>
          <div class="hv-stores">${stores || `<p class="muted">${picked ? 'Nothing found for this slot yet.' : 'Nothing found yet. Armies find gear when they take systems: more, and better, the deeper they go.'}</p>`}</div>
        </section>
        <section class="hv-tree">
          ${skillTree({ hero: pick, portrait: portrait(pick), tree: SKILL_TREES[pick] ?? [], learned: h.skills, problem: (id) => learnProblem(pick, h, id), points: pts, picked: this.skillPick })}
        </section>
      </div>`;
  }

  /** An army's deck in the deck builder: its cards and the reserve's make the pool; each tap moves a card at once. */
  private deckMode(armyId: string): BuilderMode {
    const army = () => armyById(this.state!, armyId);
    const me = () => campaignPlayer(this.state!);
    const count = (list: string[], id: string) => list.filter((x) => x === id).length;
    return {
      owned: (id) => count(army().deck, id) + count(me().reserve, id),
      cards: () => [...new Set([...army().deck, ...me().reserve])].map((id) => cardDef(id)),
      deck: () => ({ name: `${cardDef(army().general).name}'s army`, race: me().race, cards: army().deck }),
      // (A refusal has been said already, by the toast.)
      add: (id) => (this.apply({ type: 'deckAdd', armyId, defId: id }) ? null : ''),
      remove: (id) => (this.apply({ type: 'deckRemove', armyId, defId: id }) ? null : ''),
      tally: (cards) => `<b class="${cards.length === CAMPAIGN.armySize ? 'ok' : ''}" title="An army's deck: its hero and up to ${CAMPAIGN.armySize} cards in all">${cards.length}/${CAMPAIGN.armySize}</b> cards · led by ${esc(cardDef(army().general).name)}`,
      badge: (id, n) => ({ text: `${n}/${count(army().deck, id) + count(me().reserve, id)}`, title: `${n} in this deck, ${count(me().reserve, id)} in your reserve`, on: n > 0 }),
      head: () => {
        const tabs = armiesOf(this.state!, me().id)
          .map((a) => `<button class="cmp-army-tab ${a.id === armyId ? 'on' : ''}" data-act="cmp-deck-army" data-arg="${a.id}" style="--ac:${this.colourOf(a.owner)}">${armyFace(a)}<span>${lower(cardDef(a.general).name)}</span></button>`)
          .join('');
        return `<div class="cmp-army-tabs">${tabs}</div>`;
      },
      foot: () => {
        const a = army();
        if (a.moved) return '<p class="cmp-warn">This army has marched this turn: its deck can change next turn.</p>';
        const problem = armyDeckProblems(a.deck, a.general)[0];
        const note = a.refit ? '<p class="muted">Refitting: this army marches next turn.</p>' : '<p class="muted">Changing its deck refits this army: it can\'t march this turn.</p>';
        return (problem ? `<p class="cmp-warn">Not ready to fight: ${esc(problem)}</p>` : '<p class="cmp-ok">Ready to fight.</p>') + note;
      },
    };
  }

  /** The armoury in the deck builder (no deck): its stock to buy, or your reserve to recycle or fuse, run by its keepers. */
  private armoryMode(sh: Extract<Sheet, { kind: 'armory' }>): BuilderMode {
    const s = () => this.state!;
    const me = () => campaignPlayer(s());
    const count = (list: string[], id: string) => list.filter((x) => x === id).length;
    const tab = sh.tab;
    const list = () => (tab === 'buy' ? s().armory : me().reserve);
    const picks = sh.fuse ?? [];
    return {
      owned: (id) => count(list(), id),
      cards: () => [...new Set(list())].map((id) => cardDef(id)),
      deck: () => null,
      tap: (id) => {
        if (tab === 'fuse') {
          const at = picks.lastIndexOf(id);
          const next = at >= 0 ? picks.filter((_, k) => k !== at) : picks.length < 2 && count(picks, id) < count(me().reserve, id) ? [...picks, id] : [...picks.slice(0, 1), id];
          this.sheet = { kind: 'armory', tab, fuse: next };
        } else this.sheet = { kind: 'armory', tab, pick: sh.pick === id ? undefined : id };
        sound.hover();
        this.host.render();
      },
      picked: (id) => (tab === 'fuse' ? picks.includes(id) : sh.pick === id),
      badge: (id) =>
        tab === 'buy'
          ? { text: `${MATERIALS}${armoryPrice(id)}`, title: `${armoryPrice(id)} materials`, on: me().materials >= armoryPrice(id) }
          : tab === 'recycle'
            ? { text: `×${count(me().reserve, id)}`, title: `${count(me().reserve, id)} in your reserve: recycles for ${recycleValue(id)} materials each`, on: true }
            : { text: `×${count(me().reserve, id)}`, title: `${count(me().reserve, id)} in your reserve`, on: picks.includes(id) },
      head: () => {
        const keeper = tab === 'buy' ? QUARTERMASTER : RECYCLER;
        const lines = tab === 'buy' ? QUARTERMASTER_LINES : RECYCLER_LINES;
        const line = lines[(s().turn * 3 + this.keeperVisit) % lines.length];
        const sub = (['buy', 'recycle', 'fuse'] as const).map((t) => `<button class="cmp-tab ${t === tab ? 'cmp-tab-on' : ''}" data-act="cmp-armory-tab" data-arg="${t}">${t}</button>`).join('');
        return `
          <nav class="cmp-tabs cmp-armory-tabs">${sub}</nav>
          <div class="cmp-keeper">
            ${tab === 'buy' ? QUARTERMASTER_PORTRAIT : RECYCLER_PORTRAIT}
            <div><b>${esc(keeper.name.toLowerCase())}</b><small>${esc(keeper.role)}</small></div>
          </div>
          <p class="cmp-keeper-line">“${esc(line)}”</p>`;
      },
      foot: () => {
        if (tab === 'fuse') {
          if (picks.length < 2) return `<p class="muted">Pick two reserve cards to fuse into one that does both, for materials. Heroes, global and Lightspeed cards can't be fused, nor can a fused card again.</p>`;
          const [a, b] = picks;
          const problem = fusionProblem(a, b);
          if (problem) return `<p class="cmp-warn">${esc(problem)}</p>`;
          const cost = fusionCost(a, b);
          return `<div class="cmp-keeper-pick">${cardHtml(fusedId(a, b))}</div>
            <p class="muted">${esc(cardDef(a).name)} and ${esc(cardDef(b).name)} become one card. <b>This cannot be undone.</b></p>
            <button class="btn-primary" data-act="cmp-fuse" ${me().materials < cost ? 'disabled' : ''}>fuse · ${MATERIALS} ${cost}</button>`;
        }
        const id = sh.pick && list().includes(sh.pick) ? sh.pick : null;
        if (!id) return `<p class="muted">${tab === 'buy' ? 'Tap a card to look it over. Bought cards wait in your reserve. New stock arrives every turn, and with every conquest.' : 'Tap a reserve card to break it down for half its armoury price, in materials.'}</p>`;
        return `<div class="cmp-keeper-pick">${cardHtml(id)}</div>${
          tab === 'buy'
            ? `<button class="btn-primary" data-act="cmp-buy" data-arg="${id}" ${me().materials < armoryPrice(id) ? 'disabled' : ''}>buy · ${MATERIALS} ${armoryPrice(id)}</button>`
            : `<button class="btn-primary" data-act="cmp-recycle" data-arg="${id}">recycle · +${MATERIALS} ${recycleValue(id)}</button>`
        }`;
      },
    };
  }

  private modal(title: string, body: string, closable = false, tabs = '', cls = 'modal-wide'): string {
    return `
      <div class="overlay ${closable ? 'overlay-soft' : ''}" ${closable ? 'data-act="cmp-close"' : ''}>
        <div class="modal ${cls} cmp-modal">
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
      <div class="card-glyph">${cardArtLite(def, true)}</div>${stabilityBadge(def)}
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
