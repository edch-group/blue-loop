import {
  activeGlobal,
  activePlayer,
  applyAction,
  BALANCE,
  boostable,
  boosterPool,
  BOOSTERS,
  gameReward,
  PROGRESSION,
  rankName,
  RANK_TIERS,
  rankOf,
  xpToNext,
  canSetLightspeed,
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
  baseStability,
  playsAllowed,
  RACE_NAMES,
  allyChoices,
  cardChoices,
  optionText,
  allyEffectKind,
  cardDefence,
  recoverChoices,
  resonanceBonus,
  supernovaThreshold,
  hasRoomFor,
  targetOf,
  turnForecast,
  type Action,
  type BoosterCard,
  type BoosterKind,
  type CardInstance,
  type CardKind,
  type GameState,
  type PlayerSetup,
  type PlayerState,
} from '../engine';
import { roman, sunOrb, vitals } from './art';
import { backdrop } from './backdrop';
import { DeckBuilder } from './builder';
import { CampaignView, loadCampaign } from './campaign';
import { allDecks, deckById, PRESETS } from './decks';
import { factionAvatar } from './factions';
import { aim, anchorRect, beam, flyFrom, ghost, projectile, pulse, reducedMotion, snapshot, tether, type Snapshot } from './fx';
import { cardArt, cardGlyph, cardTextHtml, keywordHtml, keywordList, KIND_COLOUR, stabilityBadge, symbolIcon, typeLine } from './glyphs';
import { LOG_ICON, MENU_ICON } from './menu-icon';
import { buyBooster, grantReward, profile, setRankPoints, signedIn, signIn, signOut, type RewardResult } from './profile';
import { sound } from './sound';
import { clearSave, loadSave, save } from './storage';
import { cleanCode, hasSeat, inviteLink, LadderClient, newRoomCode, OnlineClient, type LastMove, type LobbySeat } from './online';
import { fitCardText } from './fittext';
import { refreshLift, trackLift } from './lift';
import { animateSuns } from './sun3d';
import { appSize, pageRect, VIEWPORT_EVENT } from './viewport';

type Screen = 'menu' | 'game' | 'campaign';
type MenuPage = 'title' | 'signin' | 'hub' | 'quickplay' | 'options' | 'decks' | 'online' | 'shop';

const HUB_ICONS = {
  collection: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="12" width="18" height="26" rx="3" transform="rotate(-10 17 25)"/><rect x="16" y="10" width="18" height="26" rx="3"/><rect x="24" y="12" width="18" height="26" rx="3" transform="rotate(10 33 25)"/></svg>`,
  shop: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 10h20l2 30H12z"/><path d="M14 10l4 6h12l4-6M24 22l2.4 4.8 5.3.8-3.8 3.7.9 5.2-4.8-2.5-4.8 2.5.9-5.2-3.8-3.7 5.3-.8z"/></svg>`,
  campaign: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 34 22 26 36 32M22 26 26 12 36 32M10 34 14 16 26 12"/><circle cx="10" cy="34" r="3.2"/><circle cx="22" cy="26" r="2.6"/><circle cx="36" cy="32" r="3.6"/><circle cx="26" cy="12" r="3"/><circle cx="14" cy="16" r="2.4"/></svg>`,
  quickplay: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="24" r="8"/><circle cx="36" cy="24" r="4.5"/><path d="M26 24h4M27.5 20.5 31 24l-3.5 3.5"/></svg>`,
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
  step: 'choice' | 'enemy' | 'ally' | 'recover' | 'slot';
  /** A Command card's option. */
  choice?: string;
  enemyUid?: string;
  allyUid?: string;
  recoverUid?: string;
  slot?: number;
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
  /** The option the player picked on a card with choices (a Command card's dawn effect): highlighted on it. */
  option?: string;
  /** The rival card it will remove (destroy, return or erode): aimed at while it waits on the stage. */
  target?: string;
}

/** Bottom sheets / dialogs that are not part of a pending move. */
type Sheet =
  | { kind: 'menu' }
  | { kind: 'log' }
  | { kind: 'rules' }
  /** A deck or discard pile: the viewer's, or (`playerId`) a rival's discard pile. */
  | { kind: 'pile'; pile: 'deck' | 'discard'; playerId?: string }
  /** A player's summary: deck, commands and conditions. */
  | { kind: 'player'; playerId: string }
  /** Tap-to-inspect on touch screens: a readable card with its action. */
  | { kind: 'quit' }
  /** Ending the day with plays still left: are you sure? */
  | { kind: 'end-day' }
  | { kind: 'card'; defId: string; uid?: string; /** A card in play: its uid, so the magnified card shows its live stats. */ table?: string };

/** Menu buttons that lead somewhere: the page they're on lifts away (and the star spins up) before the next one comes in. */
const MENU_NAV = new Set(['menu-page', 'open-decks', 'campaign-new', 'campaign-continue', 'continue', 'new-game', 'to-menu']);
const MENU_LEAVE_MS = 300;
const SPEED_KEY = 'blue-loop:ai-speed';
/** A rival's cards land by themselves after a moment, rather than waiting for OK. */
const AUTO_CONFIRM_KEY = 'blue-loop:auto-confirm';
const AUTO_CONFIRM_MS = 2000;
const SPEED_FACTOR: Record<Speed, number> = { slow: 1.7, normal: 1, fast: 0.4 };
/** Pause after each kind of AI action, before the next one (ms at normal speed). */
const AI_PAUSE: Record<Action['type'], number> = { playCard: 1700, setTarget: 500, endTurn: 1200, concede: 0 };
const TOAST_MS = 2600;
const LONG_PRESS_MS = 450;
/** Log lines worth emphasising: hits, supernovas, choices and so on. */
const KEY_LOG = /heats to|SUPERNOVA|chooses|wins|shields absorb|instability|destroys|stings|replaces|Lightspeed|cancelled|returns|recovers|shuffles/;
const HOT = '#f0a07a';
const COOLING = '#8fc6ff';
const SHIELDING = '#a9b8ff';
/** How long each dawn effect gets on the table, before the next fires (scaled by the game speed). */
const PULSE_STEP = 720;
/** The log button: lines of text in a page. */
/** Cards in hand: a small fan of three cards. */
/** The gap between cards dealt into the opening hand (and between faded cards leaving the table). */
const DEAL_STEP_MS = 110;
/** A faded card's way out: the deal's flight (520ms), played backwards into the discard pile. */
const FADE_OUT = { duration: 520, easing: 'cubic-bezier(.8,.2,.8,.2)', endOpacity: 0 };
const HAND_ICON = '<svg class="hand-icon" viewBox="0 0 16 14" aria-label="in hand"><rect x="2.2" y="3" width="6" height="8.6" rx="1.1" transform="rotate(-18 5.2 11)"/><rect x="5" y="1.8" width="6" height="8.6" rx="1.1"/><rect x="7.8" y="3" width="6" height="8.6" rx="1.1" transform="rotate(18 10.8 11)"/></svg>';
/** Clicks that make their own sound (or none): moves on the table and picks on the map. */
const QUIET_ACTS = new Set(['play', 'end-turn', 'choose-option', 'choose-enemy', 'choose-ally', 'choose-recover', 'choose-slot', 'stage-ok', 'inspect', 'cmp-select', 'cmp-anomaly', 'cmp-deselect', 'cmp-end-turn', 'cmp-start']);

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

interface MenuSeat {
  name: string;
  isAI: boolean;
  deckId: string;
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
  private signinAvatar: number | null = null;
  /** The ranked ladder, while queued for a match. */
  private ladder: LadderClient | null = null;
  /** The booster just opened in the shop. */
  private opened: { kind: BoosterKind; cards: BoosterCard[] } | null = null;
  private state: GameState | null = null;
  private pending: Pending | null = null;
  private stage: Stage | null = null;
  private sheet: Sheet | null = null;
  /** A move held back until the viewer has read its card on the stage (then it lands and animates). */
  private landing: (() => void) | null = null;
  /** The staged rival card has played its arrival sound (so it does not sound again as it lands). */
  private entranceHeard = false;
  /** A menu page is playing out (see leaveMenu); further clicks wait. */
  private menuLeaving = false;
  /** The page last drawn, so a new one can come in with a little rise. */
  private shownPage = '';
  /** Auto-confirm: a rival's card waits on the stage for a moment, then lands by itself. */
  private autoConfirm = false;
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
    { name: profile().name || 'Commander', isAI: false, deckId: PRESETS[0].id },
    { name: "Xel'Naru", isAI: true, deckId: PRESETS[1].id },
  ];

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
    document.addEventListener('mouseover', (e) => {
      const kw = (e.target as HTMLElement).closest?.<HTMLElement>('.kw[data-kw]');
      // Not where the card's explanations are already laid out beside it.
      if (!kw || this.touch || kw.closest('.zoom-card, .inspector-row, .card-preview')?.querySelector('.kw-list')) return tip.classList.remove('show');
      const k = KEYWORDS[kw.dataset.kw!];
      if (!k) return;
      tip.innerHTML = `${keywordHtml(kw.dataset.kw!, kw.dataset.kv, { named: true })} ${esc(k.explain(kw.dataset.kv))}`;
      const r = pageRect(kw);
      const page = appSize();
      tip.classList.add('show');
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = `${Math.max(8, Math.min(page.w - w - 8, r.left + r.width / 2 - w / 2))}px`;
      tip.style.top = `${r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8}px`;
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
      const sel = (e.target as HTMLElement).dataset.dbSelect;
      if (sel) this.builder.onSelect(sel, (e.target as HTMLSelectElement).value);
      if ((e.target as HTMLElement).dataset.seatName === '0' && this.online && this.screen === 'menu') this.online.setup(this.joinInfo());
    });
    root.addEventListener('mouseover', (e) => this.onHover(e));
    root.addEventListener('pointerdown', (e) => this.onPressStart(e));
    window.addEventListener('pointermove', (e) => this.onPressMove(e));
    window.addEventListener('pointerup', () => this.onPressEnd());
    window.addEventListener('pointercancel', () => this.onPressEnd());
    // Right-click a card (anywhere) to read it large.
    root.addEventListener('contextmenu', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (!card) return;
      e.preventDefault();
      this.zoom(card.dataset.card!);
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
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
    // Re-lay out whenever the page's size settles (after a rotation the first resize event can be stale).
    window.addEventListener(VIEWPORT_EVENT, () => {
      this.fitHand();
      if (this.screen === 'campaign') this.campaign.afterRender(this.root);
    });
  }

  start() {
    backdrop.mount();
    // An invite link (?room=CODE) opens the online page, ready to join.
    const invited = cleanCode(new URLSearchParams(location.search).get('room') ?? '');
    if (invited) {
      this.net.joinCode = invited;
      this.menuPage = 'online';
      // Already holding a seat in that room (a reload, or the tab was closed): go straight back to it.
      if (hasSeat(invited)) return this.goOnline(invited);
    }
    this.render();
  }

  // -------------------------------------------------------------------------
  // Online 1v1
  // -------------------------------------------------------------------------

  /** Create a room (no code) or join one, with the first seat's name and deck. */
  /** Your name, deck and race, as the room needs them. */
  private joinInfo() {
    const seat = this.seats[0];
    const deck = deckById(seat.deckId) ?? PRESETS[0];
    return { name: seat.name.trim() || 'Commander', deck: deck.cards, deckName: deck.name, species: deck.race, profileId: profile().id };
  }

  private goOnline(code?: string) {
    this.leaveOnline();
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
          // The ladder's word on a ranked game: what it earned, and where it left you.
          setRankPoints(r.rankPoints);
          this.resultExtra = this.rewardLine(grantReward(r.reward, r.won));
          this.render();
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
  private findRanked() {
    this.ladder?.close();
    const p = profile();
    this.net.searching = true;
    this.ladder = new LadderClient(p.id, this.joinInfo().name, {
      queued: (rp) => {
        setRankPoints(rp);
        this.render();
      },
      match: (room, rival, rp) => {
        setRankPoints(rp);
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
    const sprung = this.sprungLightspeed(prev, next);
    if (sprung) this.stage = sprung;
    const land = () => {
      const before = snapshot(this.root);
      if (last.action.type !== 'setTarget') backdrop.spin();
      this.state = next;
      if (isGameOver(next) && !isGameOver(prev)) this.holdResult(next, last.action);
      this.render();
      this.surfaceLog(prev);
      this.animate(prev, next, last.action, actor, before);
      if (turnPassed) this.announceTurn(450);
    };
    // The rival's card takes effect once the viewer has read it and said OK.
    if (this.stage?.confirm && !isGameOver(next)) {
      this.landing = land;
      this.render();
      this.stageEntrance(actor.id);
      return;
    }
    land();
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
    if (this.autoConfirm && stage?.confirm) window.setTimeout(() => this.stage === stage && this.confirmStage(), AUTO_CONFIRM_MS);
    const card = this.root.querySelector<HTMLElement>('.stage .card');
    const side = this.root.querySelector<HTMLElement>(`.tableau[data-owner="${actorId}"] .tableau-row`) ?? this.root.querySelector<HTMLElement>(`[data-anchor="pill:${actorId}"]`);
    if (card && side) flyFrom(card, pageRect(side), { duration: 560 });
    // A removal card aims at what it will take, until it is confirmed (or the stage moves on).
    this.unaim?.();
    this.unaim = null;
    const target = stage?.target;
    if (target && stage?.confirm) {
      const rect = (sel: string) => {
        const el = this.root.querySelector(sel);
        return el ? pageRect(el) : null;
      };
      this.unaim = aim(() => rect('.stage .card'), () => rect(`.tableau [data-uid="${target}"]`), { delay: 560, alive: () => this.stage === stage });
    }
  }

  /** Takes away a staged card's aim (see stageEntrance). */
  private unaim: (() => void) | null = null;

  /**
   * Leaving a menu page: the button pressed lifts up and fades (a quick rise that eases off), the rest of
   * the page drifts up after it, and the star spins faster, as it does on the board when a move is made.
   */
  private leaveMenu(el: HTMLElement) {
    this.menuLeaving = true;
    backdrop.spin();
    backdrop.spin();
    const ease = 'cubic-bezier(.1,.75,.3,1)';
    const button = el.closest<HTMLElement>('.hub-col') ?? el;
    button.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-34px)' },
      ],
      { duration: MENU_LEAVE_MS, easing: ease, fill: 'forwards' },
    );
    this.menuParts().forEach((part, i) => {
      if (part === button || part.contains(button)) return;
      part.animate(
        [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(-14px)' },
        ],
        { duration: MENU_LEAVE_MS - 40, delay: Math.min(60, i * 15), easing: ease, fill: 'forwards' },
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

  /** End the day, checking first if there are still cards that could be played. */
  private requestEndDay() {
    const s = this.state;
    if (!s || !this.canAct() || this.pending) return;
    const me = activePlayer(s);
    const playable = me.playsLeft > 0 && me.hand.some((c) => hasRoomFor(me, c.defId) && (cardDef(c.defId).kind !== 'lightspeed' || canSetLightspeed(me)));
    if (playable && this.sheet?.kind !== 'end-day') {
      this.sheet = { kind: 'end-day' };
      return this.render();
    }
    this.sheet = null;
    this.dispatch({ type: 'endTurn' });
  }

  /** The viewer has read the rival's card on the stage: it goes, and the rival carries on. */
  private confirmStage() {
    if (!this.stage?.confirm) return;
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
        return { name: s.name.trim() || 'Unnamed', isAI: s.isAI, deck: deck.cards, deckName: deck.name, species: deck.race };
      });
    this.begin(createGame({ seed: (Math.random() * 2 ** 31) | 0, players }));
  }

  private continueGame() {
    const saved = loadSave();
    if (saved) this.begin(saved);
  }

  private begin(state: GameState) {
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
    const humans = s.players.filter((pl) => !pl.isAI).length;
    const plays = `${p.playsLeft} card${p.playsLeft === 1 ? '' : 's'} to play`;
    this.showBanner('dawn', humans > 1 ? `${p.name} · ${plays}` : `round ${roman(s.round)} · ${plays}`, delay);
  }

  /** Large centred announcement (bloom, sweep, chord), outside the re-rendered root. */
  private showBanner(text: string, sub: string, delay = 0, screen: Screen = 'game') {
    window.setTimeout(() => {
      if (this.screen !== screen) return; // left the screen before it showed
      document.querySelectorAll('.turn-banner').forEach((b) => b.remove());
      const el = document.createElement('div');
      el.className = `turn-banner ${text.length > 12 ? 'turn-banner-long' : ''}`;
      el.innerHTML = `<div class="turn-banner-glow"></div><div class="turn-banner-text">${esc(text)}</div><div class="turn-banner-sub">${esc(sub.toLowerCase())}</div>`;
      document.body.appendChild(el);
      sound.turn();
      window.setTimeout(() => el.remove(), 2000);
    }, delay);
  }

  /** Opening hand: shuffle, then deal the viewer's cards in one by one. */
  private dealOpening() {
    sound.shuffle();
    this.root.querySelectorAll<HTMLElement>('.hand [data-uid]').forEach((el, i) => {
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
    el.animate(
      [
        { transform: `translate(${oldLeft - newLeft}px, ${Number.isFinite(oldFy) ? oldFy : 0}px) rotate(${Number.isFinite(oldRot) ? oldRot : 0}deg)` },
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
    const turnPassed = activePlayer(prev).id !== activePlayer(next).id;
    this.pending = null;
    if (this.sheet?.kind === 'card') this.sheet = null;
    this.stage = actor.isAI ? this.stageFor(actor, action) : null;
    // With someone watching, an AI's card waits on the stage until they have read it.
    if (this.stage && animate && !isGameOver(next) && next.players.some((p) => !p.isAI)) this.stage.confirm = true;
    const sprung = this.sprungLightspeed(prev, next);
    if (sprung) this.stage = sprung;
    const land = () => {
      const before = animate ? snapshot(this.root) : null;
      if (animate && action.type !== 'setTarget') backdrop.spin();
      this.state = next;
      // An AI's attacks bring its target's tableau onto the table.
      if (actor.isAI && action.type === 'setTarget' && action.targetId !== this.viewer().id) this.viewRivalId = action.targetId;
      this.persist(next);
      this.syncViewer();
      if (isGameOver(next) && !isGameOver(prev)) this.holdResult(next, animate ? action : { type: 'concede', playerId: '' });
      this.render();
      if (before) {
        this.surfaceLog(prev);
        this.animate(prev, next, action, actor, before);
      }
      if (turnPassed) this.announceTurn(450);
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
    land();
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

  private stageFor(actor: PlayerState, action: Action): Stage | null {
    if (action.type !== 'playCard') return null;
    const card = actor.hand.find((c) => c.uid === action.cardUid);
    if (!card) return null;
    if (cardDef(card.defId).kind === 'lightspeed') return { defId: card.defId, actorId: actor.id, faceDown: true, caption: `${actor.name.toLowerCase()} sets a card face down` };
    return { defId: card.defId, actorId: actor.id, option: action.choice, target: action.enemyUid };
  }

  /** A Lightspeed card that just sprang (revealed from face down into its owner's discard pile), announced for everyone. */
  private sprungLightspeed(prev: GameState, next: GameState): Stage | null {
    for (const was of prev.players) {
      const card = was.lightspeed;
      const now = next.players.find((p) => p.id === was.id)!;
      if (!card || now.lightspeed || now.eliminated) continue;
      // A rival's face-down card is hidden (online); the one that sprang is now on top of their discard pile.
      const defId = now.discard[now.discard.length - 1]?.defId ?? card.defId;
      const name = cardDef(defId).name;
      this.showBanner('lightspeed!', `${now.name} springs ${name}`, 150);
      sound.flare();
      const stage: Stage = { defId, actorId: now.id, caption: `⚡ ${now.name.toLowerCase()} springs` };
      // It shows for a few seconds, then fades away by itself (not lingering until someone acts).
      window.setTimeout(() => {
        if (this.stage !== stage) return;
        this.stage = null;
        const el = this.root.querySelector<HTMLElement>('.stage-sprung');
        if (!el) return;
        el.classList.add('stage-out');
        window.setTimeout(() => el.remove(), 400);
      }, 3500);
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
    while (!isGameOver(s) && activePlayer(s).isAI && guard++ < 5000) s = applyAction(s, chooseAIAction(s));
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

    // --- Card movement -----------------------------------------------------
    const inHand = new Set(vNext.hand.map((c) => c.uid));
    const endingTurn = action.type === 'endTurn';
    let drawIndex = 0;

    // Removal: a glowing arc from the removing card to each rival card it destroys, returns or
    // erodes; a removed card lingers under the arc before it goes.
    const removalAt = new Map<string, number>();
    if (action.type === 'playCard') {
      const rivalCards = (st: GameState) => new Map(st.players.filter((p) => p.id !== actor.id).flatMap((p) => p.tableau.map((c) => [c.uid, c] as const)));
      const was = rivalCards(prev);
      const now = rivalCards(next);
      const hitCards = [...was].filter(([uid, c]) => !now.has(uid) || (now.get(uid)!.stability ?? 0) < (c.stability ?? 0)).map(([uid]) => uid);
      // From the removing card once it has landed (in the tableau, or on the stage), else the attacker's sun.
      const from = () => {
        const src = this.root.querySelector(`.tableau [data-uid="${action.cardUid}"]`) ?? this.root.querySelector('.stage .card');
        return src ? pageRect(src) : orbRect(actor.id);
      };
      hitCards.forEach((uid, i) => {
        const el = root.querySelector(`[data-uid="${uid}"]`);
        const to = before.cards.get(uid)?.rect ?? (el ? pageRect(el) : null);
        if (!to) return;
        removalAt.set(uid, tether(from, to, { delay: (actor.isAI ? 600 : 470) + i * 140 }));
      });
    }

    root.querySelectorAll<HTMLElement>('[data-uid]').forEach((el) => {
      const uid = el.dataset.uid!;
      const old = before.cards.get(uid);
      if (old && el.parentElement?.classList.contains('hand') && old.html.includes('data-hand=')) {
        // A card already in hand that the fan moved: slide it along the fan, in the hand's own space.
        this.refan(el, old.html);
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
    const replayEnd = pulses.length ? this.replayPulses(next, prev, before) : 0;
    let faded = 0;
    before.cards.forEach((old, uid) => {
      if (root.querySelector(`[data-uid="${uid}"]`)) return;
      let to: DOMRect | null = null;
      if (vNext.discard.some((c) => c.uid === uid)) to = anchorRect(root, 'discard');
      else if (!to) {
        const binned = next.players.find((p) => p.id !== vNext.id && p.discard.some((c) => c.uid === uid));
        if (binned) to = anchorRect(root, `discard:${binned.id}`);
      }
      if (!to) {
        const owner = next.players.find((p) => [...p.deck, ...p.hand, ...p.discard].some((c) => c.uid === uid));
        if (owner) to = orbRect(owner.id);
      }
      const at = removalAt.get(uid);
      if (at !== undefined && this.lingerInSlot(prev, uid, old.html, at)) return;
      // A card that faded at dawn stays in its slot while the day's effects play out, then goes.
      if (replayEnd > 0 && this.fadeFromSlot(prev, uid, old.html, replayEnd, to, { w: old.w, h: old.h }, faded++)) return;
      // Faded at a dawn with nothing to replay: still one at a time.
      if (endingTurn && prev.players.some((p) => p.tableau.some((c) => c.uid === uid))) {
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
        animateSuns();
        window.setTimeout(() => {
          el.innerHTML = now;
          animateSuns();
        }, at);
      });
    };
    const hit = (id: string, at: number, byEnemy: boolean) => {
      const p = next.players.find((pl) => pl.id === id)!;
      const was = prev.players.find((pl) => pl.id === id)!;
      if (!handled.has(id)) holdUntil(p, was, at);
      handled.add(id);
      const dHeat = p.heat - was.heat;
      const lostShields = byEnemy ? Math.max(0, was.shields - p.shields) : 0;
      const gainedShields = Math.max(0, p.shields - was.shields);
      const mine = id === viewer.id;
      window.setTimeout(() => {
        const r = orbRect(id);
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
        const a = orbRect(source.id);
        const b = orbRect(p.id);
        const at = a && b ? projectile(a, b, HOT, { delay: delay + 110 * volley++, size: 34 }) : delay;
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
          window.setTimeout(() => sound.upgrade(), delay);
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

    for (const p of next.players) {
      const was = prev.players.find((pl) => pl.id === p.id)!;
      if (p.eliminated && !was.eliminated) {
        window.setTimeout(() => sound.supernova(), 650);
        pulse(orb(p.id), 'fx-nova', 600);
        pulse(root.querySelector('.game'), 'fx-flash', 650);
      }
    }
    if (vNext.deck.length === 0 && vPrev.deck.length > 0) pulse(root.querySelector('[data-anchor="deck"]'), 'fx-shuffle');
  }

  /** When the result may show on the board (after the game's last moves have played out). */
  private resultAt = 0;
  /** Extra lines under the result (what the game earned you). */
  private resultExtra = '';

  /** What a reward came to, for under the result. */
  private rewardLine(r: RewardResult): string {
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
    const kind = this.online ? (this.net.ranked ? null : 'online') : humans === 1 ? 'ai' : null;
    if (viewer && kind) {
      const won = next.winnerId === viewer.id;
      this.resultExtra = this.rewardLine(grantReward(gameReward(kind, won, { conceded: next.concededBy === viewer.id }), won));
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
    const n = (state.turnPulses ?? []).filter((p) => p.kind !== 'start').length;
    return n ? 700 + n * PULSE_STEP * SPEED_FACTOR[this.speed] + 400 : 0;
  }

  /**
   * A day's start, effect by effect: each card that fires lights up, and its
   * effect flies from it to the sun it reaches (a flare of heat to the rival's
   * sun, a cooling beam or a shield beam to its owner's), whose numbers change
   * as it lands. Regional instability and the table strike from the top of the
   * screen. Returns when the last effect has landed.
   */
  private replayPulses(next: GameState, prev: GameState, before: Snapshot): number {
    const root = this.root;
    const id = ++this.replayId;
    const all = next.turnPulses ?? [];
    const steps = all.filter((p) => p.kind !== 'start');
    const step = PULSE_STEP * SPEED_FACTOR[this.speed];
    const viewer = this.viewer();
    const orbRect = (pid: string) => anchorRect(root, `player:${pid}`) ?? before.anchors.get(`player:${pid}`) ?? anchorRect(root, `pill:${pid}`);
    // Show a sun with given numbers (its planets as they are now).
    const show = (pid: string, sun: { heat: number; shields: number; eliminated: boolean }) => {
      if (id !== this.replayId) return;
      const p = next.players.find((x) => x.id === pid)!;
      root.querySelectorAll(`[data-anchor="player:${pid}"] .vit`).forEach((vit) => {
        vit.outerHTML = vitals({ heat: sun.heat, threshold: supernovaThreshold(p), shields: sun.shields, dead: sun.eliminated, id: pid, orbit: p.orbit });
      });
      animateSuns();
    };
    // Every sun starts where it was as the turn began (shields already faded).
    const start = all.find((p) => p.kind === 'start')?.suns ?? Object.fromEntries(prev.players.map((p) => [p.id, { heat: p.heat, shields: p.shields, eliminated: p.eliminated }]));
    for (const p of next.players) show(p.id, start[p.id] ?? { heat: p.heat, shields: p.shields, eliminated: p.eliminated });
    let last = start;
    let t = 700;
    for (const ps of steps) {
      const at = t;
      const was = last;
      last = ps.suns;
      const fromEl = ps.uid ? root.querySelector(`.tableau [data-uid="${ps.uid}"]`) : null;
      const from = fromEl ? pageRect(fromEl) : ps.uid ? before.cards.get(ps.uid)?.rect ?? null : (root.querySelector('.round-box') ? pageRect(root.querySelector('.round-box')!) : null);
      const to = orbRect(ps.to);
      if (fromEl) pulse(fromEl, 'fx-trigger', at);
      let land = at + 300;
      if (from && to) {
        if (ps.kind === 'heat' || ps.kind === 'selfHeat' || ps.kind === 'unstable') land = projectile(from, to, HOT, { delay: at + 120, size: ps.kind === 'heat' ? 34 : 26, duration: 520 });
        else if (ps.kind === 'cool') land = beam(from, to, COOLING, { delay: at + 120 });
        else if (ps.kind === 'shield') land = beam(from, to, SHIELDING, { delay: at + 120, width: 5 });
      }
      window.setTimeout(() => {
        if (id !== this.replayId) return;
        if (ps.kind === 'heat' || ps.kind === 'selfHeat' || ps.kind === 'unstable') sound.launch();
        else if (ps.kind === 'cool') sound.thermo();
        else if (ps.kind === 'draw') sound.draw();
      }, at + 120);
      window.setTimeout(() => {
        if (id !== this.replayId) return;
        // Every sun that changed takes its new numbers, with what changed floating over it.
        for (const p of next.players) {
          const a = was[p.id], b = ps.suns[p.id];
          if (!a || !b || (a.heat === b.heat && a.shields === b.shields && a.eliminated === b.eliminated)) continue;
          show(p.id, b);
          const r = orbRect(p.id);
          const dHeat = b.heat - a.heat, dShield = b.shields - a.shields;
          if (r && dHeat) floatNumber(r, dHeat > 0 ? `+${dHeat}` : `−${-dHeat}`, dHeat > 0 ? 'hot' : 'cool', 0);
          if (r && dShield) floatNumber(r, dShield > 0 ? `⛨+${dShield}` : `⛨−${-dShield}`, 'block', dHeat ? 1 : 0);
          const cls = dHeat > 0 ? 'fx-hot' : dHeat < 0 ? 'fx-cold' : 'fx-shield';
          pulse(root.querySelector(`[data-anchor="player:${p.id}"]`), cls, 0);
          if (dHeat > 0) {
            if (p.id === viewer.id && ps.source !== viewer.id) {
              sound.hurt(dHeat);
              hurtFlash();
            } else if (p.id !== ps.source) sound.strike(dHeat);
            else sound.impact(true);
          } else if (dHeat < 0) sound.impact(false);
          if (dShield < 0) sound.block();
          else if (dShield > 0 && !dHeat) sound.shield();
        }
      }, land);
      t += step;
    }
    // Finally the suns as they really are.
    const end = t + 200;
    window.setTimeout(() => {
      if (id !== this.replayId) return;
      for (const p of next.players) show(p.id, { heat: p.heat, shields: p.shields, eliminated: p.eliminated });
    }, end);
    return end;
  }

  /**
   * A card taken out of a tableau by removal stays in its slot on the table
   * (a copy, in place of the empty slot) while the removal's arc holds it,
   * then dissolves. Returns false if its slot is not on the table.
   */
  private lingerInSlot(prev: GameState, uid: string, html: string, at: number): boolean {
    const owner = prev.players.find((p) => p.tableau.some((c) => c.uid === uid));
    const slot = owner?.tableau.find((c) => c.uid === uid)?.slot;
    const cell = owner && slot !== undefined ? this.root.querySelector(`.tableau[data-owner="${owner.id}"] .tableau-row`)?.children[slot] : null;
    if (!cell || cell.hasAttribute('data-uid')) return false;
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const copy = holder.firstElementChild as HTMLElement;
    copy.removeAttribute('data-uid');
    copy.removeAttribute('data-act');
    copy.classList.remove('card-choosable');
    copy.classList.add('card-removing');
    const empty = cell as HTMLElement;
    empty.replaceWith(copy);
    const dissolve = copy.animate(
      [
        { opacity: 1, filter: 'brightness(1)', transform: 'translateZ(8px) scale(1)' },
        { opacity: 1, filter: 'brightness(1.6)', transform: 'translateZ(20px) scale(1.06)', offset: 0.35 },
        { opacity: 0, filter: 'brightness(2.2) blur(3px)', transform: 'translateZ(8px) scale(0.7)' },
      ],
      { duration: 520, delay: at, easing: 'ease-in', fill: 'both' },
    );
    dissolve.onfinish = () => {
      if (copy.isConnected) copy.replaceWith(empty);
    };
    return true;
  }

  /**
   * A card that faded at dawn: a copy stays in its slot (in the table's perspective, as it was) until
   * `at`, while its last effects play out, then flies to where it went. False if its slot isn't on the table.
   */
  private fadeFromSlot(prev: GameState, uid: string, html: string, at: number, to: DOMRect | null, size: { w: number; h: number }, order = 0): boolean {
    const owner = prev.players.find((p) => p.tableau.some((c) => c.uid === uid));
    const slot = owner?.tableau.find((c) => c.uid === uid)?.slot;
    const cell = owner && slot !== undefined ? this.root.querySelector(`.tableau[data-owner="${owner.id}"] .tableau-row`)?.children[slot] : null;
    if (!cell || cell.hasAttribute('data-uid')) return false;
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const copy = holder.firstElementChild as HTMLElement;
    // It keeps its uid, so the dawn replay can still light it up as its last effects fire.
    copy.removeAttribute('data-act');
    copy.classList.remove('card-choosable', 'lifted');
    const empty = cell as HTMLElement;
    empty.replaceWith(copy);
    // They leave one at a time, like the opening hand dealt in reverse: each lifts off and speeds into the pile.
    window.setTimeout(() => {
      if (!copy.isConnected) return;
      const from = pageRect(copy);
      copy.replaceWith(empty);
      ghost(html, from, to, { size, ...FADE_OUT });
      sound.draw();
    }, at + order * DEAL_STEP_MS);
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

  private startPlay(uid: string) {
    // Tapping the card that is waiting to be placed puts it back.
    if (this.pending?.uid === uid) {
      this.pending = null;
      return this.render();
    }
    const s = this.state!;
    const me = activePlayer(s);
    const card = me.hand.find((c) => c.uid === uid);
    if (!card) return;
    if (me.playsLeft <= 0) {
      this.showToast('No plays left today: end your day.', 'info');
      sound.error();
      return;
    }
    if (cardDef(card.defId).kind === 'lightspeed' && !canSetLightspeed(me)) {
      this.showToast('You already have a Lightspeed card face down: only one at a time.', 'info');
      sound.error();
      return;
    }
    if (!hasRoomFor(me, card.defId)) {
      this.showToast('Your tableau is full: a card can only go in once one fades (or is recalled or removed). A recall card can take the place of the card it recalls.', 'info');
      sound.error();
      return;
    }
    this.pending = { uid, step: 'choice' };
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
    if (cardChoices(card.defId).length > 0 && !p.choice) return ask('choice');
    if (enemyChoices(s, me, card.defId).length > 0 && !p.enemyUid) {
      if (target) this.viewRivalId = target.id;
      return ask('enemy');
    }
    if (allyChoices(me, card.defId).length > 0 && !p.allyUid) return ask('ally');
    if (recoverChoices(me, card.defId).length > 0 && !p.recoverUid) return ask('recover');
    // Even the last open slot is clicked to confirm (a misclicked card is never played outright).
    if (persists(card.defId) && freeSlots(me).length > 0 && p.slot === undefined) return ask('slot');
    this.dispatch({ type: 'playCard', cardUid: p.uid, choice: p.choice, enemyUid: p.enemyUid, allyUid: p.allyUid, recoverUid: p.recoverUid, slot: p.slot });
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const seat = el.dataset.seatName;
    if (seat !== undefined) this.seats[Number(seat)].name = el.value;
    if (el.dataset.dbName !== undefined) this.builder.onInput(el.value);
    if (el.dataset.dbSearch !== undefined) this.builder.onSearch(el.value);
    if (el.dataset.joinCode !== undefined) this.net.joinCode = el.value;
    if (el.dataset.signinName !== undefined) this.signinName = el.value;
  }

  private peekHeld = false;

  /**
   * Whether an overlay is up that the player must answer mid-move (choosing an
   * option, or a card to recover): only then can they look past it at the board.
   * Sheets they open and close at will just get closed instead.
   */
  private canPeek(): boolean {
    return this.screen === 'game' && !!this.pending && !this.sheet && !!this.root.querySelector('.overlay');
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
    if (this.pending || this.sheet) {
      this.pending = null;
      this.sheet = null;
      this.render();
    }
  }

  private onHover(e: MouseEvent) {
    if (this.touch) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.hand [data-card]');
    const from = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-card]');
    if (el && from !== el) sound.hover(); // the card lifts via CSS
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
        this.press!.shown = true;
        this.showPeek(el);
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
    if (this.press.shown) {
      this.suppressClick = true; // the tap that ends a long press must not also play the card
      this.preview.classList.remove('show');
    }
    this.cancelPress();
  }

  private cancelPress() {
    if (this.press) window.clearTimeout(this.press.timer);
    this.press = null;
  }

  /** Large, readable copy of a card at the middle right of the screen while held. */
  private showPeek(el: HTMLElement) {
    this.preview.innerHTML = this.bigCard(el.dataset.card!, el.closest('.tableau') ? el.dataset.uid : undefined) + this.explainCard(el.dataset.card!, el.closest('.tableau') ? el.dataset.uid : undefined);
    const page = appSize();
    const h = Math.min(420, page.h - 24) * 0.7;
    const w = h * 0.714;
    this.preview.style.setProperty('--pw', `${w}px`);
    this.preview.style.left = `${Math.min(page.w - w - 16, page.w * 0.78 - w / 2)}px`;
    this.preview.style.top = `${(page.h - h) / 2}px`;
    this.preview.classList.add('show');
    fitCardText(this.preview);
  }

  private onClick(e: MouseEvent) {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
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
    if (act.startsWith('db-') && this.builder.onClick(act, arg)) return;

    switch (act) {
      case 'seat-ai':
        this.seats[Number(arg)].isAI = !this.seats[Number(arg)].isAI;
        return this.render();
      case 'seat-deck': {
        // Cycle through every deck on offer.
        const seat = this.seats[Number(arg)];
        const decks = allDecks();
        const i = decks.findIndex((d) => d.id === seat.deckId);
        seat.deckId = decks[(i + 1) % decks.length].id;
        if (this.online && arg === '0') this.online.setup(this.joinInfo());
        return this.render();
      }
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
        const cards = buyBooster(kind);
        if (!cards) {
          this.showToast(`A booster costs ✦${PROGRESSION.boosterPrice} stardust.`, 'info');
          sound.error();
          return;
        }
        this.opened = { kind, cards };
        sound.shuffle();
        return this.render();
      }
      case 'close-booster':
        this.opened = null;
        return this.render();
      case 'zoom-close':
        this.zoomed = null;
        return this.render();
      case 'profile-open':
        this.profileOpen = true;
        return this.render();
      case 'profile-close':
        this.profileOpen = false;
        return this.render();
      case 'profile-logout':
        signOut();
        this.profileOpen = false;
        this.menuPage = 'title';
        return this.render();
      case 'profile-rename':
        this.profileOpen = false;
        this.menuPage = 'signin';
        return this.render();
      case 'signin-avatar':
        this.signinAvatar = Number(arg);
        return this.render();
      case 'signin-go':
        signIn(this.signinName ?? profile().name, this.signinAvatar ?? profile().avatar);
        this.signinName = this.signinAvatar = null;
        this.seats[0].name = profile().name;
        this.menuPage = 'hub';
        return this.render();
      case 'menu-page':
        // Players sign in before they reach the hub.
        if (arg === 'hub' && !signedIn()) {
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
      case 'open-log':
        this.sheet = { kind: 'log' };
        return this.render();
      case 'toggle-sound':
        sound.toggleMute();
        return this.render();
      case 'toggle-music':
        sound.toggleMusic();
        return this.render();
      case 'toggle-autoconfirm':
        this.autoConfirm = !this.autoConfirm;
        try {
          localStorage.setItem(AUTO_CONFIRM_KEY, this.autoConfirm ? '1' : '0');
        } catch {
          // ignore
        }
        if (this.autoConfirm && this.stage?.confirm) this.confirmStage();
        else this.render();
        return;
      case 'speed': {
        const order: Speed[] = ['slow', 'normal', 'fast'];
        this.speed = order[(order.indexOf(this.speed) + 1) % order.length];
        try {
          localStorage.setItem(SPEED_KEY, this.speed);
        } catch {
          // ignore
        }
        return this.render();
      }
      case 'skip-ai':
        return this.skipAI();
      case 'stage-ok':
        return this.confirmStage();
      case 'view-pile':
        {
          const [pile, playerId] = arg.split(':');
          this.sheet = { kind: 'pile', pile: pile as 'deck' | 'discard', playerId };
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
    if (act === 'inspect' && !el.closest('.sheet') && el.dataset.card) {
      this.sheet = { kind: 'card', defId: el.dataset.card, uid: el.dataset.hand, table: el.closest('.tableau') ? el.dataset.uid : undefined };
      sound.hover();
      return this.render();
    }
    if (!this.canAct()) return;

    switch (act) {
      case 'play':
        this.sheet = null;
        return this.startPlay(arg);
      case 'end-turn':
        return this.requestEndDay();
      case 'end-day-confirm':
        this.sheet = null;
        return this.dispatch({ type: 'endTurn' });
      case 'choose-option':
        if (this.pending) this.pending.choice = arg;
        return this.advancePlay();
      case 'choose-enemy':
        if (this.pending) this.pending.enemyUid = arg;
        return this.advancePlay();
      case 'choose-ally':
        if (this.pending) this.pending.allyUid = arg;
        return this.advancePlay();
      case 'choose-recover':
        if (this.pending) this.pending.recoverUid = arg;
        return this.advancePlay();
      case 'choose-slot':
        if (this.pending) this.pending.slot = Number(arg);
        return this.advancePlay();
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private render() {
    // Typing in the deck builder's search re-renders the page: keep the caret in the box.
    const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.dataset.dbSearch !== undefined ? document.activeElement.selectionStart : null;
    this.root.innerHTML = this.screen === 'menu' ? this.renderMenu() : this.screen === 'campaign' ? this.campaign.render() : this.renderGame();
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
    // The backdrop warms (or chills) with the viewer's own sun, not whoever is acting.
    const me = this.screen === 'game' && this.state ? this.viewer() : null;
    const heat = me && !me.eliminated ? me.heat : 0;
    backdrop.setHeat(!me || heat === 0 ? 0 : heat > 0 ? heat / supernovaThreshold(me) : heat / -BALANCE.minHeat);
    this.root.querySelector('.log-list')?.scrollTo({ top: 1e9 });
    this.root.querySelector('.log-feed')?.scrollTo({ top: 1e9 });
    this.fitHand();
    fitCardText(this.root);
    refreshLift();
    const page = this.screen === 'menu' ? `menu:${this.menuPage}` : this.screen;
    if (page !== this.shownPage) {
      const first = !this.shownPage;
      this.shownPage = page;
      if (this.screen === 'menu' && !first) this.enterMenu();
    }
    animateSuns();
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
    const w = cards[0].offsetWidth;
    const inset = w * 0.12; // room for the outer cards' tilt, so they don't cover the piles
    const W = hand.clientWidth - inset * 2;
    const spacing = n > 1 ? Math.min(w * 0.82, (W - w) / (n - 1)) : 0;
    const start = inset + (W - (spacing * (n - 1) + w)) / 2;
    const step = Math.min(5, 24 / Math.max(n - 1, 1)); // degrees between neighbours
    // Freshly drawn cards are placed straight into the fan (with no transition, they would swing out from
    // the middle every time the page is redrawn); a card already placed keeps its smooth move.
    const fresh = cards.filter((c) => !c.style.getPropertyValue('--fr'));
    fresh.forEach((c) => (c.style.transition = 'none'));
    cards.forEach((c, i) => {
      const t = i - (n - 1) / 2;
      c.style.left = `${start + i * spacing}px`;
      c.style.setProperty('--fr', `${t * step}deg`);
      c.style.setProperty('--fy', `${Math.abs(t) ** 2 * 2.5}px`);
      c.style.zIndex = String(i + 1);
    });
    if (fresh.length) {
      void hand.offsetWidth;
      fresh.forEach((c) => (c.style.transition = ''));
    }
  }

  // ---- Front end -------------------------------------------------------------

  private renderMenu(): string {
    const page = this.menuPage;
    const setup = page === 'quickplay' || page === 'options' || page === 'decks' || page === 'online' || page === 'shop';
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
                  : this.renderOptions();
    return `
    <main class="menu menu-${page} ${setup ? 'setup-page' : ''}">
      ${body}
      ${page === 'title' || page === 'hub' ? '<footer class="studio">coronal mass games · prototype build</footer>' : ''}
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
    return `
      ${this.playerChip()}
      ${this.titleBlock(true)}
      <div class="hub">
        ${tile('campaign-new', '', HUB_ICONS.campaign, 'campaign', hasCampaign ? '<button class="btn btn-small hub-continue" data-act="campaign-continue">continue</button>' : '')}
        ${tile('menu-page', 'quickplay', HUB_ICONS.quickplay, 'quickplay', hasGame ? '<button class="btn btn-small hub-continue" data-act="continue">continue</button>' : '')}
        ${tile('open-decks', '', HUB_ICONS.collection, 'collection')}
        ${tile('menu-page', 'shop', HUB_ICONS.shop, 'shop')}
        ${tile('menu-page', 'options', HUB_ICONS.options, 'options')}
      </div>`;
  }

  /** Who you are, top right: your emblem, name, level and currencies. Tap it for your whole profile. */
  private playerChip(): string {
    const p = profile();
    return `
      <button class="player-chip" data-act="profile-open" title="Your profile">
        ${factionAvatar(`f${p.avatar + 1}`, 'pc-avatar')}
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
            ${factionAvatar(`f${p.avatar + 1}`, 'pv-avatar')}
            <div><h2>${esc(p.name || 'Commander')}</h2><small>${esc(RACE_NAMES[p.avatar])} · ${p.won} won of ${p.played} played</small></div>
          </div>
          <div class="pv-grid">
            <div class="pv-box"><small>level</small><b>${p.level}</b><span class="pf-xp"><i style="width:${Math.round((p.xp / need) * 100)}%"></i></span><small>${p.xp} / ${need} xp</small></div>
            <div class="pv-box"><small>stardust</small><b class="pf-dust"><i>✦</i> ${p.stardust}</b><span></span><small>buys booster packs</small></div>
            <div class="pv-box"><small>flux</small><b class="pf-flux"><i>⟁</i> ${p.flux}</b><span></span><small>crafts cards</small></div>
            <div class="pv-box"><small>rank</small><b>${rank === null ? 'unranked' : esc(rankName(rank).toLowerCase())}</b>${r ? `<span class="pf-xp"><i style="width:${r.points}%"></i></span><small>${r.points} / ${PROGRESSION.stagePoints} to the next stage</small>` : '<span></span><small>play ranked online</small>'}</div>
          </div>
          <div class="pv-actions"><button class="btn" data-act="profile-logout">log out</button><span class="setup-spacer"></span><button class="btn" data-act="profile-rename">change name or emblem</button><button class="btn-primary" data-act="profile-close">close</button></div>
        </div>
      </div>`;
  }

  /** Read a card large: in a game, the card sheet; elsewhere, a zoomed view over the menu. */
  private zoom(defId: string) {
    if (this.screen === 'game' && this.state) this.sheet = { kind: 'card', defId };
    else if (this.screen === 'menu') this.zoomed = defId;
    else return;
    sound.hover();
    this.render();
  }

  private renderZoom(): string {
    return `<div class="overlay overlay-soft zoom-view" data-act="zoom-close"><div class="zoom-card" data-act="zoom-close">${this.bigCard(this.zoomed!)}${this.explainCard(this.zoomed!)}</div><small class="muted">tap anywhere to close</small></div>`;
  }

  /** Signing in: the name and emblem you go by (until accounts arrive, it lives on this device). */
  private renderSignIn(): string {
    const p = profile();
    return `
      <div class="menu-back"><button class="btn btn-small" data-act="menu-page" data-arg="title">‹ back</button></div>
      <div class="signin">
        ${this.titleBlock(true)}
        <h2 class="menu-heading">sign in</h2>
        <input class="signin-name" data-signin-name value="${esc(this.signinName ?? p.name)}" maxlength="18" placeholder="your name" aria-label="Your name" />
        <div class="signin-emblems">${[0, 1, 2, 3].map((r) => `<button class="db-race ${(this.signinAvatar ?? p.avatar) === r ? 'on' : ''}" data-act="signin-avatar" data-arg="${r}" title="${esc(RACE_NAMES[r])}">${factionAvatar(`f${r + 1}`, 'db-race-emblem')}</button>`).join('')}</div>
        <button class="btn-primary" data-act="signin-go">continue</button>
      </div>`;
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
    return `
      <header class="setup-top">
        <button class="btn btn-small" data-act="menu-page" data-arg="hub">‹ back</button>
        <h2 class="menu-heading">shop</h2>
        ${this.playerChip()}
      </header>
      <div class="setup-body shop-body">
        <div class="section-label">boosters</div>
        <div class="pack-row">${packs}</div>
      </div>`;
  }

  /** A booster pack: a foil wrapper, crimped top and bottom, with its race's emblem and a tear strip. */
  private packFace(k: BoosterKind): string {
    const name = k === 'general' ? 'general' : RACE_NAMES[k].toLowerCase();
    const emblem = k === 'general' ? `<span class="pack-icon">${HUB_ICONS.shop}</span>` : factionAvatar(`f${k + 1}`, 'pack-emblem');
    return `<span class="pack-tear"></span><span class="pack-body"><span class="pack-brand">blue loop</span>${emblem}<span class="pack-name">${esc(name)}</span><span class="pack-count">${PROGRESSION.boosterSize} cards</span></span><span class="pack-shine"></span>`;
  }

  /** A card's face on its own, outside a game (as in the deck builder). */
  private cardFace(id: string): string {
    const c = cardDef(id);
    return `<div class="card kind-${c.kind}${c.race !== undefined ? ` race-${c.race}` : ''} rarity-${c.rarity ?? 'dwarf'}" data-card="${c.id}">
      <span class="card-glyph">${cardArt(c, true)}</span>${stabilityBadge(c)}
      <span class="card-name">${esc(c.name.toLowerCase())}</span>
      <span class="card-text">${cardTextHtml(c.text)}</span>
      <span class="card-kind">${typeLine(c)}</span>
    </div>`;
  }

  /** Setup pages fill the screen: back and title across the top, the choices in the middle, the main action bottom right. */
  private setupPage(title: string, body: string, foot: string, back = 'hub'): string {
    return `
      <header class="setup-top">
        <button class="btn btn-small" data-act="menu-page" data-arg="${back}">‹ back</button>
        <h2 class="menu-heading">${title}</h2>
        <span></span>
      </header>
      <div class="setup-body">${body}</div>
      <footer class="setup-foot">${foot}</footer>`;
  }

  private renderQuickplay(): string {
    const hasSave = loadSave() !== null;
    const seats = this.seats
      .map((seat, i) => {
        const deck = deckById(seat.deckId) ?? PRESETS[i];
        return `
        <div class="seat-tile">
          ${factionAvatar(`f${deck.race + 1}`, 'seat-emblem')}
          <input data-seat-name="${i}" value="${esc(seat.name)}" maxlength="18" aria-label="Seat ${i + 1} name" />
          <button class="seat-deck" data-act="seat-deck" data-arg="${i}" title="Tap to change deck">
            <small>deck</small><span>${esc(deck.name.toLowerCase())}</span>
          </button>
          <button class="pill-btn" data-act="seat-ai" data-arg="${i}">${seat.isAI ? 'ai' : 'human'}</button>
        </div>`;
      })
      .join('');
    return this.setupPage(
      'quickplay',
      `<div class="seat-row">${seats}</div>`,
      `<button class="btn" data-act="open-decks">deck builder</button>
       <button class="btn" data-act="menu-page" data-arg="online">play online</button>
       <span class="setup-spacer"></span>
       ${hasSave ? '<button class="btn" data-act="continue">continue game</button>' : ''}
       <button class="btn-primary" data-act="new-game">launch</button>`,
    );
  }

  /** Online 1v1: create a room or join one; then the room code, the invite and who is in. */
  private renderOnline(): string {
    const seat = this.seats[0];
    const deck = deckById(seat.deckId) ?? PRESETS[0];
    // In the lobby you can still change your name, deck and race, until the game starts.
    const you = (extra = '') => `
      <div class="seat-tile online-you">
        ${factionAvatar(`f${deck.race + 1}`, 'seat-emblem')}
        <input data-seat-name="0" value="${esc(seat.name)}" maxlength="18" aria-label="Your name" />
        <button class="seat-deck" data-act="seat-deck" data-arg="0" title="Tap to change deck"><small>your deck · ${esc(RACE_NAMES[deck.race].toLowerCase())}</small><span>${esc(deck.name.toLowerCase())}</span></button>
        ${extra}
      </div>`;
    if (!this.online) {
      return this.setupPage(
        'play online',
        `<div class="online-wrap">
          ${you}
          <div class="online-choices">
            <div class="online-box">
              <b>host a game</b>
              <p>Get a room code and an invite link to send a friend.</p>
              <button class="btn-primary" data-act="online-create">create room</button>
            </div>
            <div class="online-box online-ranked">
              <b>ranked</b>
              <p>${profile().rankPoints === null ? 'Play rivals within one rank of you, and climb from Olivine I.' : `You are ${esc(rankName(profile().rankPoints!))}. You meet rivals within one rank of you.`}</p>
              ${this.net.searching ? '<span class="muted">searching for a rival…</span><button class="btn" data-act="ranked-cancel">cancel</button>' : '<button class="btn-primary" data-act="ranked-find">find a match</button>'}
            </div>
            <div class="online-box">
              <b>join a game</b>
              <p>Enter the code your friend sent you.</p>
              <input class="online-code" data-join-code value="${esc(this.net.joinCode)}" maxlength="8" placeholder="CODE" autocapitalize="characters" aria-label="Room code" />
              <button class="btn-primary" data-act="online-join">join</button>
            </div>
          </div>
        </div>`,
        '<span class="muted">1v1 · each player on their own device</span>',
        'quickplay',
      );
    }
    const code = this.online.code;
    const status = this.net.status === 'open' ? '' : this.net.status === 'lost' ? '<button class="btn" data-act="online-retry">connection lost · retry</button>' : '<span class="muted">connecting…</span>';
    const seats = this.net.lobby ?? [];
    const rival = seats.find((_, i) => i !== this.net.you);
    const ready = !!seats[this.net.you]?.ready;
    const tag = (on: boolean, who: string) => `<span class="ready-tag ${on ? 'ready-on' : ''}">${on ? '✓ ready' : who}</span>`;
    return this.setupPage(
      'play online',
      `<div class="online-wrap">
        ${this.net.ranked
          ? `<div class="online-room"><small>ranked match</small><b class="online-room-code online-ranked-title">${rival ? `vs ${esc(rival.name)}` : 'matched'}</b><span class="muted">a win climbs the ladder · ${profile().rankPoints !== null ? esc(rankName(profile().rankPoints!).toLowerCase()) : 'olivine i'}</span></div>`
          : `<div class="online-room">
          <small>room code</small>
          <b class="online-room-code">${code}</b>
          <button class="btn" data-act="online-share">share invite link</button>
          <span class="muted online-link">${esc(inviteLink(code))}</span>
        </div>`}
        <div class="online-seats">
          ${you(tag(ready, 'not ready'))}
          <span class="online-vs">vs</span>
          ${rival
            ? `<div class="seat-tile">${factionAvatar(`f${rival.species + 1}`, 'seat-emblem')}<b class="online-name">${esc(rival.name)}</b><span class="seat-deck"><small>deck · ${esc((RACE_NAMES[rival.species] ?? '').toLowerCase())}</small><span>${esc(rival.deckName.toLowerCase())}</span></span>${tag(rival.ready, 'choosing…')}</div>`
            : '<div class="seat-tile seat-off online-waiting"><span class="online-pulse"></span><b>waiting for your opponent…</b><small>send them the code or the link</small></div>'}
        </div>
        ${status}
      </div>`,
      `<button class="btn" data-act="online-leave">leave room</button><span class="setup-spacer"></span><span class="muted">${
        !rival ? 'get ready while you wait' : ready && rival.ready ? 'starting…' : ready ? `waiting for ${esc(rival.name)} to confirm` : 'the game starts when you are both ready'
      }</span><button class="${ready ? 'btn' : 'btn-primary'}" data-act="online-ready">${ready ? 'not ready' : 'ready'}</button>`,
      'quickplay',
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
        ${tile('rules', 'how to play', 'read')}
      </div>`,
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
            fact('Your deck', `${B.deckSize} cards: up to ${B.maxCopies} of each, exactly ${B.commandCards} Command cards.`),
            fact('Your hand', `Start with ${B.openingHand} cards. Draw ${B.drawPerTurn} every Dawn after the first.`),
          ),
      ],
      day: [
        'Your Day',
        () => `<ol class="rule-steps">
          ${step('Dawn', `Your shields fade. The planets move on a notch. Draw ${B.drawPerTurn}.`)}
          ${step('The table', 'Regional instability strikes, then the global card in play.')}
          ${step('Your cards', `Every card in your tableau fires its ${kw('dawn')} effect, left to right.`)}
          ${step('Fade', 'Every card loses 1 ◷ stability. At 0 it goes to your discard pile.')}
          ${step('Play', `Play up to <b>${B.maxPlays}</b> cards (1 on your first day), each into a slot you choose.`)}
          ${step('End', "End your day. Your rival's begins.")}
        </ol>`,
      ],
      tableau: [
        'Tableau',
        () =>
          facts(
            fact('Slots', `${B.tableauSlots} slots. Defence ⛨ ${B.slotDefence.join(' · ')}: the middle is safest.`),
            fact('Defence', `Removal only reaches cards with low enough defence: ${kw('destroy', '2')} hits ⛨2 or less.`),
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
            fact(`${keywordHtml('heat', undefined, { named: true })}`, "Heats your rival's sun, unless the card says “to your sun”."),
            fact(`${keywordHtml('cool', undefined, { named: true })}`, 'Takes heat off your sun.'),
            fact(`${keywordHtml('shield', undefined, { named: true })}`, 'Each absorbs 1 enemy heat. They fade at your Dawn.'),
            fact('Orbit', `Three planets take turns facing your sun, ${B.orbitTurns} days each.`),
            fact('The planets', `Dead: nothing. Abundant: draw +${B.abundantDraw}. Industrial: play +${B.industrialPlays}.`),
            fact('Regional stability', `Drains each round. From round ${B.instabilityStartsRound}, every sun heats at Dawn, more each round.`),
          ),
      ],
      cards: [
        'Card Types',
        () =>
          facts(
            kind('attack', 'Attack', `Heat your rival's sun.`),
            kind('defence', 'Defence', 'Cool your sun, raise shields, guard your tableau.'),
            kind('growth', 'Growth', 'Draw, recover, grow and play more.'),
            kind('command', 'Command', `Two in every deck. Pick a dawn effect as you play one; it stays ${B.stabilityCommand} days, and never returns to your hand.`),
            kind('global', 'Global', 'Changes the table for both players. Only one at a time.'),
            kind('lightspeed', 'Lightspeed', "Set face down. Springs during your rival's day."),
          ),
      ],
      keywords: [
        'Keywords',
        () => `<p class="rule-note">Hover a keyword on a card, or zoom the card, to read it there.</p>
          <dl class="kw-rules">${Object.entries(KEYWORDS)
            .map(([id, k]) => {
              // Shown with a stand-in value where the keyword takes one.
              const v = ['dawn', 'anchor', 'recall', 'recover', 'overheated', 'lightspeed', 'global'].includes(id) ? undefined : id === 'orbit' ? '±N' : 'N';
              return `<div><dt>${keywordHtml(id, v, { named: true })}</dt><dd>${esc(k.explain(v))}${id === 'recover' ? ` Some name a type: ${keywordLabel('recover', 'attack')}.` : ''}</dd></div>`;
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
      <main class="table-view">
        <div class="game">
          <header class="top"></header>
          ${this.renderBoard()}
          ${this.renderDock()}
        </div>
        ${this.renderHud()}
        ${this.renderTurnControls()}
        ${this.renderPickHint()}
        ${this.renderStage()}
        ${this.renderOverlay(s)}
      </main>`;
  }

  /** Round and stability, together in one container at the top centre. */
  private renderRoundBar(): string {
    const s = this.state!;
    // Regional stability: the whole system's, draining one segment a round (each card also has its own, ◷).
    const total = BALANCE.instabilityStartsRound - 1;
    const remaining = Math.max(0, total - (s.round - 1));
    const instab = instabilityHeat(s);
    // It grows each round: say what the next round brings too, since whoever moves first in a round takes the new amount.
    const next = instabilityHeat({ ...s, round: s.round + 1 });
    const segments = Array.from({ length: total }, (_, i) => `<i class="${i < remaining ? 'on' : ''}"></i>`).join('');
    return `
      <div class="round-box ${instab ? 'unstable' : ''}" title="${instab
        ? `Round ${s.round}. Regional instability: every sun heats by ${instab} at its dawn this round, and by ${next} next round.`
        : `Round ${s.round}. Regional stability drains by one each round; when it runs out, every sun heats at its dawn.`}">
        <div class="round-num"><small>round</small><b>${roman(s.round)}</b></div>
        <div class="stability">
          <span class="stability-label">${instab ? `regional instability +${instab} <em>next round +${next}</em>` : `regional stability ${remaining}`}</span>
          <div class="stability-bar">${segments}</div>
        </div>
      </div>`;
  }

  /**
   * Both players' cards, stacked down the left: yours first, then your rival's.
   * Whoever's day it is glows green.
   */
  private renderPlayers(): string {
    const s = this.state!;
    const active = activePlayer(s);
    const me = this.viewer();
    const shown = this.shownRival();
    const playing = !isGameOver(s);
    const cards = [me, ...s.players.filter((p) => p.id !== me.id)]
      .map((p) => {
        const mine = p.id === me.id;
        const title = mine ? `${p.name} (you)` : p.name;
        return `
        <button class="rival ${mine ? 'rival-me' : ''} ${playing && p.id === active.id ? 'rival-active' : ''} ${p.eliminated ? 'rival-dead' : ''} ${!mine && shown?.id === p.id ? 'rival-shown' : ''}"
          data-act="view-player" data-arg="${p.id}" data-anchor="pill:${p.id}" title="${esc(title)}">
          ${factionAvatar(`f${p.species + 1}`, 'rival-emblem')}
          <div class="rival-info">
            <span class="rival-name">${esc(p.name.toLowerCase())}${mine ? '<i class="rival-you">you</i>' : ''}</span>
            <span class="rival-stats"><em>${p.eliminated ? 'supernova' : `${HAND_ICON}${p.hand.length} · ▤${p.deck.length}${p.lightspeed ? ' · <i class="ls-pip" title="A Lightspeed card is set face down">⚡</i>' : ''}`}</em></span>
          </div>
        </button>`;
      })
      .join('');
    return `<aside class="rivals">${cards}</aside>`;
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
        <div class="hud-players">${this.renderPlayers()}</div>
        <div class="hud-round">${this.renderRoundBar()}</div>
        <div class="hud-controls">
          ${field}
          ${this.online && this.net.status === 'connecting' ? '<span class="pill-btn net-pill">reconnecting…</span>' : ''}
          ${this.online && this.net.status === 'lost' ? '<button class="pill-btn net-pill" data-act="online-retry">connection lost · retry</button>' : ''}
          ${this.online && this.net.status === 'open' && !this.net.rivalOnline && !isGameOver(s) ? '<span class="pill-btn net-pill" title="Their seat is kept: they rejoin by opening the invite link again">rival disconnected · waiting</span>' : ''}
          ${this.campaignBattle && !isGameOver(s) ? '<button class="pill-btn" data-act="campaign-auto" title="Let your commanders finish this battle">auto-resolve</button>' : ''}
          <button class="icon-btn ${this.sheet?.kind === 'log' ? 'icon-on' : ''}" data-act="${this.sheet?.kind === 'log' ? 'cancel' : 'open-log'}" aria-label="Game log" title="Game log">${LOG_ICON}</button>
          <button class="icon-btn" data-act="open-menu" aria-label="Settings" title="Settings">${MENU_ICON}</button>
        </div>
      </div>`;
  }

  /** While a card waits for a choice on the board, a short prompt sits at the top of the screen. */
  private renderPickHint(): string {
    const p = this.pending;
    if (!p || p.step === 'choice') return '';
    const s = this.state!;
    const card = activePlayer(s).hand.find((c) => c.uid === p.uid);
    if (!card) return '';
    const name = esc(cardDef(card.defId).name.toLowerCase());
    if (p.step === 'recover') return '';
    const rival = esc(targetOf(s, activePlayer(s))?.name.toLowerCase() ?? 'your target');
    const verb = { destroy: 'destroy', bounce: 'return to their hand', erode: 'erode' }[enemyEffectKind(card.defId) ?? 'destroy'];
    // Placing a card needs no prompt: the open slots light up (tap the card again to put it back).
    if (p.step === 'slot') return '';
    const text =
      p.step === 'enemy'
        ? `${name}: choose a card in ${rival}'s tableau to ${verb}`
        : p.step === 'ally'
          ? `${name}: choose a card of yours to ${allyEffectKind(card.defId) === 'recall' ? 'return to your hand' : 'restore'}`
          : `${name}: choose a slot · the middle is safest (⛨ defence)`;
    return `<div class="pick-hint"><span>${text}</span><button class="pill-btn" data-act="cancel">cancel</button></div>`;
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
            <div class="board-star-slot"></div>
            ${rival ? this.renderTableau(rival, 'rival') : ''}
            ${this.renderResult()}
            ${this.renderTableau(me, 'mine')}
          </div>
        </div>
      </section>`;
  }

  private renderTableau(p: PlayerState, side: 'mine' | 'rival'): string {
    const pend = this.pending;
    const choosingSlot = side === 'mine' && pend?.step === 'slot';
    const slots = Array.from({ length: BALANCE.tableauSlots }, (_, i) => {
      const c = p.tableau.find((x) => x.slot === i);
      if (c) return this.renderCard(c, { tableau: side, owner: p });
      const def = BALANCE.slotDefence[i];
      return choosingSlot
        ? `<button class="slot-empty slot-choosable" data-act="choose-slot" data-arg="${i}" title="Place it here: defence ${def}"><span class="slot-def">⛨${def}</span><i>here</i></button>`
        : `<div class="slot-empty" title="Slot defence ${def}"><span class="slot-def">⛨${def}</span></div>`;
    }).join('');
    // The Lightspeed slot, right of the tableau: a card set there lies face down (its owner can still read it). It has no defence.
    const ls = p.lightspeed;
    const lightspeed = ls
      ? side === 'mine'
        ? `<button class="card card-table card-back ls-card" data-act="inspect" data-card="${ls.defId}" title="Set face down: ${esc(cardDef(ls.defId).name)}. ${esc(plainText(cardDef(ls.defId).text))}"><span>⚡</span><small>lightspeed</small></button>`
        : '<div class="card card-table card-back ls-card ls-hidden" title="A Lightspeed card is set face down. It springs during your day."><span>⚡</span><small>lightspeed</small></div>'
      : '<div class="slot-empty slot-ls" title="Lightspeed: one card can be set face down here"><span class="slot-def">⚡</span></div>';
    return `
      <div class="tableau tableau-${side} ${p.eliminated ? 'tableau-dead' : ''}" data-owner="${p.id}">
        <div class="tableau-row-wrap">
          <div class="vitals" data-anchor="player:${p.id}">${vitals({ heat: p.heat, threshold: supernovaThreshold(p), shields: p.shields, dead: p.eliminated, id: p.id, orbit: p.orbit })}<span class="vitals-name">${side === 'mine' ? 'your sun' : `${esc(p.name.toLowerCase())}'s sun`}</span></div>
          <div class="tableau-row">${slots}<div class="ls-slot">${lightspeed}</div></div>
          ${this.renderPiles(p, side)}
          ${this.renderForecast(p)}
        </div>
      </div>`;
  }

  /**
   * A player's deck and discard pile, on the board to the right of their tableau. Everyone sees both
   * counts; the discard pile lies face up (its top card showing) and anyone can look through it; only
   * your own deck can be opened (to see what's left in it).
   */
  private renderPiles(p: PlayerState, side: 'mine' | 'rival'): string {
    const mine = side === 'mine';
    const top = p.discard[p.discard.length - 1];
    const deck = `<span class="tpile-stack"><i></i><i></i></span><b>${p.deck.length}</b><small>deck</small>`;
    const discard = top
      ? `<span class="tpile-face">${this.renderCard(top, { static: true }).replace(/^(\s*)<button /, '$1<div ').replace(/<\/button>\s*$/, '</div>')}</span><b class="tpile-count">${p.discard.length}</b>`
      : `<span class="tpile-empty"></span><b>0</b><small>discard</small>`;
    // How many cards they hold: a little bar above your piles, below theirs (the board stays a mirror).
    const n = p.hand.length;
    const hand = `<div class="tpile-hand tpile-hand-${side}" title="${mine ? 'Cards in your hand' : `Cards in ${esc(p.name)}'s hand`}">${HAND_ICON}<span>hand</span><b>${n}</b></div>`;
    return `<div class="tableau-piles">
      ${hand}
      ${mine ? `<button class="tpile tpile-open" data-anchor="deck" data-act="view-pile" data-arg="deck" title="Your deck: look at what's left">${deck}</button>` : `<div class="tpile" data-anchor="deck:${p.id}" title="Cards left in ${esc(p.name)}'s deck">${deck}</div>`}
      <div class="tpile tpile-discard tpile-open" role="button" tabindex="0" data-anchor="${mine ? 'discard' : `discard:${p.id}`}" data-act="view-pile" data-arg="${mine ? 'discard' : `discard:${p.id}`}" title="${mine ? 'Your' : `${esc(p.name)}'s`} discard pile: look through it">${discard}</div>
    </div>`;
  }

  /**
   * Above each tableau: what that player's next dawn will do, net of
   * every card (heat at their target, shields, cooling, heat to their own sun,
   * extra cards), so everyone can see it coming and answer it.
   */
  private renderForecast(p: PlayerState): string {
    const s = this.state!;
    if (p.eliminated || isGameOver(s)) return '';
    const f = turnForecast(s, p);
    const me = this.viewer();
    const who = (id: string | null) => (id === me.id ? 'you' : esc((s.players.find((o) => o.id === id)?.name ?? '').toLowerCase()));
    // Each effect as a symbol and a number, with the detail in its tooltip.
    const chip = (cls: string, icon: string, n: number, title: string) =>
      n ? `<span class="fc ${cls}" title="${title}"><i>${icon}</i><b>${cls === 'fc-cool' ? `−${n}` : `+${n}`}</b></span>` : '';
    const chips = [
      chip('fc-heat', symbolIcon('heat'), f.heat, `Their dawn: ${f.heat} heat to ${who(f.targetId)} (before shields)`),
      chip('fc-shield', symbolIcon('shield'), f.shields, `Their dawn: ${f.shields} shield${f.shields === 1 ? '' : 's'} raised`),
      chip('fc-cool', symbolIcon('cool'), f.cool, `Their dawn: their own sun cools by ${f.cool}`),
      chip('fc-self', '☀', f.selfHeat, `Their dawn: ${f.selfHeat} heat to their own sun from their cards' drawbacks and the table`),
      chip('fc-unstable', '≋', f.unstable, `Their dawn (round ${f.round}): regional instability heats their sun by ${f.unstable}`),
      chip('fc-draw', HAND_ICON, f.draw, `Their dawn: ${f.draw} extra card${f.draw === 1 ? '' : 's'} drawn${f.planet === 'abundant' ? ' (the abundant planet faces their sun)' : ''}`),
      chip('fc-play', '▶', f.plays, `Their day: ${f.plays} extra card${f.plays === 1 ? '' : 's'} they may play (the industrial planet faces their sun)`),
    ].join('');
    // Nothing coming: show nothing.
    if (!chips) return '';
    return `<div class="forecast ${p.id === me.id ? 'forecast-mine' : ''}" aria-label="${p.id === me.id ? 'your' : 'their'} next dawn">${chips}</div>`;
  }

  private renderDock(): string {
    const me = this.viewer();
    const hidden = this.needsHandoff();
    const hand = hidden ? '<div class="hand-hidden">hand hidden</div>' : me.hand.map((c) => this.renderCard(c, { hand: true })).join('');
    return `
      <section class="dock">
        <div class="hand-zone">
          <div class="hand">${hand}</div>
        </div>
      </section>`;
  }

  /** The day's controls, off the board at the bottom right of the screen: actions left (as dots) and End Day. */
  private renderTurnControls(): string {
    const s = this.state!;
    const me = this.viewer();
    const act = this.canAct();
    const busy = this.pending !== null;
    const myTurn = activePlayer(s).id === me.id && !isGameOver(s);
    const total = Math.max(me.playsLeft, myTurn ? playsAllowed(s, me) : 0);
    const pips = myTurn ? Array.from({ length: total }, (_, i) => `<i class="${i < me.playsLeft ? 'on' : ''}"></i>`).join('') : '';
    return `
      <div class="turn-controls turn-corner">
        <div class="plays ${myTurn ? '' : 'plays-off'}" title="Actions left today: each card you play uses one">
          <small>${myTurn ? 'actions' : 'waiting'}</small>
          <span class="plays-pips">${pips}</span>
        </div>
        <button class="btn-primary end-turn ${act && me.playsLeft === 0 ? 'end-turn-ready' : ''}" data-act="end-turn" ${act && !busy ? '' : 'disabled'}>end day</button>
      </div>`;
  }

  private renderCard(c: CardInstance, opts: { hand?: boolean; tableau?: 'mine' | 'rival'; static?: boolean; owner?: PlayerState; option?: string }): string {
    const def = cardDef(c.defId);
    const act = this.canAct();
    const p = this.pending;
    let attrs = 'data-act="inspect"';
    let extra = '';
    if (opts.hand) {
      extra = `data-hand="${c.uid}"`;
      if ((act && !p) || this.touch) attrs = `data-act="play" data-arg="${c.uid}"`;
    }
    let state = '';
    const s = this.state;
    const me = s ? activePlayer(s) : null;
    const pendingDef = p && me ? me.hand.find((h) => h.uid === p.uid)?.defId : undefined;
    if (p && pendingDef && me && opts.tableau === 'rival' && p.step === 'enemy' && enemyChoices(s!, me, pendingDef).some((x) => x.uid === c.uid)) {
      attrs = `data-act="choose-enemy" data-arg="${c.uid}"`;
      state = 'card-choosable';
    }
    if (p && opts.tableau === 'mine' && p.step === 'ally') {
      attrs = `data-act="choose-ally" data-arg="${c.uid}"`;
      state = 'card-choosable';
    }
    if (p && opts.hand && c.uid === p.uid) state = 'card-picked';
    const growth = c.growth ? `<span class="growth" title="Growth">${c.growth}</span>` : '';
    const boost = opts.owner && boostable(c.defId) ? resonanceBonus(opts.owner, c) : 0;
    const resonance = boost ? `<span class="resonance" title="Resonance: +${boost} to this card's heat, cooling and shields from its neighbours">+${boost}</span>` : '';
    // In play: its defence (what removal must beat) and stability (turns before it fades into the discard pile).
    const stats =
      opts.owner && c.slot !== undefined
        ? `<span class="card-stats"><b class="stat-def" title="Defence: removal cards can only reach cards with low enough defence">⛨${cardDefence(opts.owner, c)}</b><b class="stat-stab ${(c.stability ?? 0) <= 1 ? 'stat-low' : ''}" title="Stability: turns before it fades into the discard pile">◷${c.stability ?? 0}</b></span>`
        : stabilityBadge(def);
    const race = def.race !== undefined ? ` race-${def.race}` : '';
    return `
      <button class="card kind-${def.kind}${race} rarity-${def.rarity ?? 'dwarf'} ${opts.tableau ? 'card-table' : ''} ${state}" ${opts.static ? '' : `data-uid="${c.uid}"`} data-card="${def.id}" ${c.growth ? `data-growth="${c.growth}"` : ''} ${extra} ${attrs} style="--kc:${KIND_COLOUR[def.kind]}">
        <div class="card-glyph">${cardArt(def, true)}</div>
        ${growth}${resonance}${stats}
        <div class="card-name">${esc(def.name.toLowerCase())}</div>
        <div class="card-text">${cardTextHtml(def.text, opts.option ?? c.choice)}</div>
        <div class="card-kind">${typeLine(def)}</div>
      </button>`;
  }

  /** The explanations beside a magnified card: its keywords, and its stability and defence (live, for a card in play). */
  private explainCard(defId: string, uid?: string): string {
    const owner = uid ? this.state?.players.find((p) => p.tableau.some((c) => c.uid === uid)) : undefined;
    const c = owner?.tableau.find((x) => x.uid === uid);
    const stats = owner && c ? { stability: c.stability ?? 0, defence: cardDefence(owner, c) } : persists(defId) ? { stability: baseStability(defId) } : {};
    return keywordList(cardDef(defId).text, stats);
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
    const boost = owner && c && boostable(c.defId) ? resonanceBonus(owner, c) : 0;
    const stats =
      owner && c
        ? `<span class="card-stats"><b class="stat-def" title="Defence">⛨${cardDefence(owner, c)}</b><b class="stat-stab ${(c.stability ?? 0) <= 1 ? 'stat-low' : ''}" title="Stability">◷${c.stability ?? 0}</b></span>`
        : stabilityBadge(def);
    const race = def.race !== undefined ? ` race-${def.race}` : '';
    return `
      <div class="card card-big kind-${def.kind}${race} rarity-${def.rarity ?? 'dwarf'}" style="--kc:${KIND_COLOUR[def.kind]}">
        <div class="card-glyph">${cardArt(def, true)}</div>
        ${c?.growth ? `<span class="growth">${c.growth}</span>` : ''}${boost ? `<span class="resonance">+${boost}</span>` : ''}${stats}
        <div class="card-name">${esc(def.name.toLowerCase())}</div>
        <div class="card-text">${cardTextHtml(def.text)}</div>
        <div class="card-kind">${typeLine(def)}</div>
      </div>`;
  }

  private renderStage(): string {
    const st = this.stage;
    const s = this.state!;
    // Online, while your rival reads your card: say so (you can't act until they have).
    if (!st && this.online && this.net.waitFor === 'rival' && !isGameOver(s)) {
      const rival = s.players.find((p) => p.id !== this.viewer().id);
      return `<div class="wait-note">${esc((rival?.name ?? 'your rival').toLowerCase())} is reading your card…</div>`;
    }
    if (!st || isGameOver(s)) return '';
    const actor = s.players.find((p) => p.id === st.actorId)!;
    const card = st.faceDown ? '<div class="card card-back"><span>⚡</span><small>lightspeed</small></div>' : this.renderCard({ uid: 'stage', defId: st.defId }, { static: true, option: st.option })
          // Already the zoomed view: a still card, not a button (only its keywords respond, explaining themselves).
          .replace(/^(\s*)<button class="card /, '$1<div class="card card-still ')
          .replace(/<\/button>\s*$/, '</div>')
          .replace(/ data-act="[^"]*"/, '')
          .replace(/ data-card="[^"]*"/, '');
    return `
      <div class="stage ${st.caption && !st.faceDown ? 'stage-sprung' : ''} ${st.confirm ? 'stage-confirm' : ''}">
        ${card}
        <div class="stage-caption">${esc(st.caption ?? `${actor.name.toLowerCase()} plays`)}</div>
        ${st.confirm ? `<button class="btn stage-ok" data-act="stage-ok" title="${esc(actor.name)} waits until you have read their card">OK</button>` : ''}
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
        const left = s ? activePlayer(s).playsLeft : 0;
        return this.sheetFrame(
          'end your day?',
          `<p class="center-text">You can still play ${left} card${left === 1 ? '' : 's'} today.</p>
           <div class="end-day-actions"><button class="btn-primary" data-act="end-day-confirm">end day <small>⏎</small></button><button class="btn" data-act="cancel">keep playing <small>esc</small></button></div>`,
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
        const lines = s!.log
          .slice(-120)
          .map((l) => `<div data-seq="${l.seq}" class="${l.turn === lastTurn ? 'log-now' : ''} ${KEY_LOG.test(l.text) ? 'log-key' : ''}">${esc(l.text)}</div>`)
          .join('');
        return `<div class="log-pop-overlay" data-act="cancel"></div>
          <div class="log-pop sheet"><div class="log-pop-head"><span class="section-label">game log</span><button class="pill-btn" data-act="cancel">close</button></div><div class="log-list">${lines}</div></div>`;
      }
      case 'pile':
        return this.renderPileSheet(sh.pile, s?.players.find((p) => p.id === sh.playerId));
      case 'player':
        return this.renderPlayerSheet(s!.players.find((p) => p.id === sh.playerId) ?? this.viewer());
      case 'card': {
        const me = s ? activePlayer(s) : null;
        const playable = !!(sh.uid && me && me.hand.some((c) => c.uid === sh.uid) && this.canAct() && !this.pending);
        const button = sh.uid ? `<button class="btn-primary" data-act="play" data-arg="${sh.uid}" ${playable && me!.playsLeft > 0 ? '' : 'disabled'}>play</button>` : '';
        return `
          <div class="overlay overlay-inspect" data-act="cancel">
            <div class="inspector sheet">
              <div class="inspector-row">${this.bigCard(sh.defId, sh.table)}${this.explainCard(sh.defId, sh.table)}</div>
              <div class="inspector-actions">${button}<button class="btn" data-act="cancel">close</button></div>
            </div>
          </div>`;
      }
    }
  }

  /** A player's summary: their deck, Command cards and the conditions they fight under. */
  private renderPlayerSheet(p: PlayerState): string {
    const s = this.state!;
    const me = this.viewer();
    const tabs = [me, ...s.players.filter((o) => o.id !== me.id)]
      .map(
        (o) => `
        <button class="sys-tab ${o.id === p.id ? 'sys-tab-on' : ''} ${o.eliminated ? 'sys-tab-dead' : ''}" data-act="view-player" data-arg="${o.id}">
          ${sunOrb({ heat: o.heat, threshold: supernovaThreshold(o), size: 26, dead: o.eliminated, label: '' })}
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
            <div class="sys-kicker">${p.id === me.id ? 'you' : esc(p.name.toLowerCase())} · ${esc(RACE_NAMES[p.species].toLowerCase())}</div>
            ${factionAvatar(`f${p.species + 1}`, 'player-emblem')}
            <h2 class="sys-name">${esc((p.deckName ?? 'custom deck').toLowerCase())}</h2>
            ${commands ? `<p class="muted center-text">Command cards in play: ${commands}</p>` : ''}
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

  private renderPileSheet(kind: 'deck' | 'discard', of?: PlayerState): string {
    const me = this.viewer();
    // A rival's discard pile is public: every card in it was seen.
    if (of && of.id !== me.id) {
      const rows = [...of.discard].reverse().map((c) => `<div class="pile-card">${this.renderCard(c, { static: true })}</div>`).join('');
      return this.sheetFrame(
        `${esc(of.name.toLowerCase())}'s discard · ${of.discard.length}`,
        `<p class="muted center-text">Most recent first. ${esc(of.name)} has ${of.deck.length} card${of.deck.length === 1 ? '' : 's'} left in their deck and ${of.hand.length} in hand.</p><div class="pile-grid">${rows || '<p class="muted">Their discard pile is empty.</p>'}</div>`,
      );
    }
    if (kind === 'deck') {
      const counts = new Map<string, number>();
      for (const c of me.deck) counts.set(c.defId, (counts.get(c.defId) ?? 0) + 1);
      const rows = [...counts.entries()]
        .sort((a, b) => cardDef(a[0]).name.localeCompare(cardDef(b[0]).name))
        .map(([defId, n]) => `<div class="pile-card">${this.renderCard({ uid: defId, defId }, { static: true })}<span class="pile-n">×${n}</span></div>`)
        .join('');
      return this.sheetFrame(
        `your deck · ${me.deck.length}`,
        `<p class="muted center-text">Draw order is hidden. When your deck runs out, your discard pile is shuffled back in, heating your sun by ${BALANCE.reshuffleHeat}.</p>
         <div class="pile-grid">${rows || '<p class="muted">Your deck is empty.</p>'}</div>`,
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
