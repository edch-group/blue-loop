import {
  activeGlobal,
  activePlayer,
  heroSkillProblem,
  heroAbilityProblem,
  RACE_TRAITS,
  SUBRACES,
  attackProblem,
  cardAttack,
  applyAction,
  BALANCE,
  boosterPool,
  BOOSTERS,
  PROGRESSION,
  rankName,
  RANK_TIERS,
  rankOf,
  xpToNext,
  canSetLightspeed,
  canSetFaceDown,
  cardDef,
  chooseAIAction,
  createGame,
  enemyChoices,
  enemyEffectKind,
  GameError,
  instabilityHeat,
  KEYWORDS,
  keywordLabel,
  plainText,
  isGameOver,
  freeSlots,
  persists,
  commandCard,
  inSlots,
  fusionHosts,
  fullDefence,
  baseStability,
  playsAllowed,
  RACE_NAMES,
  allyChoices,
  cardChoices,
  cardCost,
  aimChoices,
  aimable,
  abilityAimable,
  COMMAND_SLOT,
  dawnEffects,
  effectAmount,
  optionText,
  allyEffectKind,
  cardDefence,
  recoverChoices,
  supernovaThreshold,
  hasRoomFor,
  targetOf,
  planetsEaten,
  currentPlanet,
  type Action,
  type BoosterCard,
  type BoosterKind,
  type CardInstance,
  type CardKind,
  type GameState,
  type PlayerSetup,
  type PlayerState,
  deckProblems,
  beginStats,
  finishStats,
  noteMove,
  type GameStats,
} from '../engine';
import { roman, sunOrb, vitals } from './art';
import { backdrop } from './backdrop';
import { DeckBuilder, deckBox, deckColour, deckCover, sizePool } from './builder';
import { CampaignView, loadCampaign } from './campaign';
import { customDecks, deckById, PRESETS, type SavedDeck } from './decks';
import { factionAvatar } from './factions';
import { aim, anchorRect, beam, supernovaBurst, flyFrom, ghost, projectile, pulse, reducedMotion, snapshot, tether, type Snapshot } from './fx';
import { attackBadge, cardBackFace, cardBodyHtml, raceTraitTags, raceRow, cardArtLite, cardStock, cardGlyph, cardTextHtml, keywordHtml, keywordList, KIND_COLOUR, liveValues, pictureFor, playerAvatar, stabilityBadge, typeLine } from './glyphs';
import { EXIT_FULLSCREEN_ICON, FULLSCREEN_ICON, LOG_ICON, MENU_ICON } from './menu-icon';
import { logRows } from './logview';
import { profile, signedIn, signIn } from './profile';
import { account, buyBooster, checkIn, flush, confirmReset, deleteAccount, finishAiGame, logIn, logInWith, logOut, markDirty, onProgressReplaced, refreshEconomy, requestReset, sendGameStats, serverConfig, setSharingStats, sharingStats, signUp, startAiGame, type AuthResult, type Payout, type ServerConfig } from './account';
import { sound } from './sound';
import { clearSave, loadSave, save } from './storage';
import { cleanCode, hasSeat, inviteLink, LadderClient, newRoomCode, OnlineClient, type LastMove, type LobbySeat } from './online';
import { fitCardText, fitWhenSeen } from './fittext';
import { refreshLift, trackLift } from './lift';
import { animateSuns, holdSuns, redrawSuns } from './sun3d';
import { voices } from './voice';
import { morphInto } from './morph';
import { appSize, forceLandscape, pageRect, VIEWPORT_EVENT } from './viewport';

type Screen = 'menu' | 'game' | 'campaign';
type MenuPage = 'title' | 'signin' | 'hub' | 'quickplay' | 'options' | 'decks' | 'online' | 'shop' | 'pickdeck';

const HUB_ICONS = {
  collection: `<svg viewBox="0 0 48 48" aria-hidden="true" style="--ih:#5f8fc4"><rect class="ic-e" x="8" y="12" width="18" height="26" rx="3" transform="rotate(-10 17 25)"/><rect class="ic-e" x="16" y="10" width="18" height="26" rx="3"/><rect class="ic-e" x="24" y="12" width="18" height="26" rx="3" transform="rotate(10 33 25)"/></svg>`,
  /** The general booster pack's emblem: a pack with a star. */
  pack: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 10h20l2 30H12z"/><path d="M14 10l4 6h12l4-6M24 22l2.4 4.8 5.3.8-3.8 3.7.9 5.2-4.8-2.5-4.8 2.5.9-5.2-3.8-3.7 5.3-.8z"/></svg>`,
  shop: `<svg viewBox="0 0 48 48" aria-hidden="true" style="--ih:#5f8fc4"><path class="ic-e" d="M11 17h26l-2 23H13z"/><path d="M18 20v-6a6 6 0 0 1 12 0v6"/></svg>`,
  /** The map: systems linked by routes, the Heart the largest. */
  campaign: `<svg viewBox="0 0 48 48" aria-hidden="true" style="--ih:#5f8fc4"><path class="ic-faint" d="M10 34 22 26 36 32M22 26 26 12 36 32M10 34 14 16 26 12"/><circle class="ic-e" cx="10" cy="34" r="3.2"/><circle class="ic-e" cx="22" cy="26" r="2.6"/><circle class="ic-e" cx="36" cy="32" r="4.4"/><circle class="ic-e" cx="26" cy="12" r="3"/><circle class="ic-e" cx="14" cy="16" r="2.4"/></svg>`,
  /** A sun sending its heat at a planet. */
  quickplay: `<svg viewBox="0 0 48 48" aria-hidden="true" style="--ih:#5f8fc4"><circle class="ic-e" cx="17" cy="24" r="8"/><circle class="ic-e" cx="36" cy="24" r="4.5"/><path class="ic-faint" d="M26 24h4M27.5 20.5 31 24l-3.5 3.5"/></svg>`,
  /** The world and its meridians. */
  online: `<svg viewBox="0 0 48 48" aria-hidden="true" style="--ih:#5f8fc4"><circle class="ic-e" cx="24" cy="24" r="14"/><path class="ic-faint" d="M10 24h28M24 10c-5 4-7 9-7 14s2 10 7 14M24 10c5 4 7 9 7 14s-2 10-7 14"/></svg>`,
  options: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 15h28M10 24h28M10 33h28"/><circle cx="18" cy="15" r="3.2"/><circle cx="31" cy="24" r="3.2"/><circle cx="22" cy="33" r="3.2"/></svg>`,
};
type Speed = 'slow' | 'normal' | 'fast';

/**
 * A card the player is playing that still needs choices: which option
 * (Command Directive), which rival card to destroy or return (Ion Cannon,
 * Tractor Beam), which of their own cards to replace when their tableau is
 * full, which to recall (Phase Shift), what to recover from the discard pile
 * (Salvage Drone), and where in the tableau it goes (when resonance makes
 * position matter).
 */
interface Pending {
  uid: string;
  step: 'choice' | 'enemy' | 'ally' | 'recover' | 'aim' | 'slot' | 'host';
  /** A Fusion card: the card of yours it fuses onto. */
  hostUid?: string;
  /** Where its heat goes: a rival card's uid, or 'sun'. */
  aimUid?: string;
  /** Your Hero's ability being aimed (uid is the Hero): which one. */
  ability?: number;
  /** A card of yours in play attacking (uid is that card): its target is chosen like an aim. */
  attack?: boolean;
  /** A Command card's option. */
  choice?: string;
  enemyUid?: string;
  allyUid?: string;
  recoverUid?: string;
  slot?: number;
  /** Where the card was dropped, dragged out of the hand onto your tableau: a slot, your Lightspeed slot, or a
   *  card of yours (to recall or fuse onto). Used for whichever of those choices it fits; the rest are asked. */
  drop?: { slot?: number | 'ls'; uid?: string };
  /** A Lightspeed guard set face down instead (its Lightspeed slot chosen). */
  faceDown?: boolean;
}

/** What an AI player just played (or a Lightspeed card that just sprang), shown large at the middle right. */
interface Stage {
  defId: string;
  actorId: string;
  /** Shown instead of "<name> plays". */
  caption?: string;
  /** A Lightspeed card set face down: show only its back. */
  faceDown?: boolean;
  /** A rival's card the viewer must confirm they have read before the rival goes on. */
  confirm?: boolean;
  /**
   * The viewer's own card, just played: it hangs here until the rival has read it (online), or a moment
   * (against the AI), and then goes to the board (or the discard pile).
   */
  own?: boolean;
  /** The card's uid, when it is the viewer's own (so it flies from here to where it lands). */
  uid?: string;
  /** The option the player picked on a card with choices (a Command card's dawn effect): highlighted on it. */
  option?: string;
  /** A sprung Lightspeed card: the enemy card it answered, shown beside it. */
  against?: string;
  /** The rival card it will remove (destroy, return or erode): aimed at while it waits on the stage. */
  target?: string;
}

/** Bottom sheets / dialogs that are not part of a pending move. */
type Sheet =
  | { kind: 'menu' }
  | { kind: 'log' }
  | { kind: 'rules' }
  /** A deck or discard pile: the viewer's, or (`playerId`) a rival's discard pile. */
  | { kind: 'pile'; pile: 'discard'; playerId?: string }
  /** A player's summary: deck, commands and conditions. */
  | { kind: 'player'; playerId: string }
  /** Tap-to-inspect on touch screens: a readable card with its action. */
  | { kind: 'quit' }
  /** Ending the day with plays still left: are you sure? */
  | { kind: 'end-day' }
  /** Ending the day holding more than the hand limit: which cards go (`picked`, by uid). */
  | { kind: 'discard'; picked: string[] }
  | { kind: 'card'; defId: string; uid?: string; /** A card in play: its uid, so the magnified card shows its live stats. */ table?: string; /** Of a card in play with Fusion cards on it: which is shown (0 the card itself, then each fused card). */ tab?: number };

/** Menu buttons that lead somewhere: the page they're on lifts away (and the star spins up) before the next one comes in. */
const MENU_NAV = new Set(['menu-page', 'open-decks', 'campaign-new', 'campaign-continue', 'continue', 'new-game', 'to-menu']);
const MENU_LEAVE_MS = 300;
const SPEED_KEY = 'blue-loop:ai-speed';
/** Load a script from another site once (Apple's and Google's sign-in). */
const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scripts.delete(src);
        reject(new Error(src));
      };
      document.head.appendChild(el);
    });
    scripts.set(src, p);
  }
  return p;
}

/** The native app (Apple's and Google's web sign-ins don't run in its web view). */
function isNativeApp(): boolean {
  return location.protocol === 'capacitor:' || !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

/** The parts of Google's and Apple's sign-in scripts the game uses. */
interface GoogleId {
  accounts: {
    id: {
      initialize(o: { client_id: string; nonce: string; callback: (r: { credential?: string }) => void; use_fedcm_for_prompt?: boolean }): void;
      prompt(cb?: (n: { isNotDisplayed?: () => boolean; isSkippedMoment?: () => boolean }) => void): void;
    };
  };
}
interface AppleId {
  auth: {
    init(o: { clientId: string; scope: string; redirectURI: string; usePopup: boolean; nonce: string }): void;
    signIn(): Promise<{ authorization?: { id_token?: string } }>;
  };
}

/** The server's id for the saved game against the AI (see begin). */
const AI_GAME_KEY = 'blue-loop:ai-game';
/** A rival's cards land by themselves after a moment, rather than waiting for OK. */
const AUTO_CONFIRM_KEY = 'blue-loop:auto-confirm';
const AUTO_CONFIRM_MS = 2000;
/** How long the viewer's own card hangs in the preview pane (at least) before it lands, as the rival reads it. */
const OWN_HOLD_MS = 1100;
/** With nothing left to do today, how long the board rests before the day ends by itself. */
const AUTO_END_MS = 1600;
/** How much the hand's cards grow while it is raised to be read. */
const HAND_GROW = 1.14;
/** An attack: the card's lunge (it strikes a little past halfway; the attack lands once it is back). */
const LUNGE_MS = 900;
/** When in the lunge the card strikes (a share of it): the blow lands then. */
const LUNGE_HIT = 0.58;
/** Banners in a row (dusk, dawn, day) are this far apart. */
const BANNER_GAP_MS = 1300;
const SPEED_FACTOR: Record<Speed, number> = { slow: 1.7, normal: 1, fast: 0.4 };
/** Pause after each kind of AI action, before the next one (ms at normal speed). */
const AI_PAUSE: Record<Action['type'], number> = { playCard: 1700, setTarget: 500, endTurn: 1200, concede: 0, heroSkill: 1400, heroAbility: 1400, attack: 1300 };
const TOAST_MS = 2600;
const LONG_PRESS_MS = 450;
/** Log lines worth emphasising: hits, supernovas, choices and so on. */
const HOT = '#f0a07a';
/** How long each dawn effect gets on the table, before the next fires (scaled by the game speed). */
const PULSE_STEP = 720;
/** The log button: lines of text in a page. */
/** Cards in hand: a small fan of three cards. */
/** The gap between cards dealt into the opening hand (and between faded cards leaving the table). */
const DEAL_STEP_MS = 110;
/** A faded card's way out: the deal's flight (520ms), played backwards into the discard pile. */
const FADE_OUT = { duration: 520, easing: 'cubic-bezier(.8,.2,.8,.2)', endOpacity: 0 };
/** How long the pointer rests on a keyword before it explains itself. */
const KW_TIP_DELAY_MS = 350;
/** Scrolling areas whose position survives a redraw. */
const SCROLL_KEEP = '.db-pool, .db-rows, .db-list-body, .setup-body, .pile-grid, .log-list';
/** An eye: look closely at a tableau. */
const EYE_ICON = '<svg class="eye-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3.2"/></svg>';
const HAND_ICON = '<svg class="hand-icon" viewBox="0 0 16 14" aria-label="in hand"><rect x="2.2" y="3" width="6" height="8.6" rx="1.1" transform="rotate(-18 5.2 11)"/><rect x="5" y="1.8" width="6" height="8.6" rx="1.1"/><rect x="7.8" y="3" width="6" height="8.6" rx="1.1" transform="rotate(18 10.8 11)"/></svg>';
/** Clicks that make their own sound (or none): moves on the table and picks on the map. */
const QUIET_ACTS = new Set(['play', 'end-turn', 'choose-option', 'choose-enemy', 'choose-ally', 'choose-host', 'choose-recover', 'choose-slot', 'stage-ok', 'inspect', 'cmp-select', 'cmp-anomaly', 'cmp-deselect', 'cmp-end-turn', 'cmp-start']);

/** A number that pops out of a sun and rises away: heat taken, cooling, shields. Outside the re-rendered root. */
function floatNumber(at: DOMRect, text: string, tone: 'hot' | 'cool' | 'block', row: number) {
  const el = document.createElement('div');
  el.className = `dmg dmg-${tone}`;
  el.textContent = text;
  // Heat over the sun's middle; shields lower down and to the side, so the two never overlap.
  el.style.left = `${at.left + at.width * (row ? 1.02 : 0.5)}px`;
  el.style.top = `${at.top + at.height * (row ? 0.78 : 0.34)}px`;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 1400);
}

/** The edges of the screen burn briefly when your own sun takes enemy heat. */
function hurtFlash() {
  if (reducedMotion()) return;
  const el = document.createElement('div');
  el.className = 'hurt-vignette';
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 950);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Fullscreen, for playing in a browser: a button beside settings, where the browser allows it (iPhone
 * Safari does not, so it is left out there; the installed app is fullscreen already).
 */
type FullscreenDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
function fullscreenOn(): boolean {
  const d = document as FullscreenDoc;
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}
function fullscreenButton(cls = 'icon-btn'): string {
  const d = document as FullscreenDoc;
  const on = fullscreenOn();
  // (An installed app has no browser bars to hide. Fullscreen itself reports as display-mode fullscreen,
  // so only standalone counts here, and while fullscreen the button always shows, to leave it.)
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!on && (!(d.fullscreenEnabled || d.webkitFullscreenEnabled) || installed)) return '';
  return `<button class="${cls}" data-act="fullscreen" aria-label="${on ? 'Leave fullscreen' : 'Fullscreen'}" title="${on ? 'Leave fullscreen' : 'Fullscreen'}">${on ? EXIT_FULLSCREEN_ICON : FULLSCREEN_ICON}</button>`;
}
function toggleFullscreen() {
  const d = document as FullscreenDoc;
  const root = document.documentElement as FullscreenEl;
  if (fullscreenOn()) void (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.())?.catch?.(() => undefined);
  else void (root.requestFullscreen?.({ navigationUI: 'hide' }) ?? root.webkitRequestFullscreen?.())?.catch?.(() => undefined);
}
// The button's icon follows fullscreen as it changes (by the button, Escape or the browser).
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(ev, () => {
    document.querySelectorAll<HTMLElement>('[data-act="fullscreen"]').forEach((b) => (b.outerHTML = fullscreenButton(b.className)));
  });
}

interface MenuSeat {
  /** A human's name (the signed-in player's own, for the first seat). */
  name: string;
  isAI: boolean;
  deckId: string;
  /** The name an AI plays under: a bot name, picked at random. */
  bot: string;
}

/** Names the AI plays under in quickplay. */
const BOT_NAMES = ['Unit Parhelion', 'Kepler-9', 'Null Vector', 'Coronabot', 'Tycho Engine', 'Sentinel K4', 'Orrery', 'Halo Mk II', 'Lagrange', 'Umbra-7', 'Perihelion', 'Quasar Drone', 'Brightwire', 'Heliostat', 'Ember Logic', 'Cold Fusion'];
function botName(not = ''): string {
  const pool = BOT_NAMES.filter((n) => n !== not);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Each quickplay seat's last played deck, if it still exists (seat 0 is the signed-in player). */
const RECENT_KEY = 'blue-loop:recent-decks';
function lastDeck(seat: number): string | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '{}') as Record<string, string[]>;
    const id = Array.isArray(all[seat]) ? all[seat][0] : undefined;
    return id && deckById(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
function noteRecentDeck(seat: number, deckId: string) {
  try {
    const all = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '{}') as Record<string, string[]>;
    all[seat] = [deckId];
    localStorage.setItem(RECENT_KEY, JSON.stringify(all));
    markDirty();
  } catch {
    // Not available.
  }
}


/**
 * The line round each tableau: a rounded outline of its row of slots, with a bump for the Command slot
 * leading it (top right of yours; the rival's is the same shape turned round, so its bump is bottom left).
 * Measured after each redraw, in the row's own (untransformed) layout.
 */
/**
 * The game's result floats flat above the tilted board (so nothing on the board can show through it),
 * centred on the spot the board keeps for it between the two tableaus.
 */
/** Where an element lies within an ancestor, in that ancestor's own (untransformed) layout space. */
function planeOffset(el: HTMLElement, ancestor: HTMLElement): { x: number; y: number } {
  const a = layoutOffset(ancestor);
  const e = layoutOffset(el);
  return { x: e.x - a.x, y: e.y - a.y };
}

/** An element's offset from the top of the page's layout (transforms ignored), along its offset parents. */
function layoutOffset(el: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) {
    x += e.offsetLeft;
    y += e.offsetTop;
  }
  return { x, y };
}

function placeResult(root: HTMLElement) {
  const result = root.querySelector<HTMLElement>('.game-result');
  const anchor = root.querySelector<HTMLElement>('.result-anchor');
  if (!result || !anchor) return;
  const r = anchor.getBoundingClientRect();
  // The page may be zoomed (CSS zoom), so screen pixels are turned back into the page's own.
  const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
  result.style.left = `${(r.left + r.width / 2) / zoom}px`;
  result.style.top = `${(r.top + r.height / 2) / zoom}px`;
}

/**
 * Piles on the tilted board: how far their stacked edges must lean sideways (per pixel down the board) to stand
 * upright on screen. Moving down the board, a pile drifts outwards as the perspective widens: measured, then undone.
 */
function leanPiles(root: HTMLElement) {
  for (const face of root.querySelectorAll<HTMLElement>('.tpile-stacked')) {
    face.style.setProperty('--lean', '0');
    face.style.translate = 'none';
    const r0 = face.getBoundingClientRect();
    face.style.translate = '0 20px';
    const r1 = face.getBoundingClientRect();
    face.style.translate = '';
    const perX = r0.width / (face.offsetWidth || 1);
    // (The pile climbs to the right: its top card up and right of its foot, the edges stepping down to the left.
    // The perspective's drift is undone first, then a lean of its own is added.)
    const drift = perX ? (r1.left + r1.width / 2 - (r0.left + r0.width / 2)) / 20 / perX : 0;
    const lean = -drift - 0.45;
    face.style.setProperty('--lean', lean.toFixed(3));
  }
}

function frameTableaus(root: HTMLElement) {
  for (const row of root.querySelectorAll<HTMLElement>('.tableau-row')) {
    const svg = row.querySelector<SVGSVGElement>('.tableau-frame');
    const cmd = row.querySelector<HTMLElement>('.cmd-slot');
    if (!svg || !cmd) continue;
    const pad = parseFloat(getComputedStyle(row).getPropertyValue('--frame-pad')) || 12;
    const W = row.offsetWidth + 2 * pad, H = row.offsetHeight + 2 * pad;
    const bw = cmd.offsetWidth + 2 * pad;
    // How far the bump stands out past the row's outline (the slot sits just outside the row).
    const rival = row.closest('.tableau-rival') !== null;
    const bh = rival ? cmd.offsetTop + cmd.offsetHeight - row.offsetHeight : -cmd.offsetTop;
    const r = 12, rc = 8;
    const x0 = W - bw;
    const d = `M${r},0 H${x0 - rc} Q${x0},0 ${x0},${-rc} V${-bh + r} Q${x0},${-bh} ${x0 + r},${-bh} H${W - r} Q${W},${-bh} ${W},${-bh + r} V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} V${r} Q0,0 ${r},0 Z`;
    Object.assign(svg.style, { left: `${-pad}px`, top: `${-pad}px`, width: `${W}px`, height: `${H}px` });
    // On the half pixel, so the 1px line lands on one row of pixels (as the rings do) rather than smearing over two.
    svg.setAttribute('viewBox', `-0.5 -0.5 ${W} ${H}`);
    const path = svg.querySelector('path')!;
    path.setAttribute('d', d);
    path.setAttribute('transform', rival ? `rotate(180 ${W / 2} ${H / 2})` : '');
  }
}

/**
 * A sun as drawn on the tilted board: a square round the middle of its dome on screen (where its heat count
 * stands, placed by sun3d.ts), sized like the dome. Attacks aim here, so they hit the sun you see.
 */
/**
 * What an attack or aim points at, for an element on the board: a card together with the defence badge that
 * hangs off its foot (so a beam arriving from below stops short of the badge, not on top of it), a sun as
 * drawn, or anything else as it is.
 */
function targetRect(el: Element | null): DOMRect | null {
  if (!el) return null;
  const anchor = el.getAttribute('data-anchor');
  if (anchor?.startsWith('player:')) {
    const sun = sunRect(el.ownerDocument, anchor.slice(7));
    if (sun) return sun;
  }
  const r = pageRect(el);
  const badge = el.querySelector('.stat-def-floor');
  if (!badge) return r;
  const b = pageRect(badge);
  const left = Math.min(r.left, b.left), top = Math.min(r.top, b.top);
  return new DOMRect(left, top, Math.max(r.right, b.right) - left, Math.max(r.bottom, b.bottom) - top);
}

function sunRect(root: ParentNode, id: string): DOMRect | null {
  const vit = root.querySelector<HTMLElement>(`[data-anchor="player:${id}"] .vit`);
  const label = vit?.querySelector<HTMLElement>('.vit-heat');
  if (!vit || !label) return null;
  const l = pageRect(label), v = pageRect(vit);
  if (!l.width || !v.width) return null;
  const size = v.width * 0.45;
  return new DOMRect(l.left + l.width / 2 - size / 2, l.top + l.height / 2 - size / 2, size, size);
}

/**
 * A player's shields, big, in the board's middle: the rival's above the Stellari, yours below (they are easy to
 * miss on the sun). Faint at none.
 */
function shieldBadge(pid: string, n: number, side: 'mine' | 'rival'): string {
  return `<div class="board-shields board-shields-${side} ${n > 0 ? 'up' : ''}" data-shields-badge="${esc(pid)}" title="${side === 'mine' ? 'Your' : 'Their'} shields: they absorb enemy heat, and fade at dawn">${SHIELD_SVG}<b>${n}</b></div>`;
}

/**
 * The badge's shield: a heater shield with a bevelled silver rim, an enamel face lit from the top left, a
 * centre ridge (its right half in shade), a highlight, and a glint that sweeps across it now and then. Its
 * colours are CSS variables, so the same drawing serves raised (blue) and down (pale steel).
 */
const SHIELD_PATH = 'M50 3 L93 15 V50 C93 79 75 97 50 107 C25 97 7 79 7 50 V15 Z';
const SHIELD_FACE = 'M50 12 L84 21.5 V50 C84 73 70 88 50 96.5 C30 88 16 73 16 50 V21.5 Z';
const SHIELD_SVG = `<svg viewBox="0 0 100 110" aria-hidden="true">
  <defs>
    <linearGradient id="bs-rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style="stop-color:var(--rim1)"/><stop offset="0.35" style="stop-color:var(--rim2)"/>
      <stop offset="0.6" style="stop-color:var(--rim3)"/><stop offset="1" style="stop-color:var(--rim4)"/>
    </linearGradient>
    <linearGradient id="bs-face" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" style="stop-color:var(--face1)"/><stop offset="0.55" style="stop-color:var(--face2)"/><stop offset="1" style="stop-color:var(--face3)"/>
    </linearGradient>
    <radialGradient id="bs-spec" cx="0.32" cy="0.2" r="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bs-glint" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="bs-clip"><path d="${SHIELD_PATH}"/></clipPath>
  </defs>
  <path class="bs-rim" d="${SHIELD_PATH}" fill="url(#bs-rim)"/>
  <path class="bs-face" d="${SHIELD_FACE}" fill="url(#bs-face)"/>
  <path d="M50 12 L84 21.5 V50 C84 73 70 88 50 96.5 Z" fill="#0b1630" opacity="0.2"/>
  <path d="M50 13 V96" stroke="#fff" stroke-opacity="0.45" stroke-width="1.4"/>
  <path d="${SHIELD_FACE}" fill="none" stroke="#0b1630" stroke-opacity="0.35" stroke-width="1.6"/>
  <path d="M50 5.5 L90.5 17 V50" fill="none" stroke="#fff" stroke-opacity="0.8" stroke-width="1.6" stroke-linecap="round"/>
  <ellipse cx="36" cy="32" rx="22" ry="16" fill="url(#bs-spec)"/>
  <g clip-path="url(#bs-clip)"><rect class="bs-glint" x="-40" y="-20" width="26" height="160" fill="url(#bs-glint)" transform="rotate(20 50 55)"/></g>
</svg>`;

/** Show these shields on a player's badge (kept in step with their sun while a turn plays out). */
function setShieldBadge(root: ParentNode, pid: string, n: number) {
  root.querySelectorAll<HTMLElement>(`[data-shields-badge="${CSS.escape(pid)}"]`).forEach((el) => {
    const b = el.querySelector('b');
    const was = Number(b?.textContent ?? 0);
    el.classList.toggle('up', n > 0);
    if (b) b.textContent = String(n);
    // Raised (or raised further): the shield flashes, its glint sweeping at once.
    if (n > was) {
      el.classList.remove('raised');
      void el.offsetWidth;
      el.classList.add('raised');
    }
  });
}

export class App {
  private screen: Screen = 'menu';
  /** Which page of the front end is showing: title → hub (campaign · quickplay · options) → setup. */
  private menuPage: MenuPage = 'title';
  /** Where the deck builder was opened from (it goes back there). */
  private decksFrom: MenuPage = 'hub';
  /** A card shown large outside a game (tap anywhere to close). */
  private zoomed: string | null = null;
  /** The profile view is open (from the player chip). */
  private profileOpen = false;
  /** Sign-in being filled in. */
  private signinName: string | null = null;
  /**
   * The sign-in page: an account to sign in to (or create), or (for a guest, or once signed in) the name
   * you go by.
   */
  private authMode: 'signin' | 'signup' | 'name' | 'forgot' | 'reset' = 'signin';
  private authEmail = '';
  private authPassword = '';
  private authError = '';
  private authNote = '';
  private authBusy = false;
  /** Signing up: the Terms of Service and the Privacy Policy, each agreed to (ticked). */
  private agreeTerms = false;
  private agreePrivacy = false;
  /** A password-reset link's token (from ?reset=), while setting the new password. */
  private resetToken = '';
  /** An Apple or Google sign-in waiting for a new account to agree to the Terms and the Privacy Policy. */
  private pendingOAuth: { provider: 'apple' | 'google'; idToken: string; nonce: string } | null = null;
  /** What the server offers (Apple and Google sign-in, password reset), once it has said. */
  private serverOffers: ServerConfig = { google: null, apple: null, reset: false };
  /** The server's id for the game against the AI being played (its reward is claimed with it). */
  private aiGameId: string | null = null;
  private gamesBegun = 0;
  /** The profile view's delete-account step, and the password typed for it. */
  private deleting = false;
  private deletePassword = '';
  /** The ranked ladder, while queued for a match. */
  private ladder: LadderClient | null = null;
  /** The booster just opened in the shop. */
  private opened: { kind: BoosterKind; cards: BoosterCard[] } | null = null;
  private state: GameState | null = null;
  private pending: Pending | null = null;
  private stage: Stage | null = null;
  /** Your Hero, tapped on your day: its actions (abilities, and attack) shown in the stage's place, middle right. */
  private heroPanel: string | null = null;
  /** The card mid-attack (its flying copy is out): hidden in its slot until the copy is back. */
  private lunging: string | null = null;
  /** The board zoomed onto one tableau (the rival's, or yours), to read it close up; null: the whole board. */
  private boardZoom: 'rival' | 'mine' | null = null;
  /** How the board is zoomed to fit that tableau to the window (--bz, --zx, --zy), as worked out by fitZoom. */
  private zoomVars = '';
  /** The zoom worked out for each tableau at each window size, so zooming again needs no measuring. */
  private zoomFits = new Map<string, { bz: number; zx: number; zy: number }>();
  /** Card text to fit again once the zoom's easing is over (it would stall the easing mid-way). */
  private pendingRefit: (() => void) | null = null;
  private sheet: Sheet | null = null;
  /** A move held back until the viewer has read its card on the stage (then it lands and animates). */
  private landing: (() => void) | null = null;
  /** The staged rival card has played its arrival sound (so it does not sound again as it lands). */
  private entranceHeard = false;
  /**
   * Players whose sun has just gone supernova, still drawn alive until the blow lands and the explosion has
   * played (results show after the animation that causes them).
   */
  private dying = new Set<string>();
  private shownDead(p: PlayerState): boolean {
    return p.eliminated && !this.dying.has(p.id);
  }
  /** An invite link's room, joined once a new player has signed in. */
  private inviteAfterSignIn: string | null = null;
  /** A menu page is playing out (see leaveMenu); further clicks wait. */
  private menuLeaving = false;
  /** The page last drawn, so a new one can come in with a little rise. */
  private shownPage = '';
  /** Auto-confirm: a rival's card waits on the stage for a moment, then lands by itself. */
  private autoConfirm = false;
  /** This game's anonymous summary, for balancing (a fresh game on this device; sent when it ends). */
  private statsRec: GameStats | null = null;
  /** The How to Play tab showing. */
  private rulesTab = 'overview';
  /** The rival whose tableau is shown across the table (defaults to the viewer's target). */
  private viewRivalId: string | null = null;
  /** Overlays hidden so the player can study the board; the game is suspended meanwhile. */
  private peeking = false;
  private peekBtn!: HTMLButtonElement;
  private peekShield!: HTMLDivElement;
  private aiTimer: number | null = null;
  private speed: Speed = 'normal';
  /** Touch screens have no hover: cards open an inspector instead. */
  private touch = window.matchMedia('(pointer: coarse)').matches;
  /** Human player whose hand was last revealed (for hot-seat handoff). */
  private revealedFor: string | null = null;
  /** Whose hand sits in the dock: the current or most recent human. */
  private viewerId: string | null = null;
  private preview: HTMLElement;
  private press: { x: number; y: number; timer: number; shown: boolean } | null = null;
  private suppressClick = false;
  /** Campaign mode; `campaignBattle` is set while one of its battles is on the battle screen. */
  private campaign = new CampaignView({
    render: () => this.render(),
    toast: (text) => this.showToast(text, 'error'),
    playBattle: (game) => {
      this.campaignBattle = true;
      this.begin(game);
    },
    settingsButtons: () => this.settingsButtons(),
    banner: (text, sub) => this.showBanner(text, sub, 120, 'campaign'),
    zoom: (id) => this.zoom(id),
    toMenu: () => {
      this.campaignBattle = false;
      this.screen = 'menu';
      this.menuPage = 'hub';
      this.render();
    },
  });
  private campaignBattle = false;
  /** Online 1v1: the room connection, and what the lobby shows. */
  private online: OnlineClient | null = null;
  private net = {
    /** A code typed (or from an invite link) to join. */
    joinCode: '',
    status: 'idle' as 'idle' | 'connecting' | 'open' | 'lost',
    lobby: null as LobbySeat[] | null,
    you: 0,
    /** Whether the rival is connected (they may have closed the app; the room waits for them). */
    rivalOnline: true,
    /** Online: whether this is a ranked game (its reward comes from the server). */
    ranked: false,
    /** Queued on the ranked ladder, looking for a match. */
    searching: false,
    /** Online: 'you' must confirm the rival's card; the 'rival' is reading yours (you wait). */
    waitFor: null as 'you' | 'rival' | null,
  };
  /** The deck builder in use: the campaign base's while it is open, else the menu's. */
  private activeBuilder(): DeckBuilder {
    return this.screen === 'campaign' ? this.campaign.builder : this.builder;
  }

  private builder = new DeckBuilder({
    render: () => this.render(),
    zoom: (id) => this.zoom(id),
    toast: (text) => this.showToast(text, 'error'),
    done: () => {
      this.menuPage = this.decksFrom;
      this.render();
    },
  });

  private seats: MenuSeat[] = [
    { name: profile().name || 'Commander', isAI: false, deckId: lastDeck(0) ?? PRESETS[0].id, bot: botName() },
    { name: 'Player 2', isAI: true, deckId: lastDeck(1) ?? PRESETS[1].id, bot: botName() },
  ];
  /** Choosing a deck: for which seat, and the page to go back to. */
  private pickSeat = 0;
  private pickFrom: MenuPage = 'quickplay';

  constructor(private root: HTMLElement) {
    try {
      const saved = localStorage.getItem(SPEED_KEY) as Speed | null;
      if (saved && saved in SPEED_FACTOR) this.speed = saved;
      this.autoConfirm = localStorage.getItem(AUTO_CONFIRM_KEY) === '1';
    } catch {
      // ignore
    }
    this.preview = document.createElement('div');
    this.preview.className = 'card-preview';
    document.body.appendChild(this.preview);
    trackLift();
    // Hovering a keyword on a card explains it.
    const tip = document.createElement('div');
    tip.className = 'kw-tip';
    document.body.appendChild(tip);
    // It shows after a short hover (not as the pointer passes over), and goes at once.
    let tipFor: HTMLElement | null = null;
    let tipTimer = 0;
    document.addEventListener('mouseover', (e) => {
      const kw = (e.target as HTMLElement).closest?.<HTMLElement>('.kw[data-kw], .kw[data-tip]');
      if (kw === tipFor) return;
      tipFor = kw;
      window.clearTimeout(tipTimer);
      tip.classList.remove('show');
      // Not where the card's explanations are already laid out beside it.
      if (!kw || this.touch || kw.closest('.zoom-card, .inspector-row, .card-preview')?.querySelector('.kw-list')) return;
      // (A keyword explains itself; a race's trait, named on the card, carries its own words.)
      const k = kw.dataset.kw ? KEYWORDS[kw.dataset.kw] : undefined;
      if (!k && !kw.dataset.tip) return;
      tipTimer = window.setTimeout(() => {
        if (tipFor !== kw || !kw.isConnected) return;
        tip.innerHTML = k ? `${keywordHtml(kw.dataset.kw!, undefined, { named: true })} ${esc(k.explain())}` : `${kw.outerHTML.replace(/ data-tip="[^"]*"/, '')} ${esc(kw.dataset.tip!)}`;
        const r = pageRect(kw);
        const page = appSize();
        tip.classList.add('show');
        const w = tip.offsetWidth, h = tip.offsetHeight;
        tip.style.left = `${Math.max(8, Math.min(page.w - w - 8, r.left + r.width / 2 - w / 2))}px`;
        tip.style.top = `${r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8}px`;
      }, KW_TIP_DELAY_MS);
    });

    // "View board": any overlay can be hidden to look at the board, then brought back.
    this.peekShield = document.createElement('div');
    this.peekShield.className = 'peek-shield';
    this.peekShield.addEventListener('click', () => this.setPeek(false));
    this.peekBtn = document.createElement('button');
    this.peekBtn.className = 'peek-toggle';
    this.peekBtn.addEventListener('click', () => this.setPeek(!this.peeking));
    document.body.append(this.peekShield, this.peekBtn);

    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    // Online, a new name reaches the room once typed (on leaving the field), so the lobby does not redraw mid-word.
    root.addEventListener('change', (e) => {
      if ((e.target as HTMLElement).dataset.seatName === '0' && this.online && this.screen === 'menu') this.online.setup(this.joinInfo());
    });
    root.addEventListener('mouseover', (e) => this.onHover(e));
    // With a mouse, hovering the hand raises it (and leaving it lowers it).
    const mouse = matchMedia('(hover: hover) and (pointer: fine)');
    root.addEventListener('mouseover', (e) => {
      if (!mouse.matches || this.touch || this.screen !== 'game' || this.drag) return;
      const over = !!(e.target as HTMLElement).closest?.('.table-view > .dock .hand-zone');
      // (The card under the pointer lifts as the hand rises, both at once.)
      // (Only raised here: it is lowered once the pointer leaves the hand's whole column, below.)
      if (over) this.raiseHand(true);
    });
    // Raised, the hand stays up while the pointer is anywhere from its cards' tops down to the screen's foot
    // (over the strip it rose out of too: lowering there brought it back under the pointer, and it jittered).
    root.addEventListener(
      'mousemove',
      (e) => {
        if (!mouse.matches || this.touch || this.drag || this.screen !== 'game') return;
        // (A hover that came while the hand couldn't rise, still being dealt or with a card in the preview pane,
        // raises it once it can: the pointer needn't leave and come back.)
        if (!this.handRaised) {
          if ((e.target as HTMLElement).closest?.('.table-view > .dock .hand-zone')) this.raiseHand(true);
          return;
        }
        const cards = [...this.root.querySelectorAll<HTMLElement>('.table-view > .dock .hand > .card')].map((c) => c.getBoundingClientRect());
        if (!cards.length) return this.raiseHand(false);
        const left = Math.min(...cards.map((r) => r.left)), right = Math.max(...cards.map((r) => r.right));
        const top = Math.min(...cards.map((r) => r.top));
        if (e.clientX < left || e.clientX > right || e.clientY < top) this.raiseHand(false);
      },
      { passive: true },
    );
    root.addEventListener('mouseleave', () => mouse.matches && !this.touch && !this.drag && this.raiseHand(false));
    root.addEventListener('mousemove', (e) => (this.mouseAt = { x: e.clientX, y: e.clientY }), { passive: true });
    root.addEventListener('pointerdown', (e) => this.onPressStart(e));
    window.addEventListener('pointermove', (e) => this.onPressMove(e));
    window.addEventListener('pointerup', () => this.onPressEnd());
    window.addEventListener('pointercancel', () => this.onPressEnd());
    // Dragging a card out of the hand plays it (see onDrag*); a tap away from a raised hand lowers it.
    root.addEventListener('pointerdown', (e) => {
      this.onDragStart(e);
      if (this.handRaised && !(e.target as HTMLElement).closest?.('.dock .hand-zone')) this.raiseHand(false);
    });
    window.addEventListener('pointermove', (e) => this.onDragMove(e));
    window.addEventListener('pointerup', (e) => this.onDragEnd(e));
    window.addEventListener('pointercancel', () => this.onDragEnd(null));
    // A swipe across the deck builder's card pool turns its page.
    let swipeFrom: { x: number; y: number } | null = null;
    root.addEventListener('pointerdown', (e) => {
      swipeFrom = e.pointerType !== 'mouse' && (e.target as HTMLElement).closest('.db-pool') ? { x: e.clientX, y: e.clientY } : null;
    });
    window.addEventListener('pointerup', (e) => {
      if (!swipeFrom) return;
      const dx = e.clientX - swipeFrom.x, dy = e.clientY - swipeFrom.y;
      swipeFrom = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) this.activeBuilder().swipe(dx);
    });
    // Right-click a card (anywhere) to read it large.
    root.addEventListener('contextmenu', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (!card) return;
      e.preventDefault();
      this.zoom(card.dataset.card!, card.closest('.tableau') ? card.dataset.uid : undefined);
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    // (A keyword column scrolled to its foot loses its arrow.)
    document.addEventListener('scroll', (e) => (e.target as HTMLElement).matches?.('.kw-wrap > .kw-list') && this.markKwMore((e.target as HTMLElement).parentElement!.parentElement!), true);
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && this.peekHeld) {
        this.peekHeld = false;
        this.setPeek(false);
      }
    });
    window.addEventListener(
      'pointerdown',
      (e) => {
        sound.unlock();
        this.touch = e.pointerType === 'touch';
      },
      { capture: true },
    );
    window.addEventListener('touchstart', () => (this.touch = true), { capture: true, passive: true });
    // Zooming the board: double-tap (or double-click) a tableau's open table to zoom onto it (again to zoom out),
    // or pinch it open (and closed again) on a touch screen.
    const half = (y: number): 'rival' | 'mine' => {
      const rival = this.root.querySelector('.tableau-rival')?.getBoundingClientRect();
      const mine = this.root.querySelector('.tableau-mine')?.getBoundingClientRect();
      if (!rival || !mine) return y < window.innerHeight / 2 ? 'rival' : 'mine';
      return Math.abs(y - (rival.top + rival.bottom) / 2) < Math.abs(y - (mine.top + mine.bottom) / 2) ? 'rival' : 'mine';
    };
    root.addEventListener('dblclick', (e) => {
      if (this.screen !== 'game' || this.sheet || (e.target as HTMLElement).closest('[data-act], .dock, .hud, .stage, .overlay')) return;
      this.setBoardZoom(this.boardZoom ? null : half(e.clientY));
    });
    let pinch: { d: number; y: number } | null = null;
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    root.addEventListener(
      'touchstart',
      (e) => {
        if (this.screen === 'game' && e.touches.length === 2) {
          pinch = { d: spread(e.touches), y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
          this.cancelPress();
        }
      },
      { passive: true },
    );
    root.addEventListener(
      'touchmove',
      (e) => {
        if (!pinch || e.touches.length !== 2) return;
        e.preventDefault();
        const ratio = spread(e.touches) / pinch.d;
        if (ratio > 1.25) this.setBoardZoom(half(pinch.y));
        else if (ratio < 0.8) this.setBoardZoom(null);
        else return;
        pinch = null;
      },
      { passive: false },
    );
    root.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinch = null;
    });
    // Re-lay out whenever the page's size settles (after a rotation the first resize event can be stale).
    window.addEventListener(VIEWPORT_EVENT, () => {
      this.fitHand();
      if (this.boardZoom && this.screen === 'game') this.fitZoom();
      sizePool(this.root);
      // (The pool's pages are cut to the rows its new height holds.)
      this.activeBuilder().afterRender();
      if (this.screen === 'campaign') this.campaign.afterRender(this.root);
    });
  }

  start() {
    backdrop.mount();
    // Signed in: take up any newer progress from another device (and reload to read it).
    onProgressReplaced(() => {
      if (this.screen === 'menu') location.reload();
    });
    const avatar = account()?.avatar;
    void checkIn().then((replaced) => {
      if (replaced && this.screen === 'menu') location.reload();
      // (An account from before pictures has just been dealt one: show it.)
      else if (account()?.avatar !== avatar && this.screen === 'menu') this.render();
    });
    // Back from signing in (the page reloads to read the account's progress): on to the hub.
    let after = false;
    try {
      after = sessionStorage.getItem('blue-loop:signed-in') === '1';
      sessionStorage.removeItem('blue-loop:signed-in');
    } catch {
      // Not available.
    }
    if (after) this.menuPage = signedIn() ? 'hub' : 'signin';
    if (after && !signedIn()) this.authMode = 'name';
    // What sign-ins the server offers (Apple, Google, password reset).
    void serverConfig().then((c) => {
      this.serverOffers = c;
      if (this.menuPage === 'signin') this.render();
    });
    // A password-reset link (?reset=TOKEN): choose a new password.
    const reset = new URLSearchParams(location.search).get('reset');
    if (reset && /^[a-f0-9]{64}$/.test(reset)) {
      this.resetToken = reset;
      this.authMode = 'reset';
      this.menuPage = 'signin';
      history.replaceState(null, '', location.pathname);
    }
    // An invite link (?room=CODE) opens the online page, ready to join.
    const invited = cleanCode(new URLSearchParams(location.search).get('room') ?? '');
    if (invited) {
      this.net.joinCode = invited;
      this.menuPage = 'online';
      // Straight into the room's lobby (or back to your seat in it, after a reload).
      if (signedIn() || hasSeat(invited)) return this.goOnline(invited);
      // New players name themselves first, then go on into the room.
      this.inviteAfterSignIn = invited;
      this.menuPage = 'signin';
    }
    this.render();
  }

  // -------------------------------------------------------------------------
  // Online 1v1
  // -------------------------------------------------------------------------

  /** Create a room (no code) or join one, with the first seat's name and deck. */
  /** Your name and deck, as the room needs them. */
  private joinInfo() {
    const seat = this.seats[0];
    const deck = deckById(seat.deckId) ?? PRESETS[0];
    return { name: profile().name || seat.name.trim() || 'Commander', deck: deck.cards, deckName: deck.name, avatar: account()?.avatar, profileId: profile().id };
  }

  private goOnline(code?: string) {
    this.leaveOnline();
    noteRecentDeck(0, this.seats[0].deckId);
    const room = code || newRoomCode();
    this.net.lobby = null;
    this.online = new OnlineClient(
      room,
      this.joinInfo(),
      {
        lobby: (seats, you, ranked) => {
          this.net.lobby = seats;
          this.net.you = you;
          this.net.ranked = ranked;
          // After a game ("play again"), both players come back to the lobby to confirm again.
          if (this.screen === 'game') {
            if (this.aiTimer !== null) window.clearTimeout(this.aiTimer);
            this.screen = 'menu';
            this.menuPage = 'online';
            this.sheet = null;
            this.pending = null;
          }
          if (this.screen === 'menu') this.render();
        },
        state: (state, you, last, waitFor, ranked) => {
          this.net.waitFor = waitFor;
          this.net.ranked = ranked;
          this.onRemoteState(state, you, last);
        },
        ranked: (r) => {
          // The ladder's word on a ranked game: what the server paid you, and where it left you.
          void refreshEconomy().then(() => {
            this.resultExtra = this.rewardLine(r.reward);
            this.render();
          });
        },
        reward: (_won, r) => {
          // An unranked online game: the server paid it into your account.
          void refreshEconomy().then(() => {
            this.resultExtra = r ? this.rewardLine(r) : '';
            this.render();
          });
        },
        presence: (rivalOnline) => {
          if (this.net.rivalOnline === rivalOnline) return;
          this.net.rivalOnline = rivalOnline;
          this.render();
        },
        error: (message) => {
          this.showToast(message, 'error');
          sound.error();
          if (/full/.test(message)) {
            this.leaveOnline();
            this.render();
          }
        },
        status: (status) => {
          this.net.status = status;
          this.render();
        },
      },
    );
    history.replaceState(null, '', inviteLink(room));
    this.render();
  }

  /** Queue for a ranked match: the ladder finds a rival within a tier of you, then both go to a room made for you. */
  /** Ranked play keeps your rank on your account: sign in (or create one) first. */
  private askSignIn() {
    this.showToast('Sign in to play ranked: your rank is kept on your account.', 'info');
    this.authMode = 'signin';
    this.authError = '';
    this.menuPage = 'signin';
    this.render();
  }

  private findRanked() {
    if (!account()) return this.askSignIn();
    this.ladder?.close();
    const p = profile();
    this.net.searching = true;
    this.ladder = new LadderClient(p.id, this.joinInfo().name, {
      queued: () => {
        this.render();
      },
      match: (room, rival) => {
        this.ladder?.close();
        this.ladder = null;
        this.net.searching = false;
        this.showToast(`Matched with ${rival.name} (${rival.rankName.toLowerCase()})`, 'info');
        this.goOnline(room);
      },
      lost: () => {
        this.ladder = null;
        this.net.searching = false;
        this.showToast("Couldn't reach the ranked ladder.", 'error');
        this.render();
      },
      signin: () => {
        this.ladder?.close();
        this.ladder = null;
        this.net.searching = false;
        this.askSignIn();
      },
    });
    this.render();
  }

  private cancelRanked() {
    this.ladder?.close();
    this.ladder = null;
    this.net.searching = false;
    this.render();
  }

  private leaveOnline() {
    this.ladder?.close();
    this.ladder = null;
    this.net.searching = false;
    this.online?.close();
    this.online = null;
    this.net.lobby = null;
    this.net.status = 'idle';
    this.net.rivalOnline = true;
    if (location.search) history.replaceState(null, '', location.pathname);
  }

  /** The room sent this player's view of the game: start it, or animate the move that changed it. */
  private onRemoteState(next: GameState, you: string, last: LastMove | null) {
    // A move still waiting to be read lands first.
    if (this.landing) this.flushLanding();
    const prev = this.state;
    const sameGame = this.screen === 'game' && prev && prev.players.every((p, i) => next.players[i]?.id === p.id) && next.turnNumber >= prev.turnNumber && !(prev.winnerId && !next.winnerId);
    if (!sameGame || !prev) {
      this.state = next;
      this.viewerId = you;
      this.revealedFor = you;
      this.viewRivalId = null;
      this.pending = null;
      this.stage = null;
      this.landing = null;
      this.sheet = null;
      this.campaignBattle = false;
      this.screen = 'game';
      this.render();
      this.dealOpening();
      this.announceTurn(400);
      return;
    }
    // A reconnect resends the same state: just show it (and, if a card still waits to be read, show it again).
    const unchanged = (prev.log[prev.log.length - 1]?.seq ?? 0) === (next.log[next.log.length - 1]?.seq ?? 0);
    if (unchanged || !last) {
      this.state = next;
      if (this.net.waitFor === 'you' && !this.stage && last?.action.type === 'playCard') this.stage = this.remoteStage(last, next);
      if (this.net.waitFor !== 'you' && this.stage?.confirm) this.stage = null;
      this.render();
      return;
    }
    const actor = prev.players.find((p) => p.id === last.actorId) ?? activePlayer(prev);
    const turnPassed = activePlayer(prev).id !== activePlayer(next).id;
    this.pending = null;
    if (this.sheet?.kind === 'card') this.sheet = null;
    this.stage = null;
    if (actor.id !== you && last.action.type === 'playCard') this.stage = this.remoteStage(last, next);
    else if (actor.id === you) this.stage = this.ownStage(actor, last.action);
    const sprung = this.sprungLightspeed(prev, next);
    if (sprung) this.stage = sprung;
    const land = () => {
      const before = snapshot(this.root);
      if (this.stage?.own) this.stage = null;
      if (last.action.type !== 'setTarget') backdrop.spin();
      this.state = next;
      if (isGameOver(next) && !isGameOver(prev)) this.holdResult(next, last.action);
      this.render();
      this.surfaceLog(prev);
      this.animate(prev, next, last.action, actor, before);
      this.announcePhases(actor, next, turnPassed);
    };
    // The rival's card takes effect once the viewer has read it and said OK.
    if (this.stage?.confirm && !isGameOver(next)) {
      this.landing = land;
      this.render();
      this.stageEntrance(actor.id);
      return;
    }
    // The viewer's own card hangs in the preview pane until the rival has read it.
    if (this.stage?.own) return this.holdOwn(land);
    // An attack lands as the attacker strikes.
    if (last.action.type === 'attack' && this.lunge(prev, last.action)) this.landAtStrike(land);
    else land();
  }

  /** A move whose attack lands the moment the attacker strikes (its numbers change as it hits), while the card flies back. */
  private landAtStrike(land: () => void) {
    this.landing = land;
    window.setTimeout(() => {
      if (this.landing !== land) return;
      this.flushLanding();
      // (The redrawn attacker stays hidden until the flying copy is back in its slot.)
      if (this.lunging) this.root.querySelector<HTMLElement>(`.tableau [data-uid="${this.lunging}"]`)?.style.setProperty('visibility', 'hidden');
    }, Math.round(LUNGE_MS * LUNGE_HIT));
  }


  /** The rival's card just played, online, on the stage (to confirm, if the room is waiting on you to read it). */
  private remoteStage(last: LastMove, state: GameState): Stage | null {
    const actor = state.players.find((p) => p.id === last.actorId);
    if (!actor) return null;
    const confirm = this.net.waitFor === 'you';
    if (last.faceDown) return { defId: 'null_field', actorId: actor.id, faceDown: true, caption: `${actor.name.toLowerCase()} sets a card face down`, confirm };
    if (last.played) return { defId: last.played, actorId: actor.id, confirm, option: last.action.type === 'playCard' ? last.action.choice : undefined, target: last.action.type === 'playCard' ? last.action.enemyUid : undefined };
    return null;
  }

  /** A rival's card arriving on the stage to be read: it flies in from their side of the board, with a sound. */
  private stageEntrance(actorId: string) {
    sound.play();
    this.entranceHeard = true;
    // Auto-confirm: the card is shown for a moment, then lands by itself.
    const stage = this.stage;
    // (A card set face down needs no reading: there is nothing to read. It confirms itself after a moment.)
    if ((this.autoConfirm || stage?.faceDown) && stage?.confirm) window.setTimeout(() => this.stage === stage && this.confirmStage(), stage.faceDown ? 1100 : AUTO_CONFIRM_MS);
    const card = this.root.querySelector<HTMLElement>('.stage .card');
    const side = this.root.querySelector<HTMLElement>(`.tableau[data-owner="${actorId}"] .tableau-row`) ?? this.root.querySelector<HTMLElement>(`[data-anchor="pill:${actorId}"]`);
    if (card && side) {
      // From the middle of their row (at a card's size), sweeping up and over to the stage.
      const row = pageRect(side);
      const w = Math.min(row.height / 1.4, card.offsetWidth), h = w * 1.4;
      const from = new DOMRect(row.left + row.width / 2 - w / 2, row.top + row.height / 2 - h / 2, w, h);
      flyFrom(card, from, { duration: 640, fade: true, arc: Math.min(140, Math.abs(pageRect(card).top - from.top) * 0.35 + 60) });
    }
    // A removal card aims at what it will take, until it is confirmed (or the stage moves on).
    this.unaim?.();
    this.unaim = null;
    const target = stage?.target;
    if (target && stage?.confirm) {
      const rect = (sel: string) => {
        const el = this.root.querySelector(sel);
        return el ? pageRect(el) : null;
      };
      // (Heat aimed at a card is an attack, in red; a removal is white.)
      const removal = (cardDef(stage.defId).onPlay ?? []).some((e) => e.type === 'destroy' || e.type === 'bounce');
      this.unaim = aim(() => rect('.stage .card'), () => targetRect(this.root.querySelector(`.tableau [data-uid="${target}"]`)), { delay: 640, alive: () => this.stage === stage, kind: removal ? 'plain' : 'attack' });
    }
  }

  /** Takes away a staged card's aim (see stageEntrance). */
  private unaim: (() => void) | null = null;
  /** The card a confirmed stage was aimed at (its beam already shown), for the move as it lands. */
  private aimShown: string | null = null;

  /**
   * Leaving a menu page: the button pressed lifts up and fades (a quick rise that eases off), the rest of
   * the page drifts up after it, and the star spins faster, as it does on the board when a move is made.
   */
  /** The fades of the page being left (held at their end until the next page is drawn, then cleared). */
  private menuFades: Animation[] = [];

  private leaveMenu(el: HTMLElement) {
    this.menuLeaving = true;
    backdrop.spin();
    backdrop.spin();
    const ease = 'cubic-bezier(.1,.75,.3,1)';
    const button = el.closest<HTMLElement>('.hub-col') ?? el;
    this.menuFades.push(
      button.animate(
        [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(-34px)' },
        ],
        { duration: MENU_LEAVE_MS, easing: ease, fill: 'forwards' },
      ),
    );
    this.menuParts().forEach((part, i) => {
      if (part === button || part.contains(button)) return;
      this.menuFades.push(
        part.animate(
          [
            { opacity: 1, transform: 'translateY(0)' },
            { opacity: 0, transform: 'translateY(-14px)' },
          ],
          { duration: MENU_LEAVE_MS - 40, delay: Math.min(60, i * 15), easing: ease, fill: 'forwards' },
        ),
      );
    });
  }

  /** A new menu page rises gently into place, a part at a time. */
  private enterMenu() {
    if (reducedMotion()) return;
    this.menuParts().forEach((part, i) =>
      part.animate(
        [
          { opacity: 0, transform: 'translateY(16px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 420, delay: i * 45, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
      ),
    );
  }

  /** The parts of a menu page that move as one (each hub tile on its own). */
  private menuParts(): HTMLElement[] {
    const menu = this.root.querySelector<HTMLElement>('.menu');
    if (!menu) return [];
    const parts: HTMLElement[] = [];
    for (const child of menu.children) {
      if (!(child instanceof HTMLElement) || child.matches('.petals, .overlay')) continue;
      const tiles = child.matches('.hub') ? [...child.querySelectorAll<HTMLElement>(':scope > .hub-col')] : [];
      const stack = child.matches('.menu-stack') ? [...child.children].filter((c): c is HTMLElement => c instanceof HTMLElement) : [];
      parts.push(...(tiles.length ? tiles : stack.length ? stack : [child]));
    }
    return parts;
  }

  /** Whether a card in hand could be played now (energy, room in the tableau, a free Lightspeed slot). */
  private canPlayNow(me: PlayerState, defId: string): boolean {
    return (cardCost(defId) <= me.playsLeft && hasRoomFor(me, defId) && (cardDef(defId).kind !== 'lightspeed' || canSetLightspeed(me))) || canSetFaceDown(me, defId);
  }

  /** End the day, checking first if there are still cards that could be played. */
  private requestEndDay() {
    const s = this.state;
    if (!s || !this.canAct() || this.pending) return;
    if (this.leftUndone().length && this.sheet?.kind !== 'end-day') {
      this.sheet = { kind: 'end-day' };
      return this.render();
    }
    this.finishDay();
  }

  /**
   * With nothing left that the viewer can do today (no card they can play, no attack, no Hero ability), the day
   * ends by itself, once the board has settled (no choice open, no card in the preview pane, no banner showing).
   */
  private autoEndTimer = 0;
  private scheduleAutoEnd() {
    window.clearTimeout(this.autoEndTimer);
    if (!this.canAutoEnd()) return;
    this.autoEndTimer = window.setTimeout(() => {
      if (!this.canAutoEnd()) return;
      if (Date.now() < this.bannerFree || this.root.querySelector('.turn-banner')) return this.scheduleAutoEnd();
      this.finishDay();
    }, AUTO_END_MS);
  }
  private canAutoEnd(): boolean {
    const s = this.state;
    return this.screen === 'game' && !!s && !isGameOver(s) && this.canAct() && !this.pending && !this.stage && !this.sheet && !this.heroPanel && !this.drag && this.leftUndone().length === 0;
  }

  /** End the day: over the hand limit, the viewer first picks the cards to discard. */
  private finishDay() {
    const me = activePlayer(this.state!);
    if (me.hand.length > BALANCE.maxHand) {
      this.sheet = { kind: 'discard', picked: [] };
      return this.render();
    }
    this.sheet = null;
    this.dispatch({ type: 'endTurn' });
  }

  /** What the viewer could still do today (asked about before the day ends): cards to play, attacks, their Hero's ability. */
  private leftUndone(): string[] {
    const s = this.state!;
    const me = activePlayer(s);
    const out: string[] = [];
    const playable = me.hand.filter((c) => this.canPlayNow(me, c.defId)).length;
    if (playable) out.push(`${playable} playable card${playable === 1 ? '' : 's'}`);
    const { cards, sun } = aimChoices(s, me);
    const attackers = sun || cards.length ? me.tableau.filter((c) => !c.dimmed && cardAttack(s, me, c) > 0).length : 0;
    if (attackers) out.push(`${attackers} card${attackers === 1 ? '' : 's'} that can still attack`);
    const hero = commandCard(me);
    if (hero && (cardDef(hero.defId).abilities ?? []).some((_, i) => !heroAbilityProblem(s, me, i))) out.push(`${cardDef(hero.defId).name}'s ability`);
    return out;
  }

  /** The viewer has read the rival's card on the stage: it goes, and the rival carries on. */
  /** Clicks are ignored until then (just after the stage's OK, so a tap can't land on the board beneath it). */
  private clickShieldUntil = 0;

  private confirmStage() {
    if (!this.stage?.confirm) return;
    this.clickShieldUntil = Date.now() + 400;
    // Its aim was shown while it waited: as it lands, no second beam goes to the same card.
    this.aimShown = this.stage.target ?? null;
    this.stage = null;
    this.unaim?.();
    this.unaim = null;
    sound.click();
    if (this.online) {
      this.net.waitFor = null;
      this.online.ack();
    }
    // Now the card takes effect.
    if (this.landing) return this.flushLanding();
    this.render();
    if (!this.online) this.scheduleAI(450);
  }

  /** Play out a move that was waiting for its card to be read. */
  private flushLanding() {
    const land = this.landing;
    this.landing = null;
    land?.();
  }

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------

  private newGame() {
    const players: PlayerSetup[] = this.seats
      .map((s, i) => {
        const deck = deckById(s.deckId) ?? PRESETS[i];
        noteRecentDeck(i, deck.id);
        const name = s.isAI ? s.bot : i === 0 ? profile().name || s.name : s.name;
        // Your own picture is your account's; anyone else's is dealt by their name.
        const avatar = (!s.isAI && i === 0 ? account()?.avatar : undefined) ?? pictureFor(name.trim() || 'Unnamed');
        return { name: name.trim() || 'Unnamed', isAI: s.isAI, deck: deck.cards, deckName: deck.name, avatar };
      });
    this.begin(createGame({ seed: (Math.random() * 2 ** 31) | 0, players }));
  }

  private continueGame() {
    const saved = loadSave();
    if (saved) this.begin(saved);
  }

  /** Which server game a saved game against the AI is (so a continued game can still claim its reward). */
  private rememberAiGame(id: string | null) {
    try {
      if (id) localStorage.setItem(AI_GAME_KEY, id);
      else localStorage.removeItem(AI_GAME_KEY);
    } catch {
      // Not available.
    }
  }

  private begin(state: GameState) {
    this.boardZoom = null;
    this.gamesBegun++;
    // A game against the AI: a new one is noted by the server (for its reward); a continued one keeps its id.
    const humans = state.players.filter((p) => !p.isAI).length;
    if (humans === 1 && !state.winnerId) {
      if (state.turnNumber <= 1) {
        this.aiGameId = null;
        this.rememberAiGame(null);
        const begun = this.gamesBegun;
        void startAiGame().then((id) => {
          if (begun !== this.gamesBegun) return;
          this.aiGameId = id;
          this.rememberAiGame(id);
        });
      } else {
        try {
          this.aiGameId = localStorage.getItem(AI_GAME_KEY);
        } catch {
          this.aiGameId = null;
        }
      }
    } else this.aiGameId = null;
    // A fresh game on this device is summed up as it is played (online, the room does it).
    this.statsRec = state.turnNumber <= 1 && !state.winnerId && humans > 0 ? beginStats(state, this.campaignBattle ? 'campaign' : humans === 1 ? 'ai' : 'hotseat') : null;
    this.state = state;
    this.revealedFor = null;
    this.viewerId = null;
    this.viewRivalId = null;
    this.pending = null;
    this.stage = null;
    this.landing = null;
    this.sheet = null;
    this.screen = 'game';
    this.persist(state);
    this.syncViewer();
    this.render();
    this.dealOpening();
    this.announceTurn(400);
    this.scheduleAI(900);
  }

  /**
   * "Dawn" banner: a soft bloom across the middle of the screen whenever
   * play comes back to a human who can see their hand. Lives outside the
   * re-rendered root so it survives state changes.
   */
  private announceTurn(delay = 0) {
    const s = this.state;
    if (!s || isGameOver(s) || this.needsHandoff()) return;
    const p = activePlayer(s);
    if (p.isAI || p.id !== this.viewer().id) return;
    this.showBanner('day', `round ${roman(s.round)}`, delay, 'game', () => this.setPhase('day'), this.orbitLine(s, p));
  }

  /** For the day's banner: the planet facing the player's sun today, and what it gives (a card drawn, or energy). */
  private orbitLine(s: GameState, p: PlayerState): string {
    const planet = currentPlanet(p, s);
    const gives =
      planet === 'abundant'
        ? `<i class="tb-gift" title="Draw ${BALANCE.abundantDraw} more at dawn">${HAND_ICON}+${BALANCE.abundantDraw}</i>`
        : planet === 'industrial'
          ? `<i class="tb-gift" title="${BALANCE.industrialPlays} more energy today"><b class="tb-energy"></b>+${BALANCE.industrialPlays}</i>`
          : '';
    return `<div class="turn-banner-orbit">${planet} orbit${gives}</div>`;
  }

  /**
   * Each day runs dawn, day, dusk, each with its banner: as a day ends, "dusk" (the dusk's effects), then the
   * next player's "dawn" (their dawn effects play out), then their "day" once the dawn
   * has played out. The viewer's own read plainly ("dawn"); everyone else's carry their name.
   */
  private announcePhases(actor: PlayerState, next: GameState, turnPassed: boolean, animate = true) {
    if (isGameOver(next) || this.needsHandoff()) return;
    const you = this.viewer().id;
    const named = (p: PlayerState, phase: string) => (p.id === you ? phase : `${p.name.toLowerCase()}'s ${phase}`);
    const round = `round ${roman(next.round)}`;
    const now = activePlayer(next);
    // A dusk or dawn in which nothing happened (and nothing is asked) is passed over, banner and all.
    if (turnPassed) {
      if (this.duskHappened(next, actor)) this.showBanner(named(actor, 'dusk'), `day ${next.turnNumber - 1}`, 0, 'game', () => this.setPhase('dusk'));
      if (this.dawnHappened(next, now)) this.showBanner(named(now, 'dawn'), round, 0, 'game', () => this.setPhase('dawn'));
    }
    // The day begins once the dawn has played out.
    if (turnPassed) {
      const replay = animate ? this.replayLength(next) / SPEED_FACTOR[this.speed] : 0;
      this.showBanner(named(now, 'day'), round, Math.max(0, replay - 600), 'game', () => this.setPhase('day'), this.orbitLine(next, now));
    }
  }

  /** Whether this player's day just ended with a dusk that did something (their dusk effects resolved). */
  private duskHappened(next: GameState, actor: PlayerState): boolean {
    // Back through the log to the day before this one's start: a "— Dusk" line for them in between.
    let days = 0;
    for (let i = next.log.length - 1; i >= 0 && days < 2; i--) {
      const t = next.log[i].text;
      if (t.startsWith('— Day ')) days++;
      else if (days === 1 && t === `— Dusk: ${actor.name}.`) return true;
    }
    return false;
  }

  /** Whether this player's dawn did something (its effects, or the table's, played out on the board). */
  private dawnHappened(next: GameState, now: PlayerState): boolean {
    return (next.turnPulses ?? []).some((p) => p.kind !== 'start' && (p.source === now.id || !p.uid));
  }

  /** The phase of the day under way (shown by the phase tracker, middle right). */
  private phase: 'dawn' | 'day' | 'dusk' = 'day';

  private setPhase(phase: 'dawn' | 'day' | 'dusk') {
    this.phase = phase;
    this.root.querySelectorAll<HTMLElement>('.phase-track [data-phase]').forEach((el) => el.classList.toggle('on', el.dataset.phase === phase));
  }

  /** Beside the Stellari in the board's middle: whose turn it is on its left (the rival above you, the one whose turn
   *  it isn't greyed), and dawn, day and dusk on its right (the phase under way lit, the others grey). */
  private renderPhaseTrack(): string {
    const s = this.state!;
    if (isGameOver(s)) return '';
    const mine = activePlayer(s).id === this.viewer().id;
    const who = `<div class="turn-who" title="${mine ? 'Your turn' : "Your opponent's turn"}"><span class="${mine ? '' : 'on'}">opponent</span><span class="${mine ? 'on' : ''}">you</span></div>`;
    const phases = `<div class="phase-track" title="Dawn, then day, then dusk">${(['dawn', 'day', 'dusk'] as const).map((k) => `<div class="phase-step ${this.phase === k ? 'on' : ''}" data-phase="${k}"><i></i><span>${k}</span></div>`).join('')}</div>`;
    return who + phases;
  }

  /** When the next banner may show (each gets its moment: dusk, dawn and day follow one another). */
  private bannerFree = 0;

  /** Large centred announcement (bloom, sweep, chord), outside the re-rendered root. */
  private showBanner(text: string, sub: string, delay = 0, screen: Screen = 'game', onShow?: () => void, extra = '') {
    const at = Math.max(Date.now() + delay, this.bannerFree);
    this.bannerFree = at + BANNER_GAP_MS;
    delay = at - Date.now();
    window.setTimeout(() => {
      if (this.screen !== screen) return; // left the screen before it showed
      onShow?.();
      document.querySelectorAll('.turn-banner').forEach((b) => b.remove());
      const el = document.createElement('div');
      el.className = `turn-banner ${text.length > 12 ? 'turn-banner-long' : ''}`;
      el.innerHTML = `<div class="turn-banner-glow"></div><div class="turn-banner-text">${esc(text)}</div><div class="turn-banner-sub">${esc(sub.toLowerCase())}</div>${extra ? `<div class="turn-banner-line"></div>${extra}` : ''}`;
      document.body.appendChild(el);
      sound.turn();
      window.setTimeout(() => el.remove(), 2000);
    }, delay);
  }

  /** Opening hand: shuffle, then deal the viewer's cards in one by one. */
  private dealOpening() {
    sound.shuffle();
    const cards = this.root.querySelectorAll<HTMLElement>('.hand [data-uid]');
    // (The hand can't be raised while it is being dealt.)
    this.raiseHand(false);
    this.dealtAt = performance.now() + 350 + cards.length * DEAL_STEP_MS + 520;
    // (A mouse resting on the hand as the deal ends raises it then.)
    window.setTimeout(() => {
      const at = this.mouseAt;
      if (!at || this.touch || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      if (document.elementFromPoint(at.x, at.y)?.closest('.table-view > .dock .hand-zone')) this.raiseHand(true);
    }, this.dealtAt - performance.now() + 20);
    cards.forEach((el, i) => {
      this.dealCard(el, 350 + i * DEAL_STEP_MS);
      sound.draw(0.35 + (i * DEAL_STEP_MS) / 1000);
    });
  }

  /**
   * Draw a card: it starts on your deck pile (on the board, beside your
   * tableau) and flies to its place in the fan.
   */
  private dealCard(el: HTMLElement, delay: number) {
    if (reducedMotion()) return;
    for (const a of el.getAnimations()) a.cancel();
    // The deck lies on the board, by your tableau: the card flies from it to its place in the fan.
    const pile = this.root.querySelector<HTMLElement>('[data-anchor="deck"]');
    if (pile) flyFrom(el, pageRect(pile), { delay, duration: 520, fade: true });
  }

  /** Slide a card that stayed in hand from its old place in the fan to its new one. */
  private refan(el: HTMLElement, oldHtml: string) {
    if (reducedMotion()) return;
    const num = (re: RegExp) => Number(re.exec(oldHtml)?.[1] ?? NaN);
    const oldLeft = num(/left:\s*(-?[\d.]+)px/);
    const oldRot = num(/--fr:\s*(-?[\d.]+)deg/);
    const oldFy = num(/--fy:\s*(-?[\d.]+)px/);
    const newLeft = parseFloat(el.style.left);
    if (!Number.isFinite(oldLeft) || !Number.isFinite(newLeft) || Math.abs(oldLeft - newLeft) < 1) return;
    const rest = getComputedStyle(el).transform;
    // (A Command card is held on its side: it stays so as it slides.)
    const side = parseFloat(getComputedStyle(el).getPropertyValue('--side')) || 0;
    el.animate(
      [
        { transform: `translate(${oldLeft - newLeft}px, ${Number.isFinite(oldFy) ? oldFy : 0}px) rotate(${(Number.isFinite(oldRot) ? oldRot : 0) + side}deg)` },
        { transform: rest === 'none' ? 'none' : rest },
      ],
      { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }

  private syncViewer() {
    const s = this.state;
    if (!s || this.online) return;
    const active = activePlayer(s);
    if (!active.isAI) this.viewerId = active.id;
  }

  private dispatch(action: Action, animate = true) {
    // A move still waiting to be read lands first.
    if (this.landing) this.flushLanding();
    const prev = this.state;
    if (!prev) return;
    // Online, the room plays the move and sends back the result.
    if (this.online) {
      this.online.act(action);
      // (Your card goes straight to the pane while the room plays it.)
      if (action.type === 'playCard') this.stage = this.ownStage(activePlayer(prev), action);
      this.pending = null;
      this.render();
      return;
    }
    const actor = activePlayer(prev);
    let next: GameState;
    try {
      next = applyAction(prev, action);
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
      this.showToast(err.message, 'error');
      sound.error();
      return;
    }
    if (this.statsRec) noteMove(this.statsRec, prev, next, action);
    const turnPassed = activePlayer(prev).id !== activePlayer(next).id;
    this.pending = null;
    if (this.sheet?.kind === 'card') this.sheet = null;
    this.stage = actor.isAI ? this.stageFor(actor, action) : this.ownStage(actor, action);
    // With someone watching, an AI's card waits on the stage until they have read it.
    if (this.stage && !this.stage.own && animate && !isGameOver(next) && next.players.some((p) => !p.isAI)) this.stage.confirm = true;
    const sprung = this.sprungLightspeed(prev, next);
    if (sprung) this.stage = sprung;
    const land = () => {
      const before = animate ? snapshot(this.root) : null;
      // (The viewer's own card leaves the pane for the board as the move lands.)
      if (this.stage?.own) this.stage = null;
      if (animate && action.type !== 'setTarget') backdrop.spin();
      this.state = next;
      // An AI's attacks bring its target's tableau onto the table.
      if (actor.isAI && action.type === 'setTarget' && action.targetId !== this.viewer().id) this.viewRivalId = action.targetId;
      this.persist(next);
      this.syncViewer();
      if (isGameOver(next) && !isGameOver(prev)) this.holdResult(next, animate ? action : { type: 'concede', playerId: '' });
      // A sun this move sends supernova stays drawn alive until its explosion has played (see supernovaAt).
      if (before && !reducedMotion())
        for (const p of next.players) {
          if (!p.eliminated || prev.players.find((x) => x.id === p.id)?.eliminated) continue;
          this.dying.add(p.id);
          // (Should the explosion never come, e.g. the replay was cut short, it still greys in time.)
          window.setTimeout(() => this.finishDying(p.id), 8000);
        }
      this.render();
      if (before) {
        this.surfaceLog(prev);
        this.animate(prev, next, action, actor, before);
      }
      this.announcePhases(actor, next, turnPassed, animate);
      // The AI waits for its dawn to play out before it acts.
      this.scheduleAI(AI_PAUSE[action.type] + (action.type === 'endTurn' && animate ? this.replayLength(next) / SPEED_FACTOR[this.speed] : 0));
    };
    // A card waiting to be read takes effect once the viewer says OK.
    if (this.stage?.confirm) {
      this.landing = land;
      this.render();
      this.stageEntrance(actor.id);
      return;
    }
    // The viewer's own card hangs in the preview pane a moment before it lands.
    if (this.stage?.own && animate) return this.holdOwn(land);
    // An attack lands the moment the attacker strikes.
    if (action.type === 'attack' && animate && (this.render(), this.lunge(prev, action))) return this.landAtStrike(land);
    land();
  }

  /**
   * A card attacking: it lifts off the table, tilts back, and smashes into the card it attacks (or the
   * rival's sun), which shudders as it lands; then it settles back into its slot. (Unlike heat, which flies
   * from a card as a flare, the card itself goes.) Returns false when there is nothing to animate.
   */
  private lunge(prev: GameState, action: Extract<Action, { type: 'attack' }>): boolean {
    if (reducedMotion()) return false;
    const el = this.root.querySelector<HTMLElement>(`.tableau [data-uid="${action.attackerUid}"]`);
    const owner = prev.players.find((p) => p.tableau.some((c) => c.uid === action.attackerUid));
    const rival = owner ? targetOf(prev, owner) : undefined;
    const target = action.targetUid
      ? this.root.querySelector<HTMLElement>(`.tableau [data-uid="${action.targetUid}"]`)
      : rival
        ? this.root.querySelector<HTMLElement>(`[data-anchor="player:${rival.id}"] .vit`) ?? this.root.querySelector<HTMLElement>(`[data-anchor="player:${rival.id}"]`)
        : null;
    if (!el || !target) return false;
    const from = pageRect(el);
    const to = pageRect(target);
    // A copy of the card flies over everything (the board's rows would clip the card itself), the card
    // itself hidden meanwhile: lifted, tilted back, then into the target just short of its centre.
    const cs = getComputedStyle(el);
    const ghost = el.cloneNode(true) as HTMLElement;
    const w = el.offsetWidth, h = el.offsetHeight;
    const k0 = Math.min(from.width / (w || 1), from.height / (h || 1));
    ghost.removeAttribute('data-uid');
    ghost.classList.add('lunge-ghost');
    // (Its sizes are worked out from the card's width: give it that, in pixels.)
    ghost.style.setProperty('--cw', `${w}px`);
    ghost.style.setProperty('--tcw', `${w}px`);
    ghost.style.setProperty('--kc', cs.getPropertyValue('--kc'));
    // In a holder of the card's own size (its padding is a share of its container's width).
    const holder = document.createElement('div');
    Object.assign(holder.style, { position: 'fixed', left: `${from.left + from.width / 2 - w / 2}px`, top: `${from.top + from.height / 2 - h / 2}px`, width: `${w}px`, height: `${h}px`, zIndex: '9000', pointerEvents: 'none' });
    Object.assign(ghost.style, { position: 'absolute', left: '0', top: '0', width: `${w}px`, height: `${h}px`, margin: '0', visibility: 'visible' });
    holder.appendChild(ghost);
    document.body.appendChild(holder);
    el.style.visibility = 'hidden';
    const dx = (to.left + to.width / 2 - (from.left + from.width / 2)) * 0.82;
    const dy = (to.top + to.height / 2 - (from.top + from.height / 2)) * 0.82;
    const side = dx >= 0 ? 1 : -1;
    const lift = Math.max(18, h * 0.18);
    const k = ghost.animate(
      [
        { transform: `translate(0, 0) scale(${k0})`, boxShadow: '0 4px 10px rgba(40, 44, 60, 0.15)', offset: 0 },
        { transform: `translate(${-side * 8}px, ${-lift}px) rotate(${-side * 10}deg) scale(${k0 * 1.16})`, boxShadow: '0 26px 40px rgba(40, 44, 60, 0.35)', offset: 0.3, easing: 'cubic-bezier(.55,0,.95,.45)' },
        { transform: `translate(${dx}px, ${dy}px) rotate(${side * 8}deg) scale(${k0 * 1.08})`, boxShadow: '0 10px 18px rgba(40, 44, 60, 0.3)', offset: 0.58 },
        { transform: `translate(${dx * 0.9}px, ${dy * 0.9}px) rotate(${side * 3}deg) scale(${k0 * 1.06})`, offset: 0.66, easing: 'cubic-bezier(.3,.7,.3,1)' },
        { transform: `translate(0, 0) scale(${k0})`, boxShadow: '0 4px 10px rgba(40, 44, 60, 0.15)', offset: 1 },
      ],
      { duration: LUNGE_MS, easing: 'linear', fill: 'forwards' },
    );
    this.lunging = action.attackerUid;
    k.onfinish = k.oncancel = () => {
      holder.remove();
      el.style.visibility = '';
      if (this.lunging === action.attackerUid) this.lunging = null;
      this.root.querySelector<HTMLElement>(`.tableau [data-uid="${action.attackerUid}"]`)?.style.removeProperty('visibility');
    };
    // The blow: the target shudders, with a crash.
    window.setTimeout(() => {
      sound.impact(true);
      target.animate(
        [{ transform: 'translate(0, 0)' }, { transform: 'translate(-5px, 2px)' }, { transform: 'translate(4px, -2px)' }, { transform: 'translate(-2px, 1px)' }, { transform: 'translate(0, 0)' }],
        { duration: 320, composite: 'add' },
      );
      pulse(target, 'hit-flash');
    }, Math.round(LUNGE_MS * LUNGE_HIT));
    return true;
  }

  private quitToMenu() {
    this.entranceHeard = false;
    this.unaim?.();
    this.unaim = null;
    this.landing = null;
    this.leaveOnline();
    this.campaignBattle = false;
    this.screen = 'menu';
    this.menuPage = 'hub';
    this.pending = null;
    this.sheet = null;
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer);
    this.aiTimer = null;
    this.render();
  }

  /** Autosave: a campaign battle is saved inside its campaign; a normal game on its own. */
  private persist(state: GameState) {
    if (this.online) return; // the room keeps online games
    // Over: its anonymous summary goes off (once).
    if (this.statsRec && isGameOver(state)) {
      sendGameStats(finishStats(this.statsRec, state));
      this.statsRec = null;
    }
    if (this.campaignBattle) this.campaign.saveBattle(state);
    else if (isGameOver(state)) clearSave();
    else save(state);
  }

  /** Leave a campaign battle: hand the result (or the battle to auto-resolve) back to the map. */
  private returnToCampaign(auto: boolean) {
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer);
    this.aiTimer = null;
    this.campaignBattle = false;
    this.screen = 'campaign';
    this.sheet = null;
    this.pending = null;
    this.campaign.finishBattle(this.state!, auto);
    this.render();
  }

  /** The viewer's own card, just played: it hangs in the preview pane (see holdOwn) before it lands. */
  private ownStage(actor: PlayerState, action: Action): Stage | null {
    if (action.type !== 'playCard') return null;
    const card = actor.hand.find((c) => c.uid === action.cardUid);
    if (!card) return null;
    const faceDown = !!action.faceDown || cardDef(card.defId).kind === 'lightspeed';
    return { defId: card.defId, uid: card.uid, actorId: actor.id, own: true, caption: faceDown ? 'you set it face down' : 'you play', option: action.choice, target: action.enemyUid ?? action.aimUid };
  }

  /** The viewer's own card hangs in the pane until the rival has read it (online), or a moment against the AI; then it lands. */
  private holdOwn(land: () => void) {
    this.landing = land;
    this.render();
    const since = Date.now();
    const check = () => {
      if (this.landing !== land) return;
      if (Date.now() - since < OWN_HOLD_MS || (this.online && this.net.waitFor === 'rival')) return void window.setTimeout(check, 150);
      this.flushLanding();
    };
    window.setTimeout(check, 150);
  }

  private stageFor(actor: PlayerState, action: Action): Stage | null {
    if (action.type !== 'playCard') return null;
    const card = actor.hand.find((c) => c.uid === action.cardUid);
    if (!card) return null;
    if (cardDef(card.defId).kind === 'lightspeed' || action.faceDown) return { defId: card.defId, actorId: actor.id, faceDown: true, caption: `${actor.name.toLowerCase()} sets a card face down` };
    return { defId: card.defId, actorId: actor.id, option: action.choice, target: action.enemyUid ?? action.aimUid };
  }

  /** A Lightspeed card that just sprang (revealed from face down into its owner's discard pile), announced for everyone. */
  private sprungLightspeed(prev: GameState, next: GameState): Stage | null {
    for (const was of prev.players) {
      const card = was.lightspeed;
      const now = next.players.find((p) => p.id === was.id)!;
      if (!card || now.lightspeed || now.eliminated) continue;
      // What sprang it: the enemy card it answers (the card played, the heat's card, or the removal).
      const why = [...(next.sprung ?? [])].reverse().find((x) => x.ownerId === now.id);
      // A rival's face-down card is hidden (online): the record of what sprang says what it was (it is now on
      // top of their discard pile, or in their tableau for a Lightspeed guard).
      const defId = why?.defId ?? now.discard[now.discard.length - 1]?.defId ?? card.defId;
      // (Announced by a small tag above the card in the preview pane: a banner across the screen hid what happened.)
      sound.flare();
      const stage: Stage = { defId, actorId: now.id, caption: `⚡ ${now.name.toLowerCase()} springs`, against: why?.against };
      // It shows for a few seconds, then fades away by itself (not lingering until someone acts).
      window.setTimeout(() => {
        if (this.stage !== stage) return;
        this.stage = null;
        const el = this.root.querySelector<HTMLElement>('.stage-sprung');
        if (!el) return;
        el.classList.add('stage-out');
        window.setTimeout(() => el.remove(), 400);
      }, stage.against ? 5000 : 3500);
      return stage;
    }
    return null;
  }

  private scheduleAI(pause: number) {
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer);
    this.aiTimer = null;
    const s = this.state;
    if (this.screen !== 'game' || !s || isGameOver(s) || !activePlayer(s).isAI) return;
    // A card of the AI's is still waiting to be read.
    if (this.stage?.confirm) return;
    this.aiTimer = window.setTimeout(() => {
      this.aiTimer = null;
      if (this.state === s) this.dispatch(chooseAIAction(s));
    }, pause * SPEED_FACTOR[this.speed]);
  }

  /** Resolve the rest of the AI days instantly, up to the next human turn. */
  private skipAI() {
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer);
    this.aiTimer = null;
    // A card still waiting to be read takes effect first.
    if (this.landing) {
      const land = this.landing;
      this.landing = null;
      this.stage = null;
      land();
      if (this.aiTimer !== null) window.clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    let s = this.state!;
    let guard = 0;
    while (!isGameOver(s) && activePlayer(s).isAI && guard++ < 5000) {
      const action = chooseAIAction(s);
      const next = applyAction(s, action);
      if (this.statsRec) noteMove(this.statsRec, s, next, action);
      s = next;
    }
    this.state = s;
    this.stage = null;
    this.sheet = null;
    this.persist(s);
    this.syncViewer();
    this.render();
    this.announceTurn();
  }

  // -------------------------------------------------------------------------
  // Effects: animation + sound, derived from what changed
  // -------------------------------------------------------------------------

  private animate(prev: GameState, next: GameState, action: Action, actor: PlayerState, before: Snapshot) {
    const root = this.root;
    const viewer = this.viewer();
    const vNext = next.players.find((p) => p.id === viewer.id)!;
    const vPrev = prev.players.find((p) => p.id === viewer.id)!;
    // A player's sun on the board (or, for a rival not on the board, their pill).
    const orb = (id: string) => root.querySelector(`[data-anchor="player:${id}"]`) ?? root.querySelector(`[data-anchor="pill:${id}"]`);
    const orbRect = (id: string) => anchorRect(root, `player:${id}`) ?? before.anchors.get(`player:${id}`) ?? anchorRect(root, `pill:${id}`);
    // Where a sun is on screen: the middle of the sun as drawn on the tilted board (its heat count stands
    // there), not the middle of its gauge's box (which the dome, seen in perspective, sits off).
    const sunAt = (id: string) => sunRect(root, id) ?? orbRect(id);
    // The card just played, where it stands (it may still be flying in): attacks start from it.
    const playedFrom = action.type === 'playCard' ? () => {
      const src = this.root.querySelector(`.tableau [data-uid="${action.cardUid}"]`) ?? this.root.querySelector('.stage .card');
      return src ? pageRect(src) : orbRect(actor.id);
    } : null;
    const playedDef = action.type === 'playCard' ? cardDef(prev.players.find((p) => p.id === actor.id)!.hand.find((c) => c.uid === action.cardUid)?.defId ?? '') : null;

    // --- Card movement -----------------------------------------------------
    const inHand = new Set(vNext.hand.map((c) => c.uid));
    // A day's start replays its effects.
    const endingTurn = action.type === 'endTurn';
    let drawIndex = 0;

    // Removal: a glowing arc from the removing card to each rival card it destroys, returns or
    // erodes; a removed card lingers under the arc before it goes.
    const removalAt = new Map<string, number>();
    const shown = this.aimShown;
    this.aimShown = null;
    if (action.type === 'playCard') {
      const rivalCards = (st: GameState) => new Map(st.players.filter((p) => p.id !== actor.id).flatMap((p) => p.tableau.map((c) => [c.uid, c] as const)));
      const was = rivalCards(prev);
      const now = rivalCards(next);
      const hitCards = [...was]
        .filter(([uid, c]) => !now.has(uid) || (now.get(uid)!.stability ?? 0) < (c.stability ?? 0) || (now.get(uid)!.dented ?? 0) > (c.dented ?? 0))
        .map(([uid]) => uid);
      const from = playedFrom!;
      const heats = (playedDef?.onPlay ?? []).some((e) => e.type === 'heat');
      hitCards.forEach((uid, i) => {
        const el = root.querySelector<HTMLElement>(`[data-uid="${uid}"]`);
        const to = before.cards.get(uid)?.rect ?? (el ? pageRect(el) : null);
        if (!to) return;
        const delay = (actor.isAI ? 600 : 470) + i * 140;
        // Heat aimed at a card: flying from the card played to the card it strikes, whose numbers change as
        // it lands. (Removal, below, is a white arc.)
        const wasC = was.get(uid)!, nowC = now.get(uid);
        const byHeat = heats && uid !== action.enemyUid && (uid === action.aimUid || (nowC?.dented ?? 0) > (wasC.dented ?? 0));
        if (byHeat) {
          const land = projectile(from, () => (el?.isConnected ? pageRect(el) : to), HOT, { delay, size: 30, duration: 560 });
          removalAt.set(uid, land);
          if (el) {
            pulse(el, 'fx-hit-card', land);
            this.holdCardStats(el, before.cards.get(uid)?.html, land);
          }
          window.setTimeout(() => sound.launch(), delay);
          window.setTimeout(() => sound.whoosh(0, !nowC), land - 60);
          return;
        }
        // (A card whose aim was shown while it waited to be confirmed already pointed here.)
        removalAt.set(uid, uid === shown ? 160 : tether(from, to, { delay }));
        // The beam whooshes onto the card (and, if it takes it, sweeps it away).
        const gone = !next.players.some((p) => p.tableau.some((c) => c.uid === uid));
        window.setTimeout(() => sound.whoosh(0, gone), delay);
      });
    }

    root.querySelectorAll<HTMLElement>('[data-uid]').forEach((el) => {
      const uid = el.dataset.uid!;
      const old = before.cards.get(uid);
      if (old && el.parentElement?.classList.contains('hand') && old.html.includes('data-hand=')) {
        // A card already in hand that the fan moved: slide it along the fan, in the hand's own space. (A card
        // kept through the redraw slides by itself: the fan's own transitions move it.)
        if (!this.keptHand.has(el)) this.refan(el, old.html);
        return;
      }
      if (old) {
        const r = pageRect(el);
        // A card flung back to hand by removal waits in its slot until the arc reaches it.
        if (Math.abs(r.left - old.rect.left) > 2 || Math.abs(r.top - old.rect.top) > 2) flyFrom(el, old.rect, { delay: removalAt.get(uid) ?? 0 });
        return;
      }
      if (inHand.has(uid)) {
        const delay = (endingTurn ? 420 : 60) + drawIndex * 110;
        this.dealCard(el, delay);
        sound.draw(delay / 1000);
        drawIndex++;
      } else if (el.closest('.tableau')) {
        // A card that arrives in a tableau without having been on screen flies in from its owner's sun.
        const owner = el.closest<HTMLElement>('[data-owner]')?.dataset.owner;
        const from = owner ? orbRect(owner) : null;
        if (from) flyFrom(el, from, { fade: true, duration: 560, delay: actor.isAI ? 350 : 0 });
      }
    });
    const stageCard = root.querySelector<HTMLElement>('.stage .card');
    const stageFrom = this.stage ? orbRect(this.stage.actorId) : null;
    if (stageCard && stageFrom) flyFrom(stageCard, stageFrom, { fade: true, duration: 520 });

    // A day's start replays its effects one by one (see replayPulses); cards that faded go once it has.
    const pulses = endingTurn && !reducedMotion() ? (next.turnPulses ?? []).filter((p) => p.kind !== 'start') : [];
    // A sun that goes supernova this move: it keeps its colour (and its half of the board) until the blow lands
    // and the explosion has played (it is drawn alive meanwhile: see `dying`).
    const novas = next.players.filter((p) => p.eliminated && !prev.players.find((x) => x.id === p.id)?.eliminated);
    const novaDone = new Set<string>();
    const nova = (pid: string) => {
      if (novaDone.has(pid)) return;
      novaDone.add(pid);
      this.supernovaAt(pid);
    };
    const replayEnd = pulses.length ? this.replayPulses(next, prev, before, nova) : 0;
    const hitAt = new Map<string, number>();
    let faded = 0;
    before.cards.forEach((old, uid) => {
      if (root.querySelector(`[data-uid="${uid}"]`)) return;
      let to: DOMRect | null = null;
      // The pile on the table it went to, if any.
      let pile: string | null = null;
      if (vNext.discard.some((c) => c.uid === uid)) pile = 'discard';
      else {
        const binned = next.players.find((p) => p.id !== vNext.id && p.discard.some((c) => c.uid === uid));
        if (binned) pile = `discard:${binned.id}`;
      }
      if (pile) to = anchorRect(root, pile);
      if (!to) {
        const owner = next.players.find((p) => [...p.deck, ...p.hand, ...p.discard].some((c) => c.uid === uid));
        if (owner) to = orbRect(owner.id);
      }
      const at = removalAt.get(uid);
      if (at !== undefined && this.lingerInSlot(prev, uid, old.html, at)) return;
      const wasInPlay = prev.players.some((p) => p.tableau.some((c) => c.uid === uid));
      // A card that faded at dawn stays in its slot while the day's effects play out, then goes.
      if (replayEnd > 0 && wasInPlay && this.fadeFromSlot(prev, uid, old.html, replayEnd + faded * DEAL_STEP_MS, pile, true)) {
        faded++;
        return;
      }
      // Faded at a dawn with nothing to replay: still one at a time. Any other card leaving play goes straight.
      if (wasInPlay && this.fadeFromSlot(prev, uid, old.html, endingTurn ? 200 + faded++ * DEAL_STEP_MS : 0, pile)) return;
      if (endingTurn && wasInPlay) {
        ghost(old.html, old.rect, to, { size: { w: old.w, h: old.h }, ...FADE_OUT, delay: 200 + faded++ * DEAL_STEP_MS });
        return;
      }
      ghost(old.html, old.rect, to, { size: { w: old.w, h: old.h } });
    });

    // --- Hits: projectiles, glows, numbers and sounds ----------------------
    const handled = new Set<string>();
    // Until a projectile lands, the target's sun keeps showing its old heat and shields.
    const holdUntil = (p: PlayerState, was: PlayerState, at: number) => {
      if (reducedMotion() || at < 150 || (p.heat === was.heat && p.shields === was.shields && p.eliminated === was.eliminated)) return;
      root.querySelectorAll(`[data-anchor="player:${p.id}"]`).forEach((el) => {
        const vit = el.querySelector('.vit');
        if (!vit) return;
        const now = el.innerHTML;
        vit.outerHTML = vitals({ heat: was.heat, threshold: supernovaThreshold(was), shields: was.shields, dead: was.eliminated, id: was.id, orbit: was.orbit });
        setShieldBadge(root, p.id, was.shields);
        animateSuns();
        window.setTimeout(() => {
          el.innerHTML = now;
          setShieldBadge(root, p.id, p.shields);
          animateSuns();
        }, at);
      });
    };
    const hit = (id: string, at: number, byEnemy: boolean) => {
      const p = next.players.find((pl) => pl.id === id)!;
      const was = prev.players.find((pl) => pl.id === id)!;
      if (!handled.has(id)) holdUntil(p, was, at);
      handled.add(id);
      if (!hitAt.has(id)) hitAt.set(id, at);
      const dHeat = p.heat - was.heat;
      const lostShields = byEnemy ? Math.max(0, was.shields - p.shields) : 0;
      const gainedShields = Math.max(0, p.shields - was.shields);
      const mine = id === viewer.id;
      window.setTimeout(() => {
        const r = sunAt(id);
        if (r) {
          // Heat taken (red, rising), cooling (blue) and shields lost or raised, over the sun.
          if (dHeat) floatNumber(r, dHeat > 0 ? `+${dHeat}` : `−${-dHeat}`, dHeat > 0 ? 'hot' : 'cool', 0);
          if (lostShields) floatNumber(r, `⛨−${lostShields}`, 'block', dHeat ? 1 : 0);
          else if (gainedShields) floatNumber(r, `⛨+${gainedShields}`, 'block', dHeat ? 1 : 0);
        }
        if (dHeat > 0) {
          if (mine && byEnemy) {
            sound.hurt(dHeat);
            hurtFlash();
          } else if (byEnemy) sound.strike(dHeat);
          else sound.impact(true);
        } else if (dHeat < 0) sound.impact(false);
        if (lostShields) sound.block();
        else if (gainedShields && !dHeat) sound.shield();
      }, at);
      const fx = [dHeat > 0 ? 'fx-hot' : dHeat < 0 ? 'fx-cold' : '', lostShields || gainedShields ? 'fx-shield' : ''].filter(Boolean);
      for (const cls of fx.length ? fx : ['fx-shield']) pulse(orb(id), cls, at);
    };

    // Who caused this round of changes: the player who acted, or (at a day's
    // start) the player whose tableau just triggered.
    const source = endingTurn ? activePlayer(next) : actor;
    const delay = endingTurn ? 750 : actor.isAI ? 520 : 160;
    // (A day's start that replays its effects one by one has shown its hits already.)
    if (!replayEnd) {
      let volley = 0;
      for (const p of next.players) {
        const was = prev.players.find((pl) => pl.id === p.id)!;
        if (p.id === source.id) continue;
        const struck = p.heat > was.heat || (p.shields < was.shields && !(endingTurn && p.id === actor.id)) || (p.eliminated && !was.eliminated);
        if (!struck) continue;
        // From the card that struck (if a card was played), else from the striking sun; to the sun as drawn.
        // (A card attacking a sun is its own blow: the move lands as it strikes, so the sun is hit there and then.)
        if (action.type === 'attack') {
          hit(p.id, 0, true);
          continue;
        }
        const a = playedFrom && (playedDef?.onPlay ?? []).some((e) => e.type === 'heat') ? playedFrom : orbRect(source.id);
        const at = a ? projectile(a, () => sunAt(p.id), HOT, { delay: delay + 110 * volley++, size: 34 }) : delay;
        hit(p.id, at, true);
      }
      if (volley) window.setTimeout(() => sound.launch(), delay);
      const me = next.players.find((p) => p.id === source.id)!;
      const meWas = prev.players.find((p) => p.id === source.id)!;
      if (me.heat !== meWas.heat || me.shields > meWas.shields) {
        hit(source.id, delay, false);
        if (me.heat < meWas.heat) window.setTimeout(() => sound.thermo(), delay);
      }
    }

    switch (action.type) {
      case 'playCard': {
        // (A rival's card already sounded as it arrived on the stage.)
        if (!this.entranceHeard) sound.play();
        this.entranceHeard = false;
        const played = prev.players.find((p) => p.id === actor.id)!.hand.find((c) => c.uid === action.cardUid);
        if (played && cardDef(played.defId).kind === 'command') {
          // (Its boom lands as the card does.)
          window.setTimeout(() => sound.hero(), Math.max(0, delay - 300));
          // A hero takes the field, and says so (a caption by the card).
          window.setTimeout(() => voices.speak(played.defId, this.root.querySelector(`.tableau [data-uid="${played.uid}"]`)), delay + 250);
        }
        break;
      }
      case 'endTurn': {
        sound.endTurn();
        // The new player's dawn cards light up, oldest first, as they trigger.
        let k = 0;
        if (!replayEnd)
          root.querySelectorAll<HTMLElement>(`.tableau[data-owner="${source.id}"] [data-uid]`).forEach((el) => {
            if (cardDef(el.dataset.card!).onTurn?.length) pulse(el, 'fx-trigger', 220 + 90 * k++);
          });
        break;
      }
      case 'setTarget':
        sound.hover();
        break;
    }

    // Supernovas not shown by a dawn replay go off as the blow that caused them lands.
    if (!replayEnd) for (const p of novas) window.setTimeout(() => nova(p.id), hitAt.get(p.id) ?? 600);
    if (vNext.deck.length === 0 && vPrev.deck.length > 0) pulse(root.querySelector('[data-anchor="deck"]'), 'fx-shuffle');
  }

  /**
   * Until heat lands on a card in play (`at` ms from now), it keeps showing its defence and stability as they
   * were before (`oldHtml`: the card as it was drawn): numbers change as the blow lands, not before.
   */
  private holdCardStats(el: HTMLElement, oldHtml: string | undefined, at: number) {
    if (!oldHtml || reducedMotion() || at < 100) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = oldHtml;
    const was = tmp.firstElementChild;
    if (!was) return;
    for (const sel of ['.stat-def-floor', '.card-stats-stab']) {
      const cur = el.querySelector<HTMLElement>(sel), old = was.querySelector<HTMLElement>(sel);
      if (!cur || !old || cur.outerHTML === old.outerHTML) continue;
      const html = cur.innerHTML, cls = cur.className;
      cur.innerHTML = old.innerHTML;
      cur.className = old.className;
      window.setTimeout(() => {
        // (Unless a redraw has drawn it afresh meanwhile.)
        if (cur.isConnected && cur.innerHTML === old.innerHTML) {
          cur.innerHTML = html;
          cur.className = cls;
        }
      }, at);
    }
  }

  /** A sun goes supernova: the explosion, then its half of the board greys out. */
  private supernovaAt(pid: string) {
    const root = this.root;
    const sun = root.querySelector(`[data-anchor="player:${pid}"]`) ?? root.querySelector(`[data-anchor="pill:${pid}"]`);
    sound.supernova();
    if (sun) {
      pulse(sun, 'fx-nova', 0);
      supernovaBurst(pageRect(sun.querySelector('.vit-sun') ?? sun));
    }
    pulse(root.querySelector('.game'), 'fx-flash', 120);
    pulse(root.querySelector('.table-view') ?? root.querySelector('.game'), 'fx-quake', 60);
    window.setTimeout(() => this.finishDying(pid), 900);
  }

  /** A dying sun's explosion has played: now it, its pill and its half of the board show it gone. */
  private finishDying(pid: string) {
    if (!this.dying.delete(pid)) return;
    this.render();
  }

  /** When the result may show on the board (after the game's last moves have played out). */
  private resultAt = 0;
  /** Extra lines under the result (what the game earned you). */
  private resultExtra = '';

  /** What a reward came to, for under the result. */
  private rewardLine(r: Payout): string {
    const parts = [`✦ +${r.stardust}`, `⟁ +${r.flux}`, `+${r.xp} xp`];
    const up = r.levelsGained ? `<b class="rw-level">level ${profile().level}!</b>` : '';
    const rank = r.rank !== undefined && profile().rankPoints !== null ? `<span class="rw-rank">${r.rank >= 0 ? '+' : ''}${r.rank} rank · ${esc(rankName(profile().rankPoints!).toLowerCase())}</span>` : '';
    return `<div class="result-rewards">${parts.map((x) => `<span>${x}</span>`).join('')}${up}${rank}</div>`;
  }

  /**
   * The game just ended: pay out what it earned this device's player (not in a
   * hot-seat game, nor for a ranked game, whose reward the server sends), and
   * hold the result back until its last moves have played out on the table.
   */
  private holdResult(next: GameState, action: Action) {
    this.resultExtra = '';
    const viewer = next.players.find((p) => p.id === this.viewer().id);
    const humans = next.players.filter((p) => !p.isAI).length;
    // Against the AI: the server pays the reward for the game it saw start (an online game's, it pays by itself).
    const gameId = this.aiGameId;
    if (viewer && !this.online && humans === 1 && gameId) {
      this.aiGameId = null;
      this.rememberAiGame(null);
      const won = next.winnerId === viewer.id;
      void finishAiGame(gameId, won, next.concededBy === viewer.id).then((p) => {
        this.resultExtra = p ? this.rewardLine(p) : '<div class="result-rewards"><span>no reward for this game</span></div>';
        this.render();
      });
    }
    const wait = reducedMotion() ? 300 : (action.type === 'endTurn' ? this.replayLength(next) : 900) + 1800;
    this.resultAt = Date.now() + wait;
    window.setTimeout(() => {
      if (this.state === next || isGameOver(this.state ?? next)) this.render();
    }, wait + 20);
  }

  /** Replays in flight (a newer state cancels an older replay's remaining steps). */
  private replayId = 0;

  /** How long a state's dawn replay lasts, in ms (0 if it has none). */
  private replayLength(state: GameState): number {
    if (reducedMotion()) return 0;
    const n = (state.turnPulses ?? []).filter((p) => p.kind !== 'start' && !p.together).length;
    return n ? 700 + n * PULSE_STEP * SPEED_FACTOR[this.speed] + 400 : 0;
  }

  /**
   * A day's start, effect by effect: each card that fires lights up, and its
   * effect flies from it to the sun it reaches (a flare of heat to the rival's
   * sun, a cooling beam or a shield beam to its owner's), whose numbers change
   * as it lands. Regional instability and the table strike from the top of the
   * screen. Returns when the last effect has landed.
   */
  private replayPulses(next: GameState, prev: GameState, before: Snapshot, onNova: (pid: string) => void): number {
    const root = this.root;
    const id = ++this.replayId;
    const all = next.turnPulses ?? [];
    const steps = all.filter((p) => p.kind !== 'start');
    const step = PULSE_STEP * SPEED_FACTOR[this.speed];
    const viewer = this.viewer();
    const orbRect = (pid: string) => anchorRect(root, `player:${pid}`) ?? before.anchors.get(`player:${pid}`) ?? anchorRect(root, `pill:${pid}`);
    const sunAt = (pid: string) => sunRect(root, pid) ?? orbRect(pid);
    // Show a sun with given numbers (its planets as they are now). One going supernova stays alive until its explosion has played.
    const show = (pid: string, sun: { heat: number; shields: number; eliminated: boolean }) => {
      if (id !== this.replayId) return;
      const p = next.players.find((x) => x.id === pid)!;
      root.querySelectorAll(`[data-anchor="player:${pid}"] .vit`).forEach((vit) => {
        vit.outerHTML = vitals({ heat: sun.heat, threshold: supernovaThreshold(p), shields: sun.shields, dead: sun.eliminated && !this.dying.has(pid), id: pid, orbit: p.orbit });
      });
      setShieldBadge(root, pid, sun.shields);
      animateSuns();
    };
    // Every sun starts where it was as the turn began (shields already faded).
    const start = all.find((p) => p.kind === 'start')?.suns ?? Object.fromEntries(prev.players.map((p) => [p.id, { heat: p.heat, shields: p.shields, eliminated: p.eliminated }]));
    for (const p of next.players) show(p.id, start[p.id] ?? { heat: p.heat, shields: p.shields, eliminated: p.eliminated });
    let last = start;
    let t = 700;
    const cardLands = new Map<HTMLElement, number>();
    let lastAt = t;
    for (const ps of steps) {
      // Regional instability strikes every sun at once: those pulses share one moment.
      const at = ps.together ? lastAt : t;
      lastAt = at;
      const was = last;
      last = ps.suns;
      const fromEl = ps.uid ? root.querySelector(`.tableau [data-uid="${ps.uid}"]`) : null;
      const from = fromEl ? pageRect(fromEl) : ps.uid ? before.cards.get(ps.uid)?.rect ?? null : (root.querySelector('.round-box') ? pageRect(root.querySelector('.round-box')!) : null);
      // Heat aimed at a card flies to that card (where it stood, if it has burned away since).
      const cardEl = ps.toCard ? root.querySelector<HTMLElement>(`.tableau [data-uid="${ps.toCard}"]`) : null;
      const to = ps.toCard ? (cardEl ? pageRect(cardEl) : before.cards.get(ps.toCard)?.rect ?? null) : sunAt(ps.to);
      // Heat aimed at a card whooshes onto it (sweeping it away, if it burns away).
      if (ps.toCard) {
        const burns = !next.players.some((p) => p.tableau.some((c) => c.uid === ps.toCard));
        window.setTimeout(() => {
          if (id === this.replayId) sound.whoosh(0, burns);
        }, at + 120);
      }
      if (fromEl) pulse(fromEl, 'fx-trigger', at);
      // The instability gauge throbs red as it deals its heat.
      if (ps.kind === 'unstable' && !ps.uid && !ps.together) pulse(root.querySelector('.round-box'), 'fx-unstable', at);
      let land = at + 300;
      if (from && to) {
        if (ps.kind === 'heat' || ps.kind === 'selfHeat' || ps.kind === 'unstable') land = projectile(from, to, HOT, { delay: at + 120, size: ps.kind === 'heat' ? 34 : 26, duration: 520 });
        else if (ps.kind === 'cool') land = beam(from, to, 'cool', { delay: at + 120 });
        else if (ps.kind === 'shield') land = beam(from, to, 'plain', { delay: at + 120 });
      }
      // A struck card glows as the heat lands, and its numbers change then (after its last blow this dawn).
      if (cardEl) {
        pulse(cardEl, 'fx-hit-card', land);
        cardLands.set(cardEl, Math.max(cardLands.get(cardEl) ?? 0, land));
      }
      if (!ps.together) window.setTimeout(() => {
        if (id !== this.replayId) return;
        if (ps.kind === 'heat' || ps.kind === 'selfHeat' || ps.kind === 'unstable') sound.launch();
        else if (ps.kind === 'cool') sound.thermo();
        else if (ps.kind === 'draw') sound.draw();
      }, at + 120);
      window.setTimeout(() => {
        if (id !== this.replayId) return;
        // Every sun that changed takes its new numbers, with what changed floating over it (one heat sound per landing).
        let heard = false;
        for (const p of next.players) {
          const a = was[p.id], b = ps.suns[p.id];
          if (!a || !b || (a.heat === b.heat && a.shields === b.shields && a.eliminated === b.eliminated)) continue;
          show(p.id, b);
          if (b.eliminated && !a.eliminated) onNova(p.id);
          const r = sunAt(p.id);
          const dHeat = b.heat - a.heat, dShield = b.shields - a.shields;
          if (r && dHeat) floatNumber(r, dHeat > 0 ? `+${dHeat}` : `−${-dHeat}`, dHeat > 0 ? 'hot' : 'cool', 0);
          if (r && dShield) floatNumber(r, dShield > 0 ? `⛨+${dShield}` : `⛨−${-dShield}`, 'block', dHeat ? 1 : 0);
          const cls = dHeat > 0 ? 'fx-hot' : dHeat < 0 ? 'fx-cold' : 'fx-shield';
          pulse(root.querySelector(`[data-anchor="player:${p.id}"]`), cls, 0);
          const table = ps.kind === 'unstable' && !ps.uid;
          if (dHeat > 0 && table && p.id === viewer.id) hurtFlash();
          if (dHeat > 0 && !heard) {
            heard = true;
            if (table) sound.hurt(dHeat);
            else if (p.id === viewer.id && ps.source !== viewer.id) {
              sound.hurt(dHeat);
              hurtFlash();
            } else if (p.id !== ps.source) sound.strike(dHeat);
            else sound.impact(true);
          } else if (dHeat < 0) sound.impact(false);
          if (dShield < 0) sound.block();
          else if (dShield > 0 && !dHeat) sound.shield();
        }
      }, land);
      if (!ps.together) t += step;
    }
    for (const [el, at] of cardLands) this.holdCardStats(el, before.cards.get(el.dataset.uid!)?.html, at);
    // Finally the suns as they really are.
    const end = t + 200;
    window.setTimeout(() => {
      if (id !== this.replayId) return;
      for (const p of next.players) show(p.id, { heat: p.heat, shields: p.shields, eliminated: p.eliminated });
    }, end);
    return end;
  }

  /**
   * A copy of a card that just left a tableau, laid over the slot it held, in the table's own 3D plane (so
   * it keeps the table's perspective as it goes, and never changes the row's layout). Null if its tableau
   * isn't on the table.
   */
  private slotCopy(prev: GameState, uid: string, html: string, keepUid = false): HTMLElement | null {
    const owner = prev.players.find((p) => p.tableau.some((c) => c.uid === uid));
    const slot = owner?.tableau.find((c) => c.uid === uid)?.slot;
    const row = owner ? this.root.querySelector<HTMLElement>(`.tableau[data-owner="${owner.id}"] .tableau-row`) : null;
    if (!row || slot === undefined) return null;
    // Where it lay: the Command slot, or the slot's place in the row (an empty slot now, or a card that took its place).
    const cell =
      slot === COMMAND_SLOT ? row.querySelector<HTMLElement>(':scope > .cmd-slot > *') : row.querySelectorAll<HTMLElement>(':scope > .card, :scope > .slot-empty')[slot];
    if (!cell) return null;
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const copy = holder.firstElementChild as HTMLElement;
    if (!keepUid) copy.removeAttribute('data-uid');
    copy.removeAttribute('data-act');
    copy.classList.remove('card-choosable', 'lifted', 'card-aimer', 'card-aiming');
    copy.classList.add('card-leaving');
    const at = planeOffset(cell, row);
    // In a box the slot's size (a card's padding is a share of its container's width: laid out loose in
    // the row, it would take a share of the whole row's, and squash the card).
    const box = document.createElement('div');
    box.className = 'card-leaving-box';
    Object.assign(box.style, { position: 'absolute', left: `${at.x}px`, top: `${at.y}px`, width: `${cell.offsetWidth}px`, height: `${cell.offsetHeight}px`, zIndex: '6', pointerEvents: 'none', transformStyle: 'preserve-3d' });
    Object.assign(copy.style, { position: 'relative', left: '0', top: '0', width: '100%', height: '100%', margin: '0' });
    box.appendChild(copy);
    row.appendChild(box);
    // A redraw mid-animation rebuilds the row: the copy is put back into the new one (see keepLeaving).
    this.leaving.add({ el: box, owner: owner!.id, until: Date.now() + 8000 });
    return copy;
  }

  private dropLeaving(copy: HTMLElement) {
    const box = copy.parentElement?.classList.contains('card-leaving-box') ? copy.parentElement : copy;
    box.remove();
    for (const l of this.leaving) if (l.el === box || l.el === copy) this.leaving.delete(l);
  }

  /** Copies of cards leaving a tableau, still animating, with whose tableau they lie in. */
  private leaving = new Set<{ el: HTMLElement; owner: string; until: number; done?: boolean }>();
  private keepLeaving() {
    for (const l of this.leaving) {
      if (l.done || Date.now() > l.until) {
        l.el.remove();
        this.leaving.delete(l);
        continue;
      }
      if (l.el.isConnected) continue;
      this.root.querySelector(`.tableau[data-owner="${l.owner}"] .tableau-row`)?.appendChild(l.el);
    }
  }

  /** A card removed from play: it lingers in its slot until the removal's tether reaches it, then dissolves. */
  private lingerInSlot(prev: GameState, uid: string, html: string, at: number): boolean {
    const copy = this.slotCopy(prev, uid, html);
    if (!copy) return false;
    const dissolve = copy.animate(
      [
        { opacity: 1, filter: 'brightness(1)', transform: 'translateZ(8px) scale(1)' },
        { opacity: 1, filter: 'brightness(1.6)', transform: 'translateZ(20px) scale(1.06)', offset: 0.35 },
        { opacity: 0, filter: 'brightness(2.2) blur(3px)', transform: 'translateZ(8px) scale(0.7)' },
      ],
      { duration: 520, delay: at, easing: 'ease-in', fill: 'both' },
    );
    dissolve.onfinish = () => this.dropLeaving(copy);
    return true;
  }

  /**
   * A card leaving a tableau for a pile on the table: a copy lifts off its slot after `at` ms and glides
   * into the pile, all in the table's plane. `keepUid` lets the dawn replay still light it up meanwhile.
   * False if it can't be shown that way (its tableau or the pile isn't on the table).
   */
  private fadeFromSlot(prev: GameState, uid: string, html: string, at: number, pile: string | null, keepUid = false): boolean {
    const target = pile ? this.root.querySelector<HTMLElement>(`.board-plane [data-anchor="${pile}"]`) : null;
    if (!target) return false;
    const copy = this.slotCopy(prev, uid, html, keepUid);
    if (!copy) return false;
    const box = copy.parentElement!;
    const row = box.parentElement!;
    const from = planeOffset(box, row);
    const to = planeOffset(target, row);
    const w = copy.offsetWidth || 1;
    const h = copy.offsetHeight || 1;
    const sc = Math.min(target.offsetWidth / w, target.offsetHeight / h);
    const dx = to.x + target.offsetWidth / 2 - (from.x + w / 2);
    const dy = to.y + target.offsetHeight / 2 - (from.y + h / 2);
    const fly = copy.animate(
      [
        { opacity: 1, transform: 'translateZ(8px) scale(1)' },
        { opacity: 1, transform: 'translateZ(26px) scale(1.04)', offset: 0.25 },
        { opacity: 0, transform: `translate(${dx}px, ${dy}px) translateZ(8px) scale(${sc})` },
      ],
      { duration: 560, delay: at, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' },
    );
    window.setTimeout(() => sound.draw(), at);
    fly.onfinish = () => this.dropLeaving(copy);
    return true;
  }

  /** New log lines glow in the always-visible log panel. */
  private surfaceLog(prev: GameState) {
    const lastSeq = prev.log[prev.log.length - 1]?.seq ?? 0;
    this.root.querySelectorAll<HTMLElement>('.log-feed [data-seq]').forEach((el) => {
      if (Number(el.dataset.seq) > lastSeq) el.classList.add('log-new');
    });
  }

  private showToast(text: string, tone: 'info' | 'error') {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = document.createElement('div');
    el.className = `toast toast-${tone}`;
    el.textContent = text;
    document.body.appendChild(el);
    window.setTimeout(() => {
      el.classList.add('toast-out');
      window.setTimeout(() => el.remove(), 300);
    }, TOAST_MS);
  }

  private viewer(): PlayerState {
    const s = this.state!;
    return s.players.find((p) => p.id === this.viewerId) ?? s.players.find((p) => !p.isAI) ?? activePlayer(s);
  }

  /** The rival whose tableau is shown across the table. */
  private shownRival(): PlayerState | undefined {
    const s = this.state!;
    const me = this.viewer();
    const chosen = s.players.find((p) => p.id === this.viewRivalId && p.id !== me.id && !p.eliminated);
    return chosen ?? targetOf(s, me) ?? s.players.find((p) => p.id !== me.id);
  }

  /** True when the viewer may act right now. */
  private canAct(): boolean {
    const s = this.state!;
    const me = activePlayer(s);
    // Online, you wait while your rival reads the card you just played.
    if (this.online && this.net.waitFor === 'rival') return false;
    return !me.isAI && me.id === this.viewer().id && !isGameOver(s) && !this.needsHandoff();
  }

  /** Hot-seat: hide the hand until the next human confirms they have the device. */
  private needsHandoff(): boolean {
    if (this.online) return false;
    const s = this.state!;
    const p = activePlayer(s);
    const humans = s.players.filter((pl) => !pl.isAI).length;
    return !p.isAI && humans > 1 && this.revealedFor !== p.id && !isGameOver(s);
  }

  // -------------------------------------------------------------------------
  // Playing a card: collect any choices it needs, then play it
  // -------------------------------------------------------------------------

  private startPlay(uid: string, drop?: Pending['drop']) {
    // (The hand drops back down once a card is picked from it.)
    this.raiseHand(false);
    // Tapping the card that is waiting to be placed puts it back.
    if (this.pending?.uid === uid) {
      this.pending = null;
      return this.render();
    }
    const s = this.state!;
    const me = activePlayer(s);
    const card = me.hand.find((c) => c.uid === uid);
    if (!card) return;
    // (A card that costs 0 can still be played with no energy left.)
    // (A card that can't be played now shakes its head, with the blocker's thud.)
    const refuse = () => {
      sound.blocked();
      this.root.querySelector<HTMLElement>(`.hand > .card[data-uid="${uid}"]`)?.animate(
        [{ translate: '0' }, { translate: '-7px 0' }, { translate: '6px 0' }, { translate: '-4px 0' }, { translate: '2px 0' }, { translate: '0' }],
        { duration: 380, easing: 'ease-out' },
      );
    };
    if (cardCost(card.defId) > me.playsLeft && !canSetFaceDown(me, card.defId)) {
      this.showToast(`${cardDef(card.defId).name} costs ${cardCost(card.defId)} energy: you have ${me.playsLeft} left today.`, 'info');
      return refuse();
    }
    // (Another card in your hand, while one waits to be placed: that one is played instead.)
    if (cardDef(card.defId).kind === 'lightspeed' && !canSetLightspeed(me)) {
      this.showToast('You already have a Lightspeed card face down: only one at a time.', 'info');
      return refuse();
    }
    if (!hasRoomFor(me, card.defId) && !canSetFaceDown(me, card.defId)) {
      this.showToast('Your tableau is full: a card can only go in once one fades (or is recalled or removed). A recall card can take the place of the card it recalls.', 'info');
      return refuse();
    }
    this.pending = { uid, step: 'choice', drop };
    this.advancePlay();
  }

  /** Ask for the next choice the pending card needs, or play it once it has them all. */
  private advancePlay() {
    const p = this.pending;
    const s = this.state!;
    if (!p) return;
    const me = activePlayer(s);
    const card = me.hand.find((c) => c.uid === p.uid);
    if (!card) {
      this.pending = null;
      return this.render();
    }
    const target = targetOf(s, me);
    const ask = (step: Pending['step']) => {
      p.step = step;
      this.render();
    };
    // A Lightspeed guard: set face down (its Lightspeed slot was chosen), or played as a Guard. It is
    // placed like any card, with the Lightspeed slot open too (or only that, if it can't be played as a Guard).
    // (Dragged onto your tableau: what the drop answers is taken as chosen.)
    const drop = p.drop;
    const dropped = drop?.uid ? me.tableau.find((c) => c.uid === drop.uid) : undefined;
    const dropSlot = typeof drop?.slot === 'number' ? drop.slot : dropped?.slot;
    if (drop?.slot === 'ls' && canSetFaceDown(me, card.defId)) p.faceDown = true;
    if (p.faceDown) return this.dispatch({ type: 'playCard', cardUid: p.uid, faceDown: true });
    if (dropSlot !== undefined && p.slot === undefined && freeSlots(me).includes(dropSlot)) p.slot = dropSlot;
    if (canSetFaceDown(me, card.defId) && p.slot === undefined) return ask('slot');
    // First the card is placed, so what it does next is seen from where it will stand (its slot's forge and
    // resonance count in the heat it aims): a recall card first picks the card it recalls (it may take its
    // place), a Fusion card the card it fuses onto, and any other card its slot. Even the last open slot is
    // clicked to confirm (a misclicked card is never played outright).
    const recall = allyEffectKind(card.defId) === 'recall';
    // (A recall card dropped on a card it can recall recalls that one, and takes its place.)
    if (recall && dropped && !p.allyUid && allyChoices(me, card.defId).some((c) => c.uid === dropped.uid)) {
      p.allyUid = dropped.uid;
      if (p.slot === undefined && dropped.slot !== undefined) p.slot = dropped.slot;
    }
    if (recall && allyChoices(me, card.defId).length > 0 && !p.allyUid) return ask('ally');
    // A Fusion card is placed like any card, or fused onto a card in play: both are offered at once.
    const fusion = !!cardDef(card.defId).fusion;
    if (fusion && dropped && !p.hostUid && p.slot === undefined && fusionHosts(me).some((c) => c.uid === dropped.uid)) p.hostUid = dropped.uid;
    if (fusion && !p.hostUid && p.slot === undefined && (fusionHosts(me).length > 0 || freeSlots(me).length > 0)) return ask('slot');
    const replaces = recall && !!p.allyUid;
    if (inSlots(card.defId) && !p.hostUid && (freeSlots(me).length > 0 || replaces) && p.slot === undefined) return ask('slot');
    // Then its abilities: an option, a rival card to remove, an ally, a card to recover, where its heat goes.
    if (cardChoices(card.defId).length > 0 && !p.choice) return ask('choice');
    if (enemyChoices(s, me, card.defId).length > 0 && !p.enemyUid) {
      if (target) this.viewRivalId = target.id;
      return ask('enemy');
    }
    if (allyChoices(me, card.defId).length > 0 && !p.allyUid) return ask('ally');
    if (recoverChoices(me, card.defId).length > 0 && !p.recoverUid) return ask('recover');
    // A card that heats, with rival cards on the table: where its heat goes (a card, or their sun).
    if (aimable(card.defId) && aimChoices(s, me).cards.length && p.aimUid === undefined) return ask('aim');
    this.dispatch({ type: 'playCard', cardUid: p.uid, choice: p.choice, enemyUid: p.enemyUid, allyUid: p.allyUid, recoverUid: p.recoverUid, slot: p.slot, aimUid: p.aimUid && p.aimUid !== 'sun' ? p.aimUid : undefined, ...(p.hostUid ? { hostUid: p.hostUid } : {}) });
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const seat = el.dataset.seatName;
    if (seat !== undefined) this.seats[Number(seat)].name = el.value;
    if (el.dataset.dbName !== undefined) this.activeBuilder().onInput(el.value);
    if (el.dataset.dbSearch !== undefined) this.activeBuilder().onSearch(el.value);
    if (el.dataset.joinCode !== undefined) this.net.joinCode = el.value;
    if (el.dataset.signinName !== undefined) this.signinName = el.value;
    if (el.dataset.authEmail !== undefined) this.authEmail = el.value;
    if (el.dataset.authPassword !== undefined) this.authPassword = el.value;
    if (el.dataset.deletePassword !== undefined) this.deletePassword = el.value;
  }

  private peekHeld = false;

  /**
   * Whether an overlay is up that the player must answer mid-move and can't back
   * out of: only then can they look past it at the board. One with a cancel
   * button (choosing an option, or a card to recover) is just cancelled instead,
   * as are sheets they open and close at will.
   */
  private canPeek(): boolean {
    const overlay = this.root.querySelector('.overlay');
    return this.screen === 'game' && !!this.pending && !this.sheet && !!overlay && !overlay.querySelector('button[data-act="cancel"]');
  }

  private setPeek(on: boolean) {
    this.peeking = on && this.canPeek();
    document.body.classList.toggle('peeking', this.peeking);
    this.syncPeek();
  }

  /** Show the view-board toggle while a mid-move choice is up; drop peeking once it is gone. */
  private syncPeek() {
    const open = this.canPeek();
    if (!open && this.peeking) {
      this.peeking = false;
      document.body.classList.remove('peeking');
    }
    this.peekBtn.classList.toggle('show', open);
    this.peekBtn.innerHTML = this.peeking ? '<span>◉</span> back' : '<span>◎</span> view board';
    this.peekBtn.title = this.peeking ? 'Bring the overlay back' : 'Hide this overlay to look at the board (or hold Space)';
  }

  private onKey(e: KeyboardEvent) {
    // Hold Space to look at the board behind an overlay.
    if (e.code === 'Space' && !e.repeat && this.canPeek() && !(e.target as HTMLElement).closest?.('input, textarea')) {
      e.preventDefault();
      this.peekHeld = true;
      this.setPeek(true);
      return;
    }
    // Enter: OK the rival's card, or end the day (asking first if cards could still be played).
    if (e.key === 'Enter' && !e.repeat && !(e.target as HTMLElement).closest?.('input, textarea, select')) {
      if (this.screen !== 'game') return;
      if (this.stage?.confirm) {
        e.preventDefault();
        return this.confirmStage();
      }
      if (this.sheet && this.sheet.kind !== 'end-day') return;
      e.preventDefault();
      return this.requestEndDay();
    }
    if (e.key !== 'Escape') return;
    if (this.peeking) return this.setPeek(false);
    if (this.boardZoom && !this.zoomed && !this.pending && !this.sheet) return this.setBoardZoom(null);
    if (this.zoomed) {
      this.zoomed = null;
      return this.root.querySelector('.zoom-view')?.remove();
    }
    if (this.pending || this.sheet) {
      this.pending = null;
      this.sheet = null;
      this.render();
    }
  }

  private onHover(e: MouseEvent) {
    if (this.touch) return;
    // The deck builder's deck list: hovering a card's row shows it large, beside the list.
    const row = (e.target as HTMLElement).closest<HTMLElement>('.db-row[data-card]');
    if (row !== this.rowPeek) {
      this.rowPeek = row;
      if (row) this.showPeek(row, row.closest('.db-deck-side'));
      else if (!this.press?.shown) this.preview.classList.remove('show');
    }
    // Cards (in the hand, on the table, in the builder's grid and deck list) and deck boxes rustle like paper.
    const PAPER = '[data-card], .deck-box';
    const el = (e.target as HTMLElement).closest<HTMLElement>(PAPER);
    const from = (e.relatedTarget as HTMLElement | null)?.closest?.(PAPER);
    if (el && from !== el) sound.rustle();
    // The main menu's choices chime softly under the pointer.
    const HUB = '.hub-card, .hub-link, .hub-options, .player-chip, .hub-continue';
    const opt = (e.target as HTMLElement).closest<HTMLElement>(HUB);
    if (opt && (e.relatedTarget as HTMLElement | null)?.closest?.(HUB) !== opt) sound.hover();
  }

  // ---- The hand: raised to read it whole; cards dragged out of it to play them ----

  /** The hand raised clear of the screen's foot (on a touch screen, by a first tap; with a mouse, by hovering it). */
  private handRaised = false;
  /** When the opening hand has been dealt (until then it can't be raised). */
  private dealtAt = 0;
  /** A card is in the preview pane (picked to play, landing, a Hero's abilities): the hand keeps still meanwhile. */
  private handStill(): boolean {
    return !!(this.pending || this.stage || this.heroPanel);
  }
  private raiseHand(up: boolean) {
    if (up && (performance.now() < this.dealtAt || this.handStill())) return;
    if (this.handRaised === up) return;
    this.handRaised = up;
    if (up) {
      this.measureRaise();
      // (Again once it has risen, in case the board was still settling as it began.)
      setTimeout(() => this.handRaised && this.measureRaise(), 500);
      sound.handLift();
    }
    this.root.querySelector('.table-view > .dock')?.classList.toggle('dock-raised', up);
  }

  /** A card being dragged out of the hand: where it was picked up, and (once it moves) its flying copy. */
  private drag: { uid: string; el: HTMLElement; x: number; y: number; dx: number; dy: number; ghost: HTMLElement | null } | null = null;

  private onDragStart(e: PointerEvent) {
    if (e.button > 0 || this.screen !== 'game') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.hand > .card[data-act="play"]');
    if (!el || !this.canAct()) return;
    const r = el.getBoundingClientRect();
    this.drag = { uid: el.dataset.arg!, el, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, ghost: null };
  }

  private onDragMove(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost) {
      // A drag, not a tap: it has moved a little, mostly upwards (out of the hand).
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 14 || d.y - e.clientY < 8) return;
      this.cancelPress();
      const r = d.el.getBoundingClientRect();
      const ghost = d.el.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-uid');
      ghost.removeAttribute('data-act');
      ghost.classList.add('drag-ghost');
      Object.assign(ghost.style, { position: 'fixed', left: '0', top: '0', width: `${d.el.offsetWidth}px`, height: `${d.el.offsetHeight}px`, margin: '0', zIndex: '9000', pointerEvents: 'none', transition: 'none' });
      ghost.style.setProperty('--cw', `${d.el.offsetWidth}px`);
      ghost.style.setProperty('--kc', getComputedStyle(d.el).getPropertyValue('--kc'));
      document.body.appendChild(ghost);
      d.ghost = ghost;
      sound.handLift();
      d.dx = (d.dx / r.width) * d.el.offsetWidth;
      d.dy = (d.dy / r.height) * d.el.offsetHeight;
      d.el.classList.add('card-dragging');
    }
    d.ghost.style.transform = `translate(${e.clientX - d.dx}px, ${e.clientY - d.dy}px) rotate(-3deg) scale(1.05)`;
    this.markDrop(this.dropEl(e.clientX, e.clientY));
  }

  /** What on your tableau is under a dragged card: a slot, your Lightspeed slot, or a card of yours. */
  private dropEl(x: number, y: number): HTMLElement | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const hit = el.closest<HTMLElement>('.tableau-mine [data-slot], .tableau-mine .card[data-uid], .tableau-mine .ls-slot');
      if (hit) return hit;
      if (el.closest('.tableau-mine .tableau-row')) break;
    }
    return null;
  }

  private dropAt(x: number, y: number): Pending['drop'] {
    const el = this.dropEl(x, y);
    if (!el) return undefined;
    if (el.classList.contains('ls-slot')) return { slot: 'ls' };
    if (el.dataset.slot !== undefined) return { slot: Number(el.dataset.slot) };
    return el.dataset.uid ? { uid: el.dataset.uid } : undefined;
  }

  /** The spot a dragged card would land on, outlined. */
  private dropMarked: HTMLElement | null = null;
  private markDrop(el: HTMLElement | null) {
    if (el === this.dropMarked) return;
    this.dropMarked?.classList.remove('drop-over');
    this.dropMarked = el;
    el?.classList.add('drop-over');
  }

  private onDragEnd(e: PointerEvent | null) {
    const d = this.drag;
    this.drag = null;
    if (!d?.ghost) return;
    d.ghost.remove();
    d.el.classList.remove('card-dragging');
    // (The click that ends a drag must not also tap the card.)
    this.suppressClick = true;
    window.setTimeout(() => (this.suppressClick = false), 0);
    // Let go above the hand: it is played (to the preview pane, and on as any card played); else it goes back.
    this.markDrop(null);
    const zone = this.root.querySelector('.table-view > .dock .hand-zone')?.getBoundingClientRect();
    if (e && zone && e.clientY < zone.top) {
      this.raiseHand(false);
      this.sheet = null;
      sound.rustle();
      this.startPlay(d.uid, this.dropAt(e.clientX, e.clientY));
    }
  }

  // ---- Long press (touch): hold a card to read it; release to dismiss ----

  private onPressStart(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
    if (!el || el.closest('.sheet')) return;
    this.cancelPress();
    this.press = {
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => {
        // Press and hold always reads the card: the inspector (as a right-click does).
        this.press!.shown = true;
        this.zoom(el.dataset.card!, el.closest('.tableau') ? el.dataset.uid : undefined);
        sound.hover();
      }, LONG_PRESS_MS),
      shown: false,
    };
  }

  private onPressMove(e: PointerEvent) {
    if (this.press && !this.press.shown && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 10) this.cancelPress();
  }

  private onPressEnd() {
    if (!this.press) return;
    if (this.press.shown) this.suppressClick = true; // the tap that ends a long press must not also play the card
    this.cancelPress();
  }

  private cancelPress() {
    if (this.press) window.clearTimeout(this.press.timer);
    this.press = null;
  }

  /** The deck row whose card is shown large (see onHover). */
  private rowPeek: HTMLElement | null = null;
  private mouseAt: { x: number; y: number } | null = null;

  /** Large, readable copy of a card at the middle right of the screen while held (or, `beside` a panel, to its left). */
  private showPeek(el: HTMLElement, beside: Element | null = null) {
    this.preview.innerHTML = this.bigCard(el.dataset.card!, el.closest('.tableau') ? el.dataset.uid : undefined) + this.explainCard(el.dataset.card!, el.closest('.tableau') ? el.dataset.uid : undefined);
    const page = appSize();
    const h = Math.min(420, page.h - 24) * 0.7;
    const w = h * 0.714;
    this.preview.style.setProperty('--pw', `${w}px`);
    this.preview.style.left = `${Math.min(page.w - w - 16, page.w * 0.78 - w / 2)}px`;
    this.preview.style.top = `${(page.h - h) / 2}px`;
    this.preview.classList.add('show');
    // A card held in the deck builder's deck list: in the middle of the screen, clear of the thumb.
    if (!beside && el.closest('.db-rows')) {
      const pw = this.preview.offsetWidth, ph = this.preview.offsetHeight;
      // (Its explanations sit to its left: centre the two together.)
      const list = this.preview.querySelector<HTMLElement>('.kw-list');
      const lw = list ? list.offsetWidth + 12 : 0;
      this.preview.style.left = `${Math.max(8 + lw, (page.w - pw - lw) / 2 + lw)}px`;
      this.preview.style.top = `${(page.h - ph) / 2}px`;
    }
    if (beside) {
      // Left of the panel, level with the row (kept on screen).
      const r = pageRect(beside), row = pageRect(el);
      const pw = this.preview.offsetWidth, ph = this.preview.offsetHeight;
      this.preview.style.left = `${Math.max(8, r.left - pw - 14)}px`;
      this.preview.style.top = `${Math.max(8, Math.min(page.h - ph - 8, row.top + row.height / 2 - ph / 2))}px`;
    }
    fitCardText(this.preview);
  }

  private onClick(e: MouseEvent) {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    // While a rival's card waits on the stage to be read, only the stage takes clicks (and a tap on its OK
    // must not fall through to whatever is under it once the stage has gone).
    // (The menu, settings and log stay usable.)
    const onStage = !!(e.target as HTMLElement).closest?.('.stage, .hud, .overlay, .modal');
    if ((this.stage?.confirm && !onStage) || Date.now() < this.clickShieldUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    // A card being played on the board: a click anywhere that isn't its next step (a slot, the card it
    // recalls or fuses onto, its target), another card in hand, or cancel puts it back in the hand.
    if (this.screen === 'game' && this.pending && !(e.target as HTMLElement).closest?.('.overlay, .modal, .sheet, .hud, .zoom-view, .peek-toggle, .peek-shield')) {
      const a = el && !el.hasAttribute('disabled') ? el.dataset.act ?? '' : '';
      if (a !== 'play' && a !== 'cancel' && a !== 'attack-start' && a !== 'board-zoom' && !a.startsWith('choose-')) {
        this.pending = null;
        this.render();
        return;
      }
    }
    // Your Hero's actions close with a click anywhere else.
    if (this.heroPanel && !(e.target as HTMLElement).closest?.('.stage-hero') && el?.dataset.act !== 'hero-panel') {
      this.heroPanel = null;
      this.render();
      if (!el) return;
    }
    if (!el || el.hasAttribute('disabled')) return;
    if (el.classList.contains('overlay') && e.target !== el) return;
    const act = el.dataset.act!;
    const arg = el.dataset.arg ?? '';
    const s = this.state;
    // In the menus, a button that leads somewhere first plays the page out, then acts.
    const leaving = el.dataset.leaving === '1';
    if (leaving) delete el.dataset.leaving;
    else if (this.screen === 'menu' && MENU_NAV.has(act) && !reducedMotion()) {
      if (this.menuLeaving) return;
      sound.click();
      this.leaveMenu(el);
      window.setTimeout(() => {
        this.menuLeaving = false;
        if (!el.isConnected) return;
        el.dataset.leaving = '1';
        el.click();
      }, MENU_LEAVE_MS);
      return;
    }
    // Buttons tick; moves on the table (and map selections) have sounds of their own.
    if (!leaving && !QUIET_ACTS.has(act) && !el.classList.contains('overlay') && !el.classList.contains('cmp-stage')) sound.click();
    if (act.startsWith('cmp-') && this.campaign.onClick(act, arg, el)) return;
    if (act.startsWith('db-') && this.activeBuilder().onClick(act, arg)) return;

    switch (act) {
      case 'seat-ai': {
        const seat = this.seats[Number(arg)];
        seat.isAI = !seat.isAI;
        if (seat.isAI) seat.bot = botName(this.seats[1 - Number(arg)]?.bot);
        return this.render();
      }
      case 'seat-deck':
        // Choose from the decks, shown as deck boxes, then come back here.
        this.pickSeat = Number(arg);
        this.pickFrom = this.menuPage;
        this.menuPage = 'pickdeck';
        return this.render();
      case 'pick-deck': {
        const seat = this.pickSeat;
        if (!deckById(arg)) return;
        this.seats[seat].deckId = arg;
        if (this.online && seat === 0) this.online.setup(this.joinInfo());
        this.menuPage = this.pickFrom;
        return this.render();
      }
      case 'pick-back':
        this.menuPage = this.pickFrom;
        return this.render();
      case 'new-game':
        return this.newGame();
      case 'online-create':
        return this.goOnline();
      case 'online-join': {
        const code = cleanCode(this.net.joinCode);
        if (code.length < 4) {
          this.showToast('Enter the room code your friend sent you.', 'info');
          return;
        }
        return this.goOnline(code);
      }
      case 'online-leave':
        this.leaveOnline();
        return this.render();
      case 'online-retry':
        this.online?.retry();
        return;
      case 'online-ready': {
        const mine = this.net.lobby?.[this.net.you];
        this.online?.ready(!mine?.ready);
        return;
      }
      case 'online-rematch':
        this.online?.rematch();
        return;
      case 'online-share': {
        if (!this.online) return;
        const link = inviteLink(this.online.code);
        const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
        if (nav.share) void nav.share({ title: 'Blue Loop', url: link }).catch(() => undefined);
        else void navigator.clipboard?.writeText(link).then(() => this.showToast('Invite link copied.', 'info'), () => undefined);
        return;
      }
      case 'continue':
        return this.continueGame();
      case 'rules':
        this.sheet = { kind: 'rules' };
        return this.render();
      case 'rules-tab':
        this.rulesTab = arg;
        return this.render();
      case 'open-decks':
        // The builder hands back to wherever it was opened from.
        this.decksFrom = this.menuPage === 'decks' ? this.decksFrom : this.menuPage;
        this.builder.open();
        this.menuPage = 'decks';
        return this.render();
      case 'campaign-new':
        this.campaign.openSetup();
        this.screen = 'campaign';
        return this.render();
      case 'campaign-continue':
        if (!this.campaign.resume()) return this.render();
        this.screen = 'campaign';
        this.render();
        return this.showBanner('campaign', this.campaign.turnLine(), 120, 'campaign');
      case 'campaign-return':
        return this.returnToCampaign(false);
      case 'campaign-auto':
        return this.returnToCampaign(true);
      case 'ranked-find':
        return this.findRanked();
      case 'ranked-cancel':
        return this.cancelRanked();
      case 'ranked-again':
        this.leaveOnline();
        this.screen = 'menu';
        this.menuPage = 'online';
        this.state = null;
        return this.findRanked();
      case 'buy-booster': {
        const kind: BoosterKind = arg === 'general' ? 'general' : (Number(arg) as BoosterKind);
        // The server opens it (it keeps your collection); the pack tears open once it answers.
        void buyBooster(kind).then((res) => {
          if ('error' in res) {
            this.showToast(res.error, 'info');
            sound.error();
            return this.render();
          }
          this.opened = { kind, cards: res.cards as BoosterCard[] };
          sound.shuffle();
          this.render();
        });
        return;
      }
      case 'close-booster':
        this.opened = null;
        return this.render();
      case 'zoom-close': {
        this.zoomed = null;
        const view = this.root.querySelector('.zoom-view');
        if (view) return view.remove();
        return this.render();
      }
      case 'profile-open':
        this.profileOpen = true;
        return this.render();
      case 'profile-close':
        this.profileOpen = false;
        return this.render();
      case 'profile-logout':
        // Signing out: the account's progress leaves this device with it (it's safe on the server).
        this.profileOpen = false;
        void logOut().then(() => location.reload());
        return;
      case 'profile-rename':
        this.profileOpen = false;
        this.authMode = 'name';
        this.menuPage = 'signin';
        return this.render();
      case 'profile-delete':
        this.deleting = !this.deleting;
        this.deletePassword = '';
        this.authError = '';
        return this.render();
      case 'profile-delete-go':
        if (this.authBusy) return;
        this.authBusy = true;
        this.render();
        void deleteAccount(this.deletePassword).then((why) => {
          this.authBusy = false;
          if (why) {
            this.authError = why;
            return this.render();
          }
          location.reload();
        });
        return;
      case 'auth-mode':
        this.authMode = arg === 'signup' ? 'signup' : arg === 'forgot' ? 'forgot' : 'signin';
        this.authError = this.authNote = '';
        this.pendingOAuth = null;
        return this.render();
      case 'auth-agree':
        if (arg === 'terms') this.agreeTerms = !this.agreeTerms;
        else this.agreePrivacy = !this.agreePrivacy;
        return this.render();
      case 'auth-go':
        return this.submitAuth();
      case 'auth-google':
      case 'auth-apple':
        return this.socialSignIn(act === 'auth-apple' ? 'apple' : 'google');
      case 'signin-go':
        signIn(this.signinName ?? profile().name);
        this.signinName = null;
        this.seats[0].name = profile().name;
        if (this.inviteAfterSignIn) {
          const room = this.inviteAfterSignIn;
          this.inviteAfterSignIn = null;
          this.menuPage = 'online';
          return this.goOnline(room);
        }
        this.menuPage = 'hub';
        return this.render();
      case 'menu-page':
        // Players sign in before they reach the hub.
        // Everyone plays with an account: sign in (or make one), then name yourself.
        if (arg === 'hub' && !signedIn()) {
          this.authMode = account() ? 'name' : 'signin';
          this.menuPage = 'signin';
          return this.render();
        }
        if (this.menuPage === 'online' && arg !== 'online') this.leaveOnline();
        this.menuPage = arg as MenuPage;
        this.sheet = null;
        return this.render();
      case 'to-menu':
        return this.quitToMenu();
      case 'reveal':
        this.revealedFor = s ? activePlayer(s).id : null;
        this.render();
        this.announceTurn();
        return this.dealOpening();
      case 'open-menu':
        this.sheet = { kind: 'menu' };
        return this.render();
      case 'open-quit':
        this.sheet = { kind: 'quit' };
        return this.render();
      case 'quit-concede': {
        if (!s || isGameOver(s)) return;
        const me = this.viewer();
        this.sheet = null;
        if (this.online) {
          this.online.act({ type: 'concede', playerId: me.id });
          // Let the message go before the connection closes.
          window.setTimeout(() => this.quitToMenu(), 150);
          return;
        }
        return this.dispatch({ type: 'concede', playerId: me.id });
      }
      case 'quit-retreat': {
        if (!s || isGameOver(s) || !this.campaignBattle) return;
        this.state = applyAction(s, { type: 'concede', playerId: this.viewer().id });
        return this.returnToCampaign(false);
      }
      case 'fullscreen':
        toggleFullscreen();
        return;
      case 'open-log':
        this.sheet = { kind: 'log' };
        return this.render();
      case 'toggle-sound':
        sound.toggleMute();
        return this.refreshSettings();
      case 'toggle-music':
        sound.toggleMusic();
        return this.refreshSettings();
      case 'toggle-stats':
        setSharingStats(!sharingStats());
        markDirty();
        this.render();
        return;
      case 'toggle-autoconfirm':
        this.autoConfirm = !this.autoConfirm;
        try {
          localStorage.setItem(AUTO_CONFIRM_KEY, this.autoConfirm ? '1' : '0');
          markDirty();
        } catch {
          // ignore
        }
        this.refreshSettings();
        if (this.autoConfirm && this.stage?.confirm) this.confirmStage();
        return;
      case 'speed': {
        const order: Speed[] = ['slow', 'normal', 'fast'];
        this.speed = order[(order.indexOf(this.speed) + 1) % order.length];
        try {
          localStorage.setItem(SPEED_KEY, this.speed);
          markDirty();
        } catch {
          // ignore
        }
        return this.refreshSettings();
      }
      case 'skip-ai':
        return this.skipAI();
      case 'stage-ok':
        return this.confirmStage();
      case 'view-pile':
        {
          // Only discard piles can be looked through: what is left in a deck stays hidden.
          const [pile, playerId] = arg.split(':');
          if (pile !== 'discard') return;
          this.sheet = { kind: 'pile', pile: 'discard', playerId };
        }
        return this.render();
      case 'view-player':
        this.sheet = { kind: 'player', playerId: arg || (s ? this.viewer().id : '') };
        return this.render();
      case 'cancel':
        this.pending = null;
        this.sheet = null;
        return this.render();
    }

    if (!s) return;
    // A card in play's tabs (the card, then the cards fused onto it), or a fused card peeking out behind it.
    if (act === 'inspect-tab' && this.sheet?.kind === 'card') {
      this.sheet.tab = Number(el.dataset.arg);
      sound.hover();
      return this.render();
    }
    if (act === 'inspect-fused') {
      const [host, tab] = (el.dataset.arg ?? '').split('|');
      const card = s.players.flatMap((p) => p.tableau).find((c) => c.uid === host);
      if (!card) return;
      this.sheet = { kind: 'card', defId: card.defId, table: host, tab: Number(tab) };
      sound.hover();
      return this.render();
    }
    if (act === 'inspect' && !el.closest('.sheet') && el.dataset.card) {
      this.sheet = { kind: 'card', defId: el.dataset.card, uid: el.dataset.hand, table: el.closest('.tableau') ? el.dataset.uid : undefined };
      sound.hover();
      return this.render();
    }
    if (!this.canAct()) return;

    switch (act) {
      case 'play':
        this.sheet = null;
        // On a touch screen the first tap on the hand raises it (to read every card whole); taps after that play.
        if (this.touch && !this.handRaised && !this.handStill()) return this.raiseHand(true);
        return this.startPlay(arg);
      case 'end-turn':
        return this.requestEndDay();
      case 'end-day-confirm':
        return this.finishDay();
      case 'discard-pick': {
        if (this.sheet?.kind !== 'discard') return;
        const over = activePlayer(this.state!).hand.length - BALANCE.maxHand;
        const picked = this.sheet.picked.includes(arg) ? this.sheet.picked.filter((u) => u !== arg) : [...this.sheet.picked, arg].slice(-over);
        this.sheet = { kind: 'discard', picked };
        sound.rustle();
        return this.render();
      }
      case 'discard-confirm': {
        if (this.sheet?.kind !== 'discard') return;
        const discard = this.sheet.picked;
        this.sheet = null;
        return this.dispatch({ type: 'endTurn', discard });
      }
      case 'board-zoom':
        return this.setBoardZoom(this.boardZoom === arg ? null : (arg as 'rival' | 'mine'));
      case 'hero-panel':
        this.heroPanel = this.heroPanel === arg ? null : arg;
        sound.hover();
        return this.render();
      case 'hero-ability': {
        const why = heroAbilityProblem(this.state!, this.viewer(), Number(arg));
        if (why) return this.showToast(why, 'info');
        this.sheet = null;
        this.heroPanel = null;
        // An ability that heats, with rival cards on the table: aim it first (a card, or their sun).
        const hero = commandCard(this.viewer())!;
        if (abilityAimable(hero.defId, Number(arg)) && aimChoices(this.state!, this.viewer()).cards.length) {
          this.pending = { uid: hero.uid, step: 'aim', ability: Number(arg) };
          sound.hover();
          return this.render();
        }
        sound.hero();
        return this.dispatch({ type: 'heroAbility', index: Number(arg) });
      }
      case 'hero-skill': {
        const why = heroSkillProblem(this.state!, this.viewer(), Number(arg));
        if (why) return this.showToast(why, 'info');
        sound.hero();
        return this.dispatch({ type: 'heroSkill', index: Number(arg) });
      }
      case 'choose-option':
        if (this.pending) this.pending.choice = arg;
        return this.advancePlay();
      case 'choose-enemy':
        if (this.pending) this.pending.enemyUid = arg;
        return this.advancePlay();
      case 'attack-start': {
        this.heroPanel = null;
        // On your day, a card of yours with attack that has not acted yet: choose what it attacks.
        if (this.pending?.attack && this.pending.uid === arg) {
          this.pending = null;
          return this.render();
        }
        const why = attackProblem(this.state!, this.viewer(), arg);
        if (why) return this.showToast(why, 'info');
        this.pending = { uid: arg, step: 'aim', attack: true };
        sound.hover();
        return this.render();
      }
      case 'choose-aim': {
        const pend = this.pending;
        if (!pend) return;
        if (pend.attack) {
          this.pending = null;
          const target = arg === 'sun' ? null : arg;
          const why = attackProblem(this.state!, this.viewer(), pend.uid, target);
          if (why) return this.showToast(why, 'info');
          return this.dispatch({ type: 'attack', attackerUid: pend.uid, targetUid: target });
        }
        if (pend.ability !== undefined) {
          this.pending = null;
          sound.hero();
          return this.dispatch({ type: 'heroAbility', index: pend.ability, aimUid: arg === 'sun' ? undefined : arg });
        }
        pend.aimUid = arg;
        return this.advancePlay();
      }
      case 'choose-ally':
        if (this.pending) this.pending.allyUid = arg;
        return this.advancePlay();
      case 'choose-host':
        if (this.pending) this.pending.hostUid = arg;
        return this.advancePlay();
      case 'choose-recover':
        if (this.pending) this.pending.recoverUid = arg;
        return this.advancePlay();
      case 'choose-slot':
        if (this.pending) {
          if (arg === 'ls') this.pending.faceDown = true;
          else this.pending.slot = Number(arg);
        }
        return this.advancePlay();
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /** Cards in hand kept through the last redraw (not rebuilt). */
  private keptHand = new WeakSet<HTMLElement>();
  private render() {
    this.scheduleAutoEnd();
    // Typing in the deck builder's search re-renders the page: keep the caret in the box.
    const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.dataset.dbSearch !== undefined ? document.activeElement.selectionStart : null;
    // Lists that scroll (the deck builder's card pool and deck, piles, setup pages) keep their place across a redraw.
    const scrolled = [...this.root.querySelectorAll<HTMLElement>(SCROLL_KEEP)].map((el) => [el.scrollTop, el.scrollLeft]);
    const pageY = window.scrollY;
    // The cards in hand before the redraw: those still there after it were kept (and slide along the fan by themselves).
    const held = new Set(this.root.querySelectorAll<HTMLElement>('.hand > .card[data-uid]'));
    // Only the landing and sign-in pages may lie upright; from the game mode menu on, it's landscape.
    forceLandscape(!(this.screen === 'menu' && (this.menuPage === 'title' || this.menuPage === 'signin')));
    // The page is morphed into its new markup, not rebuilt: only what changed is touched, so the board,
    // its cards and canvases stay as they are between moves (rebuilding it all made every action slow).
    morphInto(this.root, this.screen === 'menu' ? this.renderMenu() : this.screen === 'campaign' ? this.campaign.render() + (this.zoomed ? this.renderZoom() : '') : this.renderGame());
    this.keptHand = new WeakSet([...this.root.querySelectorAll<HTMLElement>('.hand > .card[data-uid]')].filter((el) => held.has(el)));
    const again = [...this.root.querySelectorAll<HTMLElement>(SCROLL_KEEP)];
    if (again.length === scrolled.length) again.forEach((el, i) => ((el.scrollTop = scrolled[i][0]), (el.scrollLeft = scrolled[i][1])));
    if (window.scrollY !== pageY) window.scrollTo(0, pageY);
    // A deck row shown large was redrawn (or removed): show whichever row is under the pointer now.
    if (this.rowPeek) {
      const under = this.mouseAt ? document.elementFromPoint(this.mouseAt.x, this.mouseAt.y)?.closest<HTMLElement>('.db-row[data-card]') ?? null : null;
      this.rowPeek = under;
      if (under) this.showPeek(under, under.closest('.db-deck-side'));
      else this.preview.classList.remove('show');
    }
    // The password is never written into the markup, so put what's been typed back after a redraw (ticking a box, an error).
    const pw = this.root.querySelector<HTMLInputElement>('[data-auth-password]');
    if (pw) pw.value = this.authPassword;
    if (typing !== null) {
      const box = this.root.querySelector<HTMLInputElement>('[data-db-search]');
      box?.focus();
      box?.setSelectionRange(typing, typing);
    }
    document.body.classList.toggle('screen-campaign', this.screen === 'campaign');
    // The rotating star lies on the battle board, between the tableaus; elsewhere it fills the screen.
    backdrop.attach(this.root.querySelector<HTMLElement>('.board-star-slot'));
    if (this.screen === 'campaign') this.campaign.afterRender(this.root);
    this.syncPeek();
    // The petal follows the region's stability: blue while it holds, whitening as it drains, then
    // redder the more unstable the region grows.
    if (this.screen === 'game' && this.state) {
      const s = this.state;
      const total = BALANCE.instabilityStartsRound - 1;
      const remaining = Math.max(0, total - (s.round - 1));
      const instab = instabilityHeat(s);
      backdrop.setHeat(instab > 0 ? Math.min(1, instab / 5) : -remaining / total);
    } else backdrop.setHeat(0);
    // A match in play gets the battle theme, the campaign map its exploration score; everywhere else, the ambient score.
    sound.setScene(this.screen === 'game' && this.state && !isGameOver(this.state) ? 'battle' : this.screen === 'campaign' && this.campaign.state ? 'campaign' : 'ambient');
    this.root.querySelector('.log-list')?.scrollTo({ top: 1e9 });
    this.root.querySelector('.log-feed')?.scrollTo({ top: 1e9 });
    this.fitHand();
    fitCardText(this.root);
    this.markKwMore(this.root);
    sizePool(this.root);
    fitWhenSeen(this.root.querySelectorAll<HTMLElement>('.db-pool .db-card'));
    this.activeBuilder().afterRender();
    refreshLift();
    this.prefitZooms();
    const page = this.screen === 'menu' ? `menu:${this.menuPage}` : this.screen;
    if (page !== this.shownPage) {
      // The page left behind faded out and stayed faded; redraws keep elements, so those fades are cleared.
      for (const anim of this.menuFades.splice(0)) anim.cancel();
      const first = !this.shownPage;
      this.shownPage = page;
      if (this.screen === 'menu' && !first) this.enterMenu();
    }
    animateSuns();
    frameTableaus(this.root);
    leanPiles(this.root);
    placeResult(this.root);
    this.keepLeaving();
    if (!this.press?.shown) this.preview.classList.remove('show');
  }

  /**
   * Lay the hand out as a fan: cards overlap along a gentle arc, centred,
   * with their lower half below the screen edge (CSS lifts a hovered card).
   */
  private fitHand() {
    const hand = this.root.querySelector<HTMLElement>('.hand');
    if (!hand) return;
    const cards = [...hand.querySelectorAll<HTMLElement>(':scope > .card')];
    const n = cards.length;
    if (!n) return;
    // Cards differ in width (a Command card lies landscape): neighbours overlap by the same share of their widths.
    // (A Command card is held on its side: its footprint is as wide as it is tall.)
    const ws = cards.map((c) => (c.classList.contains('card-landscape') ? c.offsetHeight : c.offsetWidth));
    const w = Math.min(...ws);
    const inset = w * 0.12; // room for the outer cards' tilt, so they don't cover the piles
    const W = hand.clientWidth - inset * 2;
    const pairs = ws.slice(1).reduce((sum, x, i) => sum + (x + ws[i]) / 2, 0);
    const k = n > 1 ? Math.min(0.82, (W - ws[0] / 2 - ws[n - 1] / 2) / pairs) : 0;
    const centres = ws.reduce<number[]>((at, x, i) => [...at, i ? at[i - 1] + ((ws[i - 1] + x) / 2) * k : 0], []);
    const span = ws[0] / 2 + centres[n - 1] + ws[n - 1] / 2;
    const start = inset + (W - span) / 2 + ws[0] / 2;
    const spacing = n > 1 ? centres[n - 1] / (n - 1) : 0;
    // Degrees between neighbours: a gentle fan (rotated text can't sit on the pixel grid, so it reads softer).
    const step = Math.min(2.5, 12 / Math.max(n - 1, 1));
    // Freshly drawn cards are placed straight into the fan (with no transition, they would swing out from
    // the middle every time the page is redrawn); a card already placed keeps its smooth move.
    const fresh = cards.filter((c) => !c.style.getPropertyValue('--fr'));
    fresh.forEach((c) => (c.style.transition = 'none'));
    // A true arc: the cards' centres sit on a circle whose curve matches their tilt (radius = spacing / angle
    // between neighbours), so each card is lower than the one inside it, corners and all.
    const radius = spacing / ((step * Math.PI) / 180 || 1);
    cards.forEach((c, i) => {
      const t = i - (n - 1) / 2;
      const a = (t * step * Math.PI) / 180;
      // (On whole pixels, for crisp text.)
      c.style.left = `${Math.round(start + centres[i] - c.offsetWidth / 2)}px`;
      c.style.setProperty('--fr', `${t * step}deg`);
      c.style.setProperty('--fy', `${(radius * (1 - Math.cos(a)) * 1.25).toFixed(2)}px`);
      c.style.zIndex = String(i + 1);
      c.style.setProperty('--hz', String(i + 1));
    });
    if (fresh.length) {
      void hand.offsetWidth;
      fresh.forEach((c) => (c.style.transition = ''));
    }
    this.measureRaise();
  }

  /** How far the hand rises to be read whole: raised, its cards also grow a little (from the hand's foot), and the
   *  lowest card's foot just clears the screen's foot. (Measured in layout, where the lift doesn't show.) */
  private measureRaise() {
    const dock = this.root.querySelector<HTMLElement>('.table-view > .dock');
    const hand = dock?.querySelector<HTMLElement>('.hand');
    const cards = hand ? [...hand.querySelectorAll<HTMLElement>(':scope > .card')] : [];
    if (!dock || !hand || !cards.length) return;
    // (A card lifted under the pointer, or still moving into place, is measured where it rests.)
    const low = Math.max(
      ...cards.map((c) => {
        const a = ((parseFloat(c.style.getPropertyValue('--fr')) || 0) * Math.PI) / 180;
        const [w, h] = [c.offsetWidth, c.offsetHeight];
        return c.offsetTop + (parseFloat(c.style.getPropertyValue('--fy')) || 0) + h / 2 + (w * Math.abs(Math.sin(a)) + h * Math.cos(a)) / 2;
      }),
    );
    // (In layout pixels, within the table view: the page may be turned or zoomed on screen.)
    const view = dock.parentElement!;
    let top = 0;
    for (let el: HTMLElement | null = hand; el && el !== view; el = el.offsetParent as HTMLElement | null) top += el.offsetTop;
    const foot = top + hand.offsetHeight;
    const bottom = top + low;
    dock.style.setProperty('--hgrow', String(HAND_GROW));
    dock.style.setProperty('--raise', `${Math.max(0, Math.round(foot + (bottom - foot) * HAND_GROW - view.clientHeight + 8))}px`);
  }

  // ---- Front end -------------------------------------------------------------

  private renderMenu(): string {
    const page = this.menuPage;
    const setup = page === 'quickplay' || page === 'options' || page === 'decks' || page === 'online' || page === 'shop' || page === 'pickdeck';
    const body =
      page === 'title'
        ? this.renderTitlePage()
        : page === 'signin'
          ? this.renderSignIn()
          : page === 'hub'
          ? this.renderHub()
          : page === 'quickplay'
            ? this.renderQuickplay()
            : page === 'decks'
              ? this.builder.render()
              : page === 'online'
                ? this.renderOnline()
                : page === 'shop'
                  ? this.renderShop()
                  : page === 'pickdeck'
                  ? this.renderPickDeck()
                  : this.renderOptions();
    return `
    <main class="menu menu-${page} ${setup ? 'setup-page' : ''}">
      ${body}
      ${page === 'title' || page === 'hub' ? '<footer class="studio">coronal mass games</footer>' : ''}
      ${this.sheet?.kind === 'rules' ? this.renderSheet() : ''}
      ${this.profileOpen ? this.renderProfileView() : ''}
      ${this.zoomed ? this.renderZoom() : ''}
    </main>`;
  }

  private titleBlock(small = false): string {
    return `
      <div class="title-block ${small ? 'title-small' : ''}">
        <div class="title-sun"></div>
        <h1 class="title">blue loop</h1>
      </div>`;
  }

  /** Landing screen: just the logo, the title and a start button. */
  private renderTitlePage(): string {
    return `
      <div class="menu-stack">
        ${this.titleBlock()}
        <button class="btn-primary menu-start" data-act="menu-page" data-arg="hub">start</button>
      </div>`;
  }

  private renderHub(): string {
    const hasCampaign = loadCampaign() !== null;
    const hasGame = loadSave() !== null;
    const tile = (act: string, arg: string, icon: string, name: string, extra = '') => `
      <div class="hub-col">
        <button class="hub-card" data-act="${act}" ${arg ? `data-arg="${arg}"` : ''}>
          <span class="hub-icon">${icon}</span>
          <span class="hub-name">${name}</span>
        </button>
        ${extra}
      </div>`;
    // Shop and collection sit top left as plain header links; options top right, beside you.
    const link = (act: string, arg: string, icon: string, name: string) =>
      `<button class="hub-link" data-act="${act}" ${arg ? `data-arg="${arg}"` : ''}><span class="hub-link-icon">${icon}</span>${name}</button>`;
    return `
      <nav class="hub-links">
        ${link('menu-page', 'shop', HUB_ICONS.shop, 'shop')}
        ${link('open-decks', '', HUB_ICONS.collection, 'collection')}
      </nav>
      <div class="hub-corner">
        ${this.playerChip()}
        <button class="hub-options" data-act="menu-page" data-arg="options" title="Options" aria-label="Options">${HUB_ICONS.options}</button>
        ${fullscreenButton('hub-options')}
      </div>
      ${this.titleBlock(true)}
      <div class="hub">
        ${tile('campaign-new', '', HUB_ICONS.campaign, 'campaign', hasCampaign ? '<button class="btn btn-small hub-continue" data-act="campaign-continue">continue</button>' : '')}
        ${tile('menu-page', 'quickplay', HUB_ICONS.quickplay, 'quickplay', hasGame ? '<button class="btn btn-small hub-continue" data-act="continue">continue</button>' : '')}
        ${tile('menu-page', 'online', HUB_ICONS.online, 'online')}
      </div>`;
  }

  /** Who you are, top right: your picture, name, level and currencies. Tap it for your whole profile. */
  private playerChip(): string {
    const p = profile();
    return `
      <button class="player-chip" data-act="profile-open" title="Your profile">
        ${playerAvatar(account()?.avatar, 'pc-avatar')}
        <span class="pc-who"><b>${esc(p.name || 'Commander')}</b><small>level ${p.level}</small></span>
        <span class="pc-cur"><span class="pf-dust">✦ ${p.stardust}</span><span class="pf-flux">⟁ ${p.flux}</span></span>
      </button>`;
  }

  /** The full profile: level and experience, currencies, rank and record. */
  private renderProfileView(): string {
    const p = profile();
    const need = xpToNext(p.level);
    const rank = p.rankPoints;
    const r = rank !== null ? rankOf(rank) : null;
    return `
      <div class="overlay overlay-soft" data-act="profile-close">
        <div class="modal sheet profile-view">
          <div class="pv-head">
            ${playerAvatar(account()?.avatar, 'pv-avatar')}
            <div class="pv-who"><h2>${esc(p.name || 'Commander')}</h2><small>${p.won} won of ${p.played} played</small></div>
            <button class="pill-btn pv-close" data-act="profile-close">close</button>
          </div>
          <div class="pv-grid">
            <div class="pv-box" title="${p.xp} / ${need} xp to the next level"><small>level</small><b>${p.level}</b><span class="pf-xp"><i style="width:${Math.round((p.xp / need) * 100)}%"></i></span><small>${p.xp} / ${need} xp</small></div>
            <div class="pv-box" title="Buys booster packs"><small>stardust</small><b class="pf-dust"><i>✦</i> ${p.stardust}</b></div>
            <div class="pv-box" title="Crafts cards"><small>flux</small><b class="pf-flux"><i>⟁</i> ${p.flux}</b></div>
            <div class="pv-box" title="${r ? `${r.points} / ${PROGRESSION.stagePoints} to the next stage` : 'Play ranked online'}"><small>rank</small><b>${rank === null ? 'unranked' : esc(rankName(rank).toLowerCase())}</b>${r ? `<span class="pf-xp"><i style="width:${r.points}%"></i></span>` : ''}</div>
          </div>
          ${this.accountRow()}
          <div class="pv-foot"><button class="link-btn" data-act="profile-rename">change name</button><button class="link-btn" data-act="profile-logout">sign out</button></div>
        </div>
      </div>`;
  }

  /** In the profile view: the account your progress is saved to, and deleting it. */
  private accountRow(): string {
    const a = account();
    if (!a) return '';
    const withPassword = a.password !== false;
    const del = this.deleting
      ? `<div class="pv-delete"><small>This deletes your account and all its progress, for good. ${withPassword ? 'Enter your password' : 'Type DELETE'} to confirm.</small>
          <input class="signin-name" type="${withPassword ? 'password' : 'text'}" data-delete-password value="" placeholder="${withPassword ? 'password' : 'DELETE'}" ${withPassword ? 'autocomplete="current-password"' : ''} aria-label="Confirm" />
          ${this.authError ? `<span class="auth-error">${esc(this.authError)}</span>` : ''}
          <div class="pv-actions"><button class="btn" data-act="profile-delete">cancel</button><button class="btn btn-danger" data-act="profile-delete-go" ${this.authBusy ? 'disabled' : ''}>delete account</button></div></div>`
      : '';
    return `<div class="pv-account"><span><b>${esc(a.email)}</b><small>Your progress is saved to this account.</small></span>${this.deleting ? '' : '<button class="link-btn" data-act="profile-delete">delete account</button>'}</div>${del}`;
  }

  /** Read a card large: in a game, the card sheet; elsewhere, a zoomed view over the menu. */
  private zoom(defId: string, table?: string) {
    // (A card in play shows as it stands: its defence, stability and changed numbers.)
    if (this.screen === 'game' && this.state) this.sheet = { kind: 'card', defId, table };
    else if (this.screen === 'menu') {
      this.zoomed = defId;
      sound.hover();
      // Over the menu, the zoomed card is laid on top where it is (redrawing a page full of cards beneath it was slow).
      const menu = this.root.querySelector<HTMLElement>('main.menu');
      if (menu) {
        menu.querySelector('.zoom-view')?.remove();
        menu.insertAdjacentHTML('beforeend', this.renderZoom());
        fitCardText(menu.querySelector<HTMLElement>('.zoom-view')!);
        this.markKwMore(menu);
        return;
      }
    } else if (this.screen === 'campaign') this.zoomed = defId;
    else return;
    sound.hover();
    this.render();
  }

  private renderZoom(): string {
    return `<div class="overlay overlay-soft zoom-view" data-act="zoom-close"><div class="zoom-card" data-act="zoom-close">${this.bigCard(this.zoomed!)}${this.explainCard(this.zoomed!)}</div><small class="muted">tap anywhere to close</small></div>`;
  }

  /** After a sign-in, sign-up or new password: on to the hub (reloading, so everything reads the account's progress). */
  private signedInNow() {
    try {
      sessionStorage.setItem('blue-loop:signed-in', '1');
    } catch {
      // Not available.
    }
    // (Anything still to send goes first, so the reloaded page doesn't find a newer copy and reload again.)
    void flush().then(() => location.reload());
  }

  /** The sign-in page's form, sent: sign in, create an account, ask for a reset email, or set a new password. */
  private submitAuth() {
    if (this.authBusy) return;
    const mode = this.authMode;
    const signingUp = mode === 'signup' || !!this.pendingOAuth;
    if (signingUp && !(this.agreeTerms && this.agreePrivacy)) {
      this.authError = 'Agree to the Terms of Service and the Privacy Policy to create an account.';
      return this.render();
    }
    this.authBusy = true;
    this.authError = this.authNote = '';
    this.render();
    const done = (res: AuthResult) => {
      this.authBusy = false;
      this.authPassword = '';
      if (res.error) {
        this.authError = res.error;
        // A new account, signing in with Apple or Google: agree first (the form shows the boxes), then go on.
        if (!res.needsAgreement) this.pendingOAuth = null;
        return this.render();
      }
      this.pendingOAuth = null;
      this.signedInNow();
    };
    if (this.pendingOAuth) {
      const o = this.pendingOAuth;
      void logInWith(o.provider, o.idToken, o.nonce, true).then(done);
    } else if (mode === 'signup') void signUp(this.authEmail, this.authPassword, this.agreeTerms, this.agreePrivacy).then(done);
    else if (mode === 'reset') void confirmReset(this.resetToken, this.authPassword).then(done);
    else if (mode === 'forgot') {
      void requestReset(this.authEmail).then((why) => {
        this.authBusy = false;
        if (why) this.authError = why;
        else this.authNote = `If there's an account for ${this.authEmail}, an email with a link to choose a new password is on its way.`;
        this.render();
      });
    } else void logIn(this.authEmail, this.authPassword).then(done);
  }

  /**
   * Sign in with Apple or Google: their own sign-in (a popup), whose signed token the server checks. A new
   * account is made on the spot, once its player has agreed to the Terms and the Privacy Policy.
   */
  private socialSignIn(provider: 'apple' | 'google') {
    const clientId = provider === 'apple' ? this.serverOffers.apple : this.serverOffers.google;
    if (!clientId || this.authBusy) return;
    const nonce = crypto.getRandomValues(new Uint32Array(4)).join('');
    this.authError = '';
    const go = (idToken: string) => {
      this.authBusy = true;
      this.render();
      void logInWith(provider, idToken, nonce, this.agreeTerms && this.agreePrivacy).then((res) => {
        this.authBusy = false;
        if (!res.error) return this.signedInNow();
        if (res.needsAgreement) {
          // New here: tick the boxes, then carry on (the sign-in is kept meanwhile).
          this.pendingOAuth = { provider, idToken, nonce };
          this.authMode = 'signup';
        }
        this.authError = res.error;
        this.render();
      });
    };
    const fail = (why = `Couldn't sign in with ${provider === 'apple' ? 'Apple' : 'Google'}.`) => {
      this.authError = why;
      this.render();
    };
    if (provider === 'google') {
      void loadScript('https://accounts.google.com/gsi/client').then(() => {
        const g = (window as unknown as { google?: GoogleId }).google;
        if (!g) return fail();
        g.accounts.id.initialize({ client_id: clientId, nonce, callback: (r) => (r.credential ? go(r.credential) : fail()), use_fedcm_for_prompt: true });
        g.accounts.id.prompt((n) => {
          if (n.isNotDisplayed?.() || n.isSkippedMoment?.()) fail('Google sign-in was closed. Allow pop-ups and try again.');
        });
      }, () => fail());
    } else {
      void loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js').then(async () => {
        const apple = (window as unknown as { AppleID?: AppleId }).AppleID;
        if (!apple) return fail();
        apple.auth.init({ clientId, scope: 'email', redirectURI: location.origin, usePopup: true, nonce });
        try {
          const r = await apple.auth.signIn();
          if (r?.authorization?.id_token) go(r.authorization.id_token);
          else fail();
        } catch {
          fail('Apple sign-in was closed.');
        }
      }, () => fail());
    }
  }

  /**
   * Signing in: to your account (email and password, or Apple or Google), creating one (agreeing to the
   * Terms and the Privacy Policy), or a new password; then the name you go by (beside the picture the
   * account was dealt).
   */
  private renderSignIn(): string {
    const p = profile();
    const back = `<div class="menu-back"><button class="btn btn-small" data-act="menu-page" data-arg="title">‹ back</button></div>`;
    if (this.authMode === 'name') {
      return `
      ${back}
      <div class="signin">
        ${this.titleBlock(true)}
        ${playerAvatar(account()?.avatar, 'signin-avatar')}
        <h2 class="menu-heading">your name</h2>
        <input class="signin-name" data-signin-name value="${esc(this.signinName ?? p.name)}" maxlength="18" placeholder="your name" aria-label="Your name" />
        <button class="btn-primary" data-act="signin-go">continue</button>
      </div>`;
    }
    const mode = this.authMode;
    const o = this.serverOffers;
    const heading = { signin: 'sign in', signup: 'create account', forgot: 'reset password', reset: 'new password' }[mode];
    const email = mode === 'reset' || this.pendingOAuth ? '' : `<input class="signin-name" type="email" data-auth-email value="${esc(this.authEmail)}" placeholder="email" autocomplete="email" aria-label="Email" />`;
    const password =
      mode === 'forgot' || this.pendingOAuth
        ? ''
        : `<input class="signin-name" type="password" data-auth-password value="" placeholder="${mode === 'signin' ? 'password' : 'password (8+ characters)'}" autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}" aria-label="Password" />`;
    const tick = (key: 'terms' | 'privacy', on: boolean, label: string) =>
      `<button class="auth-tick ${on ? 'on' : ''}" type="button" data-act="auth-agree" data-arg="${key}" role="checkbox" aria-checked="${on}"><i class="db-check"></i><span>${label}</span></button>`;
    const agree =
      mode === 'signup'
        ? `<div class="auth-agree">
            ${tick('terms', this.agreeTerms, 'I agree to the <a href="/terms.html" target="_blank" rel="noopener">Terms of Service</a>')}
            ${tick('privacy', this.agreePrivacy, 'I have read and accept the <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>')}
          </div>`
        : '';
    const action = { signin: 'sign in', signup: this.pendingOAuth ? 'create account' : 'create account', forgot: 'send link', reset: 'set password' }[mode];
    // Apple and Google, where the server offers them (not in the native app, whose web view they don't allow).
    const social =
      (mode === 'signin' || mode === 'signup') && !this.pendingOAuth && !isNativeApp() && (o.apple || o.google)
        ? `<div class="auth-social">
            ${o.apple ? '<button class="btn auth-sso" type="button" data-act="auth-apple"><span class="sso-mark"></span>continue with Apple</button>' : ''}
            ${o.google ? '<button class="btn auth-sso" type="button" data-act="auth-google"><span class="sso-mark sso-g">G</span>continue with Google</button>' : ''}
          </div><div class="auth-or"><span>or</span></div>`
        : '';
    const links =
      mode === 'signin'
        ? `<button class="link-btn" type="button" data-act="auth-mode" data-arg="signup">new here? create an account</button>${o.reset ? '<button class="link-btn" type="button" data-act="auth-mode" data-arg="forgot">forgot password?</button>' : ''}`
        : `<button class="link-btn" type="button" data-act="auth-mode" data-arg="signin">${mode === 'signup' ? 'I have an account: sign in' : 'back to sign in'}</button>`;
    return `
      ${back}
      <form class="signin" onsubmit="return false">
        ${this.titleBlock(true)}
        <h2 class="menu-heading">${heading}</h2>
        ${this.pendingOAuth ? `<small class="auth-note">One last thing before your account is made:</small>` : social}
        ${email}
        ${password}
        ${agree}
        ${this.authError ? `<span class="auth-error">${esc(this.authError)}</span>` : this.authNote ? `<small class="auth-note">${esc(this.authNote)}</small>` : ''}
        <button class="btn-primary" type="submit" data-act="auth-go" ${this.authBusy ? 'disabled' : ''}>${this.authBusy ? '…' : action}</button>
        <div class="auth-alt">${links}</div>
      </form>`;
  }

  /** The shop: booster packs (one for each race, and a general one), to rip open. */
  private renderShop(): string {
    const p = profile();
    const label = (k: BoosterKind) => (k === 'general' ? 'general' : RACE_NAMES[k].toLowerCase());
    if (this.opened) {
      const k = this.opened.kind;
      return this.setupPage(
        'shop',
        `<div class="booster-open">
          <div class="pack pack-${k} pack-ripped" aria-hidden="true">${this.packFace(k)}</div>
          <div class="booster-cards">${this.opened.cards
            .map((c, i) => `<div class="booster-card" style="--i:${i}">${this.cardFace(c.id)}<small class="${c.flux ? 'bc-flux' : c.isNew ? 'bc-new' : ''}">${c.flux ? `spare · +⟁${c.flux}` : c.isNew ? 'new' : 'another copy'}</small></div>`)
            .join('')}</div>
        </div>`,
        `<span class="muted">${esc(label(k))} booster</span><span class="setup-spacer"></span><button class="btn-primary" data-act="close-booster">done</button>`,
      );
    }
    const packs = BOOSTERS.map(
      (k) => `
        <button class="pack-slot" data-act="buy-booster" data-arg="${k}" ${p.stardust < PROGRESSION.boosterPrice ? 'disabled' : ''} title="${boosterPool(k).length} cards · ${PROGRESSION.boosterSize} in a pack">
          <span class="pack pack-${k}">${this.packFace(k)}</span>
          <b>${esc(label(k))}</b>
          <small>✦ ${PROGRESSION.boosterPrice}</small>
        </button>`,
    ).join('');
    return this.setupPage('shop', `<div class="section-label">boosters · ✦ ${PROGRESSION.boosterPrice} each</div><div class="pack-row">${packs}</div>`, '', 'hub', 'shop-body');
  }

  /** A booster pack: a foil wrapper, crimped top and bottom, with its race's emblem and a tear strip. */
  private packFace(k: BoosterKind): string {
    const name = k === 'general' ? 'general' : RACE_NAMES[k].toLowerCase();
    const emblem = k === 'general' ? `<span class="pack-icon">${HUB_ICONS.pack}</span>` : factionAvatar(`f${k + 1}`, 'pack-emblem');
    return `<span class="pack-tear"></span><span class="pack-body"><span class="pack-brand">blue loop</span>${emblem}<span class="pack-name">${esc(name)}</span><span class="pack-count">${PROGRESSION.boosterSize} cards</span></span><span class="pack-shine"></span>`;
  }

  /** A card's face on its own, outside a game (as in the deck builder). */
  private cardFace(id: string): string {
    const c = cardDef(id);
    return `<div class="card kind-${c.kind}${c.race !== undefined ? ` race-${c.race}` : ''} rarity-${c.rarity ?? 'dwarf'}" data-card="${c.id}">
      ${cardStock(c)}<span class="card-glyph">${cardArtLite(c, true)}</span>${raceRow(c)}${stabilityBadge(c)}
      <span class="card-name">${esc(c.name.toLowerCase())}</span>
      <span class="card-text">${cardBodyHtml(c)}</span>
      <span class="card-kind">${typeLine(c)}</span>
    </div>`;
  }

  /** Setup pages fill the screen: back and title across the top, the choices in the middle, the main action bottom right. */
  private setupPage(title: string, body: string, foot: string, back = 'hub', bodyClass = ''): string {
    return `
      ${this.setupTop(title, back)}
      <div class="setup-body ${bodyClass}">${body}</div>
      <footer class="setup-foot">${foot}</footer>`;
  }

  /** Every menu page's header, the same everywhere: back on the left, the page's name centred, you on the right. */
  private setupTop(title: string, back = 'hub'): string {
    return `
      <header class="setup-top">
        <button class="btn btn-small" data-act="menu-page" data-arg="${back}">‹ back</button>
        <h2 class="menu-heading">${title}</h2>
        ${this.playerChip()}
      </header>`;
  }

  private renderQuickplay(): string {
    const seats = this.seats
      .map((seat, i) => {
        // Only a second human types a name: you play as yourself, and the AI as a bot.
        const name = seat.isAI
          ? `<span class="seat-name" title="The AI plays as ${esc(seat.bot)}">${esc(seat.bot)}</span>`
          : i === 0
            ? `<span class="seat-name">${esc(profile().name || seat.name)}</span>`
            : `<input data-seat-name="${i}" value="${esc(seat.name)}" maxlength="18" aria-label="Player ${i + 1} name" />`;
        return `
        <div class="qp-seat">
          <div class="qp-head">
            ${name}
            <button class="pill-btn qp-mode" data-act="seat-ai" data-arg="${i}" title="Switch between a human and the AI">${seat.isAI ? 'ai' : 'human'}</button>
          </div>
          ${this.seatDecks(i)}
          <button class="link-btn qp-all" data-act="seat-deck" data-arg="${i}">view decks</button>
        </div>`;
      })
      .join('');
    return this.setupPage(
      'quickplay',
      `<div class="seat-row">${seats}</div>`,
      '<button class="btn-primary" data-act="new-game">launch</button>',
    );
  }

  /** A seat's deck (the last one it played, until another is chosen) as a deck box: tap it to choose another. */
  private seatDecks(seat: number): string {
    const current = deckById(this.seats[seat].deckId) ?? PRESETS[seat];
    return `<div class="qp-decks">${this.deckBoxMini(current, true, `data-act="seat-deck" data-arg="${seat}"`)}</div>`;
  }

  /** A small deck box with its name beneath: a button when `attrs` give it an action. */
  private deckBoxMini(d: SavedDeck, on: boolean, attrs = ''): string {
    const tag = attrs ? 'button' : 'div';
    return `
      <${tag} class="lobby-deck ${on ? 'on' : ''}" ${attrs} title="${esc(d.name)}" style="--dc:${deckColour(d)}">
        <span class="deck-box"><span class="deck-box-top"></span><span class="deck-box-side"></span><span class="deck-box-front">${deckCover(d)}</span></span>
        <small>${esc(d.name.toLowerCase())}</small>
      </${tag}>`;
  }

  /** Choosing a seat's deck: every deck as a deck box; tap one to take it. */
  private renderPickDeck(): string {
    const current = this.seats[this.pickSeat]?.deckId;
    const box = (d: SavedDeck) => {
      const legal = deckProblems(d.cards).length === 0;
      return deckBox(d, { act: 'pick-deck', title: legal ? `Play with ${d.name}` : 'This deck is not complete yet', selected: d.id === current, disabled: !legal });
    };
    const mine = customDecks();
    return `
      <header class="setup-top">
        <button class="btn btn-small" data-act="pick-back">‹ back</button>
        <h2 class="menu-heading">choose a deck</h2>
        ${this.playerChip()}
      </header>
      <div class="setup-body db-list-body">
        <div class="db-list">
          <div class="section-label">race starters</div>
          <div class="db-boxes">${PRESETS.filter((d) => !d.mixed).map(box).join('')}</div>
          <div class="section-label">mechanic starters</div>
          <div class="db-boxes">${PRESETS.filter((d) => d.mixed).map(box).join('')}</div>
          ${mine.length ? `<div class="section-label">your decks</div><div class="db-boxes">${mine.map(box).join('')}</div>` : ''}
        </div>
      </div>`;
  }

  /** Online 1v1: create a room or join one; then the room code, the invite and who is in. */
  private renderOnline(): string {
    // You, as in quickplay: your name, your decks as boxes, and every deck a tap away.
    const you = (extra = '') => `
      <div class="qp-seat online-me">
        <div class="qp-head"><span class="seat-name">${esc(profile().name || 'Commander')}</span>${extra}</div>
        ${this.seatDecks(0)}
        <button class="link-btn qp-all" data-act="seat-deck" data-arg="0">view decks</button>
      </div>`;
    if (!this.online) {
      const rank = profile().rankPoints;
      const mode = (title: string, sub: string, action: string, cls = '') => `
        <div class="online-mode ${cls}">
          <div class="online-mode-text"><b>${title}</b><small>${sub}</small></div>
          <div class="online-mode-act">${action}</div>
        </div>`;
      return this.setupPage(
        'play online',
        `<div class="online-page">
          ${you()}
          <div class="online-modes">
            ${mode('host a game', 'a room code and link to send a friend', '<button class="btn-primary" data-act="online-create">create room</button>')}
            ${mode(
              'ranked',
              rank === null ? 'climb from olivine i against rivals near your rank' : `${esc(rankName(rank).toLowerCase())} · rivals within one rank`,
              this.net.searching ? '<span class="muted">searching…</span><button class="btn" data-act="ranked-cancel">cancel</button>' : '<button class="btn-primary" data-act="ranked-find">find a match</button>',
            )}
            ${mode(
              'join a game',
              'the code your friend sent you',
              `<input class="online-code" data-join-code value="${esc(this.net.joinCode)}" maxlength="8" placeholder="code" autocapitalize="characters" aria-label="Room code" /><button class="btn-primary" data-act="online-join">join</button>`,
              'online-join',
            )}
          </div>
        </div>`,
        '<span class="muted">1v1 · each player on their own device</span>',
        'hub',
      );
    }
    const code = this.online.code;
    const status = this.net.status === 'open' ? '' : this.net.status === 'lost' ? '<button class="btn" data-act="online-retry">connection lost · retry</button>' : '<span class="muted">connecting…</span>';
    const seats = this.net.lobby ?? [];
    const rival = seats.find((_, i) => i !== this.net.you);
    const ready = !!seats[this.net.you]?.ready;
    const tag = (on: boolean, who: string) => `<span class="ready-tag ${on ? 'ready-on' : ''}">${on ? 'ready' : who}</span>`;
    // Your rival: their name and their deck's box (theirs to choose, so not a button).
    const rivalSeat = rival
      ? `<div class="qp-seat online-rival">
          <div class="qp-head"><span class="seat-name">${esc(rival.name)}</span>${tag(rival.ready, 'choosing')}</div>
          <div class="qp-decks">${this.deckBoxMini({ id: 'rival', name: rival.deckName, cards: rival.cover ? [rival.cover] : [] } as SavedDeck, false)}</div>
          <span class="qp-all muted">their deck</span>
        </div>`
      : '<div class="qp-seat online-rival online-waiting"><span class="online-pulse"></span><b>waiting for your opponent</b><small>send them the code or the link</small></div>';
    return this.setupPage(
      'play online',
      `<div class="online-wrap">
        ${this.net.ranked
          ? `<div class="online-room"><small>ranked match</small><b class="online-room-code online-ranked-title">${rival ? `vs ${esc(rival.name)}` : 'matched'}</b><span class="muted">a win climbs the ladder · ${profile().rankPoints !== null ? esc(rankName(profile().rankPoints!).toLowerCase()) : 'olivine i'}</span></div>`
          : `<div class="online-room">
          <small>room code</small>
          <b class="online-room-code">${code}</b>
          <button class="pill-btn" data-act="online-share">share invite link</button>
        </div>`}
        <div class="online-seats">
          ${you(tag(ready, 'not ready'))}
          <span class="online-vs">vs</span>
          ${rivalSeat}
        </div>
        ${status}
      </div>`,
      `<button class="btn" data-act="online-leave">leave room</button><span class="setup-spacer"></span><span class="muted">${
        !rival ? 'get ready while you wait' : ready && rival.ready ? 'starting…' : ready ? `waiting for ${esc(rival.name)} to confirm` : 'the game starts when you are both ready'
      }</span><button class="${ready ? 'btn' : 'btn-primary'}" data-act="online-ready">${ready ? 'not ready' : 'ready'}</button>`,
      'hub',
    );
  }

  private renderOptions(): string {
    const tile = (act: string, label: string, value: string, disabled = false) =>
      `<button class="opt-tile" data-act="${act}" ${disabled ? 'disabled' : ''}><span class="opt-label">${label}</span><b class="opt-value">${value}</b></button>`;
    return this.setupPage(
      'options',
      `<div class="opt-row">
        ${tile('toggle-sound', 'sound', sound.muted ? 'off' : 'on')}
        ${tile('toggle-music', 'music', sound.musicOn && !sound.muted ? 'on' : 'off', sound.muted)}
        ${tile('speed', 'ai speed', this.speed)}
        ${tile('toggle-autoconfirm', 'auto-confirm', this.autoConfirm ? 'on' : 'off')}
        ${tile('toggle-stats', 'share game stats', sharingStats() ? 'on' : 'off')}
        ${tile('rules', 'how to play', 'read')}
      </div>
      <p class="opt-note muted">Game stats are anonymous: the decks played, the cards used and who won, never who played. They help us balance the game.</p>`,
      '',
    );
  }

  /** How to play: short facts, one tab per topic. */
  private rulesHtml(): string {
    const B = BALANCE;
    const kw = (id: string, v?: string) => keywordHtml(id, v);
    const fact = (title: string, body: string) => `<div class="rule-fact"><b>${title}</b><span>${body}</span></div>`;
    const facts = (...f: string[]) => `<div class="rule-facts">${f.join('')}</div>`;
    const step = (title: string, body: string) => `<li><b>${title}</b><span>${body}</span></li>`;
    const kind = (k: CardKind, name: string, body: string) => `<div class="rule-fact"><b><i class="rule-dot" style="--kc:${KIND_COLOUR[k]}"></i>${name}</b><span>${body}</span></div>`;
    const tabs: Record<string, [string, () => string]> = {
      overview: [
        'Overview',
        () =>
          facts(
            fact('The goal', `Heat your rival's sun to <b>${B.supernovaAt}</b>. It goes supernova and you win.`),
            fact('Two suns', `Both start at ${B.startingHeat} heat. ${kw('heat')} heats, ${kw('cool')} cools, ${kw('shield')} blocks.`),
            fact('Days', 'Players take turns, called days. Each of your days starts at Dawn.'),
            fact('Cards stay', 'Played cards sit in your tableau and act every Dawn, until they fade.'),
            fact('Your deck', `${B.deckSize}–${B.maxDeckSize} cards: up to ${B.maxCopies} of each, and one Hero per ${B.cardsPerCommand} cards.`),
            fact('Your hand', `Start with ${B.openingHand} cards. Draw ${B.drawPerTurn} every Dawn after the first.`),
          ),
      ],
      day: [
        'Your Day',
        () => `<ol class="rule-steps">
          ${step('Dawn', `Your shields fade. The planets move on a notch. Draw ${B.drawPerTurn}.`)}
          ${step('The table', 'Regional instability strikes, then the global card in play.')}
          ${step('Your cards', `Every card in your tableau fires its ${kw('dawn')} effect, left to right: heat strikes your rival's sun.`)}
          ${step('Fade', 'Every card loses 1 ◷ stability. At 0 it goes to your discard pile.')}
          ${step('Play', `Spend your energy on cards: 1 on your first day, 2 on your second, then <b>${B.maxPlays}</b> a day (more with bonuses). Each card goes into a slot you choose.`)}
          ${step('Attack', "Each ready card with attack may strike the rival's sun or one of their cards, once a day.")}
          ${step('Dusk', `End your day: every ${kw('dusk')} effect fires, cooling your sun. Your rival's day begins.`)}
        </ol>`,
      ],
      tableau: [
        'Tableau',
        () =>
          facts(
            fact('Slots', `${B.tableauSlots} slots. Defence ⛨ ${B.slotDefence.join(' · ')}: the middle is safest.`),
            fact('Defence', `An attack or aimed heat wears a card's defence first, and the wear lasts: it mends 1 a day (more with ${kw('sturdy', '1')} or ${kw('repair', '1')}), and stays in the slot if the card leaves. Removal only reaches cards with low enough defence: ${kw('destroy', '2')} hits ⛨2 or less.`),
            fact('Stability ◷', `Days a card stays. ${kw('restore', '2')} adds to yours; ${kw('erode', '2')} drains theirs.`),
            fact('No replacing', 'A full tableau takes nothing new until a card fades or leaves. A recall card can go in, in the place of the card it recalls.'),
            fact('Neighbours', `${kw('resonance', '1')} and ${kw('bulwark', '1')} boost the cards beside them. A gap breaks it.`),
            fact('Discard pile', `Every card that leaves goes here. An empty deck reshuffles it back in: ${kw('heat', String(B.reshuffleHeat))} to your sun.`),
          ),
      ],
      sun: [
        'Sun & Orbit',
        () =>
          facts(
            fact(`${keywordHtml('heat', undefined, { named: true })}`, "Heats your rival's sun, unless the card says “to your sun”. Passive heat comes at dawn and always strikes the sun; heat as a card is played can be aimed at a rival card instead."),
            fact(`${keywordHtml('cool', undefined, { named: true })}`, 'Takes heat off your sun. Passive cooling comes at dusk.'),
            fact(`${keywordHtml('shield', undefined, { named: true })}`, 'Each absorbs 1 enemy heat. They fade at your Dawn.'),
            fact('Attacks', "Once a day, a card's attack strikes the rival's sun or one of their cards (which hits back)."),
            fact('Energy', `Cards cost energy (the green gem). You get 1 on your first day, 2 on your second, then ${B.maxPlays} a day. The industrial planet and energy cards add more on top.`),
            fact('Orbit', `Three planets take turns facing your sun, ${B.orbitTurns} days each.`),
            fact('The planets', `Dead: nothing. Abundant: draw +${B.abundantDraw}. Industrial: play +${B.industrialPlays}.`),
            fact('Regional stability', `Drains each round. From round ${B.instabilityStartsRound}, every sun heats at Dawn, more each round.`),
          ),
      ],
      cards: [
        'Card Types',
        () =>
          facts(
            kind('attack', 'Attack', `Heat your rival's sun, and attack their cards.`),
            kind('defence', 'Defence', 'Cool your sun, raise shields, guard your tableau.'),
            kind('growth', 'Growth', 'Draw, recover, grow and play more.'),
            kind('relic', 'Relic', 'No attack, and never fades: a lasting bonus. Brittle: nothing restores it, and removal reaches it whatever its defence.'),
            kind('command', 'Hero', `One per ${B.cardsPerCommand} cards in every deck. Pick a dawn effect as you play one; it stays ${B.stabilityCommand} days, and never returns to your hand.`),
            kind('global', 'Global', 'Changes the table for both players. Only one at a time.'),
            kind('lightspeed', 'Lightspeed', "Set face down. Springs during your rival's day."),
          ),
      ],
      keywords: [
        'Keywords',
        () => `<p class="rule-note">Hover a keyword on a card, or zoom the card, to read it there.</p>
          <dl class="kw-rules">${Object.entries(KEYWORDS)
            .map(([id, k]) => {
              return `<div><dt>${keywordHtml(id, undefined, { named: true })}</dt><dd>${esc(k.explain())}${id === 'recover' ? ` Some name a type: ${keywordLabel('recover', 'attack')}.` : ''}</dd></div>`;
            })
            .join('')}</dl>`,
      ],
      progress: [
        'Progress',
        () =>
          facts(
            fact('Levels', `Every game earns experience. Each level: ✦${PROGRESSION.levelReward.stardust} and ⟁${PROGRESSION.levelReward.flux}.`),
            fact('Stardust ✦', `Buys boosters: ✦${PROGRESSION.boosterPrice} for ${PROGRESSION.boosterSize} cards.`),
            fact('Flux ⟁', 'Crafts the cards you want. Breaking one down returns half.'),
            fact('Ranks', `${RANK_TIERS.join(' → ')}. Three stages each.`),
            fact('Ranked', 'Matches players at most one tier apart. Beat higher ranks for more.'),
            fact('Collection', 'You start with every starter card. Boosters and crafting add the rest.'),
          ),
      ],
    };
    const tab = tabs[this.rulesTab] ? this.rulesTab : 'overview';
    return `
      <div class="rules-wrap">
        <nav class="rules-tabs">${Object.entries(tabs)
          .map(([id, [name]]) => `<button class="rules-tab${id === tab ? ' on' : ''}" data-act="rules-tab" data-arg="${id}">${name}</button>`)
          .join('')}</nav>
        <div class="rules-page">${tabs[tab][1]()}</div>
      </div>`;
  }

  // ---- The battle table --------------------------------------------------------

  private renderGame(): string {
    const s = this.state!;
    // The whole play area is a table seen in perspective; pop-ups and the
    // played-card stage sit outside it so they stay flat and readable.
    return `
      <main class="table-view${this.boardZoom ? ` zoom-${this.boardZoom}` : ''}" style="${this.boardZoom ? this.zoomVars : ''}">
        <div class="game">
          <header class="top"></header>
          ${this.renderBoard()}
          <section class="dock dock-space" aria-hidden="true"><div class="hand-zone"><div class="hand-space"></div></div></section>
        </div>
        ${/* The hand lies flat in front of the tilted board (on it, its text was drawn small and stretched: blurry). */ ''}
        ${this.renderDock()}
        ${this.renderHud()}
        ${this.renderTurnControls()}
        ${this.renderZoomControls()}
        ${this.renderStage()}
        ${this.renderResult()}
        ${this.renderOverlay(s)}
      </main>`;
  }

  /** Zoomed onto a tableau: back out to the whole board, or across to the other player's. (Unzoomed, each tableau has its own eye.) */
  private renderZoomControls(): string {
    const z = this.boardZoom;
    if (!z) return '<div class="board-zoom"></div>';
    const other = z === 'mine' ? 'rival' : 'mine';
    return `<div class="board-zoom">
      <button class="zoom-btn" data-act="board-zoom" data-arg="${z}" title="Back to the whole board (Esc)"><span>‹</span><small>back</small></button>
      <button class="zoom-btn" data-act="board-zoom" data-arg="${other}" title="Look at ${other === 'mine' ? 'your' : 'their'} tableau instead">${EYE_ICON}<small>${other === 'mine' ? 'you' : 'opponent'}</small></button>
    </div>`;
  }

  /**
   * Work out the zoom onto each tableau ahead of time, while nothing is happening (all in one task, put back
   * before the screen is drawn, so nothing on it changes): the first zoom then starts at once, as later ones do.
   */
  private prefitQueued = false;
  private prefitZooms() {
    if (this.prefitQueued || this.screen !== 'game' || this.boardZoom || reducedMotion()) return;
    const key = (side: string) => `${side}:${window.innerWidth}x${window.innerHeight}`;
    if (this.zoomFits.has(key('mine')) && this.zoomFits.has(key('rival'))) return;
    this.prefitQueued = true;
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 300));
    idle(
      () => {
        this.prefitQueued = false;
        const view = this.root.querySelector<HTMLElement>('.table-view');
        if (!view || this.screen !== 'game' || this.boardZoom) return;
        const style = view.getAttribute('style');
        // (No transitions while it is measured: the zoom's own styles, come and gone, would set them off.)
        view.classList.add('no-anim');
        for (const side of ['mine', 'rival'] as const) {
          if (this.zoomFits.has(key(side))) continue;
          this.boardZoom = side;
          view.classList.add(`zoom-${side}`);
          this.fitZoom(undefined, undefined, { measureOnly: true });
          view.classList.remove(`zoom-${side}`);
          this.boardZoom = null;
        }
        this.zoomVars = '';
        if (style === null) view.removeAttribute('style');
        else view.setAttribute('style', style);
        const game = view.querySelector<HTMLElement>(':scope > .game');
        void view.offsetWidth;
        if (game) game.style.transition = '';
        view.classList.remove('no-anim');
      },
      { timeout: 2000 },
    );
  }

  /** Zoom the board onto one tableau, or out (null): the board itself moves, so everything on it still works. */
  private setBoardZoom(side: 'rival' | 'mine' | null) {
    if (this.boardZoom === side) return;
    const was = this.boardZoom;
    this.boardZoom = side;
    sound.hover();
    // (Zooming in, the suns hold still while the board moves: redrawn at their new, larger size, they would
    // stall it. Zooming out, they are drawn at their smaller size at once, below.)
    if (!reducedMotion() && side) holdSuns(720);
    const view = this.root.querySelector('.table-view');
    if (!view) return;
    const game = view.querySelector<HTMLElement>(':scope > .game');
    // Zooming in: the board is laid out at its zoomed size at once (to stay sharp), then shown easing in from where
    // the tableau stood, tilting up as it comes (as zooming out tilts it back down).
    const spanOf = (which: 'rival' | 'mine') => {
      const parts = [...view.querySelectorAll<HTMLElement>(`.tableau-${which} .tableau-row, .tableau-${which} .cmd-slot, .tableau-${which} .ls-slot`)].map((el) => el.getBoundingClientRect());
      if (!parts.length) return null;
      const left = Math.min(...parts.map((r) => r.left)), right = Math.max(...parts.map((r) => r.right));
      const top = Math.min(...parts.map((r) => r.top)), bottom = Math.max(...parts.map((r) => r.bottom));
      return { x: (left + right) / 2, y: (top + bottom) / 2, w: right - left };
    };
    // Across from one tableau to the other: the board keeps its zoom and glides over (the other tableau, off
    // the screen in the tilted view, can't be measured where it stands).
    if (was && side && game) {
      const num = (k: string) => Number(new RegExp(`--${k}:(-?[\\d.]+)`).exec(this.zoomVars)?.[1] ?? NaN);
      const [bz, zx, zy] = [num('bz'), num('zx'), num('zy')];
      view.classList.toggle('zoom-rival', side === 'rival');
      view.classList.toggle('zoom-mine', side === 'mine');
      this.fitZoom(Number.isFinite(bz) ? bz : undefined);
      if (Number.isFinite(zx) && Number.isFinite(zy) && !reducedMotion()) {
        const to = this.zoomVars;
        game.style.transition = 'none';
        (view as HTMLElement).style.setProperty('--zx', `${zx}px`);
        (view as HTMLElement).style.setProperty('--zy', `${zy}px`);
        void game.offsetWidth;
        game.style.transition = '';
        view.setAttribute('style', to);
      }
      const ctl = this.root.querySelector('.board-zoom');
      if (ctl) ctl.outerHTML = this.renderZoomControls();
      return;
    }
    // In or out: the board is laid out at its new size at once (sharp when zoomed), then eased from exactly
    // how it stood to how it now stands, its pan, scale and tilt all at once: the same list of steps at both
    // ends (a pan, a tilt, a scale), so it moves step by step, never twisting through a matrix.
    const animate = !!game && !reducedMotion();
    const tiltOf = (zoomed: boolean) => (zoomed ? '6deg' : getComputedStyle(view).getPropertyValue('--board-tilt').trim() || '34deg');
    const layoutBox = (el: HTMLElement) => {
      const t = el.style.transform;
      el.style.transform = 'none';
      const r = el.getBoundingClientRect();
      el.style.transform = t;
      return r;
    };
    // (Lined up on the tableau zoomed onto, or out from: it starts exactly where it stood on screen.)
    const which = (side ?? was)!;
    let from: { box: DOMRect; m: DOMMatrix; tilt: string; span: ReturnType<typeof spanOf> } | null = null;
    if (animate) {
      for (const a of game!.getAnimations()) a.cancel();
      game!.style.transition = 'none';
      from = { box: layoutBox(game!), m: new DOMMatrix(getComputedStyle(game!).transform), tilt: tiltOf(!!was), span: spanOf(which) };
    }
    view.classList.toggle('zoom-rival', side === 'rival');
    view.classList.toggle('zoom-mine', side === 'mine');
    this.fitZoom(undefined, undefined, { deferFit: animate });
    if (!side) redrawSuns();
    if (animate && from && game) {
      game.style.transition = 'none';
      const box = layoutBox(game);
      const m = new DOMMatrix(getComputedStyle(game).transform);
      let k = box.width > 0 ? from.box.width / box.width : 1;
      let dx = from.box.left + from.box.width / 2 + from.m.m41 - (box.left + box.width / 2);
      let dy = from.box.top + from.box.height / 2 + from.m.m42 - (box.top + box.height / 2);
      const start = () => `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotateX(${from!.tilt}) scale(${(0.82 * k).toFixed(5)})`;
      // Nudged until the tableau stands just where it stood (the two layouts aren't exactly in proportion).
      if (from.span) {
        for (let i = 0; i < 4; i++) {
          game.style.transform = start();
          const now = spanOf(which);
          if (!now || now.w <= 0) break;
          k *= from.span.w / now.w;
          game.style.transform = start();
          const again = spanOf(which);
          if (!again) break;
          dx += from.span.x - again.x;
          dy += from.span.y - again.y;
          if (Math.abs(from.span.x - again.x) < 0.3 && Math.abs(from.span.y - again.y) < 0.3 && Math.abs(from.span.w - again.w) < 0.3) break;
        }
        game.style.transform = '';
      }
      // Held on its first frame until that frame is drawn (the board at its new size takes a moment to paint),
      // then run, so none of the easing is lost to the paint; on its own layer while it moves.
      game.style.willChange = 'transform';
      const anim = game.animate([{ transform: start() }, { transform: `translate(${m.m41.toFixed(1)}px, ${m.m42.toFixed(1)}px) rotateX(${tiltOf(!!side)}) scale(0.82)` }], {
        duration: 520,
        easing: 'cubic-bezier(0.32, 0, 0.18, 1)',
      });
      anim.pause();
      requestAnimationFrame(() => requestAnimationFrame(() => anim.play()));
      anim.finished
        .finally(() => {
          game.style.transition = '';
          game.style.willChange = '';
          this.runRefit();
        })
        .catch(() => undefined);
    } else this.runRefit();
    const ctl = this.root.querySelector('.board-zoom');
    if (ctl) ctl.outerHTML = this.renderZoomControls();
  }

  /** The card text fitting held back for the zoom, now. */
  private runRefit() {
    const f = this.pendingRefit;
    this.pendingRefit = null;
    f?.();
  }

  /**
   * Zoom the board so the tableau zoomed onto (its row of slots and its Hero) spans the window end to end, centred:
   * the board is laid out larger (--bz, so it stays sharp), then moved (--zx, --zy), measuring as it goes.
   */
  private fitZoom(keepBz?: number, from?: { zx: number; zy: number }, opts: { deferFit?: boolean; measureOnly?: boolean } = {}) {
    const view = this.root.querySelector<HTMLElement>('.table-view');
    const game = view?.querySelector<HTMLElement>(':scope > .game');
    if (!view || !game) return;
    // (Card text fitted afresh to the cards' new size, and the tableaus' outlines and the piles' lean drawn
    // again: at once, or once the zoom's easing is done, so none of it holds up its first frame.)
    const refit = () => {
      fitCardText(view);
      frameTableaus(this.root);
      leanPiles(this.root);
    };
    const settle = () => (opts.deferFit ? (this.pendingRefit = refit) : refit());
    if (!this.boardZoom) {
      this.zoomVars = '';
      view.removeAttribute('style');
      frameTableaus(this.root);
      settle();
      return;
    }
    const side = this.boardZoom;
    const span = () => {
      const parts = [...view.querySelectorAll<HTMLElement>(`.tableau-${side} .tableau-row, .tableau-${side} .cmd-slot, .tableau-${side} .ls-slot`)].map((el) => el.getBoundingClientRect());
      if (!parts.length) return null;
      const left = Math.min(...parts.map((r) => r.left)), right = Math.max(...parts.map((r) => r.right));
      const top = Math.min(...parts.map((r) => r.top)), bottom = Math.max(...parts.map((r) => r.bottom));
      return { left, top, width: right - left, height: bottom - top };
    };
    const set = (bz: number, zx: number, zy: number) => {
      this.zoomVars = `--bz:${bz.toFixed(3)};--zx:${zx.toFixed(1)}px;--zy:${zy.toFixed(1)}px`;
      view.setAttribute('style', this.zoomVars);
    };
    const w = window.innerWidth, h = window.innerHeight;
    // (Measured as it will stand, not mid-way through a transition, nor under a zoom's easing still running.)
    game.style.transition = 'none';
    for (const a of game.getAnimations()) a.cancel();
    // Already worked out for this tableau at this size: no measuring (each step lays the whole board out again).
    const key = `${side}:${w}x${h}`;
    const known = keepBz === undefined && !from ? this.zoomFits.get(key) : undefined;
    if (known) {
      set(known.bz, known.zx, known.zy);
      void game.offsetWidth;
      game.style.transition = '';
      frameTableaus(this.root);
      settle();
      return;
    }
    let bz = keepBz ?? 1.6, zx = from?.zx ?? 0, zy = from?.zy ?? 0;
    set(bz, zx, zy);
    // First measured with the board laid flat (no tilt, no perspective to throw a far tableau's measure off),
    // then with its tilt for the last step.
    view.classList.add('zoom-measuring');
    const centre = (tries: number) => {
      for (let i = 0; i < tries; i++) {
        const r = span();
        if (!r) break;
        if (Math.abs(w / 2 - (r.left + r.width / 2)) < 0.5 && Math.abs(h / 2 - (r.top + r.height / 2)) < 0.5) break;
        zx += w / 2 - (r.left + r.width / 2);
        zy += h / 2 - (r.top + r.height / 2);
        set(bz, zx, zy);
      }
    };
    centre(3);
    for (let i = 0; i < (keepBz ? 0 : 3); i++) {
      const r = span();
      if (!r) break;
      // (Clear of the zoom buttons at the left edge, and as far in from the right, so it stays centred.)
      bz *= Math.min((w - 2 * 76) / r.width, (h * 0.94) / r.height);
      set(bz, zx, zy);
    }
    centre(3);
    view.classList.remove('zoom-measuring');
    // (The board is tilted: a move comes out a little short on screen, so it is measured and moved again.)
    centre(6);
    if (keepBz === undefined) this.zoomFits.set(key, { bz, zx, zy });
    if (opts.measureOnly) return;
    void game.offsetWidth;
    game.style.transition = '';
    frameTableaus(this.root);
    settle();
  }

  /** Round and stability, together in one container at the top centre. */
  /**
   * The round, in the middle of the board's petal, ringed by regional stability: a segment drains each
   * round; once it has all gone the ring burns red, and the heat every sun takes at its dawn shows beneath.
   */
  private renderRoundRing(): string {
    const s = this.state!;
    const total = BALANCE.instabilityStartsRound - 1;
    const remaining = Math.max(0, total - (s.round - 1));
    const instab = instabilityHeat(s);
    const next = instabilityHeat({ ...s, round: s.round + 1 });
    const gap = 4; // degrees between segments
    const arc = (i: number) => {
      const a0 = (i / total) * 360 + gap / 2 - 90;
      const a1 = ((i + 1) / total) * 360 - gap / 2 - 90;
      const pt = (a: number) => `${(50 + 44 * Math.cos((a * Math.PI) / 180)).toFixed(2)} ${(50 + 44 * Math.sin((a * Math.PI) / 180)).toFixed(2)}`;
      return `<path class="${i < remaining ? 'on' : ''}" d="M${pt(a0)} A44 44 0 0 1 ${pt(a1)}"/>`;
    };
    const title = instab
      ? `Round ${s.round}. Regional instability: every sun heats by ${instab} at its dawn this round, and by ${next} next round.`
      : `Round ${s.round}. Regional stability ${remaining}: it drains by one each round; when it runs out, every sun heats at its dawn.`;
    return `
      <div class="round-ring round-box ${instab ? 'unstable' : ''}" title="${title}">
        <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="round-track" cx="50" cy="50" r="44"/>${Array.from({ length: total }, (_, i) => arc(i)).join('')}</svg>
        <div class="round-ring-num"><small>round</small><b>${roman(s.round)}</b>${instab ? `<em>+${instab}</em>` : ''}</div>
      </div>`;
  }




  private renderHud(): string {
    const s = this.state!;
    const global = activeGlobal(s);
    const field = global
      ? `<button class="field" data-act="inspect" data-card="${global.card.defId}" title="${esc(plainText(cardDef(global.card.defId).text))}">
          ${cardGlyph(global.card.defId, 'global')}
          <span class="field-name">${esc(cardDef(global.card.defId).name.toLowerCase())}</span>
        </button>`
      : '';
    // Off the table, flat: players top left, round and stability top centre, menu and turn controls top right.
    return `
      <div class="hud">

        <div class="hud-controls">
          ${field}
          ${this.online && this.net.status === 'connecting' ? '<span class="pill-btn net-pill">reconnecting…</span>' : ''}
          ${this.online && this.net.status === 'lost' ? '<button class="pill-btn net-pill" data-act="online-retry">connection lost · retry</button>' : ''}
          ${this.online && this.net.status === 'open' && !this.net.rivalOnline && !isGameOver(s) ? '<span class="pill-btn net-pill" title="Their seat is kept: they rejoin by opening the invite link again">rival disconnected · waiting</span>' : ''}
          ${this.campaignBattle && !isGameOver(s) ? '<button class="pill-btn" data-act="campaign-auto" title="Let your commanders finish this battle">auto-resolve</button>' : ''}
          <button class="icon-btn ${this.sheet?.kind === 'log' ? 'icon-on' : ''}" data-act="${this.sheet?.kind === 'log' ? 'cancel' : 'open-log'}" aria-label="Game log" title="Game log">${LOG_ICON}</button>
          ${fullscreenButton()}
          <button class="icon-btn" data-act="open-menu" aria-label="Settings" title="Settings">${MENU_ICON}</button>
        </div>
      </div>`;
  }

  /**
   * While the board waits on you (aiming heat, choosing a card), a word or two lies in the middle of the
   * board saying what to do, with a way back out.
   */
  private renderMidHint(): string {
    const p = this.pending;
    const s = this.state!;
    if (isGameOver(s)) return '';
    const hint = (text: string, cancel = true) => `<div class="mid-hint"><b>${text}</b>${cancel ? '<button class="mid-cancel" data-act="cancel">cancel</button>' : ''}</div>`;
    // Online, while your rival reads the card you just played.
    if (!p && !this.stage && this.online && this.net.waitFor === 'rival') return hint('waiting for rival', false);
    if (!p || p.step === 'choice' || p.step === 'recover') return '';
    const card = activePlayer(s).hand.find((c) => c.uid === p.uid) ?? (p.attack || p.ability !== undefined ? activePlayer(s).tableau.find((c) => c.uid === p.uid) : undefined);
    if (!card) return '';
    const guarded = !aimChoices(s, activePlayer(s)).sun;
    if (p.step === 'aim' && p.attack) return hint(guarded ? 'attack a guard' : `attack with ${esc(cardDef(card.defId).name.toLowerCase())}`);
    if (p.step === 'aim') return hint(guarded ? 'aim at a guard' : 'aim heat');
    if (p.step === 'enemy') return hint({ destroy: 'destroy a card', bounce: 'return a card', erode: 'erode a card' }[enemyEffectKind(card.defId) ?? 'destroy']);
    if (p.step === 'ally') return hint(allyEffectKind(card.defId) === 'recall' ? 'recall a card' : 'restore a card');
    if (p.step === 'host') return hint('fuse onto a card');
    if (p.step === 'slot') return hint(cardDef(card.defId).fusion && fusionHosts(activePlayer(s)).length ? 'place it, or fuse it onto a card' : 'place it');
    return '';
  }

  /**
   * Game over: the result, on the board where the forecast was, with the way
   * out beneath it. It waits for the game's last moves to finish playing out.
   */
  private renderResult(): string {
    const s = this.state!;
    const winner = s.players.find((p) => p.id === s.winnerId);
    if (!winner || Date.now() < this.resultAt) return '';
    const quitter = s.concededBy ? s.players.find((p) => p.id === s.concededBy) : undefined;
    // One person at this device (online, or against the AI): tell it from their side.
    const viewer = this.viewer();
    const solo = !!this.online || s.players.filter((p) => !p.isAI).length === 1;
    const won = winner.id === viewer.id;
    const title = solo ? (won ? 'victory' : 'defeat') : `${esc(winner.name.toLowerCase())} wins`;
    const why = quitter ? `${quitter.id === viewer.id ? 'You' : solo ? 'Your rival' : esc(quitter.name)} conceded in round ${s.round}.` : `The last sun standing after ${s.round} round${s.round === 1 ? "" : "s"}.`;
    const actions = this.campaignBattle
      ? '<button class="btn-primary" data-act="campaign-return">return to the campaign</button>'
      : this.online && this.net.ranked
        ? '<div class="result-actions"><button class="btn-primary" data-act="ranked-again">find another match</button><button class="btn" data-act="to-menu">return to menu</button></div>'
        : this.online
        ? quitter
          ? '<button class="btn-primary" data-act="to-menu">return to menu</button>'
          : '<div class="result-actions"><button class="btn-primary" data-act="online-rematch">play again</button><button class="btn" data-act="to-menu">return to menu</button></div>'
        : '<button class="btn-primary" data-act="to-menu">return to menu</button>';
    return `
      <div class="game-result ${solo ? (won ? 'result-win' : 'result-loss') : ''}">
        <h2>${title}</h2>
        <p>${why}</p>
        ${this.resultExtra}
        ${actions}
      </div>`;
  }

  /** The board: your target's tableau across the far side, yours on the near side, the star between. */
  private renderBoard(): string {
    const me = this.viewer();
    const rival = this.shownRival();
    return `
      <section class="display board">
        <div class="board3d">
          <div class="board-plane">
            <div class="board-floor"></div>
            <div class="board-star-slot" data-morph-keep></div>
            ${this.renderRoundRing()}
            ${this.renderPhaseTrack()}
            ${rival ? shieldBadge(rival.id, rival.shields, 'rival') : ''}${shieldBadge(me.id, me.shields, 'mine')}
            ${rival ? this.renderTableau(rival, 'rival') : ''}
            ${this.state?.winnerId && Date.now() >= this.resultAt ? '<div class="result-anchor"></div>' : ''}
            ${this.renderMidHint()}
            ${this.renderTableau(me, 'mine')}
          </div>
        </div>
      </section>`;
  }

  private renderTableau(p: PlayerState, side: 'mine' | 'rival'): string {
    const pend = this.pending;
    const choosingSlot = side === 'mine' && pend?.step === 'slot';
    const st = this.state!;
    // While an attack is aimed: what it would leave of each rival card it could hit.
    const preview = new Map<string, { defence: number; stability: number }>();
    // What a staged card is aimed at: a ring round that card's edge.
    const targeted = new Set<string>();
    if (this.stage?.confirm && this.stage.target) targeted.add(this.stage.target);
    // An attack, a card's heat or a Hero's ability being aimed: what it would leave of each rival card it could
    // hit, worked out by making the move on a copy of the game (so a slot's forge and resonance count). (Face-down
    // Lightspeed cards are left out of the copy: the preview must not give them away.)
    if (pend?.step === 'aim' && side === 'rival') {
      const me = activePlayer(st);
      const move = (aim: string): Action =>
        pend.attack
          ? { type: 'attack', attackerUid: pend.uid, targetUid: aim }
          : pend.ability !== undefined
            ? { type: 'heroAbility', index: pend.ability, aimUid: aim }
            : { type: 'playCard', cardUid: pend.uid, choice: pend.choice, enemyUid: pend.enemyUid, allyUid: pend.allyUid, recoverUid: pend.recoverUid, slot: pend.slot, aimUid: aim, ...(pend.hostUid ? { hostUid: pend.hostUid } : {}) };
      for (const c of aimChoices(st, me).cards) {
        try {
          const g = structuredClone(st);
          for (const pl of g.players) if (pl.id !== me.id) pl.lightspeed = null;
          const after = applyAction(g, move(c.uid));
          const owner = after.players.find((x) => x.id === p.id)!;
          const left = owner.tableau.find((x) => x.uid === c.uid);
          preview.set(c.uid, left ? { defence: cardDefence(owner, left), stability: left.stability ?? 0 } : { defence: 0, stability: 0 });
        } catch {
          // (A preview that can't be worked out is simply not shown.)
        }
      }
    }
    // The card being played, once placed: shown standing in its slot (over the card it recalls, if it takes its place).
    const placing = side === 'mine' && pend && !pend.attack && pend.slot !== undefined && !pend.faceDown ? activePlayer(st).hand.find((h) => h.uid === pend.uid) : undefined;
    const ghostAt = (i: number) =>
      placing && pend!.slot === i
        ? this.renderCard({ ...placing, slot: i, stability: baseStability(placing.defId) }, { tableau: 'mine', owner: p, static: true }).replace('class="card ', 'class="card card-placing ')
        : null;
    // Aiming (an attack, a card's heat or a Hero's ability): the rival's sun is a target too, unless a Guard stands.
    const sunAim = side === 'rival' && pend?.step === 'aim' && aimChoices(st, activePlayer(st)).sun;
    // The Command slot: the one Command card leads the tableau from out in front (top right of yours,
    // bottom left of your rival's: a mirror across the board), lying landscape.
    const cmd = commandCard(p);
    const cmdHtml = cmd
      ? this.renderCard(cmd, { tableau: side, owner: p })
      : `<div class="slot-empty slot-cmd" title="Hero slot: your one Hero leads your tableau from here (a new one replaces it). Defence ${BALANCE.commandSlotDefence}"><span class="slot-def">⛨${BALANCE.commandSlotDefence}</span><small>hero</small></div>`;
    const slots = Array.from({ length: BALANCE.tableauSlots }, (_, i) => {
      const c = p.tableau.find((x) => x.slot === i);
      const g = ghostAt(i);
      if (g) return g;
      if (c) return this.renderCard(c, { tableau: side, owner: p, preview: preview.get(c.uid), targeted: targeted.has(c.uid) });
      // A slot keeps the wear of the card that stood in it (mending 1 a day).
      const full = BALANCE.slotDefence[i];
      const wear = p.slotWear?.[i] ?? 0;
      const def = Math.max(0, full - wear);
      const worn = wear ? ` slot-worn` : '';
      const why = wear ? `: worn to ${def} of ${full} by heat on the card that stood here (it mends 1 a day)` : ` ${full}`;
      return choosingSlot
        ? `<button class="slot-empty slot-choosable${worn}" data-act="choose-slot" data-arg="${i}" data-slot="${i}" title="Place it here: defence${why}"><span class="slot-def">⛨${def}</span><i>here</i></button>`
        : `<div class="slot-empty${worn}" data-slot="${i}" title="Slot defence${why}"><span class="slot-def">⛨${def}</span></div>`;
    }).join('');
    // The Lightspeed slot, right of the tableau: a card set there lies face down (its owner can still read it). It has no defence.
    const ls = p.lightspeed;
    const lightspeed = ls
      ? side === 'mine'
        ? `<button class="card card-table card-back ls-card" data-act="inspect" data-card="${ls.defId}" title="Set face down: ${esc(cardDef(ls.defId).name)}. ${esc(plainText(cardDef(ls.defId).text))}">${cardBackFace()}</button>`
        : `<div class="card card-table card-back ls-card ls-hidden" title="A Lightspeed card is set face down. It springs during your day.">${cardBackFace()}</div>`
      : choosingSlot && pend && canSetFaceDown(p, activePlayer(st).hand.find((h) => h.uid === pend.uid)?.defId ?? '')
        ? `<button class="slot-empty slot-ls slot-choosable" data-act="choose-slot" data-arg="ls" title="Set it face down at lightspeed, for 1 more energy"><span class="slot-def">⚡</span><i>face down +1</i></button>`
        : '<div class="slot-empty slot-ls" title="Lightspeed: one card can be set face down here"><span class="slot-def">⚡</span></div>';
    return `
      <div class="tableau tableau-${side} ${this.shownDead(p) ? 'tableau-dead' : ''}" data-owner="${p.id}">
        <div class="tableau-row-wrap">
          <div class="vitals ${sunAim ? 'vitals-choosable' : ''}" data-anchor="player:${p.id}" ${sunAim ? 'data-act="choose-aim" data-arg="sun" role="button" title="Aim at their sun"' : ''}>${vitals({ heat: p.heat, threshold: supernovaThreshold(p), shields: p.shields, dead: this.shownDead(p), id: p.id, orbit: p.orbit, eaten: planetsEaten(st, p) })}<span class="vitals-name">${side === 'mine' ? 'your sun' : `${esc(p.name.toLowerCase())}'s sun`}</span></div>
          <div class="tableau-row"><svg class="tableau-frame" aria-hidden="true"><path/></svg>${slots}<button class="tableau-eye tableau-eye-${side}" data-act="board-zoom" data-arg="${side}" title="Look closely at ${side === 'mine' ? 'your' : 'their'} tableau (or double-tap it; pinch on a phone)" aria-label="Zoom in on ${side === 'mine' ? 'your' : 'their'} tableau">${EYE_ICON}</button><div class="ls-slot">${lightspeed}</div><div class="cmd-slot">${cmdHtml}</div></div>
          ${this.renderPiles(p, side)}
        </div>
      </div>`;
  }

  /**
   * A player's deck and discard pile, on the board to the right of their tableau. Everyone sees both
   * counts; the discard pile lies face up (its top card showing) and anyone can look through it. Decks
   * stay closed, your own included: what is left in one is hidden.
   */
  private renderPiles(p: PlayerState, side: 'mine' | 'rival'): string {
    const mine = side === 'mine';
    const top = p.discard[p.discard.length - 1];
    // A pile stands as tall as the cards in it: its top card raised, their edges stacked beneath it (no count).
    // (The board is seen in perspective: each pile's edges lean by --lean, measured so they stand upright on screen.)
    const stack = (n: number) => {
      const depth = Math.max(1, Math.round(n * 0.45));
      const edges = Array.from({ length: depth }, (_, i) => `calc(var(--lean, 0) * ${i + 1}px) ${i + 1}px 0 ${i % 2 ? '#d9dadf' : '#f4f4f2'}`).join(', ');
      return { style: `--depth:${depth};--edges:${edges}, calc(var(--lean, 0) * ${depth + 3}px) ${depth + 3}px 8px rgba(80, 84, 100, 0.22)`, layers: '' };
    };
    const deckStack = stack(p.deck.length), discardStack = stack(p.discard.length);
    const deck = p.deck.length
      ? `${deckStack.layers}<span class="tpile-face tpile-back tpile-stacked" style="${deckStack.style}">${cardBackFace()}</span>`
      : `<span class="tpile-empty"></span><small>deck</small>`;
    const discard = top
      ? `${discardStack.layers}<span class="tpile-face tpile-stacked" style="${discardStack.style}">${this.renderCard(top, { static: true }).replace(/^(\s*)<button /, '$1<div ').replace(/<\/button>\s*$/, '</div>')}</span>`
      : `<span class="tpile-empty"></span><small>discard</small>`;
    // How many cards they hold: a little bar above your piles, below theirs (the board stays a mirror).
    const n = p.hand.length;
    const hand = `<div class="tpile-hand tpile-hand-${side}" title="${mine ? 'Cards in your hand' : `Cards in ${esc(p.name)}'s hand`}">${HAND_ICON}<span>hand</span><b>${n}</b></div>`;
    // Their name by their hand: above yours, below theirs (a mirror). It opens their summary.
    const name = `<button class="tpile-name tpile-name-${side} ${this.shownDead(p) ? 'tpile-name-dead' : ''}" data-act="view-player" data-arg="${p.id}" data-anchor="pill:${p.id}" title="${esc(mine ? `${p.name} (you)` : p.name)}"><span>${esc(p.name.toLowerCase())}</span></button>`;
    return `<div class="tableau-piles">
      ${mine ? name + hand : hand + name}
      <div class="tpile" data-anchor="${mine ? 'deck' : `deck:${p.id}`}" title="${mine ? `${p.deck.length} cards left in your deck (what they are, and their order, stay hidden)` : `${p.deck.length} cards left in ${esc(p.name)}'s deck`}">${deck}</div>
      <div class="tpile tpile-discard tpile-open" role="button" tabindex="0" data-anchor="${mine ? 'discard' : `discard:${p.id}`}" data-act="view-pile" data-arg="${mine ? 'discard' : `discard:${p.id}`}" title="${mine ? 'Your' : `${esc(p.name)}'s`} discard pile (${p.discard.length}): look through it">${discard}</div>
    </div>`;
  }


  private renderDock(): string {
    const me = this.viewer();
    const hidden = this.needsHandoff();
    const hand = hidden ? '<div class="hand-hidden">hand hidden</div>' : me.hand
          // (The card picked, or just played, is in the preview pane, not the hand.)
          .filter((c) => c.uid !== this.pending?.uid && c.uid !== this.stage?.uid)
          .map((c) => this.renderCard(c, { hand: true }))
          .join('');
    return `
      <section class="dock${this.handRaised ? ' dock-raised' : ''}${this.handStill() ? ' dock-still' : ''}">
        <div class="hand-zone">
          <div class="hand">${hand}</div>
        </div>
      </section>`;
  }

  /** The day's controls, off the board at the bottom right of the screen: energy left (as dots) and End Day. */
  private renderTurnControls(): string {
    const s = this.state!;
    const me = this.viewer();
    const act = this.canAct();
    const busy = this.pending !== null;
    const myTurn = activePlayer(s).id === me.id && !isGameOver(s);
    // The day's whole energy, spent pips left empty; energy beyond the day's usual amount (planets, cards) is amber: it is only for today.
    const total = Math.max(me.playsLeft, myTurn ? me.turn.energyTotal ?? playsAllowed(s, me) : 0);
    const base = me.turn.energyBase ?? total;
    const pips = myTurn ? Array.from({ length: total }, (_, i) => `<i class="${i < me.playsLeft ? 'on' : ''} ${i >= base ? 'bonus' : ''}"></i>`).join('') : '';
    // A campaign hero's battle skills, above End Day: each a button with its cost (and spent, once used).
    const skills = (me.skills ?? [])
      .map((k, i) => {
        const why = heroSkillProblem(s, me, i);
        const spent = k.spent || (!k.once && k.usedTurn === s.turnNumber);
        return `<button class="hero-skill ${spent ? 'spent' : ''}" data-act="hero-skill" data-arg="${i}" ${why || !act || busy ? `disabled title="${esc(why ?? k.text)}"` : `title="${esc(k.text)}"`}>
          <span class="hero-skill-face">${cardArtLite(cardDef(k.hero))}</span><b>${esc(k.name.toLowerCase())}</b><small>${k.once ? 'once' : 'daily'}${k.cost ? ` ${keywordHtml('cost', String(k.cost))}` : ''}</small></button>`;
      })
      .join('');
    return `
      ${skills ? `<div class="hero-skills">${skills}</div>` : ''}
      <div class="turn-controls turn-corner">
        <div class="plays ${myTurn ? '' : 'plays-off'}" title="Energy left today: each card costs the number on its gem">
          <small>${myTurn ? 'energy' : 'waiting'}</small>
          <span class="plays-pips">${pips}</span>
        </div>
        <button class="btn-primary end-turn ${act && !me.hand.some((c) => this.canPlayNow(me, c.defId)) ? 'end-turn-ready' : ''}" data-act="end-turn" ${act && !busy ? '' : 'disabled'}>end day</button>
      </div>`;
  }

  private renderCard(c: CardInstance, opts: { hand?: boolean; tableau?: 'mine' | 'rival'; static?: boolean; owner?: PlayerState; option?: string; landscape?: boolean; settled?: { defence: number; stability: number }; preview?: { defence: number; stability: number }; targeted?: boolean }): string {
    const def = cardDef(c.defId);
    const act = this.canAct();
    const p = this.pending;
    let attrs = 'data-act="inspect"';
    let extra = '';
    if (opts.hand) {
      extra = `data-hand="${c.uid}"`;
      // (While one card waits to be placed, tapping another plays that one instead.)
      if (act || this.touch) attrs = `data-act="play" data-arg="${c.uid}"`;
    }
    let state = '';
    const s = this.state;
    const me = s ? activePlayer(s) : null;
    const pendingDef = p && me ? me.hand.find((h) => h.uid === p.uid)?.defId : undefined;
    if (p && pendingDef && me && opts.tableau === 'rival' && p.step === 'enemy' && enemyChoices(s!, me, pendingDef).some((x) => x.uid === c.uid)) {
      attrs = `data-act="choose-enemy" data-arg="${c.uid}"`;
      state = 'card-choosable';
    }
    if (p?.step === 'aim' && me && opts.tableau === 'rival' && aimChoices(s!, me).cards.some((x) => x.uid === c.uid)) {
      attrs = `data-act="choose-aim" data-arg="${c.uid}"`;
      state = 'card-choosable';
    }
    // On your day, your cards with attack that have not acted yet: click one, then what it attacks.
    if ((!p || p.attack) && act && me && s && opts.tableau === 'mine' && opts.owner?.id === me.id && me.id === this.viewer().id && !c.dimmed && cardAttack(s, me, c) > 0 && !isGameOver(s)) {
      attrs = `data-act="attack-start" data-arg="${c.uid}" title="Attack: click, then a rival card"`;
      state = 'card-attacker';
    }
    // Your Hero, with something it can do today: a tap opens its actions (middle right).
    if (!p && act && me && s && opts.tableau === 'mine' && opts.owner?.id === me.id && me.id === this.viewer().id && def.kind === 'command' && c.slot === COMMAND_SLOT && this.heroActions(me).length) {
      attrs = `data-act="hero-panel" data-arg="${c.uid}" title="Choose what ${esc(def.name)} does today (hold or right-click to read it)"`;
      state = 'card-attacker';
    }
    if ((p?.attack || p?.ability !== undefined) && opts.tableau === 'mine' && c.uid === p.uid) state = 'card-aiming';
    if (opts.tableau && c.dimmed && c.slot !== undefined) state += ' card-dimmed';
    // Placing a recall card: the card it recalls can make way for it.
    if (p && pendingDef && opts.tableau === 'mine' && p.step === 'slot' && p.allyUid === c.uid && allyEffectKind(pendingDef) === 'recall' && c.slot !== undefined) {
      attrs = `data-act="choose-slot" data-arg="${c.slot}" title="Put it here, in place of the card it recalls"`;
      state = 'card-choosable card-replace';
    }
    if (p && opts.tableau === 'mine' && p.step === 'ally') {
      attrs = `data-act="choose-ally" data-arg="${c.uid}"`;
      state = 'card-choosable';
    }
    if (p && opts.tableau === 'mine' && (p.step === 'host' || (p.step === 'slot' && pendingDef && cardDef(pendingDef).fusion)) && opts.owner && fusionHosts(opts.owner).some((h) => h.uid === c.uid)) {
      attrs = `data-act="choose-host" data-arg="${c.uid}" title="Fuse it onto ${esc(cardDef(c.defId).name)}"`;
      state = 'card-choosable';
    }
    if (p && opts.hand && c.uid === p.uid) state = 'card-picked';
    // On your day, a card that costs more energy than you have left is dimmed.
    if (opts.hand && !state && me && act && me.id === this.viewer().id && cardCost(c.defId) > me.playsLeft) state = 'card-pricey';
    // ...and one that can be played now has a faint green rim.
    if (opts.hand && !state && me && act && me.id === this.viewer().id && this.canPlayNow(me, c.defId)) state = 'card-playable';
    // A stat as it stands; on a card heat is aimed at, as that heat will leave it (in red, all the while it is
    // aimed); and while aiming more heat, as that would leave it, shown on hover.
    const pv = (icon: string, n: number, settled?: number, hover?: number) => {
      const shown = settled ?? n;
      const base = shown === n ? `${icon}${n}` : `<span class="pv-settled" title="${n} now">${icon}${shown}</span>`;
      return hover === undefined || hover === shown ? base : `<span class="pv-now">${base}</span><span class="pv-after">${icon}${hover}</span>`;
    };
    const growth = c.growth ? `<span class="growth" title="Growth">${c.growth}</span>` : '';
    // A campaign hero's boons (skills and gear), carried while it is in play: one tag, their text on hover.
    const boonTag = c.boons?.length ? `<i class="boon-tag" title="${esc(`From skills and gear: ${c.boons.map((b) => plainText(cardDef(b).text)).join(' ')}`)}">✦ ${c.boons.length} boon${c.boons.length === 1 ? '' : 's'}</i>` : '';
    // Fusion cards fused onto it: tucked behind it, each a little higher, only its name showing above it
    // (its text on hover). A campaign hero's boons stay as a tag on the card.
    const fusedTags =
      (c.boons?.length ? `<span class="fused-tags">${boonTag}</span>` : '') +
      (c.fused ?? [])
        .map((f, i) => {
          const fd = cardDef(f.defId);
          return `<span class="fused-behind" data-act="inspect-fused" data-arg="${c.uid}|${i + 1}" style="--fi:${i};--fk:${KIND_COLOUR[fd.kind]}" title="${esc(`${fd.name} (fused): ${plainText(fd.text).replace(/^Fusion\. /, '')}`)}"><i>${esc(fd.name.toLowerCase())}</i></span>`;
        })
        .join('');
    const fusedText = this.fusedTextHtml(c);
    // (Resonance and forge show in the card's own numbers, not as a badge.)
    const resonance = '';
    // In play: its defence (what removal must beat) and stability (turns before it fades into the discard pile).
    const stats =
      opts.owner && c.slot !== undefined
        ? `<b class="stat-def stat-def-floor ${c.dented ? 'stat-dented' : ''}" title="${c.dented ? `Defence ${cardDefence(opts.owner, c)} of ${fullDefence(opts.owner, c)}: worn by attacks and heat. It mends 1 at each of its owner's dawns (more with Repair), and the wear on its slot stays if it leaves. ` : ''}Defence: heat aimed at this card wears its defence first (pierce ignores it), and the wear lasts; removal can only reach cards with low enough defence">${pv('⛨', cardDefence(opts.owner, c), opts.settled?.defence, opts.preview?.defence)}</b><span class="card-stats ${(def.attack ?? 0) > 0 && s ? '' : 'card-stats-stab'}">${(def.attack ?? 0) > 0 && s ? attackBadge(cardAttack(s, opts.owner, c), c.dimmed) : ''}<b class="stat-stab ${(c.stability ?? 0) <= 1 ? 'stat-low' : ''}" title="${def.kind === 'command' ? 'Stability: a Hero never fades by itself, but heat past its defence wears this down; at 0 it falls' : 'Stability: turns before it fades into the discard pile'}">${pv('◷', c.stability ?? 0, opts.settled?.stability, opts.preview?.stability)}</b></span>`
        : stabilityBadge(def);
    const race = def.race !== undefined ? ` race-${def.race}` : '';
    const guard = (opts.tableau && (def.passive ?? []).some((x) => x.type === 'taunt') ? ' card-guard' : '') + (c.fused?.length ? ' card-has-fused' : '');
    return `
      <button class="card kind-${def.kind}${race}${guard} rarity-${def.rarity ?? 'dwarf'} ${opts.tableau ? 'card-table' : ''} ${opts.landscape ? 'card-landscape' : ''} ${state}${opts.targeted && !state.includes('card-choosable') ? ' card-targeted' : ''}" ${opts.static ? '' : `data-uid="${c.uid}"`} data-card="${def.id}" ${c.growth ? `data-growth="${c.growth}"` : ''} ${extra} ${attrs} style="--kc:${KIND_COLOUR[def.kind]}">
        ${cardStock(def)}<div class="card-glyph">${cardArtLite(def, true)}</div>${raceRow(def)}
        ${growth}${resonance}${fusedTags}${stats}
        <div class="card-name">${esc(def.name.toLowerCase())}</div>
        <div class="card-text">${cardBodyHtml(def, opts.option ?? c.choice, this.liveNumbers(c, opts))}${fusedText}</div>
        <div class="card-kind">${typeLine(def)}</div>
      </button>`;
  }

  /** What a card's Fusion cards add, under its own text (a rule above each, in its colour), so the card says all it does. */
  private fusedTextHtml(c: CardInstance | undefined): string {
    return (c?.fused ?? [])
      .map((f) => {
        const fd = cardDef(f.defId);
        const text = fd.text.replace(/^\{fusion\}\.\s*/, '');
        return text ? `<span class="card-fused-text" style="--fk:${KIND_COLOUR[fd.kind]}" title="${esc(`From ${fd.name}, fused onto it`)}">${cardTextHtml(text)}</span>` : '';
      })
      .join('');
  }

  /**
   * A card's heat, cooling and shields as they now stand (its neighbours' resonance, Forge cards, the
   * table): in play its dawn's numbers, in your hand what it would do as you play it.
   */
  private liveNumbers(c: CardInstance, opts: { hand?: boolean; owner?: PlayerState }): Record<number, number> {
    const s = this.state;
    const owner = opts.owner ?? (opts.hand ? this.viewer() : undefined);
    if (!s || !owner) return {};
    const def = cardDef(c.defId);
    const inPlay = c.slot !== undefined && owner.tableau.some((x) => x.uid === c.uid);
    if (!inPlay && !opts.hand) return {};
    const when = inPlay ? 'turn' : 'play';
    const effects = (inPlay ? dawnEffects(c) : def.onPlay ?? []).flatMap((e) =>
      e.type === 'heat' || e.type === 'cool' || e.type === 'shield'
        ? // Thermosiphon: the number on the card is per point below zero; shown as the total it now comes to.
          e.plus?.of === 'cold'
          ? [{ type: e.type, amount: e.amount || (e.plus.times ?? 1), now: effectAmount(s, owner, c, e, when) }]
          : [{ type: e.type, amount: e.amount, now: e.amount + effectAmount(s, owner, c, { ...e, amount: 1, plus: undefined, max: undefined }, when) - 1 }]
        : [],
    );
    return liveValues(def.text, effects, inPlay);
  }

  /** The explanations beside a magnified card: its keywords, and its stability and defence (live, for a card in play). */
  private explainCard(defId: string, uid?: string): string {
    const owner = uid ? this.state?.players.find((p) => p.tableau.some((c) => c.uid === uid)) : undefined;
    const c = owner?.tableau.find((x) => x.uid === uid);
    const stats = owner && c ? { stability: c.stability ?? 0, defence: cardDefence(owner, c) } : persists(defId) ? { stability: baseStability(defId) } : {};
    const def = cardDef(defId);
    const first = [this.raceNote(defId), ...raceTraitTags(def).map((g) => `<div><b class="kw kw-trait ${g.nerf ? 'kw-trait-nerf' : ''}">${esc(g.name)}</b><span>${esc(g.text)}</span></div>`)].filter(Boolean);
    return keywordList(def.text, stats, first);
  }

  /** Keyword columns that run longer than the card: the arrow at their foot shows while there is more below. */
  private markKwMore(root: ParentNode = document) {
    root.querySelectorAll<HTMLElement>('.kw-wrap > .kw-list').forEach((list) => {
      list.parentElement!.classList.toggle('more', list.scrollTop + list.clientHeight < list.scrollHeight - 4);
    });
  }

  /** A race card's racial bonus and nerf (and its sub-race), which ride on every card of that race. */
  private raceNote(defId: string): string {
    const def = cardDef(defId);
    const t = def.race !== undefined ? RACE_TRAITS[def.race] : undefined;
    if (!t) return '';
    const sub = def.sub && SUBRACES[def.sub] ? ` · ${SUBRACES[def.sub].name}` : '';
    const head = `<b class="kw kw-race">${esc(RACE_NAMES[def.race!])}${esc(sub)}</b>`;
    // (Its bonus and nerf follow as keywords, those that apply to this card.)
    const theme = def.sub && SUBRACES[def.sub] ? SUBRACES[def.sub].theme : `${plainText(t.bonus)} ${plainText(t.nerf)}`;
    return `<div class="kw-race-row">${head}<span>${esc(theme.replace(/\.*$/, '.'))}</span></div>`;
  }

  /**
   * The magnified card, used by the hover preview and the inspector: the same
   * card stock, gem and badges as the card itself, and, for a card in play
   * (`uid`), its live growth, resonance, defence and stability.
   */
  private bigCard(defId: string, uid?: string): string {
    const def = cardDef(defId);
    const owner = uid ? this.state?.players.find((p) => p.tableau.some((c) => c.uid === uid)) : undefined;
    const c = owner?.tableau.find((x) => x.uid === uid);
    const stats =
      owner && c
        ? `<span class="card-stats"><b class="stat-def" title="Defence">⛨${cardDefence(owner, c)}</b>${(def.attack ?? 0) > 0 ? attackBadge(cardAttack(this.state!, owner, c), c.dimmed) : ''}<b class="stat-stab ${(c.stability ?? 0) <= 1 ? 'stat-low' : ''}" title="Stability">◷${c.stability ?? 0}</b></span>`
        : stabilityBadge(def);
    const race = def.race !== undefined ? ` race-${def.race}` : '';
    return `
      <div class="card card-big kind-${def.kind}${race} rarity-${def.rarity ?? 'dwarf'}" style="--kc:${KIND_COLOUR[def.kind]}">
        ${cardStock(def)}<div class="card-glyph">${cardArtLite(def, true)}</div>${raceRow(def)}
        ${c?.growth ? `<span class="growth">${c.growth}</span>` : ''}${stats}
        <div class="card-name">${esc(def.name.toLowerCase())}</div>
        <div class="card-text">${cardBodyHtml(def, c?.choice, owner && c ? this.liveNumbers(c, { owner }) : {})}${this.fusedTextHtml(c)}</div>
        <div class="card-kind">${typeLine(def)}</div>
      </div>`;
  }

  /** What the viewer's Hero can do right now: its usable abilities (by index), and 'attack' if it may attack. */
  private heroActions(me: PlayerState): (number | 'attack')[] {
    const s = this.state!;
    const hero = commandCard(me);
    if (!hero || hero.dimmed) return [];
    const out: (number | 'attack')[] = (cardDef(hero.defId).abilities ?? []).map((_, i) => i).filter((i) => !heroAbilityProblem(s, me, i));
    const { cards, sun } = aimChoices(s, me);
    if (cardAttack(s, me, hero) > 0 && (sun || cards.length)) out.push('attack');
    return out;
  }

  /**
   * Your Hero, in the stage's place (middle right), full size like any card there: tap one of its ability
   * lines to use it, or its attack (bottom left) to attack with it.
   */
  private renderHeroPanel(): string {
    const s = this.state!;
    const me = this.viewer();
    const hero = commandCard(me);
    if (!hero || hero.uid !== this.heroPanel) return '';
    const attack = this.heroActions(me).includes('attack');
    const card = this.renderCard(hero, { static: true })
      .replace(/^(\s*)<button class="card /, '$1<div class="card card-still ')
      .replace(/<\/button>\s*$/, '</div>')
      .replace(/ data-act="[^"]*"/, '')
      .replace(/<span class="card-ability" data-ability="(\d+)">/g, (_, i: string) => {
        const why = heroAbilityProblem(s, me, Number(i));
        return why ? `<span class="card-ability card-ability-off" title="${esc(why)}">` : `<span class="card-ability card-ability-on" data-act="hero-ability" data-arg="${i}" role="button">`;
      })
      .replace(/<b class="stat-atk"/, (m) => (attack ? `<b class="stat-atk stat-atk-on" data-act="attack-start" data-arg="${hero.uid}" role="button"` : m));
    return `<div class="stage stage-hero">${card}</div>`;
  }

  private renderStage(): string {
    const st = this.stage;
    const s = this.state!;
    if (!st && this.heroPanel && !isGameOver(s) && this.canAct() && this.heroActions(this.viewer()).length) return this.renderHeroPanel();
    // A card picked from your hand: it waits here while you choose where it goes and what it does.
    const picked = !st && this.pending && !this.pending.attack && this.pending.ability === undefined ? activePlayer(s).hand.find((c) => c.uid === this.pending!.uid) : undefined;
    if (picked) {
      const html = this.renderCard(picked, { static: true, option: this.pending!.choice })
        .replace(/^(\s*)<button class="card /, `$1<div data-uid="${picked.uid}" class="card card-still `)
        .replace(/<\/button>\s*$/, '</div>')
        .replace(/ data-act="[^"]*"/, '');
      // A card that can also be set face down at Lightspeed: say so here, plainly (its slot can be out of sight).
      const me = activePlayer(s);
      const faceDown =
        this.pending!.step === 'slot' && canSetFaceDown(me, picked.defId)
          ? `<button class="btn stage-ls-btn" data-act="choose-slot" data-arg="ls" title="Set it face down in your Lightspeed slot: it springs when its trigger comes">⚡ set face down <small>+1 energy</small></button>`
          : '';
      return `<div class="stage stage-picked">${html}${faceDown}</div>`;
    }
    // Online, while your rival reads your card: say so (you can't act until they have).

    if (!st || isGameOver(s)) return '';
    const actor = s.players.find((p) => p.id === st.actorId)!;
    // A card large and still (already the zoomed view: only its keywords respond, explaining themselves).
    const still = (uid: string, defId: string, option?: string) =>
      this.renderCard({ uid, defId }, { static: true, option })
        .replace(/^(\s*)<button class="card /, '$1<div class="card card-still ')
        .replace(/<\/button>\s*$/, '</div>')
        .replace(/ data-act="[^"]*"/, '')
        .replace(/ data-card="[^"]*"/, '');
    // (Your own card keeps its uid here, so it flies from here to where it lands.)
    const card = st.faceDown ? `<div class="card card-back">${cardBackFace()}</div>` : still('stage', st.defId, st.option).replace('<div class="card ', st.uid ? `<div data-uid="${st.uid}" class="card ` : '<div class="card ');
    // A sprung Lightspeed card: the card that sprang it stands where a played card does (plain, to be read),
    // and the Lightspeed card beside it on the left, the same size.
    if (st.against) {
      const trigger = s.sprung?.find((x) => x.ownerId === st.actorId)?.trigger ?? 'enemyPlays';
      const how = { enemyPlays: 'in answer to this', heated: 'against its heat', targeted: 'against this', cardAttacked: 'against its attack' }[trigger] ?? 'in answer to this';
      return `
      <div class="stage stage-sprung stage-pair">
        <div class="stage-ls"><span class="stage-ls-tag">⚡ lightspeed</span>${card}</div>
        ${still('stage-against', st.against)}
        <div class="stage-caption">${esc(`${actor.name.toLowerCase()} springs ${cardDef(st.defId).name.toLowerCase()} ${how}`)}</div>
      </div>`;
    }
    return `
      <div class="stage ${st.caption && !st.faceDown ? 'stage-sprung' : ''} ${st.confirm ? 'stage-confirm' : ''}">
        ${st.caption && !st.faceDown && st.caption.startsWith('⚡') ? '<span class="stage-ls-tag stage-ls-tag-solo">⚡ lightspeed</span>' : ''}
        ${card}
        ${/* (A plain play needs no words: only a card set face down, or sprung, says what happened.) */ st.caption && st.caption !== 'you play' ? `<div class="stage-caption">${esc(st.caption)}</div>` : ''}
        ${st.confirm && !st.faceDown ? `<button class="btn stage-ok" data-act="stage-ok" title="${esc(actor.name)} waits until you have read their card">OK</button>` : ''}
      </div>`;
  }

  // ---- Sheets --------------------------------------------------------------

  private sheetFrame(title: string, body: string, footer = ''): string {
    return `
      <div class="overlay overlay-soft" data-act="cancel">
        <div class="modal sheet">
          <div class="bar-title">${title}</div>
          <div class="modal-body">${body}</div>
          ${footer}
          <button class="modal-cancel" data-act="cancel">close</button>
        </div>
      </div>`;
  }

  /**
   * A setting changed: relabel its buttons where they stand (settings sheet, options page, campaign),
   * rather than redrawing the page and replaying its entrance.
   */
  private refreshSettings() {
    const values: Record<string, { text: string; disabled?: boolean; tile?: string }> = {
      'toggle-sound': { text: `sound: ${sound.muted ? 'off' : 'on'}`, tile: sound.muted ? 'off' : 'on' },
      'toggle-music': { text: `music: ${sound.musicOn ? 'on' : 'off'}`, tile: sound.musicOn && !sound.muted ? 'on' : 'off', disabled: sound.muted },
      speed: { text: `ai speed: ${this.speed}`, tile: this.speed },
      'toggle-autoconfirm': { text: `auto-confirm: ${this.autoConfirm ? 'on' : 'off'}`, tile: this.autoConfirm ? 'on' : 'off' },
    };
    for (const [act, v] of Object.entries(values)) {
      document.querySelectorAll<HTMLButtonElement>(`[data-act="${act}"]`).forEach((el) => {
        const tile = el.querySelector('.opt-value');
        if (tile) tile.textContent = v.tile ?? v.text;
        else el.textContent = v.text;
        if (v.disabled !== undefined) el.disabled = v.disabled;
      });
    }
  }

  /** Sound, music and AI speed: in the battle's settings sheet and the campaign's. */
  private settingsButtons(): string {
    return `
      <button class="btn" data-act="toggle-sound">${sound.muted ? 'sound: off' : 'sound: on'}</button>
      <button class="btn" data-act="toggle-music" ${sound.muted ? 'disabled' : ''}>${sound.musicOn ? 'music: on' : 'music: off'}</button>
      <button class="btn" data-act="speed">ai speed: ${this.speed}</button>
      <button class="btn" data-act="toggle-autoconfirm" title="Your rival's cards land by themselves after ${AUTO_CONFIRM_MS / 1000}s">auto-confirm: ${this.autoConfirm ? 'on' : 'off'}</button>`;
  }

  private renderSheet(): string {
    const sh = this.sheet!;
    const s = this.state;
    switch (sh.kind) {
      case 'rules':
        return this.sheetFrame('how to play', this.rulesHtml());
      case 'end-day': {
        const left = this.leftUndone();
        return this.sheetFrame(
          'end your day?',
          `<p class="center-text">You still have ${esc(left.length > 1 ? `${left.slice(0, -1).join(', ')} and ${left[left.length - 1]}` : left[0] ?? 'things to do')}.</p>
           <div class="end-day-actions"><button class="btn-primary" data-act="end-day-confirm">end day <small>⏎</small></button><button class="btn" data-act="cancel">keep playing <small>esc</small></button></div>`,
        );
      }
      case 'discard': {
        const me = activePlayer(this.state!);
        const over = me.hand.length - BALANCE.maxHand;
        const picked = new Set(sh.picked);
        // (Each card shown still: tapping it marks it to go, tapping again keeps it.)
        const still = (c: CardInstance) =>
          this.renderCard(c, { static: true })
            .replace(/^(\s*)<button class="card /, '$1<div class="card card-still ')
            .replace(/<\/button>\s*$/, '</div>')
            .replace(/ data-act="[^"]*"/, '');
        const cards = me.hand
          .map((c) => `<button class="discard-pick ${picked.has(c.uid) ? 'on' : ''}" data-act="discard-pick" data-arg="${c.uid}" title="${picked.has(c.uid) ? 'Keep it' : 'Discard it'}">${still(c)}</button>`)
          .join('');
        const left = over - picked.size;
        return this.sheetFrame(
          `discard ${over} card${over === 1 ? '' : 's'}`,
          `<p class="center-text">You can hold ${BALANCE.maxHand} cards at the end of your day. Pick ${over === 1 ? 'the card' : `the ${over} cards`} to discard.</p>
           <div class="discard-grid">${cards}</div>
           <div class="end-day-actions"><button class="btn-primary" data-act="discard-confirm" ${left ? 'disabled' : ''}>${left ? `pick ${left} more` : 'discard and end day'}</button><button class="btn" data-act="cancel">keep playing</button></div>`,
        );
      }
      case 'quit': {
        // What quitting means depends on the game: online and campaign battles are lost; a local game can wait.
        const [text, buttons] = this.online
          ? ['Quit and concede? Your rival wins, and the room closes for you.', '<button class="btn-primary" data-act="quit-concede">concede and leave</button>']
          : this.campaignBattle
            ? ['Retreat from this battle? You lose it, as if your sun had gone supernova.', '<button class="btn-primary" data-act="quit-retreat">retreat</button>']
            : [
                'Leave this game? It is saved: continue it from Quickplay. Or concede it to your rival.',
                '<button class="btn-primary" data-act="to-menu">save and leave</button><button class="btn" data-act="quit-concede">concede</button>',
              ];
        return this.sheetFrame(
          'quit game',
          `<p class="center-text">${text}</p><div class="menu-actions center-row">${buttons}<button class="btn" data-act="cancel">keep playing</button></div>`,
        );
      }
      case 'menu':
        return this.sheetFrame(
          `settings · round ${s?.round ?? ''}`,
          `<div class="menu-list">
            ${this.settingsButtons()}
            <button class="btn" data-act="view-player" data-arg="">players</button>
            <button class="btn" data-act="open-log">game log</button>
            <button class="btn" data-act="rules">how to play</button>
            ${s && !isGameOver(s) ? '<button class="btn" data-act="open-quit">quit game</button>' : '<button class="btn" data-act="to-menu">main menu</button>'}
          </div>`,
        );
      case 'log': {
        // A popover under the log button; the board stays in view (tap anywhere else to close).
        const lastTurn = s!.log[s!.log.length - 1]?.turn;
        const lines = logRows(s!.log.slice(-120), s!.players, this.viewer().id, lastTurn);
        return `<div class="log-pop-overlay" data-act="cancel"></div>
          <div class="log-pop sheet"><div class="log-pop-head"><span class="section-label">game log</span><button class="pill-btn" data-act="cancel">close</button></div><div class="log-list">${lines}</div></div>`;
      }
      case 'pile':
        return this.renderPileSheet(s?.players.find((p) => p.id === sh.playerId));
      case 'player':
        return this.renderPlayerSheet(s!.players.find((p) => p.id === sh.playerId) ?? this.viewer());
      case 'card': {
        const me = s ? activePlayer(s) : null;
        const playable = !!(sh.uid && me && me.hand.some((c) => c.uid === sh.uid) && this.canAct() && !this.pending);
        const button = sh.uid ? `<button class="btn-primary" data-act="play" data-arg="${sh.uid}" ${playable && cardCost(sh.defId ?? '') <= me!.playsLeft ? '' : 'disabled'}>play</button>` : '';
        return `
          <div class="overlay overlay-inspect" data-act="cancel">
            <div class="inspector sheet">
              <div class="inspector-row">${this.inspectorCard(sh)}</div>
              <div class="inspector-actions">${button}<button class="btn" data-act="cancel">close</button></div>
            </div>
          </div>`;
      }
    }
  }

  /**
   * The magnified card in the inspector, with its explanations. A card in play with Fusion cards on it gets a
   * column of tabs by its top right edge: the card itself, then each fused card (purple), to read each one.
   */
  private inspectorCard(sh: Extract<Sheet, { kind: 'card' }>): string {
    const host = sh.table ? this.state?.players.flatMap((p) => p.tableau).find((c) => c.uid === sh.table) : undefined;
    const fused = host?.fused ?? [];
    // (A Hero's abilities stand right beside it, before the explanations, so they are never off screen.)
    if (!fused.length) return this.bigCard(sh.defId, sh.table) + this.explainCard(sh.defId, sh.table);
    const tab = Math.min(Math.max(0, sh.tab ?? 0), fused.length);
    const shown = tab === 0 ? this.bigCard(sh.defId, sh.table) : this.bigCard(fused[tab - 1].defId);
    const explain = tab === 0 ? this.explainCard(sh.defId, sh.table) : this.explainCard(fused[tab - 1].defId);
    const tabs = [host!, ...fused]
      .map((c, i) => `<button class="insp-tab ${i ? 'insp-tab-fused' : ''} ${i === tab ? 'on' : ''}" data-act="inspect-tab" data-arg="${i}">${esc(cardDef(c.defId).name.toLowerCase())}</button>`)
      .join('');
    return `<div class="insp-tabbed"><div class="insp-tabs">${tabs}</div>${shown}</div>${explain}`;
  }

  /** A player's summary: their deck, Command cards and the conditions they fight under. */
  private renderPlayerSheet(p: PlayerState): string {
    const s = this.state!;
    const me = this.viewer();
    const tabs = [me, ...s.players.filter((o) => o.id !== me.id)]
      .map(
        (o) => `
        <button class="sys-tab ${o.id === p.id ? 'sys-tab-on' : ''} ${this.shownDead(o) ? 'sys-tab-dead' : ''}" data-act="view-player" data-arg="${o.id}">
          ${sunOrb({ heat: o.heat, threshold: supernovaThreshold(o), size: 26, dead: this.shownDead(o), label: '' })}
          <span>${o.id === me.id ? 'you' : esc(o.name.toLowerCase())}</span>
        </button>`,
      )
      .join('');
    const commands = p.tableau
      .filter((c) => cardDef(c.defId).kind === 'command')
      .map((c) => `${esc(cardDef(c.defId).name.toLowerCase())}${c.choice ? ` (${cardTextHtml(optionText(c.choice))})` : ''}`)
      .join(' · ');
    return `
      <div class="overlay overlay-inspect" data-act="cancel">
        <div class="sys-wrap sheet">
          <div class="sys-tabs">${tabs}</div>
          <div class="sys-card player-card">
            <div class="sys-kicker">${p.id === me.id ? 'you' : esc(p.name.toLowerCase())}</div>
            ${playerAvatar(p.avatar ?? pictureFor(p.name), 'player-emblem')}
            <h2 class="sys-name">${esc((p.deckName ?? 'custom deck').toLowerCase())}</h2>
            ${commands ? `<p class="muted center-text">Heroes in play: ${commands}</p>` : ''}
            ${p.lightspeed ? `<p class="muted center-text">⚡ ${p.id === me.id ? `Set face down: ${esc(cardDef(p.lightspeed.defId).name.toLowerCase())}` : 'A Lightspeed card is set face down.'}</p>` : ''}
            ${p.conditions?.length ? `<div class="sys-conditions">${p.conditions.map((c) => `<div><b>${esc(c.name.toLowerCase())}</b>${esc(c.text)}</div>`).join('')}</div>` : ''}
            <div class="sys-stats">
              <span>heat ${p.heat}/${supernovaThreshold(p)}</span><span>⛨ ${p.shields}</span><span>${HAND_ICON} ${p.hand.length} in hand</span><span>▤ ${p.deck.length} in deck</span><span>${p.discard.length} discarded</span><span>${p.tableau.length}/${BALANCE.tableauSlots} in play</span>
            </div>
            <button class="modal-cancel" data-act="cancel">close</button>
          </div>
        </div>
      </div>`;
  }

  /** A discard pile, looked through (a deck can't be: what is left in it stays hidden). */
  private renderPileSheet(of?: PlayerState): string {
    const me = this.viewer();
    // A rival's discard pile is public: every card in it was seen.
    if (of && of.id !== me.id) {
      const rows = [...of.discard].reverse().map((c) => `<div class="pile-card">${this.renderCard(c, { static: true })}</div>`).join('');
      return this.sheetFrame(
        `${esc(of.name.toLowerCase())}'s discard · ${of.discard.length}`,
        `<p class="muted center-text">Most recent first. ${esc(of.name)} has ${of.deck.length} card${of.deck.length === 1 ? '' : 's'} left in their deck and ${of.hand.length} in hand.</p><div class="pile-grid">${rows || '<p class="muted">Their discard pile is empty.</p>'}</div>`,
      );
    }
    const rows = [...me.discard].reverse().map((c) => `<div class="pile-card">${this.renderCard(c, { static: true })}</div>`).join('');
    return this.sheetFrame(
      `your discard · ${me.discard.length}`,
      `<p class="muted center-text">Cards that faded, were destroyed or were cancelled, most recent first. When your deck runs out they are shuffled into a new one.</p><div class="pile-grid">${rows || '<p class="muted">Your discard pile is empty.</p>'}</div>`,
    );
  }

  private renderOverlay(s: GameState): string {
    const winner = s.players.find((p) => p.id === s.winnerId);
    // The result lies on the board itself (see renderResult), so the board can still be looked over.
    if (winner) return this.sheet ? this.renderSheet() : '';
    if (this.needsHandoff()) {
      const p = activePlayer(s);
      return `
        <div class="overlay"><div class="modal">
          <div class="bar-title">pass to ${esc(p.name.toLowerCase())}</div>
          <div class="modal-body center">
            <p>Hand the device to ${esc(p.name)}, then reveal your hand.</p>
            <button class="btn-primary" data-act="reveal">reveal hand</button>
          </div>
        </div></div>`;
    }
    if (this.sheet) return this.renderSheet();
    const pend = this.pending;
    if (pend?.step === 'recover') return this.renderRecoverChoice(pend);
    if (!pend || pend.step !== 'choice') return '';

    // A Command card: its options are chosen right on the card, magnified.
    const me = activePlayer(s);
    const card = me.hand.find((c) => c.uid === pend.uid);
    if (!card) return '';
    const big = this.bigCard(card.defId).replace(/<span class="card-opt" data-opt="([^"]+)">/g, '<span class="card-opt card-opt-pick" role="button" data-act="choose-option" data-arg="$1">');
    return `
      <div class="overlay overlay-inspect" data-act="cancel">
        <div class="choice-view">
          <span class="choice-hint">choose one</span>
          ${big}
          <button class="btn" data-act="cancel">cancel</button>
        </div>
      </div>`;
  }

  /** Salvage Drone and friends: choose a card from your discard pile. */
  private renderRecoverChoice(pend: Pending): string {
    const me = activePlayer(this.state!);
    const card = me.hand.find((c) => c.uid === pend.uid);
    if (!card) return '';
    const cards = [...recoverChoices(me, card.defId)]
      .reverse()
      .map((c) => this.renderCard(c, { static: true }).replace('data-act="inspect"', `data-act="choose-recover" data-arg="${c.uid}"`).replace('class="card ', 'class="card card-choosable '))
      .join('');
    return `
      <div class="overlay overlay-soft" data-act="cancel"><div class="modal modal-wide">
        <div class="bar-title">${esc(cardDef(card.defId).name.toLowerCase())} · choose a card to recover</div>
        <div class="modal-body"><div class="pile-grid choose-grid">${cards}</div></div>
        <button class="modal-cancel" data-act="cancel">cancel</button>
      </div></div>`;
  }


}
