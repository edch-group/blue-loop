import {
  ACTION_NAME,
  ACTION_TEXT,
  activeGlobal,
  activePlayer,
  applyAction,
  BALANCE,
  cardDef,
  cardNeedsDestroyTarget,
  cardNeedsUpgradeChoice,
  chooseAIAction,
  createGame,
  GameError,
  instabilityHeat,
  isGameOver,
  MAX_UPGRADES,
  persists,
  playsAllowed,
  RACE_NAMES,
  supernovaThreshold,
  tableauFull,
  targetOf,
  upgradeOptions,
  type Action,
  type CardInstance,
  type CoreAction,
  type GameState,
  type PlayerSetup,
  type PlayerState,
} from '../engine';
import { actionChip, actionTile, roman, sunOrb } from './art';
import { backdrop } from './backdrop';
import { DeckBuilder } from './builder';
import { CampaignView, loadCampaign } from './campaign';
import { allDecks, deckById, PRESETS } from './decks';
import { factionAvatar } from './factions';
import { anchorRect, flyFrom, ghost, projectile, pulse, reducedMotion, snapshot, type Snapshot } from './fx';
import { cardGlyph, KIND_COLOUR } from './glyphs';
import { MENU_ICON } from './menu-icon';
import { sound } from './sound';
import { clearSave, loadSave, save } from './storage';
import { appSize, pageRect } from './viewport';

type Screen = 'menu' | 'game' | 'campaign';
type MenuPage = 'title' | 'hub' | 'quickplay' | 'options' | 'decks';

const HUB_ICONS = {
  campaign: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 34 22 26 36 32M22 26 26 12 36 32M10 34 14 16 26 12"/><circle cx="10" cy="34" r="3.2"/><circle cx="22" cy="26" r="2.6"/><circle cx="36" cy="32" r="3.6"/><circle cx="26" cy="12" r="3"/><circle cx="14" cy="16" r="2.4"/></svg>`,
  quickplay: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="24" r="8"/><circle cx="36" cy="24" r="4.5"/><path d="M26 24h4M27.5 20.5 31 24l-3.5 3.5"/></svg>`,
  options: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 15h28M10 24h28M10 33h28"/><circle cx="18" cy="15" r="3.2"/><circle cx="31" cy="24" r="3.2"/><circle cx="22" cy="33" r="3.2"/></svg>`,
};
type Speed = 'slow' | 'normal' | 'fast';

/**
 * A card the player is playing that still needs choices: which upgrade
 * (Command Directive), which rival card to destroy (Ion Cannon), and which of
 * their own cards to replace when their tableau is full.
 */
interface Pending {
  uid: string;
  step: 'upgrade' | 'destroy' | 'replace';
  upgrade?: CoreAction;
  destroyUid?: string;
  replaceUid?: string;
}

/** What an AI player just played, shown large at the middle right. */
interface Stage {
  defId: string;
  actorId: string;
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
  | { kind: 'card'; defId: string; uid?: string };

const SPEED_KEY = 'blue-loop:ai-speed';
const SPEED_FACTOR: Record<Speed, number> = { slow: 1.7, normal: 1, fast: 0.4 };
/** Pause after each kind of AI action, before the next one (ms at normal speed). */
const AI_PAUSE: Record<Action['type'], number> = { playCard: 1700, setTarget: 500, endTurn: 1200 };
const TOAST_MS = 2600;
const LONG_PRESS_MS = 450;
/** Log lines worth emphasising: hits, supernovas, upgrades and so on. */
const KEY_LOG = /heats to|SUPERNOVA|upgrades|wins|shields absorb|instability|destroys|stings|replaces/;
const HOT = '#f0a07a';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface MenuSeat {
  name: string;
  isAI: boolean;
  enabled: boolean;
  deckId: string;
}

export class App {
  private screen: Screen = 'menu';
  /** Which page of the front end is showing: title → hub (campaign · quickplay · options) → setup. */
  private menuPage: MenuPage = 'title';
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
    toMenu: () => {
      this.campaignBattle = false;
      this.screen = 'menu';
      this.menuPage = 'hub';
      this.render();
    },
  });
  private campaignBattle = false;
  private builder = new DeckBuilder({
    render: () => this.render(),
    toast: (text) => this.showToast(text, 'error'),
    done: () => {
      this.menuPage = 'quickplay';
      this.render();
    },
  });

  private seats: MenuSeat[] = [
    { name: 'Commander', isAI: false, enabled: true, deckId: PRESETS[0].id },
    { name: "Xel'Naru", isAI: true, enabled: true, deckId: PRESETS[1].id },
    { name: 'Vorthane', isAI: true, enabled: false, deckId: PRESETS[2].id },
    { name: 'Ixquor', isAI: true, enabled: false, deckId: PRESETS[3].id },
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
    window.addEventListener('resize', () => {
      this.fitHand();
      if (this.screen === 'campaign') this.campaign.afterRender(this.root);
    });
  }

  start() {
    backdrop.mount();
    this.render();
  }

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------

  private newGame() {
    const players: PlayerSetup[] = this.seats
      .filter((s) => s.enabled)
      .map((s, i) => {
        const deck = deckById(s.deckId) ?? PRESETS[i % 4];
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
  private showBanner(text: string, sub: string, delay = 0) {
    window.setTimeout(() => {
      if (this.screen !== 'game') return; // left the table before it showed
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
    if (!s) return;
    const active = activePlayer(s);
    if (!active.isAI) this.viewerId = active.id;
  }

  private dispatch(action: Action, animate = true) {
    const prev = this.state;
    if (!prev) return;
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
    // An AI's attacks bring its target's tableau onto the table.
    if (actor.isAI && action.type === 'setTarget' && action.targetId !== this.viewer().id) this.viewRivalId = action.targetId;
    this.persist(next);
    this.syncViewer();
    this.render();
    if (before) {
      this.surfaceLog(prev);
      this.animate(prev, next, action, actor, before);
    }
    if (turnPassed) this.announceTurn(450);
    this.scheduleAI(AI_PAUSE[action.type]);
  }

  /** Autosave: a campaign battle is saved inside its campaign; a normal game on its own. */
  private persist(state: GameState) {
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
    return card ? { defId: card.defId, actorId: actor.id } : null;
  }

  private scheduleAI(pause: number) {
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer);
    this.aiTimer = null;
    const s = this.state;
    if (this.screen !== 'game' || !s || isGameOver(s) || !activePlayer(s).isAI) return;
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
    const orb = (id: string) => root.querySelector(`[data-anchor="player:${id}"]`);
    const orbRect = (id: string) => before.anchors.get(`player:${id}`) ?? anchorRect(root, `player:${id}`);

    // --- Card movement -----------------------------------------------------
    const inHand = new Set(vNext.hand.map((c) => c.uid));
    const endingTurn = action.type === 'endTurn';
    let drawIndex = 0;

    root.querySelectorAll<HTMLElement>('[data-uid]').forEach((el) => {
      const uid = el.dataset.uid!;
      const old = before.cards.get(uid);
      if (old && el.parentElement?.classList.contains('hand')) {
        // A card already in hand that the fan moved: slide it along the fan, in the hand's own space.
        this.refan(el, old.html);
        return;
      }
      if (old) {
        const r = pageRect(el);
        if (Math.abs(r.left - old.rect.left) > 2 || Math.abs(r.top - old.rect.top) > 2) flyFrom(el, old.rect);
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

    before.cards.forEach((old, uid) => {
      if (root.querySelector(`[data-uid="${uid}"]`)) return;
      let to: DOMRect | null = null;
      if (vNext.discard.some((c) => c.uid === uid)) to = anchorRect(root, 'discard');
      else if (vNext.commands.some((c) => c.uid === uid)) to = anchorRect(root, 'upgrades');
      else {
        const owner = next.players.find((p) => [...p.deck, ...p.hand, ...p.discard, ...p.commands].some((c) => c.uid === uid));
        if (owner) to = orbRect(owner.id);
      }
      ghost(old.html, old.rect, to);
    });

    // --- Hits: projectiles, glows and sounds -------------------------------
    const handled = new Set<string>();
    // Until a projectile lands, the target's sun and numbers keep showing their old values.
    const holdUntil = (p: PlayerState, was: PlayerState, at: number) => {
      if (reducedMotion() || at < 150 || (p.heat === was.heat && p.shields === was.shields && p.eliminated === was.eliminated)) return;
      const restore: (() => void)[] = [];
      const swap = (el: Element, old: string) => {
        const now = el.innerHTML;
        el.innerHTML = old;
        restore.push(() => (el.innerHTML = now));
      };
      root.querySelectorAll(`[data-anchor="player:${p.id}"]`).forEach((el) =>
        swap(el, sunOrb({ heat: was.heat, threshold: supernovaThreshold(was), size: Number(el.querySelector<HTMLElement>('.orb')?.style.getPropertyValue('--size').replace('px', '')) || 40 })),
      );
      root.querySelectorAll(`[data-heat-of="${p.id}"]`).forEach((el) => swap(el, String(was.heat)));
      root.querySelectorAll(`[data-shields-of="${p.id}"]`).forEach((el) => swap(el, String(was.shields)));
      window.setTimeout(() => restore.forEach((f) => f()), at);
    };
    const hit = (id: string, at: number) => {
      const p = next.players.find((pl) => pl.id === id)!;
      const was = prev.players.find((pl) => pl.id === id)!;
      if (!handled.has(id)) holdUntil(p, was, at);
      window.setTimeout(() => {
        if (p.heat !== was.heat) sound.impact(p.heat > was.heat);
        else if (p.shields < was.shields) sound.shield();
      }, at);
      pulse(orb(id), p.heat > was.heat ? 'fx-hot' : p.heat < was.heat ? 'fx-cold' : 'fx-shield', at);
      handled.add(id);
    };

    // Who caused this round of changes: the player who acted, or (at a turn's
    // start) the player whose tableau just triggered.
    const source = endingTurn ? activePlayer(next) : actor;
    const delay = endingTurn ? 750 : actor.isAI ? 520 : 160;
    let volley = 0;
    for (const p of next.players) {
      const was = prev.players.find((pl) => pl.id === p.id)!;
      if (p.id === source.id) continue;
      const struck = p.heat > was.heat || (p.shields < was.shields && !(endingTurn && p.id === actor.id)) || (p.eliminated && !was.eliminated);
      if (!struck) continue;
      const a = orbRect(source.id);
      const b = orbRect(p.id);
      const at = a && b ? projectile(a, b, HOT, { delay: delay + 110 * volley++ }) : delay;
      hit(p.id, at);
    }
    if (volley) window.setTimeout(() => sound.flare(), delay);
    const me = next.players.find((p) => p.id === source.id)!;
    const meWas = prev.players.find((p) => p.id === source.id)!;
    if (me.heat !== meWas.heat || me.shields > meWas.shields) {
      hit(source.id, delay);
      if (me.heat < meWas.heat) window.setTimeout(() => sound.thermo(), delay);
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
    return !me.isAI && me.id === this.viewer().id && !isGameOver(s) && !this.needsHandoff();
  }

  /** Hot-seat: hide the hand until the next human confirms they have the device. */
  private needsHandoff(): boolean {
    const s = this.state!;
    const p = activePlayer(s);
    const humans = s.players.filter((pl) => !pl.isAI).length;
    return !p.isAI && humans > 1 && this.revealedFor !== p.id && !isGameOver(s);
  }

  // -------------------------------------------------------------------------
  // Playing a card: collect any choices it needs, then play it
  // -------------------------------------------------------------------------

  private startPlay(uid: string) {
    const s = this.state!;
    const me = activePlayer(s);
    const card = me.hand.find((c) => c.uid === uid);
    if (!card) return;
    if (me.playsLeft <= 0) {
      this.showToast('No plays left this turn: end your turn.', 'info');
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
    if (cardNeedsUpgradeChoice(card.defId) && upgradeOptions(me).length > 0 && !p.upgrade) {
      p.step = 'upgrade';
      return this.render();
    }
    if (cardNeedsDestroyTarget(card.defId) && target && target.tableau.length > 0 && !p.destroyUid) {
      p.step = 'destroy';
      this.viewRivalId = target.id;
      return this.render();
    }
    if (persists(card.defId) && tableauFull(me) && !p.replaceUid) {
      p.step = 'replace';
      return this.render();
    }
    this.dispatch({ type: 'playCard', cardUid: p.uid, upgrade: p.upgrade, destroyUid: p.destroyUid, replaceUid: p.replaceUid });
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const seat = el.dataset.seatName;
    if (seat !== undefined) this.seats[Number(seat)].name = el.value;
    if (el.dataset.dbName !== undefined) this.builder.onInput(el.value);
  }

  private peekHeld = false;

  private setPeek(on: boolean) {
    this.peeking = on && !!this.root.querySelector('.overlay');
    document.body.classList.toggle('peeking', this.peeking);
    this.syncPeek();
  }

  /** Show the view-board toggle whenever an overlay is up; drop peeking once none is. */
  private syncPeek() {
    const open = !!this.root.querySelector('.overlay');
    if (!open && this.peeking) {
      this.peeking = false;
      document.body.classList.remove('peeking');
    }
    this.peekBtn.classList.toggle('show', open && this.screen === 'game');
    this.peekBtn.innerHTML = this.peeking ? '<span>◉</span> back' : '<span>◎</span> view board';
    this.peekBtn.title = this.peeking ? 'Bring the overlay back' : 'Hide this overlay to look at the board (or hold Space)';
  }

  private onKey(e: KeyboardEvent) {
    // Hold Space to look at the board behind an overlay.
    if (e.code === 'Space' && !e.repeat && this.root.querySelector('.overlay') && !(e.target as HTMLElement).closest?.('input, textarea')) {
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
    this.preview.innerHTML = this.bigCard(el.dataset.card!, el.dataset.growth ? Number(el.dataset.growth) : undefined);
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
    if (act.startsWith('cmp-') && this.campaign.onClick(act, arg, el)) return;
    if (act.startsWith('db-') && this.builder.onClick(act, arg)) return;

    switch (act) {
      case 'seat-toggle': {
        const i = Number(arg);
        if (i >= BALANCE.minPlayers) this.seats[i].enabled = !this.seats[i].enabled;
        return this.render();
      }
      case 'seat-ai':
        this.seats[Number(arg)].isAI = !this.seats[Number(arg)].isAI;
        return this.render();
      case 'seat-deck': {
        // Cycle through every deck on offer.
        const seat = this.seats[Number(arg)];
        const decks = allDecks();
        const i = decks.findIndex((d) => d.id === seat.deckId);
        seat.deckId = decks[(i + 1) % decks.length].id;
        return this.render();
      }
      case 'new-game':
        return this.newGame();
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
        if (this.campaign.resume()) this.screen = 'campaign';
        return this.render();
      case 'campaign-return':
        return this.returnToCampaign(false);
      case 'campaign-auto':
        return this.returnToCampaign(true);
      case 'menu-page':
        this.menuPage = arg as MenuPage;
        this.sheet = null;
        return this.render();
      case 'to-menu':
        this.campaignBattle = false;
        this.screen = 'menu';
        this.menuPage = 'hub';
        this.pending = null;
        this.sheet = null;
        if (this.aiTimer !== null) window.clearTimeout(this.aiTimer);
        return this.render();
      case 'reveal':
        this.revealedFor = s ? activePlayer(s).id : null;
        this.render();
        this.announceTurn();
        return this.dealOpening();
      case 'open-menu':
        this.sheet = { kind: 'menu' };
        return this.render();
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
    if (act === 'focus') {
      // A rival's pill: make them your target (on your turn) and bring their tableau across the table.
      this.viewRivalId = arg;
      const me = activePlayer(s);
      if (this.canAct() && !this.pending && targetOf(s, me)?.id !== arg) return this.dispatch({ type: 'setTarget', targetId: arg });
      sound.hover();
      return this.render();
    }
    if (act === 'inspect' && !el.closest('.sheet') && el.dataset.card) {
      this.sheet = { kind: 'card', defId: el.dataset.card, uid: el.dataset.hand };
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
      case 'choose-destroy':
        if (this.pending) this.pending.destroyUid = arg;
        return this.advancePlay();
      case 'choose-replace':
        if (this.pending) this.pending.replaceUid = arg;
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
    const setup = page === 'quickplay' || page === 'options' || page === 'decks';
    const body =
      page === 'title' ? this.renderTitlePage() : page === 'hub' ? this.renderHub() : page === 'quickplay' ? this.renderQuickplay() : page === 'decks' ? this.builder.render() : this.renderOptions();
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
        ${small ? '' : '<p class="tagline">cool your star · ignite theirs</p>'}
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
      ${this.titleBlock(true)}
      <div class="hub">
        ${column('campaign-new', '', HUB_ICONS.campaign, 'campaign', 'Conquer a galaxy of forty-eight systems, one battle at a time.',
          hasCampaign ? '<button class="btn btn-small hub-continue" data-act="campaign-continue">continue campaign</button>' : '')}
        ${column('menu-page', 'quickplay', HUB_ICONS.quickplay, 'quickplay', 'A single battle for two to four suns, against AI or friends.',
          hasGame ? '<button class="btn btn-small hub-continue" data-act="continue">continue game</button>' : '')}
        ${column('menu-page', 'options', HUB_ICONS.options, 'options', 'Sound, music, AI speed and how to play.')}
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
        const locked = i < BALANCE.minPlayers;
        const deck = deckById(seat.deckId) ?? PRESETS[i];
        return `
        <div class="seat-tile ${seat.enabled ? '' : 'seat-off'}">
          <button class="pill-btn seat-in" data-act="seat-toggle" data-arg="${i}" ${locked ? 'disabled' : ''}>${seat.enabled ? '● playing' : '○ empty'}</button>
          ${factionAvatar(`f${deck.race + 1}`, 'seat-emblem')}
          <input data-seat-name="${i}" value="${esc(seat.name)}" maxlength="18" ${seat.enabled ? '' : 'disabled'} aria-label="Seat ${i + 1} name" />
          <button class="seat-deck" data-act="seat-deck" data-arg="${i}" ${seat.enabled ? '' : 'disabled'} title="Tap to change deck">
            <small>deck</small><span>${esc(deck.name.toLowerCase())}</span>
          </button>
          <button class="pill-btn" data-act="seat-ai" data-arg="${i}" ${seat.enabled ? '' : 'disabled'}>${seat.isAI ? 'ai' : 'human'}</button>
        </div>`;
      })
      .join('');
    return this.setupPage(
      'quickplay',
      `<div class="seat-row">${seats}</div>`,
      `<button class="btn" data-act="open-decks">deck builder</button>
       <span class="setup-spacer"></span>
       ${hasSave ? '<button class="btn" data-act="continue">continue game</button>' : ''}
       <button class="btn-primary" data-act="new-game">launch</button>`,
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
        <li>Every sun starts at <b>${BALANCE.startingHeat}</b> heat with <b>${BALANCE.supernovaAt}</b> max health. Reach it and your sun goes supernova. The last sun standing wins.</li>
        <li>Bring a <b>${BALANCE.deckSize}-card deck</b>: up to ${BALANCE.maxCopies} copies of a card, and exactly ${BALANCE.commandCards} Command cards. You start with ${BALANCE.openingHand} cards and draw ${BALANCE.drawPerTurn} each turn after that.</li>
        <li>Play <b>1 card</b> on your first turn, <b>2</b> on your second, and so on up to ${BALANCE.maxPlays}. Cards <b>stay in play</b> in your tableau (${BALANCE.tableauSlots} slots): their start-of-turn effects trigger every turn, and they power each other up. With every slot full, a new card replaces one of yours.</li>
        <li><b>Your target</b> is the rival your attacks hit: tap a rival to choose. Shields absorb enemy heat and fade at the start of your turn.</li>
        <li><b>Command</b> cards upgrade your whole deck: Solar Flare (your attack cards deal +1 heat), Thermosiphon (your cooling cools +1) or Cooling Chamber (+${BALANCE.coolingChamberHealthPerUpgrade} max health).</li>
        <li>Only one <b>global</b> card can be in play at a time, and it affects everyone. From round ${BALANCE.instabilityStartsRound}, <b>Stellar Instability</b> heats every sun each turn, and drawing from an empty deck heats yours by ${BALANCE.fatigueHeat}.</li>
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
          ${this.renderLogPanel()}
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
    const total = BALANCE.instabilityStartsRound - 1;
    const remaining = Math.max(0, total - (s.round - 1));
    const instab = instabilityHeat(s);
    const segments = Array.from({ length: total }, (_, i) => `<i class="${i < remaining ? 'on' : ''}"></i>`).join('');
    return `
      <div class="round-box ${instab ? 'unstable' : ''}" title="${instab
        ? `Round ${s.round}. Stellar Instability: every sun heats by ${instab} at the start of its turn.`
        : `Round ${s.round}. Stability drains by one each round; when it runs out, every sun heats at the start of its turn.`}">
        <div class="round-num"><small>round</small><b>${roman(s.round)}</b></div>
        <div class="stability">
          <span class="stability-label">${instab ? `instability +${instab}` : `stability ${remaining}`}</span>
          <div class="stability-bar">${segments}</div>
        </div>
      </div>`;
  }

  /**
   * Every player's card, stacked down the left: yours first, then your rivals.
   * Whoever's turn it is glows green; your target wears a crosshair. Tap a
   * rival to target them (on your turn) and see their tableau.
   */
  private renderPlayers(): string {
    const s = this.state!;
    const active = activePlayer(s);
    const me = this.viewer();
    const target = targetOf(s, me);
    const shown = this.shownRival();
    const playing = !isGameOver(s);
    const cards = [me, ...s.players.filter((p) => p.id !== me.id)]
      .map((p) => {
        const mine = p.id === me.id;
        const targeted = !mine && target?.id === p.id && !p.eliminated;
        const title = mine ? `${p.name} (you)` : `${p.name}${targeted ? ' · your target' : ' · tap to target'}`;
        return `
        <button class="rival ${mine ? 'rival-me' : ''} ${playing && p.id === active.id ? 'rival-active' : ''} ${p.eliminated ? 'rival-dead' : ''} ${targeted ? 'rival-target' : ''} ${!mine && shown?.id === p.id ? 'rival-shown' : ''}"
          data-act="${mine ? 'view-player' : 'focus'}" data-arg="${p.id}" title="${esc(title)}">
          <div class="orb-anchor" data-anchor="player:${p.id}">${sunOrb({ heat: p.heat, threshold: supernovaThreshold(p), size: 40, dead: p.eliminated })}</div>
          <div class="rival-info">
            <span class="rival-name">${esc(p.name.toLowerCase())}${mine ? '<i class="rival-you">you</i>' : ''}${targeted ? '<i class="rival-crosshair" aria-label="your target">◎</i>' : ''}</span>
            <span class="rival-stats"><b><span data-heat-of="${p.id}">${p.heat}</span>/${supernovaThreshold(p)}</b><em>⛨<span data-shields-of="${p.id}">${p.shields}</span> · ✋${p.hand.length} · ▤${p.deck.length}</em></span>
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
          ${this.campaignBattle && !isGameOver(s) ? '<button class="pill-btn" data-act="campaign-auto" title="Let your commanders finish this battle">auto-resolve</button>' : ''}
          <button class="icon-btn" data-act="open-menu" aria-label="Menu">${MENU_ICON}</button>
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
    const text =
      p.step === 'destroy'
        ? `${name}: choose a card in ${esc(targetOf(s, activePlayer(s))!.name.toLowerCase())}'s tableau to destroy`
        : `${name}: your tableau is full · choose a card of yours to replace`;
    return `<div class="pick-hint"><span>${text}</span><button class="pill-btn" data-act="cancel">cancel</button></div>`;
  }

  /** The game log, always visible down the right-hand side. Tap it for the full history. */
  private renderLogPanel(): string {
    const s = this.state!;
    const lastTurn = s.log[s.log.length - 1]?.turn;
    const lines = s.log
      .slice(-60)
      .map((l) => `<div data-seq="${l.seq}" class="${l.turn === lastTurn ? 'log-now' : ''} ${KEY_LOG.test(l.text) ? 'log-key' : ''}">${esc(l.text)}</div>`)
      .join('');
    return `
      <aside class="log-panel" data-act="open-log" title="Game log (tap for the full history)">
        <div class="section-label">log</div>
        <div class="log-feed">${lines}</div>
      </aside>`;
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
            ${this.renderTableau(me, 'mine')}
          </div>
        </div>
      </section>`;
  }

  private renderTableau(p: PlayerState, side: 'mine' | 'rival'): string {
    const s = this.state!;
    const slots = Array.from({ length: BALANCE.tableauSlots }, (_, i) => {
      const c = p.tableau[i];
      return c ? this.renderCard(c, { tableau: side }) : '<div class="slot-empty"></div>';
    }).join('');
    const targeted = side === 'rival' && targetOf(s, this.viewer())?.id === p.id;
    const label = side === 'mine' ? 'your tableau' : `${esc(p.name.toLowerCase())}'s tableau`;
    const deck = p.deckName ? `<em>${esc(p.deckName.toLowerCase())}</em>` : '';
    return `
      <div class="tableau tableau-${side} ${p.eliminated ? 'tableau-dead' : ''}" data-owner="${p.id}">
        <div class="tableau-label">${factionAvatar(`f${p.species + 1}`, 'tableau-emblem')}<span>${label}</span>${deck}<b>${p.tableau.length}/${BALANCE.tableauSlots}</b>${targeted ? '<i class="target-tag">◎ your target</i>' : ''}</div>
        <div class="tableau-row">${slots}</div>
      </div>`;
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

  private renderCard(c: CardInstance, opts: { hand?: boolean; tableau?: 'mine' | 'rival'; static?: boolean }): string {
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
    if (p && opts.tableau === 'rival' && p.step === 'destroy') {
      attrs = `data-act="choose-destroy" data-arg="${c.uid}"`;
      state = 'card-choosable';
    }
    if (p && opts.tableau === 'mine' && p.step === 'replace') {
      attrs = `data-act="choose-replace" data-arg="${c.uid}"`;
      state = 'card-choosable';
    }
    if (p && opts.hand && c.uid === p.uid) state = 'card-picked';
    const growth = c.growth ? `<span class="growth" title="Growth">${c.growth}</span>` : '';
    const race = def.race !== undefined ? ` race-${def.race}` : '';
    return `
      <button class="card kind-${def.kind}${race} ${opts.tableau ? 'card-table' : ''} ${state}" ${opts.static ? '' : `data-uid="${c.uid}"`} data-card="${def.id}" ${c.growth ? `data-growth="${c.growth}"` : ''} ${extra} ${attrs} style="--kc:${KIND_COLOUR[def.kind]}">
        <div class="card-glyph">${cardGlyph(def.id, def.kind)}</div>
        ${growth}
        <div class="card-name">${esc(def.name.toLowerCase())}</div>
        <div class="card-text">${esc(def.text)}</div>
        <div class="card-kind">${def.kind}${def.race !== undefined ? ` · ${esc(RACE_NAMES[def.race].toLowerCase())}` : ''}</div>
      </button>`;
  }

  /** The magnified card, used by the hover preview and the inspector. */
  private bigCard(defId: string, growth?: number): string {
    const def = cardDef(defId);
    return `
      <div class="card card-big kind-${def.kind}" style="--kc:${KIND_COLOUR[def.kind]}">
        <div class="card-glyph">${cardGlyph(def.id, def.kind)}</div>
        ${growth ? `<span class="growth">${growth}</span>` : ''}
        <div class="card-name">${esc(def.name.toLowerCase())}</div>
        <div class="card-text">${esc(def.text)}</div>
        <div class="card-kind">${def.kind}${def.race !== undefined ? ` · ${esc(RACE_NAMES[def.race].toLowerCase())}` : ''}</div>
      </div>`;
  }

  private renderStage(): string {
    const st = this.stage;
    const s = this.state!;
    if (!st || isGameOver(s)) return '';
    const actor = s.players.find((p) => p.id === st.actorId)!;
    return `
      <div class="stage">
        ${this.renderCard({ uid: 'stage', defId: st.defId }, { static: true })}
        <div class="stage-caption">${esc(actor.name.toLowerCase())} plays</div>
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

  private renderSheet(): string {
    const sh = this.sheet!;
    const s = this.state;
    switch (sh.kind) {
      case 'rules':
        return this.sheetFrame('how to play', this.rulesHtml());
      case 'menu':
        return this.sheetFrame(
          `round ${s?.round ?? ''}`,
          `<div class="menu-list">
            <button class="btn" data-act="toggle-sound">${sound.muted ? 'sound: off' : 'sound: on'}</button>
            <button class="btn" data-act="toggle-music" ${sound.muted ? 'disabled' : ''}>${sound.musicOn ? 'music: on' : 'music: off'}</button>
            <button class="btn" data-act="speed">ai speed: ${this.speed}</button>
            <button class="btn" data-act="view-player" data-arg="">players</button>
            <button class="btn" data-act="open-log">game log</button>
            <button class="btn" data-act="rules">how to play</button>
            <button class="btn" data-act="to-menu">main menu</button>
          </div>`,
        );
      case 'log':
        return this.sheetFrame('game log', `<div class="log-list">${s!.log.slice(-120).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`);
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
              ${this.bigCard(sh.defId)}
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
    const commands = p.commands.map((c) => esc(cardDef(c.defId).name.toLowerCase())).join(' · ');
    return `
      <div class="overlay overlay-inspect" data-act="cancel">
        <div class="sys-wrap sheet">
          <div class="sys-tabs">${tabs}</div>
          <div class="sys-card player-card">
            <div class="sys-kicker">${p.id === me.id ? 'you' : esc(p.name.toLowerCase())} · ${esc(RACE_NAMES[p.species].toLowerCase())}</div>
            ${factionAvatar(`f${p.species + 1}`, 'player-emblem')}
            <h2 class="sys-name">${esc((p.deckName ?? 'custom deck').toLowerCase())}</h2>
            <div class="upgrade-actions">${ups}</div>
            ${commands ? `<p class="muted center-text">Command cards played: ${commands}</p>` : ''}
            ${p.conditions?.length ? `<div class="sys-conditions">${p.conditions.map((c) => `<div><b>${esc(c.name.toLowerCase())}</b>${esc(c.text)}</div>`).join('')}</div>` : ''}
            <div class="sys-stats">
              <span>heat ${p.heat}/${supernovaThreshold(p)}</span><span>⛨ ${p.shields}</span><span>✋ ${p.hand.length} in hand</span><span>▤ ${p.deck.length} in deck</span><span>${p.discard.length} discarded</span><span>${p.tableau.length}/${BALANCE.tableauSlots} in play</span>
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
        `<p class="muted center-text">Draw order is hidden. When your deck runs out, each card you should draw heats your sun by ${BALANCE.fatigueHeat} instead.</p>
         <div class="pile-grid">${rows || '<p class="muted">Your deck is empty.</p>'}</div>`,
      );
    }
    const rows = [...me.discard].reverse().map((c) => `<div class="pile-card">${this.renderCard(c, { static: true })}</div>`).join('');
    return this.sheetFrame(
      `your discard · ${me.discard.length}`,
      `<p class="muted center-text">Cards replaced or destroyed, most recent first.</p><div class="pile-grid">${rows || '<p class="muted">Your discard pile is empty.</p>'}</div>`,
    );
  }

  private renderOverlay(s: GameState): string {
    const winner = s.players.find((p) => p.id === s.winnerId);
    if (winner) {
      return `
        <div class="overlay"><div class="modal">
          <div class="bar-title">supernova cascade complete</div>
          <div class="modal-body center">
            ${sunOrb({ heat: winner.heat, threshold: supernovaThreshold(winner), size: 96 })}
            <h2>${esc(winner.name.toLowerCase())} wins</h2>
            <p>The last sun standing after ${s.round} rounds.</p>
            ${this.campaignBattle ? '<button class="btn-primary" data-act="campaign-return">return to the campaign</button>' : '<button class="btn-primary" data-act="to-menu">back to menu</button>'}
          </div>
        </div></div>`;
    }
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
}
