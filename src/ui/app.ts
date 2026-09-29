import {
  ACTION_NAME,
  activePlayer,
  applyAction,
  BALANCE,
  cardDef,
  cardNeedsTarget,
  cardNeedsUpgrade,
  chooseAIAction,
  createGame,
  flareCost,
  flareHeat,
  GameError,
  GLOBALS,
  handSizeFor,
  incomeFor,
  instabilityHeat,
  isGameOver,
  livingOpponents,
  marketCost,
  MAX_UPGRADES,
  missionOf,
  objectiveDef,
  rewardDef,
  shieldPierce,
  supernovaThreshold,
  systemDef,
  thermoCool,
  thermoCost,
  trackLevel,
  upgradeOptions,
  type Action,
  type CardInstance,
  type CoreAction,
  type GameState,
  type Planet,
  type PlayerSetup,
  type PlayerState,
  type RewardId,
} from '../engine';
import { actionChip, actionTile, roman, sunOrb } from './art';
import { backdrop } from './backdrop';
import { anchorRect, flyFrom, ghost, projectile, pulse, snapshot, type Snapshot } from './fx';
import { cardGlyph, KIND_COLOUR, objectiveGlyph, rewardGlyph } from './glyphs';
import { sound } from './sound';
import { clearSave, loadSave, save } from './storage';

type Screen = 'menu' | 'game';
type Speed = 'slow' | 'normal' | 'fast';

/** A flare or card waiting for the player to pick a target or an upgrade. */
type Pending =
  | { kind: 'flare' }
  | { kind: 'card'; uid: string; need: 'target' | 'upgrade' };

/** What an AI player is doing right now, shown large in the centre. */
interface Stage {
  uid: string;
  defId: string;
  actorId: string;
  verb: 'plays' | 'buys';
  targetId?: string;
}

/** Bottom sheets / dialogs that are not part of a pending move. */
type Sheet =
  | { kind: 'menu' }
  | { kind: 'log' }
  | { kind: 'rules' }
  | { kind: 'pile'; pile: 'deck' | 'discard' }
  | { kind: 'system'; playerId: string }
  | { kind: 'objective'; id: string }
  | { kind: 'mission'; uid: string; playerId: string }
  | { kind: 'action'; action: CoreAction }
  /** Tap-to-inspect on touch screens: a readable card with its action. */
  | { kind: 'card'; defId: string; uid?: string; slot?: number };

const SPEED_KEY = 'blue-loop:ai-speed';
const SPEED_FACTOR: Record<Speed, number> = { slow: 1.7, normal: 1, fast: 0.4 };
/** Pause after each kind of AI action, before the next one (ms at normal speed). */
const AI_PAUSE: Record<Action['type'], number> = {
  playAllMoney: 1000,
  playCard: 1700,
  buyCard: 1500,
  solarFlare: 1300,
  thermosiphon: 1100,
  endTurn: 1000,
  chooseReward: 1500,
};
const TOAST_MS = 2600;
const LONG_PRESS_MS = 450;
const TRACK_ICON: Record<string, string> = { weapons: '⚔', defences: '⛨', economy: '◈', resources: '⬢' };
const TOAST_PATTERN = /heats to|SUPERNOVA|completes|claims|takes the reward|upgrades|wins|shields absorb|Instability/;
const HOT = '#f0a07a';

const ACTION_TEXT: Record<CoreAction, string> = {
  solarFlare: `Spend money to heat an enemy sun. Deals 1 heat, +1 per upgrade (max ${1 + BALANCE.solarFlareMaxUpgrades}). Use as often as you can afford.`,
  thermosiphon: `Spend money to cool your own sun. Cools 1, +1 per upgrade (max ${1 + BALANCE.thermosiphonMaxUpgrades}). Use as often as you can afford.`,
  coolingChamber: `Passive. Each upgrade raises your max health (the heat at which your sun goes supernova) by ${BALANCE.coolingChamberHealthPerUpgrade}, from ${BALANCE.supernovaAt} up to ${BALANCE.supernovaAt + BALANCE.coolingChamberMaxUpgrades * BALANCE.coolingChamberHealthPerUpgrade}.`,
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** What a planet's track does at a given level, in plain words. */
function planetEffect(track: Planet['track'], level: number): string {
  switch (track) {
    case 'economy':
      return `+${level * BALANCE.economyIncomePerLevel} money at the start of each turn`;
    case 'defences':
      return `+${level * BALANCE.shieldsPerDefenceLevel} shields each turn`;
    case 'weapons':
      return `your heat ignores ${level * BALANCE.piercePerWeaponLevel} enemy shields`;
    case 'resources':
      return `+${level * BALANCE.resourceCardsPerLevel} cards in hand`;
  }
}

interface MenuSeat {
  name: string;
  isAI: boolean;
  enabled: boolean;
}

export class App {
  private screen: Screen = 'menu';
  private state: GameState | null = null;
  private pending: Pending | null = null;
  private stage: Stage | null = null;
  /** Second step of a reward that needs a choice (what to upgrade, which card). */
  private rewardStep: 'command' | 'requisition' | null = null;
  private sheet: Sheet | null = null;
  private aiTimer: number | null = null;
  private speed: Speed = 'normal';
  /** Touch screens have no hover: cards open an inspector instead. */
  private touch = window.matchMedia('(pointer: coarse)').matches;
  /** Human player whose hand was last revealed (for hot-seat handoff). */
  private revealedFor: string | null = null;
  /** Whose home system sits in the dock: the current or most recent human. */
  private viewerId: string | null = null;
  private preview: HTMLElement;
  private press: { x: number; y: number; timer: number; shown: boolean } | null = null;
  private suppressClick = false;
  private seats: MenuSeat[] = [
    { name: 'Commander', isAI: false, enabled: true },
    { name: "Xel'Naru", isAI: true, enabled: true },
    { name: 'Vorthane', isAI: true, enabled: false },
    { name: 'Ixquor', isAI: true, enabled: false },
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
    window.addEventListener('pointerdown', (e) => {
      sound.unlock();
      this.touch = e.pointerType === 'touch';
    }, { capture: true });
    window.addEventListener('touchstart', () => (this.touch = true), { capture: true, passive: true });
    window.addEventListener('resize', () => this.fitHand());
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
      .map((s) => ({ name: s.name.trim() || 'Unnamed', isAI: s.isAI }));
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
    this.pending = null;
    this.stage = null;
    this.sheet = null;
    this.screen = 'game';
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
    window.setTimeout(() => {
      document.querySelectorAll('.turn-banner').forEach((b) => b.remove());
      const el = document.createElement('div');
      el.className = 'turn-banner';
      el.innerHTML = `<div class="turn-banner-glow"></div><div class="turn-banner-text">your turn</div>${
        humans > 1 ? `<div class="turn-banner-sub">${esc(p.name.toLowerCase())}</div>` : `<div class="turn-banner-sub">round ${roman(s.round)}</div>`
      }`;
      document.body.appendChild(el);
      sound.turn();
      window.setTimeout(() => el.remove(), 2000);
    }, delay);
  }

  /** Opening hand: shuffle, then deal the viewer's cards in one by one. */
  private dealOpening() {
    sound.shuffle();
    const deck = anchorRect(this.root, 'deck');
    if (!deck) return;
    this.root.querySelectorAll<HTMLElement>('.hand [data-uid]').forEach((el, i) => {
      flyFrom(el, deck, { delay: 350 + i * 110, fade: true, rotate: -8 });
      sound.draw(0.35 + i * 0.11);
    });
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
    if (animate) backdrop.spin();
    const turnPassed = activePlayer(prev).id !== activePlayer(next).id;
    this.state = next;
    this.pending = null;
    if (this.sheet?.kind === 'card') this.sheet = null;
    this.stage = actor.isAI ? this.stageFor(prev, actor, action) : null;
    if (isGameOver(next)) clearSave();
    else save(next);
    this.syncViewer();
    this.render();
    if (before) {
      this.surfaceLog(prev, next);
      this.animate(prev, next, action, actor, before);
    }
    if (turnPassed) this.announceTurn(450);
    this.scheduleAI(AI_PAUSE[action.type]);
  }

  private stageFor(prev: GameState, actor: PlayerState, action: Action): Stage | null {
    if (action.type === 'playCard') {
      const card = actor.hand.find((c) => c.uid === action.cardUid);
      return card ? { uid: card.uid, defId: card.defId, actorId: actor.id, verb: 'plays', targetId: action.targetId } : null;
    }
    if (action.type === 'buyCard') {
      const card = prev.display[action.slot];
      return card ? { uid: card.uid, defId: card.defId, actorId: actor.id, verb: 'buys' } : null;
    }
    return null;
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
    if (isGameOver(s)) clearSave();
    else save(s);
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
    const orbRect = (id: string) => anchorRect(root, `player:${id}`);

    // --- Card movement -----------------------------------------------------
    const inHand = new Set(vNext.hand.map((c) => c.uid));
    const inDeck = new Set(vNext.deck.map((c) => c.uid));
    const inDiscard = new Set(vNext.discard.map((c) => c.uid));
    const endingTurn = action.type === 'endTurn';
    let drawIndex = 0;

    root.querySelectorAll<HTMLElement>('[data-uid]').forEach((el) => {
      const uid = el.dataset.uid!;
      const old = before.cards.get(uid);
      if (old) {
        const r = el.getBoundingClientRect();
        if (Math.abs(r.left - old.rect.left) > 2 || Math.abs(r.top - old.rect.top) > 2) flyFrom(el, old.rect);
        return;
      }
      if (inHand.has(uid)) {
        const from = before.anchors.get('deck') ?? anchorRect(root, 'deck');
        const delay = (endingTurn ? 420 : 60) + drawIndex * 110;
        if (from) flyFrom(el, from, { delay, fade: true, rotate: -8 });
        sound.draw(delay / 1000);
        drawIndex++;
      } else if (el.closest('.stage')) {
        const from = orbRect(this.stage?.actorId ?? actor.id);
        if (from) flyFrom(el, from, { fade: true, duration: 520 });
      } else if (el.closest('.display')) {
        const from = before.anchors.get('market') ?? anchorRect(root, 'market');
        if (from) flyFrom(el, from, { fade: true, delay: 250 });
      }
    });

    before.cards.forEach((old, uid) => {
      if (root.querySelector(`[data-uid="${uid}"]`)) return;
      let to: DOMRect | null = null;
      if (inDiscard.has(uid)) to = anchorRect(root, 'discard');
      else if (inDeck.has(uid)) to = anchorRect(root, 'deck');
      else {
        const owner = next.players.find((p) => p.id !== viewer.id && [...p.deck, ...p.hand, ...p.inPlay, ...p.discard].some((c) => c.uid === uid));
        if (owner) to = orbRect(owner.id);
      }
      ghost(old.html, old.rect, to);
    });

    if (vNext.deck.length > vPrev.deck.length && vPrev.discard.length > vNext.discard.length) {
      sound.shuffle();
      pulse(root.querySelector('[data-anchor="deck"]'), 'fx-shuffle');
    }

    // --- Action sounds and projectiles --------------------------------------
    const handled = new Set<string>();
    const hit = (id: string, at: number) => {
      const p = next.players.find((pl) => pl.id === id)!;
      const was = prev.players.find((pl) => pl.id === id)!;
      window.setTimeout(() => {
        if (p.heat !== was.heat) sound.impact(p.heat > was.heat);
        if (p.blockedSinceTurnStart > was.blockedSinceTurnStart) sound.shield();
      }, at);
      pulse(orb(id), p.heat > was.heat ? 'fx-hot' : p.heat < was.heat ? 'fx-cold' : 'fx-shield', at);
      handled.add(id);
    };
    const fire = (fromId: string, toId: string, delay = 0) => {
      const a = orbRect(fromId), b = orbRect(toId);
      const at = a && b ? projectile(a, b, HOT, { delay }) : delay;
      hit(toId, at);
    };

    switch (action.type) {
      case 'solarFlare':
        sound.flare();
        fire(actor.id, action.targetId);
        break;
      case 'thermosiphon':
        sound.thermo();
        hit(actor.id, 80);
        break;
      case 'buyCard':
        sound.buy();
        break;
      case 'playAllMoney':
        sound.play();
        break;
      case 'playCard': {
        sound.play();
        const def = cardDef(prev.players.find((p) => p.id === actor.id)!.hand.find((c) => c.uid === action.cardUid)!.defId);
        const delay = actor.isAI ? 500 : 150;
        let i = 0;
        for (const e of def.effects) {
          if (e.type === 'heatTarget' && action.targetId) fire(actor.id, action.targetId, delay);
          if (e.type === 'heatAllOpponents') for (const o of livingOpponents(prev, actor)) fire(actor.id, o.id, delay + 120 * i++);
          if (e.type === 'cool' || e.type === 'heatSelf' || e.type === 'shield') hit(actor.id, delay);
          if (e.type === 'command' && action.upgradeId) {
            window.setTimeout(() => sound.upgrade(), delay);
            pulse(root.querySelector(`[data-anchor="upgrade:${action.upgradeId}"]`), 'fx-upgrade', delay);
          }
        }
        break;
      }
      case 'endTurn': {
        sound.endTurn();
        break;
      }
    }

    for (const p of next.players) {
      const was = prev.players.find((pl) => pl.id === p.id)!;
      if (!handled.has(p.id) && p.heat !== was.heat) hit(p.id, endingTurn ? 700 : 200);
      if (p.eliminated && !was.eliminated) {
        window.setTimeout(() => sound.supernova(), 650);
        pulse(orb(p.id), 'fx-nova', 600);
        pulse(root.querySelector('.game'), 'fx-flash', 650);
      }
    }
    if (next.pendingRewards.length > prev.pendingRewards.length) {
      sound.objective();
      pulse(root.querySelector('.objectives-row'), 'fx-upgrade', 150);
    }
    if (action.type === 'chooseReward') window.setTimeout(() => sound.upgrade(), 100);
  }

  /** Show the most important new log line as a toast. */
  private surfaceLog(prev: GameState, next: GameState) {
    // Only entries added by this action (state is cloned per action, so compare ids, not objects).
    const lastSeq = prev.log[prev.log.length - 1]?.seq ?? 0;
    const fresh = next.log.filter((l) => l.seq > lastSeq).map((l) => l.text);
    const hit = [...fresh].reverse().find((t) => TOAST_PATTERN.test(t));
    if (hit) this.showToast(hit, 'info');
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

  /** True when the viewer may act right now. */
  private canAct(): boolean {
    const s = this.state!;
    const me = activePlayer(s);
    return !me.isAI && me.id === this.viewer().id && !isGameOver(s) && !this.needsHandoff() && s.pendingRewards.length === 0;
  }

  /** The reward choice waiting for the viewer, if any. */
  private myReward() {
    const s = this.state!;
    const r = s.pendingRewards[0];
    if (!r || this.needsHandoff() || isGameOver(s)) return null;
    const owner = s.players.find((p) => p.id === r.playerId)!;
    return !owner.isAI && owner.id === this.viewer().id ? r : null;
  }

  /** Hot-seat: hide the hand until the next human confirms they have the device. */
  private needsHandoff(): boolean {
    const s = this.state!;
    const p = activePlayer(s);
    const humans = s.players.filter((pl) => !pl.isAI).length;
    return !p.isAI && humans > 1 && this.revealedFor !== p.id && !isGameOver(s);
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const seat = el.dataset.seatName;
    if (seat !== undefined) this.seats[Number(seat)].name = el.value;
  }

  private onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
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
      this.suppressClick = true; // the tap that ends a long press must not also play/buy
      this.preview.classList.remove('show');
    }
    this.cancelPress();
  }

  private cancelPress() {
    if (this.press) window.clearTimeout(this.press.timer);
    this.press = null;
  }

  /** Large, readable copy of a card, centred on screen while held. */
  private showPeek(el: HTMLElement) {
    const defId = el.dataset.card!;
    const cost = el.dataset.cost;
    this.preview.innerHTML = this.bigCard(defId, cost !== undefined ? Number(cost) : undefined);
    const h = Math.min(420, window.innerHeight - 24);
    const w = h * 0.714;
    this.preview.style.setProperty('--pw', `${w}px`);
    this.preview.style.left = `${(window.innerWidth - w) / 2}px`;
    this.preview.style.top = `${(window.innerHeight - h) / 2}px`;
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

    switch (act) {
      case 'seat-toggle': {
        const i = Number(arg);
        if (i >= BALANCE.minPlayers) this.seats[i].enabled = !this.seats[i].enabled;
        return this.render();
      }
      case 'seat-ai':
        this.seats[Number(arg)].isAI = !this.seats[Number(arg)].isAI;
        return this.render();
      case 'new-game':
        return this.newGame();
      case 'continue':
        return this.continueGame();
      case 'rules':
        this.sheet = { kind: 'rules' };
        return this.render();
      case 'to-menu':
        this.screen = 'menu';
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
      case 'view-system':
        this.sheet = { kind: 'system', playerId: arg };
        return this.render();
      case 'view-objective':
        this.sheet = { kind: 'objective', id: arg };
        return this.render();
      case 'view-mission':
        this.sheet = { kind: 'mission', uid: arg, playerId: el.dataset.player ?? '' };
        return this.render();
      case 'reward': {
        if (!this.myReward()) return;
        const reward = arg as RewardId;
        const needs = rewardDef(reward).needs;
        if (needs) {
          this.rewardStep = needs === 'upgrade' ? 'command' : 'requisition';
          return this.render();
        }
        return this.dispatch({ type: 'chooseReward', reward });
      }
      case 'reward-upgrade':
        this.rewardStep = null;
        return this.dispatch({ type: 'chooseReward', reward: 'command', upgradeId: arg });
      case 'reward-slot':
        this.rewardStep = null;
        return this.dispatch({ type: 'chooseReward', reward: 'requisition', slot: Number(arg) });
      case 'reward-back':
        this.rewardStep = null;
        return this.render();
      case 'coolingChamber':
        this.sheet = { kind: 'action', action: 'coolingChamber' };
        return this.render();
      case 'cancel':
        this.pending = null;
        this.sheet = null;
        return this.render();
    }

    if (!s) return;
    // On touch screens, tapping a card opens the inspector; its button then acts.
    // Touch: tapping a display card opens the buy overlay (hand cards play straight away).
    if (((this.touch && act === 'buy') || act === 'inspect') && !el.closest('.sheet') && el.dataset.card) {
      const defId = el.dataset.card!;
      const slot = el.dataset.slot;
      this.sheet = { kind: 'card', defId, uid: el.dataset.hand, slot: slot !== undefined ? Number(slot) : undefined };
      sound.hover();
      return this.render();
    }
    if (!this.canAct()) return;
    const me = activePlayer(s);

    switch (act) {
      case 'play': {
        this.sheet = null;
        const card = me.hand.find((c) => c.uid === arg);
        if (!card) return;
        if (cardNeedsTarget(card.defId)) {
          const foes = livingOpponents(s, me);
          if (foes.length === 1) return this.dispatch({ type: 'playCard', cardUid: arg, targetId: foes[0].id });
          this.pending = { kind: 'card', uid: arg, need: 'target' };
          return this.render();
        }
        if (cardNeedsUpgrade(card.defId) && upgradeOptions(me).length > 0) {
          this.pending = { kind: 'card', uid: arg, need: 'upgrade' };
          return this.render();
        }
        return this.dispatch({ type: 'playCard', cardUid: arg });
      }
      case 'play-all':
        return this.dispatch({ type: 'playAllMoney' });
      case 'buy':
        this.sheet = null;
        return this.dispatch({ type: 'buyCard', slot: Number(arg) });
      case 'solarFlare': {
        const foes = livingOpponents(s, me);
        if (foes.length === 1) return this.dispatch({ type: 'solarFlare', targetId: foes[0].id });
        this.pending = { kind: 'flare' };
        return this.render();
      }
      case 'thermosiphon':
        return this.dispatch({ type: 'thermosiphon' });
      case 'end-turn':
        return this.dispatch({ type: 'endTurn' });
      case 'target': {
        const p = this.pending;
        this.pending = null;
        if (p?.kind === 'flare') return this.dispatch({ type: 'solarFlare', targetId: arg });
        if (p?.kind === 'card') return this.dispatch({ type: 'playCard', cardUid: p.uid, targetId: arg });
        return;
      }
      case 'upgrade': {
        const p = this.pending;
        this.pending = null;
        if (p?.kind === 'card') return this.dispatch({ type: 'playCard', cardUid: p.uid, upgradeId: arg });
        return;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private render() {
    this.root.innerHTML = this.screen === 'menu' ? this.renderMenu() : this.renderGame();
    // The backdrop warms with the viewer's own sun (not whoever is acting).
    const me = this.screen === 'game' && this.state ? this.viewer() : null;
    backdrop.setHeat(me && !me.eliminated ? me.heat / supernovaThreshold(me) : 0);
    this.root.querySelector('.log-list')?.scrollTo({ top: 1e9 });
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

  private renderMenu(): string {
    const hasSave = loadSave() !== null;
    const seats = this.seats
      .map((seat, i) => {
        const locked = i < BALANCE.minPlayers;
        return `
        <div class="seat ${seat.enabled ? '' : 'seat-off'}">
          <button class="pill-btn" data-act="seat-toggle" data-arg="${i}" ${locked ? 'disabled' : ''}>${seat.enabled ? '●' : '○'} ${i + 1}</button>
          <input data-seat-name="${i}" value="${esc(seat.name)}" maxlength="18" ${seat.enabled ? '' : 'disabled'} />
          <button class="pill-btn" data-act="seat-ai" data-arg="${i}" ${seat.enabled ? '' : 'disabled'}>${seat.isAI ? 'ai' : 'human'}</button>
        </div>`;
      })
      .join('');

    return `
    <main class="menu">
      <div class="title-block">
        <div class="title-sun"></div>
        <h1 class="title">blue loop</h1>
        <p class="tagline">cool your star · ignite theirs</p>
      </div>
      <section class="glass menu-panel">
        <div class="bar-title">new game</div>
        <div class="menu-body">
          ${seats}
          <div class="menu-actions">
            <button class="btn-primary" data-act="new-game">launch</button>
            ${hasSave ? '<button class="btn" data-act="continue">continue</button>' : ''}
            <button class="btn" data-act="rules">how to play</button>
          </div>
        </div>
      </section>
      <footer class="studio">coronal mass games · prototype build</footer>
      ${this.sheet?.kind === 'rules' ? this.renderSheet() : ''}
    </main>`;
  }

  private rulesHtml(): string {
    return `
      <ul class="rules">
        <li>Every sun starts at <b>0</b> with <b>${BALANCE.supernovaAt}</b> max health. Reach it and your sun goes supernova. The last sun standing wins.</li>
        <li>Play cards for money. Spend it on <b>Solar Flare</b> to heat an enemy sun, or <b>Thermosiphon</b> to cool your own (down to ${BALANCE.minHeat}), as often as you can afford.</li>
        <li><b>Command</b> cards upgrade an action or a planet. Solar Flare: 3 upgrades (up to 4 heat). Thermosiphon: 1 (up to 2 cooling). <b>Cooling Chamber</b>: 3 upgrades, +${BALANCE.coolingChamberHealthPerUpgrade} max health each (up to ${BALANCE.supernovaAt + 3 * BALANCE.coolingChamberHealthPerUpgrade}).</li>
        <li><b>Objectives</b> are shared: the first player to meet one claims it and picks a reward (each reward once per player). Buy <b>mission</b> cards for personal objectives: play one, meet its condition, and pick a reward.</li>
        <li>The stability bar drains by one each round. When it empties, <b>Stellar Instability</b> heats every sun at the start of each turn.</li>
      </ul>`;
  }

  private renderGame(): string {
    const s = this.state!;
    return `
      <main class="game">
        ${this.renderTop()}
        ${this.renderDisplay()}
        ${this.renderDock()}
        ${this.renderStage()}
        ${this.renderOverlay(s)}
        <div class="rotate-hint"><div><h1 class="title">blue loop</h1><p>turn your device sideways to play</p></div></div>
      </main>`;
  }

  private renderTop(): string {
    const s = this.state!;
    const active = activePlayer(s);
    const me = this.viewer();
    const mine = active.id === me.id && !active.isAI;
    const total = BALANCE.instabilityStartsRound - 1;
    const remaining = Math.max(0, total - (s.round - 1));
    const instab = instabilityHeat(s);
    const segments = Array.from({ length: total }, (_, i) => `<i class="${i < remaining ? 'on' : ''}"></i>`).join('');
    const globals = s.globals
      .filter((g) => g.turnsRemaining > 0)
      .map((g) => `<span class="global" title="${esc(GLOBALS[g.id].text)} (${g.turnsRemaining} turns left)">${esc(GLOBALS[g.id].name.toLowerCase())}</span>`)
      .join('');

    const rivals = s.players
      .filter((p) => p.id !== me.id)
      .map(
        (p) => `
        <button class="rival ${p.id === active.id ? 'rival-active' : ''} ${p.eliminated ? 'rival-dead' : ''}" data-act="view-system" data-arg="${p.id}" title="${esc(p.name)} · ${esc(systemDef(p.systemId).name)}">
          <div class="orb-anchor" data-anchor="player:${p.id}">${sunOrb({ heat: p.heat, threshold: supernovaThreshold(p), size: 40, dead: p.eliminated })}</div>
          <div class="rival-info">
            <span class="rival-name">${esc(p.name.toLowerCase())}</span>
            <span class="rival-stats"><b>${p.heat}/${supernovaThreshold(p)}</b><em> · ⛨${p.shields} · ▲${flareHeat(p)}${p.claimedObjectives.length ? ` · ★${p.claimedObjectives.length}` : ''}${p.missions.length ? ` · ◎${p.missions.length}` : ''}</em></span>
          </div>
        </button>`,
      )
      .join('');

    const last = s.log[s.log.length - 1]?.text ?? '';
    const aiTurn = active.isAI && !isGameOver(s);
    return `
      <header class="top">
        <div class="round">
          <button class="numeral" data-act="open-menu" title="Round ${s.round} · menu">${roman(s.round)}</button>
          <div class="stability ${instab ? 'unstable' : ''}" title="${instab
            ? `Stellar Instability: every sun heats by ${instab} at the start of its turn.`
            : 'Drains by one each round. When empty, every sun heats at the start of its turn.'}">
            <span class="stability-label">${instab ? `instability +${instab}` : `stability ${remaining}`}</span>
            <div class="stability-bar">${segments}</div>
          </div>
          ${this.renderObjectivesRow(me)}
        </div>
        <div class="rivals">${rivals}</div>
        <div class="turn">
          <div class="turn-pill ${mine ? 'turn-mine' : ''}">${mine ? 'your turn' : `${esc(active.name.toLowerCase())}'s turn`}</div>
          <div class="feed" title="${esc(last)}">${esc(last)}</div>
        </div>
        <div class="top-controls">
          ${globals}
          ${aiTurn ? '<button class="pill-btn" data-act="skip-ai" title="Resolve AI turns instantly">skip ›</button>' : ''}
          <button class="icon-btn" data-act="open-menu" aria-label="Menu">≡</button>
        </div>
      </header>`;
  }

  private renderDisplay(): string {
    const s = this.state!;
    const me = activePlayer(s);
    return `
      <section class="display">
        <div class="section-label" data-anchor="market">display <span>${s.marketDeck.length} left</span></div>
        <div class="cards">${s.display
          .map((c, i) => (c ? this.renderCard(c, { slot: i, buyer: me }) : '<div class="card card-empty"></div>'))
          .join('')}</div>
      </section>`;
  }

  private renderDock(): string {
    const s = this.state!;
    const me = this.viewer();
    const act = this.canAct();
    const busy = this.pending !== null;
    const hidden = this.needsHandoff();
    const max = supernovaThreshold(me);

    const fc = flareCost(s, me);
    const tc = thermoCost(me);
    const rail = `
      <div data-anchor="upgrade:solarFlare">${actionChip({ action: 'solarFlare', upgrades: me.upgrades.solarFlare, cost: fc, power: flareHeat(me), enabled: act && !busy && me.money >= fc })}</div>
      <div data-anchor="upgrade:thermosiphon">${actionChip({ action: 'thermosiphon', upgrades: me.upgrades.thermosiphon, cost: tc, power: thermoCool(me), enabled: act && !busy && me.money >= tc && me.heat > BALANCE.minHeat })}</div>
      <div data-anchor="upgrade:coolingChamber">${actionChip({ action: 'coolingChamber', upgrades: me.upgrades.coolingChamber, power: max, enabled: true })}</div>`;

    const hasMoneyCards = me.hand.some((c) => cardDef(c.defId).effects.every((e) => e.type === 'money'));
    const hand = hidden ? '<div class="hand-hidden">hand hidden</div>' : me.hand.map((c) => this.renderCard(c, { hand: true })).join('');
    const groups = new Map<string, CardInstance[]>();
    for (const c of me.inPlay) groups.set(c.defId, [...(groups.get(c.defId) ?? []), c]);
    const played = [...groups.values()].map((cs) => this.renderMini(cs[cs.length - 1], cs.length)).join('');

    return `
      <section class="dock">
        <div class="command">
          <button class="me" data-act="view-system" data-arg="${me.id}" title="${esc(me.name)} · ${esc(systemDef(me.systemId).name)} (tap for details)">
            <div class="orb-anchor" data-anchor="player:${me.id}">${sunOrb({ heat: me.heat, threshold: max, size: 44, dead: me.eliminated })}</div>
            <span class="health">${me.heat}<small>/${max}</small></span>
            <span class="me-stats">
              <span title="Shields">⛨${me.shields}</span>
              <span title="Income per turn">◈+${incomeFor(me)}</span>
              <span title="Hand size">✋${handSizeFor(me)}</span>
              ${shieldPierce(me) ? `<span title="Shield pierce">⚔${shieldPierce(me)}</span>` : ''}
            </span>
          </button>
          <div class="rail">${rail}</div>
        </div>
        <button class="pile" data-anchor="deck" data-act="view-pile" data-arg="deck" title="Your deck"><span class="pile-stack"><i></i><i></i></span><b>${me.deck.length}</b><small>deck</small></button>
        <div class="hand-zone">
          <div class="in-play">${played}</div>
          <div class="hand">${hand}</div>
        </div>
        <button class="pile" data-anchor="discard" data-act="view-pile" data-arg="discard" title="Your discard pile"><span class="pile-stack"><i></i><i></i></span><b>${me.discard.length}</b><small>discard</small></button>
        <div class="turn-controls">
          <div class="money" title="Money this turn">◈ ${me.money}</div>
          <button class="btn btn-small" data-act="play-all" ${act && hasMoneyCards && !busy ? '' : 'disabled'} title="Play every plain money card in your hand">play money</button>
          <button class="btn-primary end-turn" data-act="end-turn" ${act && !busy ? '' : 'disabled'}>end turn</button>
        </div>
      </section>`;
  }

  /** Global objectives (first to meet one claims it), then the viewer's missions. */
  private renderObjectivesRow(me: PlayerState): string {
    const s = this.state!;
    const objectives = s.objectives
      .map((id) => {
        const o = objectiveDef(id);
        return `
          <button class="objective" data-anchor="obj:${id}" data-act="view-objective" data-arg="${id}">
            ${objectiveGlyph(id)}
            <div class="popover"><b>${esc(o.name.toLowerCase())}</b><p>${esc(o.text)}</p><p class="muted">First to meet it claims it.</p></div>
          </button>`;
      })
      .join('');
    const missions = me.missions
      .map((m) => {
        const o = objectiveDef(missionOf(m.defId));
        return `
          <button class="objective obj-mission" data-act="view-mission" data-arg="${m.uid}" data-player="${me.id}" style="--kc:${KIND_COLOUR.mission}">
            ${cardGlyph(m.defId, 'mission')}
            <div class="popover"><b>mission · ${esc(o.name.toLowerCase())}</b><p>${esc(o.text)}</p></div>
          </button>`;
      })
      .join('');
    const claimedCount = me.claimedObjectives.length;
    return `<div class="objectives-row">${objectives}${missions ? `<span class="obj-divider"></span>${missions}` : ''}${claimedCount ? `<span class="obj-claimed" title="Objectives you have claimed">★${claimedCount}</span>` : ''}</div>`;
  }

  private renderCard(c: CardInstance, opts: { slot?: number; hand?: boolean; buyer?: PlayerState; static?: boolean }): string {
    const def = cardDef(c.defId);
    const act = this.canAct() && !this.pending;
    // Cards are never disabled: if a card can't be played or bought right now, tapping it inspects it.
    let attrs = `data-act="inspect"`;
    let cost = '';
    let costAttr = opts.slot !== undefined ? `data-slot="${opts.slot}"` : opts.hand ? `data-hand="${c.uid}"` : '';
    if (opts.slot !== undefined && opts.buyer) {
      const price = marketCost(opts.buyer, c.defId);
      if ((act && opts.buyer.money >= price) || this.touch) attrs = `data-act="buy" data-arg="${opts.slot}"`;
      cost = `<span class="coin ${price < def.cost ? 'coin-discount' : ''}">${price}</span>`;
      costAttr += ` data-cost="${price}"`;
    } else if (opts.hand && (act || this.touch)) {
      attrs = `data-act="play" data-arg="${c.uid}"`;
    }
    // Display cards stay at full strength; affordability shows as a highlight (on your turn) or a muted price.
    let buyState = '';
    if (opts.slot !== undefined && opts.buyer) {
      buyState = opts.buyer.money >= marketCost(opts.buyer, c.defId) ? (act ? 'card-affordable' : '') : 'card-pricey';
    }
    return `
      <button class="card kind-${def.kind} ${buyState}" ${opts.static ? '' : `data-uid="${c.uid}"`} data-card="${def.id}" ${costAttr} ${attrs} style="--kc:${KIND_COLOUR[def.kind]}">
        <div class="card-glyph">${cardGlyph(def.id, def.kind)}</div>
        ${cost}
        <div class="card-name">${esc(def.name.toLowerCase())}</div>
        <div class="card-text">${esc(def.text)}</div>
        <div class="card-kind">${def.kind === 'basic' ? 'money' : def.kind}</div>
      </button>`;
  }

  /** Small card for the "in play" strip. */
  private renderMini(c: CardInstance, count = 1): string {
    const def = cardDef(c.defId);
    return `
      <button class="mini kind-${def.kind}" data-uid="${c.uid}" data-card="${def.id}" data-act="inspect" style="--kc:${KIND_COLOUR[def.kind]}">
        ${cardGlyph(def.id, def.kind)}
        ${count > 1 ? `<b>×${count}</b>` : ''}
      </button>`;
  }

  /** The magnified card, used by the hover preview and the inspector. */
  private bigCard(defId: string, cost?: number): string {
    const def = cardDef(defId);
    const shownCost = cost ?? def.cost;
    return `
      <div class="card card-big kind-${def.kind}" style="--kc:${KIND_COLOUR[def.kind]}">
        <div class="card-glyph">${cardGlyph(def.id, def.kind)}</div>
        ${shownCost > 0 ? `<span class="coin ${shownCost < def.cost ? 'coin-discount' : ''}">${shownCost}</span>` : ''}
        <div class="card-name">${esc(def.name.toLowerCase())}</div>
        <div class="card-text">${esc(def.text)}</div>
        <div class="card-kind">${def.kind === 'basic' ? 'money' : def.kind}</div>
      </div>`;
  }

  private renderStage(): string {
    const st = this.stage;
    const s = this.state!;
    if (!st || isGameOver(s)) return '';
    const actor = s.players.find((p) => p.id === st.actorId)!;
    const target = st.targetId ? s.players.find((p) => p.id === st.targetId) : undefined;
    return `
      <div class="stage">
        ${this.renderCard({ uid: st.uid, defId: st.defId }, {})}
        <div class="stage-caption">${esc(actor.name.toLowerCase())} ${st.verb}${target ? ` → ${esc(target.name.toLowerCase())}` : ''}</div>
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
            <button class="btn" data-act="open-log">game log</button>
            <button class="btn" data-act="rules">how to play</button>
            <button class="btn" data-act="to-menu">main menu</button>
          </div>`,
        );
      case 'log':
        return this.sheetFrame('game log', `<div class="log-list">${s!.log.slice(-120).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`);
      case 'pile':
        return this.renderPileSheet(sh.pile);
      case 'system':
        return this.renderSystemSheet(s!.players.find((p) => p.id === sh.playerId)!);
      case 'objective': {
        const o = objectiveDef(sh.id);
        const claimed = s!.claimed.map((c) => `${esc(objectiveDef(c.id).name)} · ${esc(s!.players.find((p) => p.id === c.playerId)!.name)}`);
        return this.sheetFrame(
          esc(o.name.toLowerCase()),
          `<div class="obj-sheet">${objectiveGlyph(sh.id)}<p>${esc(o.text)}</p>
           <p class="muted">Global objective: the first player to meet it claims it and chooses a reward. A new objective then takes its place.</p>
           ${claimed.length ? `<p class="claimed">claimed so far: ${claimed.join(' · ')}</p>` : ''}</div>`,
        );
      }
      case 'mission': {
        const owner = s!.players.find((p) => p.id === sh.playerId)!;
        const card = owner.missions.find((m) => m.uid === sh.uid);
        if (!card) return '';
        const o = objectiveDef(missionOf(card.defId));
        return this.sheetFrame(
          `mission · ${esc(o.name.toLowerCase())}`,
          `<div class="obj-sheet">${cardGlyph(card.defId, 'mission')}<p>${esc(o.text)}</p>
           <p class="muted">Personal mission. When you meet it on your turn you choose a reward, and the mission card leaves the game.</p></div>`,
        );
      }
      case 'action': {
        const me = this.viewer();
        return this.sheetFrame(
          ACTION_NAME[sh.action].toLowerCase(),
          `<div class="action-sheet">
            ${actionTile({ action: sh.action, upgrades: me.upgrades[sh.action], power: supernovaThreshold(me), enabled: false, compact: true, actAttr: '' })}
            <div><p>${ACTION_TEXT[sh.action]}</p><p class="muted">Upgrades: ${me.upgrades[sh.action]}/${MAX_UPGRADES[sh.action]}. Upgrade with a Command card.</p></div>
          </div>`,
        );
      }
      case 'card': {
        const act = this.canAct() && !this.pending;
        const me = s ? activePlayer(s) : null;
        let button = '';
        let cost: number | undefined;
        if (sh.uid && s) {
          const inHand = me!.hand.some((c) => c.uid === sh.uid);
          button = inHand ? `<button class="btn-primary" data-act="play" data-arg="${sh.uid}" ${act ? '' : 'disabled'}>play</button>` : '';
        } else if (sh.slot !== undefined && s && me) {
          cost = marketCost(me, sh.defId);
          button = `<button class="btn-primary" data-act="buy" data-arg="${sh.slot}" ${act && me.money >= cost ? '' : 'disabled'}>buy · ◈${cost}</button>
            ${me.money < cost && act ? `<span class="muted">you have ◈${me.money}</span>` : ''}`;
        }
        return `
          <div class="overlay overlay-inspect" data-act="cancel">
            <div class="inspector sheet">
              ${this.bigCard(sh.defId, cost)}
              <div class="inspector-actions">${button}<button class="btn" data-act="cancel">close</button></div>
            </div>
          </div>`;
      }
    }
  }

  private renderSystemSheet(p: PlayerState): string {
    const sys = systemDef(p.systemId);
    const planets = p.planets
      .map((pl) => {
        const pips = Array.from({ length: BALANCE.maxPlanetLevel }, (_, i) => `<i class="${i < pl.level ? 'on' : ''}"></i>`).join('');
        return `<div class="planet-row"><span class="planet track-${pl.track}">${TRACK_ICON[pl.track]} ${esc(pl.name.toLowerCase())}<span class="pips">${pips}</span></span>
          <small>${pl.track}: all levels together give ${planetEffect(pl.track, trackLevel(p, pl.track))}</small></div>`;
      })
      .join('');
    const ups = (['solarFlare', 'thermosiphon', 'coolingChamber'] as const)
      .map((a) => `<span>${ACTION_NAME[a].toLowerCase()} ${p.upgrades[a]}/${MAX_UPGRADES[a]}</span>`)
      .join(' · ');
    return this.sheetFrame(
      `${esc(p.name.toLowerCase())} · ${esc(sys.name.toLowerCase())}`,
      `<div class="system-sheet">
        <div class="system-head">
          ${sunOrb({ heat: p.heat, threshold: supernovaThreshold(p), size: 72, dead: p.eliminated })}
          <div>
            <p><b>${esc(sys.abilityName.toLowerCase())}</b> · ${esc(sys.abilityText)}</p>
            <p class="muted">heat ${p.heat} / ${supernovaThreshold(p)} · shields ${p.shields} · income +${incomeFor(p)} · hand ${handSizeFor(p)} · deck ${p.deck.length} · discard ${p.discard.length}</p>
            <p class="muted">${ups}</p>
            ${p.rewards.length ? `<p class="muted">rewards: ${p.rewards.map((r) => esc(rewardDef(r).name.toLowerCase())).join(' · ')}</p>` : ''}
            ${p.missions.length ? `<p class="muted">missions: ${p.missions.map((m) => esc(objectiveDef(missionOf(m.defId)).name.toLowerCase())).join(' · ')}</p>` : ''}
          </div>
        </div>
        ${planets}
      </div>`,
    );
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
        `<p class="muted center-text">Draw order is hidden. When your deck runs out, your discard pile is shuffled into a new one.</p>
         <div class="pile-grid">${rows || '<p class="muted">Your deck is empty.</p>'}</div>`,
      );
    }
    const rows = [...me.discard].reverse().map((c) => `<div class="pile-card">${this.renderCard(c, { static: true })}</div>`).join('');
    return this.sheetFrame(
      `your discard · ${me.discard.length}`,
      `<p class="muted center-text">Most recent first.</p><div class="pile-grid">${rows || '<p class="muted">Your discard pile is empty.</p>'}</div>`,
    );
  }

  /** Objective claimed: pick one of the offered rewards (then, if needed, what it applies to). */
  private renderReward(r: GameState['pendingRewards'][number]): string {
    const s = this.state!;
    const me = s.players.find((p) => p.id === r.playerId)!;
    if (this.rewardStep === 'command') {
      const options = upgradeOptions(me);
      const tiles = (['solarFlare', 'thermosiphon', 'coolingChamber'] as const)
        .map((a) =>
          actionTile({
            action: a,
            upgrades: me.upgrades[a],
            cost: a === 'solarFlare' ? flareCost(s, me) : a === 'thermosiphon' ? thermoCost(me) : undefined,
            power: a === 'solarFlare' ? flareHeat(me) : a === 'thermosiphon' ? thermoCool(me) : supernovaThreshold(me),
            enabled: options.includes(a),
            compact: true,
            actAttr: options.includes(a) ? `data-act="reward-upgrade" data-arg="${a}"` : 'disabled',
          }),
        )
        .join('');
      const planets = me.planets
        .map((pl) => {
          const ok = options.includes(pl.id);
          return `<button class="planet planet-choice" ${ok ? `data-act="reward-upgrade" data-arg="${pl.id}"` : 'disabled'}>
            <span>${TRACK_ICON[pl.track]} ${esc(pl.name.toLowerCase())}</span>
            <small>${ok ? `→ ${planetEffect(pl.track, trackLevel(me, pl.track) + 1)}` : 'max level'}</small></button>`;
        })
        .join('');
      return `
        <div class="overlay"><div class="modal modal-wide">
          <div class="bar-title">command upgrade · choose what to upgrade</div>
          <div class="modal-body upgrade-body"><div class="upgrade-actions">${tiles}</div><div class="upgrade-planets">${planets}</div></div>
          <button class="modal-cancel" data-act="reward-back">back</button>
        </div></div>`;
    }
    if (this.rewardStep === 'requisition') {
      const cards = s.display
        .map((c, i) => (c ? `<div class="pile-card" data-act="reward-slot" data-arg="${i}">${this.renderCard(c, { static: true })}</div>` : ''))
        .join('');
      return `
        <div class="overlay"><div class="modal modal-wide">
          <div class="bar-title">requisition · take any card for free</div>
          <div class="modal-body"><div class="pile-grid requisition">${cards}</div></div>
          <button class="modal-cancel" data-act="reward-back">back</button>
        </div></div>`;
    }
    const options = r.options
      .map((id) => {
        const def = rewardDef(id);
        return `
          <button class="reward" data-act="reward" data-arg="${id}">
            <div class="reward-glyph">${rewardGlyph(id)}</div>
            <div class="reward-name">${esc(def.name.toLowerCase())}</div>
            <div class="reward-text">${esc(def.text.replace(/^Permanent: /, ''))}</div>
            <div class="reward-kind">${def.permanent ? 'permanent' : 'instant'}</div>
          </button>`;
      })
      .join('');
    return `
      <div class="overlay overlay-inspect"><div class="modal modal-wide">
        <div class="bar-title">★ ${esc(r.source.toLowerCase())} · choose a reward</div>
        <div class="modal-body"><div class="rewards">${options}</div>
          <p class="muted center-text">Each reward can be taken once per game.</p></div>
      </div></div>`;
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
            <p>${esc(systemDef(winner.systemId).name)} is the last sun standing after ${s.round} rounds.</p>
            <button class="btn-primary" data-act="to-menu">back to menu</button>
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
    const reward = this.myReward();
    if (reward) return this.renderReward(reward);
    if (this.sheet) return this.renderSheet();
    const pend = this.pending;
    if (!pend) return '';
    const me = activePlayer(s);

    if (pend.kind === 'flare' || pend.need === 'target') {
      const title = pend.kind === 'flare' ? 'select solar flare target' : `select ${cardDef(me.hand.find((c) => c.uid === pend.uid)!.defId).name.toLowerCase()} target`;
      const foes = livingOpponents(s, me)
        .map(
          (p) => `
          <button class="target" data-act="target" data-arg="${p.id}">
            ${sunOrb({ heat: p.heat, threshold: supernovaThreshold(p), size: 72 })}
            <span class="target-name">${esc(p.name.toLowerCase())}</span>
            <span class="target-meta">${p.heat}/${supernovaThreshold(p)} · ⛨${p.shields}</span>
          </button>`,
        )
        .join('');
      return `
        <div class="overlay overlay-soft" data-act="cancel"><div class="modal">
          <div class="bar-title">${esc(title)}</div>
          <div class="modal-body targets">${foes}</div>
          <button class="modal-cancel" data-act="cancel">cancel</button>
        </div></div>`;
    }

    // Upgrade choice for a Command card.
    const options = upgradeOptions(me);
    const actionChoices = (['solarFlare', 'thermosiphon', 'coolingChamber'] as const)
      .map((a) => {
        const available = options.includes(a);
        return actionTile({
          action: a,
          upgrades: me.upgrades[a],
          cost: a === 'solarFlare' ? flareCost(s, me) : a === 'thermosiphon' ? thermoCost(me) : undefined,
          power: a === 'solarFlare' ? flareHeat(me) : a === 'thermosiphon' ? thermoCool(me) : supernovaThreshold(me),
          enabled: available,
          compact: true,
          actAttr: available ? `data-act="upgrade" data-arg="${a}"` : 'disabled',
        });
      })
      .join('');
    const planetChoices = me.planets
      .map((pl) => {
        const available = options.includes(pl.id);
        const pips = Array.from({ length: BALANCE.maxPlanetLevel }, (_, i) => `<i class="${i < pl.level ? 'on' : ''}"></i>`).join('');
        return `
          <button class="planet planet-choice track-${pl.track}" ${available ? `data-act="upgrade" data-arg="${pl.id}"` : 'disabled'}>
            <span>${TRACK_ICON[pl.track]} ${esc(pl.name.toLowerCase())}<span class="pips">${pips}</span></span>
            <small>${available ? `→ ${planetEffect(pl.track, trackLevel(me, pl.track) + 1)}` : 'max level'}</small>
          </button>`;
      })
      .join('');
    return `
      <div class="overlay overlay-soft" data-act="cancel"><div class="modal modal-wide">
        <div class="bar-title">select upgrade</div>
        <div class="modal-body upgrade-body">
          <div class="upgrade-actions">${actionChoices}</div>
          <div class="upgrade-planets">${planetChoices}</div>
        </div>
        <button class="modal-cancel" data-act="cancel">cancel</button>
      </div></div>`;
  }
}
