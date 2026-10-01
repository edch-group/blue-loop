import {
  ACTION_NAME,
  ACTION_TEXT,
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
  rankOf,
  xpToNext,
  canSetLightspeed,
  cardDef,
  cardNeedsUpgradeChoice,
  chooseAIAction,
  createGame,
  enemyChoices,
  enemyEffectKind,
  GameError,
  instabilityHeat,
  isGameOver,
  MAX_UPGRADES,
  needsSlot,
  persists,
  playsAllowed,
  RACE_NAMES,
  allyChoices,
  allyEffectKind,
  cardDefence,
  recoverChoices,
  resonanceBonus,
  supernovaThreshold,
  tableauFull,
  targetOf,
  turnForecast,
  upgradeOptions,
  type Action,
  type BoosterCard,
  type BoosterKind,
  type CardInstance,
  type CoreAction,
  type GameState,
  type PlayerSetup,
  type PlayerState,
} from '../engine';
import { actionChip, actionTile, roman, sunOrb, vitals } from './art';
import { backdrop } from './backdrop';
import { DeckBuilder } from './builder';
import { CampaignView, loadCampaign } from './campaign';
import { allDecks, deckById, PRESETS } from './decks';
import { factionAvatar } from './factions';
import { anchorRect, beam, flyFrom, ghost, projectile, pulse, reducedMotion, snapshot, tether, type Snapshot } from './fx';
import { cardArt, cardGlyph, KIND_COLOUR, stabilityBadge, typeLine } from './glyphs';
import { LOG_ICON, MENU_ICON } from './menu-icon';
import { buyBooster, grantReward, owned, profile, setRankPoints, type RewardResult } from './profile';
import { sound } from './sound';
import { clearSave, loadSave, save } from './storage';
import { cleanCode, hasSeat, inviteLink, LadderClient, newRoomCode, OnlineClient, type LastMove, type LobbySeat } from './online';
import { animateSuns } from './sun3d';
import { appSize, pageRect, VIEWPORT_EVENT } from './viewport';

type Screen = 'menu' | 'game' | 'campaign';
type MenuPage = 'title' | 'hub' | 'quickplay' | 'options' | 'decks' | 'online' | 'shop';

const HUB_ICONS = {
  shop: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 10h20l2 30H12z"/><path d="M14 10l4 6h12l4-6M24 22l2.4 4.8 5.3.8-3.8 3.7.9 5.2-4.8-2.5-4.8 2.5.9-5.2-3.8-3.7 5.3-.8z"/></svg>`,
  campaign: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 34 22 26 36 32M22 26 26 12 36 32M10 34 14 16 26 12"/><circle cx="10" cy="34" r="3.2"/><circle cx="22" cy="26" r="2.6"/><circle cx="36" cy="32" r="3.6"/><circle cx="26" cy="12" r="3"/><circle cx="14" cy="16" r="2.4"/></svg>`,
  quickplay: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="24" r="8"/><circle cx="36" cy="24" r="4.5"/><path d="M26 24h4M27.5 20.5 31 24l-3.5 3.5"/></svg>`,
  options: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 15h28M10 24h28M10 33h28"/><circle cx="18" cy="15" r="3.2"/><circle cx="31" cy="24" r="3.2"/><circle cx="22" cy="33" r="3.2"/></svg>`,
};
type Speed = 'slow' | 'normal' | 'fast';

/**
 * A card the player is playing that still needs choices: which upgrade
 * (Command Directive), which rival card to destroy or return (Ion Cannon,
 * Tractor Beam), which of their own cards to replace when their tableau is
 * full, which to recall (Phase Shift), what to recover from the discard pile
 * (Salvage Drone), and where in the tableau it goes (when resonance makes
 * position matter).
 */
interface Pending {
  uid: string;
  step: 'upgrade' | 'enemy' | 'ally' | 'recover' | 'slot';
  upgrade?: CoreAction;
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
}

/** Bottom sheets / dialogs that are not part of a pending move. */
type Sheet =
  | { kind: 'menu' }
  | { kind: 'log' }
  | { kind: 'rules' }
  | { kind: 'pile'; pile: 'deck' | 'discard' }
  /** A player's summary: deck, upgrades, commands and conditions. */
  | { kind: 'player'; playerId: string }
  | { kind: 'upgrade'; action: CoreAction }
  /** Tap-to-inspect on touch screens: a readable card with its action. */
  | { kind: 'quit' }
  | { kind: 'card'; defId: string; uid?: string; /** A card in play: its uid, so the magnified card shows its live stats. */ table?: string };

const SPEED_KEY = 'blue-loop:ai-speed';
const SPEED_FACTOR: Record<Speed, number> = { slow: 1.7, normal: 1, fast: 0.4 };
/** Pause after each kind of AI action, before the next one (ms at normal speed). */
const AI_PAUSE: Record<Action['type'], number> = { playCard: 1700, setTarget: 500, endTurn: 1200, concede: 0 };
const TOAST_MS = 2600;
const LONG_PRESS_MS = 450;
/** Log lines worth emphasising: hits, supernovas, upgrades and so on. */
const KEY_LOG = /heats to|SUPERNOVA|upgrades|wins|shields absorb|instability|destroys|stings|replaces|Lightspeed|cancelled|returns|recovers|shuffles/;
const HOT = '#f0a07a';
const COOLING = '#8fc6ff';
const SHIELDING = '#a9b8ff';
/** How long each start-of-turn effect gets on the table, before the next fires (scaled by the game speed). */
const PULSE_STEP = 720;
/** The log button: lines of text in a page. */
/** Cards in hand: a small fan of three cards. */
const HAND_ICON = '<svg class="hand-icon" viewBox="0 0 16 14" aria-label="in hand"><rect x="2.2" y="3" width="6" height="8.6" rx="1.1" transform="rotate(-18 5.2 11)"/><rect x="5" y="1.8" width="6" height="8.6" rx="1.1"/><rect x="7.8" y="3" width="6" height="8.6" rx="1.1" transform="rotate(18 10.8 11)"/></svg>';
/** Clicks that make their own sound (or none): moves on the table and picks on the map. */
const QUIET_ACTS = new Set(['play', 'end-turn', 'upgrade', 'choose-enemy', 'choose-ally', 'choose-recover', 'choose-slot', 'stage-ok', 'inspect', 'cmp-select', 'cmp-anomaly', 'cmp-deselect', 'cmp-end-turn', 'cmp-start']);

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
  /** The ranked ladder, while queued for a match. */
  private ladder: LadderClient | null = null;
  /** The booster just opened in the shop. */
  private opened: { kind: BoosterKind; cards: BoosterCard[] } | null = null;
  private state: GameState | null = null;
  private pending: Pending | null = null;
  private stage: Stage | null = null;
  private sheet: Sheet | null = null;
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
    toast: (text) => this.showToast(text, 'error'),
    done: () => {
      this.menuPage = 'quickplay';
      this.render();
    },
  });

  private seats: MenuSeat[] = [
    { name: 'Commander', isAI: false, deckId: PRESETS[0].id },
    { name: "Xel'Naru", isAI: true, deckId: PRESETS[1].id },
  ];

  constructor(private root: HTMLElement) {
    try {
      const saved = localStorage.getItem(SPEED_KEY) as Speed | null;
      if (saved && saved in SPEED_FACTOR) this.speed = saved;
    } catch {
      // ignore
    }
    this.preview = document.createElement('div');
    this.preview.className = 'card-preview';
    document.body.appendChild(this.preview);

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
    root.addEventListener('pointerdown', (e) => this.onPressStart(e));
    window.addEventListener('pointermove', (e) => this.onPressMove(e));
    window.addEventListener('pointerup', () => this.onPressEnd());
    window.addEventListener('pointercancel', () => this.onPressEnd());
    root.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest('[data-card]')) e.preventDefault();
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
    const prev = this.state;
    const sameGame = this.screen === 'game' && prev && prev.players.every((p, i) => next.players[i]?.id === p.id) && next.turnNumber >= prev.turnNumber && !(prev.winnerId && !next.winnerId);
    if (!sameGame || !prev) {
      this.state = next;
      this.viewerId = you;
      this.revealedFor = you;
      this.viewRivalId = null;
      this.pending = null;
      this.stage = null;
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
    const before = snapshot(this.root);
    if (last.action.type !== 'setTarget') backdrop.spin();
    const turnPassed = activePlayer(prev).id !== activePlayer(next).id;
    this.state = next;
    this.pending = null;
    if (this.sheet?.kind === 'card') this.sheet = null;
    this.stage = null;
    if (actor.id !== you && last.action.type === 'playCard') this.stage = this.remoteStage(last, next);
    const sprung = this.sprungLightspeed(prev, next);
    if (sprung) this.stage = sprung;
    if (isGameOver(next) && !isGameOver(prev)) this.holdResult(next, last.action);
    this.render();
    this.surfaceLog(prev);
    this.animate(prev, next, last.action, actor, before);
    if (turnPassed) this.announceTurn(450);
  }

  /** The rival's card just played, online, on the stage (to confirm, if the room is waiting on you to read it). */
  private remoteStage(last: LastMove, state: GameState): Stage | null {
    const actor = state.players.find((p) => p.id === last.actorId);
    if (!actor) return null;
    const confirm = this.net.waitFor === 'you';
    if (last.faceDown) return { defId: 'null_field', actorId: actor.id, faceDown: true, caption: `${actor.name.toLowerCase()} sets a card face down`, confirm };
    if (last.played) return { defId: last.played, actorId: actor.id, confirm };
    return null;
  }

  /** The viewer has read the rival's card on the stage: it goes, and the rival carries on. */
  private confirmStage() {
    if (!this.stage?.confirm) return;
    this.stage = null;
    sound.click();
    if (this.online) {
      this.net.waitFor = null;
      this.online.ack();
    }
    this.render();
    if (!this.online) this.scheduleAI(450);
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
   * "Your turn" banner: a soft bloom across the middle of the screen whenever
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
    this.showBanner('your turn', humans > 1 ? `${p.name} · ${plays}` : `round ${roman(s.round)} · ${plays}`, delay);
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
      this.dealCard(el, 350 + i * 110);
      sound.draw(0.35 + i * 0.11);
    });
  }

  /** An element's position inside the dock, from layout offsets (unaffected by the table's tilt). */
  private dockPos(el: HTMLElement): { x: number; y: number } | null {
    const dock = el.closest<HTMLElement>('.dock');
    let x = 0;
    let y = 0;
    let n: HTMLElement | null = el;
    while (n && n !== dock) {
      x += n.offsetLeft;
      y += n.offsetTop;
      n = n.offsetParent as HTMLElement | null;
    }
    return n === dock ? { x, y } : null;
  }

  /**
   * Draw a card: it always starts on the deck pile and flies exactly to its
   * place in the fan. Everything is computed in the dock's own layout space,
   * so the tilted, scaled table cannot throw it off.
   */
  private dealCard(el: HTMLElement, delay: number) {
    if (reducedMotion()) return;
    for (const a of el.getAnimations()) a.cancel();
    const pile = this.root.querySelector<HTMLElement>('[data-anchor="deck"]');
    const card = this.dockPos(el);
    const deck = pile && this.dockPos(pile);
    if (!card || !deck || !pile) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const s = Math.min(1, (pile.offsetHeight * 0.9) / h);
    // The card rotates about (50%, 120%): place its centre on the pile's centre.
    const tx = deck.x + pile.offsetWidth / 2 - (card.x + w / 2);
    const ty = deck.y + pile.offsetHeight / 2 - (card.y + h * 1.2) + h * 0.7 * s;
    const rest = getComputedStyle(el).transform;
    el.animate(
      [
        { transform: `translate(${tx}px, ${ty}px) scale(${s}) rotate(-6deg)`, opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { transform: rest === 'none' ? 'none' : rest, opacity: 1 },
      ],
      { duration: 460, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
    );
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
    const before = animate ? snapshot(this.root) : null;
    if (animate && action.type !== 'setTarget') backdrop.spin();
    const turnPassed = activePlayer(prev).id !== activePlayer(next).id;
    this.state = next;
    this.pending = null;
    if (this.sheet?.kind === 'card') this.sheet = null;
    this.stage = actor.isAI ? this.stageFor(actor, action) : null;
    // With someone watching, an AI's card waits on the stage until they have read it.
    if (this.stage && animate && !isGameOver(next) && next.players.some((p) => !p.isAI)) this.stage.confirm = true;
    const sprung = this.sprungLightspeed(prev, next);
    if (sprung) this.stage = sprung;
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
    // The AI waits for its start of turn to play out before it acts.
    this.scheduleAI(AI_PAUSE[action.type] + (action.type === 'endTurn' && animate ? this.replayLength(next) / SPEED_FACTOR[this.speed] : 0));
  }

  private quitToMenu() {
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
    return { defId: card.defId, actorId: actor.id };
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

  /** Resolve the rest of the AI turns instantly, up to the next human turn. */
  private skipAI() {
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer);
    this.aiTimer = null;
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

    // A turn's start replays its effects one by one (see replayPulses); cards that faded go once it has.
    const pulses = endingTurn && !reducedMotion() ? (next.turnPulses ?? []).filter((p) => p.kind !== 'start') : [];
    const replayEnd = pulses.length ? this.replayPulses(next, prev, before) : 0;
    before.cards.forEach((old, uid) => {
      if (root.querySelector(`[data-uid="${uid}"]`)) return;
      let to: DOMRect | null = null;
      if (vNext.discard.some((c) => c.uid === uid)) to = anchorRect(root, 'discard');
      else {
        const owner = next.players.find((p) => [...p.deck, ...p.hand, ...p.discard].some((c) => c.uid === uid));
        if (owner) to = orbRect(owner.id);
      }
      const at = removalAt.get(uid);
      if (at !== undefined && this.lingerInSlot(prev, uid, old.html, at)) return;
      ghost(old.html, old.rect, to, { size: { w: old.w, h: old.h }, delay: replayEnd });
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

    // Who caused this round of changes: the player who acted, or (at a turn's
    // start) the player whose tableau just triggered.
    const source = endingTurn ? activePlayer(next) : actor;
    const delay = endingTurn ? 750 : actor.isAI ? 520 : 160;
    // (A turn's start that replays its effects one by one has shown its hits already.)
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
      if (volley) window.setTimeout(() => sound.flare(), delay);
      const me = next.players.find((p) => p.id === source.id)!;
      const meWas = prev.players.find((p) => p.id === source.id)!;
      if (me.heat !== meWas.heat || me.shields > meWas.shields) {
        hit(source.id, delay, false);
        if (me.heat < meWas.heat) window.setTimeout(() => sound.thermo(), delay);
      }
    }

    switch (action.type) {
      case 'playCard': {
        sound.play();
        const played = prev.players.find((p) => p.id === actor.id)!.hand.find((c) => c.uid === action.cardUid);
        if (played && cardDef(played.defId).kind === 'command') {
          window.setTimeout(() => sound.upgrade(), delay);
          if (actor.id === viewer.id) pulse(root.querySelector('[data-anchor="upgrades"]'), 'fx-upgrade', delay);
        }
        break;
      }
      case 'endTurn': {
        sound.endTurn();
        // The new player's start-of-turn cards light up, oldest first, as they trigger.
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

  /** How long a state's start-of-turn replay lasts, in ms (0 if it has none). */
  private replayLength(state: GameState): number {
    if (reducedMotion()) return 0;
    const n = (state.turnPulses ?? []).filter((p) => p.kind !== 'start').length;
    return n ? 700 + n * PULSE_STEP * SPEED_FACTOR[this.speed] + 400 : 0;
  }

  /**
   * A turn's start, effect by effect: each card that fires lights up, and its
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
        if (ps.kind === 'heat' || ps.kind === 'selfHeat' || ps.kind === 'unstable') sound.flare();
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
      this.showToast('No plays left this turn: end your turn.', 'info');
      sound.error();
      return;
    }
    if (cardDef(card.defId).kind === 'lightspeed' && !canSetLightspeed(me)) {
      this.showToast('You already have a Lightspeed card face down: only one at a time.', 'info');
      sound.error();
      return;
    }
    if (persists(card.defId) && tableauFull(me)) {
      this.showToast('Your tableau is full: a card can only go in once one fades (or is recalled or removed).', 'info');
      sound.error();
      return;
    }
    this.pending = { uid, step: 'upgrade' };
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
    if (cardNeedsUpgradeChoice(card.defId) && upgradeOptions(me).length > 0 && !p.upgrade) return ask('upgrade');
    if (enemyChoices(s, me, card.defId).length > 0 && !p.enemyUid) {
      if (target) this.viewRivalId = target.id;
      return ask('enemy');
    }
    if (allyChoices(me, card.defId).length > 0 && !p.allyUid) return ask('ally');
    if (recoverChoices(me, card.defId).length > 0 && !p.recoverUid) return ask('recover');
    if (needsSlot(me, card.defId) && p.slot === undefined) return ask('slot');
    this.dispatch({ type: 'playCard', cardUid: p.uid, upgrade: p.upgrade, enemyUid: p.enemyUid, allyUid: p.allyUid, recoverUid: p.recoverUid, slot: p.slot });
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const seat = el.dataset.seatName;
    if (seat !== undefined) this.seats[Number(seat)].name = el.value;
    if (el.dataset.dbName !== undefined) this.builder.onInput(el.value);
    if (el.dataset.joinCode !== undefined) this.net.joinCode = el.value;
  }

  private peekHeld = false;

  /**
   * Whether an overlay is up that the player must answer mid-move (choosing an
   * upgrade, or a card to recover): only then can they look past it at the board.
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
    this.preview.innerHTML = this.bigCard(el.dataset.card!, el.closest('.tableau') ? el.dataset.uid : undefined);
    const page = appSize();
    const h = Math.min(420, page.h - 24) * 0.7;
    const w = h * 0.714;
    this.preview.style.setProperty('--pw', `${w}px`);
    this.preview.style.left = `${Math.min(page.w - w - 16, page.w * 0.78 - w / 2)}px`;
    this.preview.style.top = `${(page.h - h) / 2}px`;
    this.preview.classList.add('show');
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
    // Buttons tick; moves on the table (and map selections) have sounds of their own.
    if (!QUIET_ACTS.has(act) && !el.classList.contains('overlay') && !el.classList.contains('cmp-stage')) sound.click();
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
      case 'open-decks':
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
      case 'menu-page':
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
        this.sheet = { kind: 'pile', pile: arg as 'deck' | 'discard' };
        return this.render();
      case 'view-player':
        this.sheet = { kind: 'player', playerId: arg || (s ? this.viewer().id : '') };
        return this.render();
      case 'view-upgrade':
        this.sheet = { kind: 'upgrade', action: arg as CoreAction };
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
        return this.dispatch({ type: 'endTurn' });
      case 'upgrade':
        if (this.pending) this.pending.upgrade = arg as CoreAction;
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
    this.root.innerHTML = this.screen === 'menu' ? this.renderMenu() : this.screen === 'campaign' ? this.campaign.render() : this.renderGame();
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
    cards.forEach((c, i) => {
      const t = i - (n - 1) / 2;
      c.style.left = `${start + i * spacing}px`;
      c.style.setProperty('--fr', `${t * step}deg`);
      c.style.setProperty('--fy', `${Math.abs(t) ** 2 * 2.5}px`);
      c.style.zIndex = String(i + 1);
    });
  }

  // ---- Front end -------------------------------------------------------------

  private renderMenu(): string {
    const page = this.menuPage;
    const setup = page === 'quickplay' || page === 'options' || page === 'decks' || page === 'online' || page === 'shop';
    const body =
      page === 'title'
        ? this.renderTitlePage()
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
    const column = (act: string, arg: string, icon: string, name: string, blurb: string, extra = '') => `
      <div class="hub-col">
        <button class="hub-card" data-act="${act}" ${arg ? `data-arg="${arg}"` : ''}>
          <span class="hub-icon">${icon}</span>
          <span class="hub-name">${name}</span>
          <small class="hub-blurb">${blurb}</small>
        </button>
        ${extra}
      </div>`;
    return `
      <div class="menu-back"><button class="btn btn-small" data-act="menu-page" data-arg="title">‹ back</button></div>
      ${this.profileBar()}
      ${this.titleBlock(true)}
      <div class="hub">
        ${column('campaign-new', '', HUB_ICONS.campaign, 'campaign', 'Conquer a galaxy of forty-eight systems, one battle at a time.',
          hasCampaign ? '<button class="btn btn-small hub-continue" data-act="campaign-continue">continue campaign</button>' : '')}
        ${column('menu-page', 'quickplay', HUB_ICONS.quickplay, 'quickplay', 'A 1v1 battle: against the AI, a friend on this device, or online.',
          hasGame ? '<button class="btn btn-small hub-continue" data-act="continue">continue game</button>' : '')}
        ${column('menu-page', 'shop', HUB_ICONS.shop, 'collection', 'Open booster packs, craft the cards you want and build decks with them.',
          '<button class="btn btn-small hub-continue" data-act="open-decks">deck builder</button>')}
        ${column('menu-page', 'options', HUB_ICONS.options, 'options', 'Sound, music, AI speed and how to play.')}
      </div>`;
  }

  /** Your level, experience, currencies and rank, across the top of the hub and the shop. */
  private profileBar(): string {
    const p = profile();
    const need = xpToNext(p.level);
    return `
      <div class="profile-bar" title="${p.won} won of ${p.played} played">
        <span class="pf-level"><small>level</small><b>${p.level}</b></span>
        <span class="pf-xp" title="${p.xp} / ${need} experience to level ${p.level + 1}"><i style="width:${Math.round((p.xp / need) * 100)}%"></i></span>
        <span class="pf-cur pf-dust" title="Stardust: buys booster packs">✦ <b>${p.stardust}</b></span>
        <span class="pf-cur pf-flux" title="Flux: crafts cards (break spare cards down for more)">⟁ <b>${p.flux}</b></span>
        <span class="pf-rank" title="${p.rankPoints === null ? 'Play ranked online to earn a rank' : `${rankOf(p.rankPoints).points} / ${PROGRESSION.stagePoints} rank points to the next stage`}">${p.rankPoints === null ? 'unranked' : esc(rankName(p.rankPoints).toLowerCase())}</span>
      </div>`;
  }

  /** The shop: a booster for each race, and a general one with every card of no race. Opened packs are shown here. */
  private renderShop(): string {
    const p = profile();
    const label = (k: BoosterKind) => (k === 'general' ? 'general' : RACE_NAMES[k].toLowerCase());
    const packs = BOOSTERS.map((k) => {
      const pool = boosterPool(k);
      const missing = pool.filter((c) => owned(c.id) === 0).length;
      return `
        <div class="booster booster-${k}">
          <div class="booster-pack">${k === 'general' ? `<span class="booster-icon">${HUB_ICONS.shop}</span>` : factionAvatar(`f${k + 1}`, 'booster-emblem')}</div>
          <b>${label(k)} booster</b>
          <small>${PROGRESSION.boosterSize} cards of ${pool.length} · ${missing ? `${missing} you don't own` : 'you own them all'}</small>
          <button class="btn-primary" data-act="buy-booster" data-arg="${k}" ${p.stardust < PROGRESSION.boosterPrice ? 'disabled' : ''}>open · ✦${PROGRESSION.boosterPrice}</button>
        </div>`;
    }).join('');
    const opened = this.opened
      ? `<div class="booster-open">
          <div class="section-label">${esc(label(this.opened.kind))} booster</div>
          <div class="booster-cards">${this.opened.cards
            .map((c, i) => `<div class="booster-card" style="--i:${i}">${this.cardFace(c.id)}<small class="${c.flux ? 'bc-flux' : owned(c.id) === 1 ? 'bc-new' : ''}">${c.flux ? `spare · +⟁${c.flux}` : owned(c.id) === 1 ? 'new' : `owned ${owned(c.id)}`}</small></div>`)
            .join('')}</div>
          <button class="btn" data-act="close-booster">done</button>
        </div>`
      : '';
    return this.setupPage(
      'collection',
      `${this.profileBar()}${opened || `<div class="booster-row">${packs}</div>`}`,
      `<span class="muted">Win games to earn stardust ✦ and flux ⟁ (far more online, and more again ranked).</span><span class="setup-spacer"></span><button class="btn" data-act="open-decks">deck builder</button>`,
    );
  }

  /** A card's face on its own, outside a game (as in the deck builder). */
  private cardFace(id: string): string {
    const c = cardDef(id);
    return `<div class="card kind-${c.kind}${c.race !== undefined ? ` race-${c.race}` : ''} rarity-${c.rarity ?? 'dwarf'}" data-card="${c.id}">
      <span class="card-glyph">${cardArt(c, true)}</span>${stabilityBadge(c)}
      <span class="card-name">${esc(c.name.toLowerCase())}</span>
      <span class="card-text">${esc(c.text)}</span>
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
        ${tile('rules', 'how to play', 'read')}
      </div>`,
      '',
    );
  }

  private rulesHtml(): string {
    return `
      <ul class="rules">
        <li>Every sun starts at <b>${BALANCE.startingHeat}</b> heat with <b>${BALANCE.supernovaAt}</b> max health. Reach it and your sun goes supernova. Blow up your rival's sun to win.</li>
        <li>Bring a <b>${BALANCE.deckSize}-card deck</b>: up to ${BALANCE.maxCopies} copies of a card, and exactly ${BALANCE.commandCards} Command cards. You start with ${BALANCE.openingHand} cards and draw ${BALANCE.drawPerTurn} each turn after that.</li>
        <li>Play <b>1 card</b> on your first turn, then up to <b>${BALANCE.maxPlays}</b> a turn. Cards <b>stay in play</b> in your tableau of <b>${BALANCE.tableauSlots} slots</b>, in the slot you choose: their start-of-turn effects trigger every turn, and they power each other up.</li>
        <li><b>Stability</b> (◷) is how many of your turns a card stays: after its start-of-turn effects it loses 1, and at 0 it fades into your discard pile. Some cards restore stability; others erode your rival's. There is <b>no replacing</b>: with every slot full, nothing new goes in until a card fades, or is recalled or removed.</li>
        <li><b>Orbit:</b> three planets circle your sun, each facing it for ${BALANCE.orbitTurns} of your turns in turn: the <b>dead</b> planet (nothing), the <b>abundant</b> planet (draw ${BALANCE.abundantDraw} extra card each turn), then the <b>industrial</b> planet (play ${BALANCE.industrialPlays} extra card each turn), and round again. Every sun starts at the dead planet. Some cards move an orbit on or back ("your orbit +1", "your rival's orbit −2"); others are stronger while a planet faces your sun.</li>
        <li><b>Defence</b> (⛨) comes from the slot: ${BALANCE.slotDefence.join(', ')} from left to right, so the middle is safest. Sturdy cards and bulwarks add more. Removal only reaches cards with low enough defence ("destroy a card with 2 or less defence").</li>
        <li>Your attacks heat your rival's sun. Shields absorb their heat and fade at the start of your turn.</li>
        <li><b>Command</b> cards upgrade your whole deck: Solar Flare (your attack cards deal +1 heat), Thermosiphon (your cooling cools +1) or Cooling Chamber (+${BALANCE.coolingChamberHealthPerUpgrade} max health), up to ${BALANCE.solarFlareMaxUpgrades} each. They stay in your tableau like any other card, and some cards reward keeping them there. Play one again and it upgrades again.</li>
        <li><b>Resonance</b> cards power up their neighbours in your tableau, and bulwarks guard them.</li>
        <li><b>Lightspeed</b> cards are set face down (one at a time, no slot) and spring during your rival's turn: cancelling a card they play, turning heat aside, or saving your cards from removal.</li>
        <li>Destroyed and cancelled cards go to your discard pile. When your deck runs out it is shuffled back in (heating your sun by ${BALANCE.reshuffleHeat}), and some cards recover cards from it or return your cards to your hand to play again.</li>
        <li>Only one <b>global</b> card can be in play at a time, and it affects both players. <b>Regional stability</b> (top of the screen) drains one segment a round; from round ${BALANCE.instabilityStartsRound} it is gone and both suns heat each turn, more each round.</li>
      </ul>`;
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
          <div class="star-dock"><div class="board-star-slot"></div></div>
          ${this.renderDock()}
        </div>
        ${this.renderHud()}
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
        ? `Round ${s.round}. Regional instability: every sun heats by ${instab} at the start of its turn this round, and by ${next} next round.`
        : `Round ${s.round}. Regional stability drains by one each round; when it runs out, every sun heats at the start of its turn.`}">
        <div class="round-num"><small>round</small><b>${roman(s.round)}</b></div>
        <div class="stability">
          <span class="stability-label">${instab ? `regional instability +${instab} <em>next round +${next}</em>` : `regional stability ${remaining}`}</span>
          <div class="stability-bar">${segments}</div>
        </div>
      </div>`;
  }

  /**
   * Both players' cards, stacked down the left: yours first, then your rival's.
   * Whoever's turn it is glows green.
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
    const active = activePlayer(s);
    const global = activeGlobal(s);
    const field = global
      ? `<button class="field" data-act="inspect" data-card="${global.card.defId}" title="${esc(cardDef(global.card.defId).text)}">
          ${cardGlyph(global.card.defId, 'global')}
          <span class="field-name">${esc(cardDef(global.card.defId).name.toLowerCase())}</span>
        </button>`
      : '';
    const aiTurn = active.isAI && !isGameOver(s);
    // Off the table, flat: players top left, round and stability top centre, menu and turn controls top right.
    return `
      <div class="hud">
        <div class="hud-players">${this.renderPlayers()}</div>
        <div class="hud-round">${this.renderRoundBar()}</div>
        <div class="hud-controls">
          ${field}
          ${aiTurn ? '<button class="pill-btn" data-act="skip-ai" title="Resolve AI turns instantly">skip ›</button>' : ''}
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
    if (!p || p.step === 'upgrade') return '';
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
        ? `<button class="card card-table card-back ls-card" data-act="inspect" data-card="${ls.defId}" title="Set face down: ${esc(cardDef(ls.defId).name)}. ${esc(cardDef(ls.defId).text)}"><span>⚡</span><small>lightspeed</small></button>`
        : '<div class="card card-table card-back ls-card ls-hidden" title="A Lightspeed card is set face down. It springs during your turn."><span>⚡</span><small>lightspeed</small></div>'
      : '<div class="slot-empty slot-ls" title="Lightspeed: one card can be set face down here"><span class="slot-def">⚡</span></div>';
    return `
      <div class="tableau tableau-${side} ${p.eliminated ? 'tableau-dead' : ''}" data-owner="${p.id}">
        <div class="tableau-row-wrap">
          <div class="vitals" data-anchor="player:${p.id}">${vitals({ heat: p.heat, threshold: supernovaThreshold(p), shields: p.shields, dead: p.eliminated, id: p.id, orbit: p.orbit })}<span class="vitals-name">${side === 'mine' ? 'your sun' : `${esc(p.name.toLowerCase())}'s sun`}</span></div>
          <div class="tableau-row">${slots}<div class="ls-slot">${lightspeed}</div></div>
          ${this.renderForecast(p)}
        </div>
      </div>`;
  }

  /**
   * Above each tableau: what that player's next start of turn will do, net of
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
      chip('fc-heat', '✹', f.heat, `Their start of turn: ${f.heat} heat to ${who(f.targetId)} (before shields)`),
      chip('fc-shield', '⛨', f.shields, `Their start of turn: ${f.shields} shield${f.shields === 1 ? '' : 's'} raised`),
      chip('fc-cool', '❄', f.cool, `Their start of turn: their own sun cools by ${f.cool}`),
      chip('fc-self', '☀', f.selfHeat, `Their start of turn: ${f.selfHeat} heat to their own sun from their cards' drawbacks and the table`),
      chip('fc-unstable', '≋', f.unstable, `Their start of turn (round ${f.round}): regional instability heats their sun by ${f.unstable}`),
      chip('fc-draw', HAND_ICON, f.draw, `Their start of turn: ${f.draw} extra card${f.draw === 1 ? '' : 's'} drawn${f.planet === 'abundant' ? ' (the abundant planet faces their sun)' : ''}`),
      chip('fc-play', '▶', f.plays, `Their turn: ${f.plays} extra card${f.plays === 1 ? '' : 's'} they may play (the industrial planet faces their sun)`),
    ].join('');
    // Nothing coming: show nothing.
    if (!chips) return '';
    return `<div class="forecast ${p.id === me.id ? 'forecast-mine' : ''}" aria-label="${p.id === me.id ? 'your' : 'their'} next start of turn">${chips}</div>`;
  }

  private renderDock(): string {
    const s = this.state!;
    const me = this.viewer();
    const act = this.canAct();
    const busy = this.pending !== null;
    const hidden = this.needsHandoff();
    const rail = `
      ${actionChip({ action: 'solarFlare', upgrades: me.upgrades.solarFlare, power: `+${me.upgrades.solarFlare}` })}
      ${actionChip({ action: 'thermosiphon', upgrades: me.upgrades.thermosiphon, power: `+${me.upgrades.thermosiphon}` })}
      ${actionChip({ action: 'coolingChamber', upgrades: me.upgrades.coolingChamber, power: `${supernovaThreshold(me)}` })}`;
    const hand = hidden ? '<div class="hand-hidden">hand hidden</div>' : me.hand.map((c) => this.renderCard(c, { hand: true })).join('');
    const myTurn = activePlayer(s).id === me.id && !isGameOver(s);
    const total = Math.max(me.playsLeft, myTurn ? playsAllowed(s, me) : 0);
    const pips = myTurn
      ? Array.from({ length: total }, (_, i) => `<i class="${i < me.playsLeft ? 'on' : ''}"></i>`).join('')
      : '';
    return `
      <section class="dock">
        <div class="command" data-anchor="upgrades">
          <div class="rail">${rail}</div>
        </div>
        <button class="pile" data-anchor="deck" data-act="view-pile" data-arg="deck" title="Your deck"><span class="pile-stack"><i></i><i></i></span><b>${me.deck.length}</b><small>deck</small></button>
        <div class="hand-zone">
          <div class="hand">${hand}</div>
        </div>
        <button class="pile" data-anchor="discard" data-act="view-pile" data-arg="discard" title="Your discard pile"><span class="pile-stack"><i></i><i></i></span><b>${me.discard.length}</b><small>discard</small></button>
        <div class="turn-controls">
          <div class="plays ${myTurn ? '' : 'plays-off'}" title="Cards you may still play this turn">
            <small>${myTurn ? `plays ${me.playsLeft}` : 'waiting'}</small>
            <span class="plays-pips">${pips}</span>
          </div>
          <button class="btn-primary end-turn ${act && me.playsLeft === 0 ? 'end-turn-ready' : ''}" data-act="end-turn" ${act && !busy ? '' : 'disabled'}>end turn</button>
        </div>
      </section>`;
  }

  private renderCard(c: CardInstance, opts: { hand?: boolean; tableau?: 'mine' | 'rival'; static?: boolean; owner?: PlayerState }): string {
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
        <div class="card-text">${esc(def.text)}</div>
        <div class="card-kind">${typeLine(def)}</div>
      </button>`;
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
        <div class="card-text">${esc(def.text)}</div>
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
    const card = st.faceDown ? '<div class="card card-back"><span>⚡</span><small>lightspeed</small></div>' : this.renderCard({ uid: 'stage', defId: st.defId }, { static: true });
    return `
      <div class="stage ${st.caption && !st.faceDown ? 'stage-sprung' : ''} ${st.confirm ? 'stage-confirm' : ''}">
        ${card}
        <div class="stage-caption">${esc(st.caption ?? `${actor.name.toLowerCase()} plays`)}</div>
        ${st.confirm ? `<button class="btn stage-ok" data-act="stage-ok" title="${esc(actor.name)} waits until you have read their card">got it</button>` : ''}
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
      <button class="btn" data-act="speed">ai speed: ${this.speed}</button>`;
  }

  private renderSheet(): string {
    const sh = this.sheet!;
    const s = this.state;
    switch (sh.kind) {
      case 'rules':
        return this.sheetFrame('how to play', this.rulesHtml());
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
        return this.renderPileSheet(sh.pile);
      case 'player':
        return this.renderPlayerSheet(s!.players.find((p) => p.id === sh.playerId) ?? this.viewer());
      case 'upgrade': {
        const me = this.viewer();
        const a = sh.action;
        return this.sheetFrame(
          ACTION_NAME[a].toLowerCase(),
          `<div class="action-sheet">
            ${actionTile({ action: a, upgrades: me.upgrades[a], power: a === 'coolingChamber' ? String(supernovaThreshold(me)) : `+${me.upgrades[a]}`, enabled: false, compact: true, actAttr: '' })}
            <div><p>${ACTION_TEXT[a]}</p><p class="muted">Upgrades: ${me.upgrades[a]}/${MAX_UPGRADES[a]}. Command cards upgrade it.</p></div>
          </div>`,
        );
      }
      case 'card': {
        const me = s ? activePlayer(s) : null;
        const playable = !!(sh.uid && me && me.hand.some((c) => c.uid === sh.uid) && this.canAct() && !this.pending);
        const button = sh.uid ? `<button class="btn-primary" data-act="play" data-arg="${sh.uid}" ${playable && me!.playsLeft > 0 ? '' : 'disabled'}>play</button>` : '';
        return `
          <div class="overlay overlay-inspect" data-act="cancel">
            <div class="inspector sheet">
              ${this.bigCard(sh.defId, sh.table)}
              <div class="inspector-actions">${button}<button class="btn" data-act="cancel">close</button></div>
            </div>
          </div>`;
      }
    }
  }

  /** A player's summary: their deck, upgrades, Command cards and the conditions they fight under. */
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
    const ups = (['solarFlare', 'thermosiphon', 'coolingChamber'] as const)
      .map((a) =>
        actionTile({ action: a, upgrades: p.upgrades[a], power: a === 'coolingChamber' ? String(supernovaThreshold(p)) : `+${p.upgrades[a]}`, enabled: false, compact: true, actAttr: `data-act="view-upgrade" data-arg="${a}"` }),
      )
      .join('');
    const commands = p.tableau.filter((c) => cardDef(c.defId).kind === 'command').map((c) => esc(cardDef(c.defId).name.toLowerCase())).join(' · ');
    return `
      <div class="overlay overlay-inspect" data-act="cancel">
        <div class="sys-wrap sheet">
          <div class="sys-tabs">${tabs}</div>
          <div class="sys-card player-card">
            <div class="sys-kicker">${p.id === me.id ? 'you' : esc(p.name.toLowerCase())} · ${esc(RACE_NAMES[p.species].toLowerCase())}</div>
            ${factionAvatar(`f${p.species + 1}`, 'player-emblem')}
            <h2 class="sys-name">${esc((p.deckName ?? 'custom deck').toLowerCase())}</h2>
            <div class="upgrade-actions">${ups}</div>
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

  private renderPileSheet(kind: 'deck' | 'discard'): string {
    const me = this.viewer();
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
    if (!pend || pend.step !== 'upgrade') return '';

    // Command Directive: choose what to upgrade.
    const me = activePlayer(s);
    const options = upgradeOptions(me);
    const tiles = (['solarFlare', 'thermosiphon', 'coolingChamber'] as const)
      .map((a) => {
        const ok = options.includes(a);
        const next = me.upgrades[a] + 1;
        return `<div class="upgrade-choice">
          ${actionTile({ action: a, upgrades: me.upgrades[a], power: a === 'coolingChamber' ? String(supernovaThreshold(me)) : `+${me.upgrades[a]}`, enabled: ok, compact: true, actAttr: ok ? `data-act="upgrade" data-arg="${a}"` : 'disabled' })}
          <small>${ok ? (a === 'coolingChamber' ? `→ ${supernovaThreshold(me) + BALANCE.coolingChamberHealthPerUpgrade} max health` : `→ +${next} ${a === 'solarFlare' ? 'heat on attacks' : 'cooling'}`) : 'fully upgraded'}</small>
        </div>`;
      })
      .join('');
    return `
      <div class="overlay overlay-soft" data-act="cancel"><div class="modal modal-wide">
        <div class="bar-title">command · choose an upgrade</div>
        <div class="modal-body upgrade-body"><div class="upgrade-actions">${tiles}</div></div>
        <button class="modal-cancel" data-act="cancel">cancel</button>
      </div></div>`;
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
