import {
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
  objectiveDef,
  shieldPierce,
  systemDef,
  thermoCool,
  thermoCost,
  trackLevel,
  upgradeOptions,
  type Action,
  type CardInstance,
  type GameState,
  type Planet,
  type PlayerSetup,
  type PlayerState,
} from '../engine';
import { actionTile, petalBackdrop, roman, sunOrb } from './art';
import { anchorRect, flyFrom, ghost, projectile, pulse, snapshot, type Snapshot } from './fx';
import { cardGlyph, KIND_COLOUR, objectiveGlyph } from './glyphs';
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
};
const TOAST_MS = 2600;
const TRACK_ICON: Record<string, string> = { weapons: '⚔', defences: '⛨', economy: '◈', resources: '⬢' };
const TOAST_PATTERN = /heats to|SUPERNOVA|completes|upgrades|wins|shields absorb|Instability/;
const HOT = '#ff6a3d';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** What a planet's track does at a given level, in plain words. */
function planetEffect(track: Planet['track'], level: number): string {
  switch (track) {
    case 'economy':
      return `+${level * BALANCE.economyIncomePerLevel} money at the start of each turn`;
    case 'defences':
      return `+${Math.floor(level / BALANCE.defenceLevelsPerShield)} shields each turn (1 per ${BALANCE.defenceLevelsPerShield} levels)`;
    case 'weapons':
      return `your heat ignores ${Math.floor(level / BALANCE.weaponLevelsPerShieldPierce)} enemy shields (1 per ${BALANCE.weaponLevelsPerShieldPierce} levels)`;
    case 'resources':
      return `+${Math.floor(level / BALANCE.resourceLevelsPerExtraCard)} cards in hand (1 per ${BALANCE.resourceLevelsPerExtraCard} levels)`;
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
  private pileView: 'deck' | 'discard' | null = null;
  private showLog = false;
  private aiTimer: number | null = null;
  private speed: Speed = 'normal';
  /** Human player whose hand was last revealed (for hot-seat handoff). */
  private revealedFor: string | null = null;
  /** Whose home system sits in the dock: the current or most recent human. */
  private viewerId: string | null = null;
  private preview: HTMLElement;
  private pointer = { x: -1, y: -1 };
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
    root.addEventListener('mouseout', (e) => this.onHoverOut(e));
    window.addEventListener('mousemove', (e) => (this.pointer = { x: e.clientX, y: e.clientY }));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
  }

  start() {
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
    this.pileView = null;
    this.screen = 'game';
    this.syncViewer();
    this.render();
    this.dealOpening();
    this.scheduleAI(900);
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
    this.state = next;
    this.pending = null;
    this.stage = actor.isAI ? this.stageFor(prev, actor, action) : null;
    if (isGameOver(next)) clearSave();
    else save(next);
    this.syncViewer();
    this.render();
    if (before) {
      this.surfaceLog(prev, next);
      this.animate(prev, next, action, actor, before);
    }
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
    if (isGameOver(s)) clearSave();
    else save(s);
    this.syncViewer();
    this.render();
    if (!isGameOver(s)) sound.turn();
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
        // Drawn: fly in from the deck, one after another (after the old hand is swept away).
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
        const hotter = p.heat > was.heat;
        if (p.heat !== was.heat) sound.impact(hotter);
        if (p.blockedSinceTurnStart > was.blockedSinceTurnStart) sound.shield();
      }, at);
      pulse(orb(id), p.heat > was.heat ? 'fx-hot' : p.heat < was.heat ? 'fx-cold' : 'fx-shield', at);
      handled.add(id);
    };
    const fire = (fromId: string, toId: string, colour: string, delay = 0) => {
      const a = orbRect(fromId), b = orbRect(toId);
      const at = a && b ? projectile(a, b, colour, { delay }) : delay;
      hit(toId, at);
    };

    switch (action.type) {
      case 'solarFlare':
        sound.flare();
        fire(actor.id, action.targetId, HOT);
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
          if (e.type === 'heatTarget' && action.targetId) fire(actor.id, action.targetId, HOT, delay);
          if (e.type === 'heatAllOpponents') for (const o of livingOpponents(prev, actor)) fire(actor.id, o.id, HOT, delay + 120 * i++);
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
        const nowActive = activePlayer(next);
        if (!nowActive.isAI && !isGameOver(next)) window.setTimeout(() => sound.turn(), 500);
        break;
      }
    }

    // Anything else that changed a sun (turn-start effects, instability, self-heat).
    for (const p of next.players) {
      const was = prev.players.find((pl) => pl.id === p.id)!;
      if (!handled.has(p.id) && p.heat !== was.heat) hit(p.id, endingTurn ? 700 : 200);
      if (p.eliminated && !was.eliminated) {
        window.setTimeout(() => sound.supernova(), 650);
        pulse(orb(p.id), 'fx-nova', 600);
        pulse(root.querySelector('.game'), 'fx-flash', 650);
      }
      const newly = p.claimedObjectives.filter((o) => !was.claimedObjectives.includes(o));
      if (newly.length) {
        sound.objective();
        if (p.id === viewer.id) newly.forEach((o) => pulse(root.querySelector(`[data-anchor="obj:${o}"]`), 'fx-upgrade', 200));
      }
    }
  }

  /** Show the most important new log line as a toast. */
  private surfaceLog(prev: GameState, next: GameState) {
    const lastPrev = prev.log[prev.log.length - 1];
    const start = lastPrev ? next.log.lastIndexOf(lastPrev) + 1 : 0;
    const fresh = next.log.slice(Math.max(start, 0)).map((l) => l.text);
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
  // Input
  // -------------------------------------------------------------------------

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const seat = el.dataset.seatName;
    if (seat !== undefined) this.seats[Number(seat)].name = el.value;
  }

  private onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (this.pending || this.pileView) {
      this.pending = null;
      this.pileView = null;
      this.render();
    }
  }

  private onHover(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
    if (!el) return;
    const from = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-card]');
    if (from === el) return;
    this.showPreview(el);
    if (!el.hasAttribute('disabled') || el.closest('.hand')) sound.hover();
  }

  private onHoverOut(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-card]');
    if (el && to !== el) this.preview.classList.remove('show');
  }

  /** Magnified, fully readable view of the hovered card. */
  private showPreview(el: HTMLElement) {
    const defId = el.dataset.card!;
    const cost = el.dataset.cost;
    this.preview.innerHTML = this.bigCard(defId, cost !== undefined ? Number(cost) : undefined);
    const r = el.getBoundingClientRect();
    const w = 300, h = 420, gap = 18;
    let left = r.right + gap;
    if (left + w > window.innerWidth - 8) left = r.left - gap - w;
    if (left < 8) left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    let top = r.top + r.height / 2 - h / 2;
    top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
    // If it would cover the card itself (no room either side), sit above it instead.
    if (left < r.right && left + w > r.left) top = Math.max(8, r.top - h - gap);
    this.preview.style.left = `${left}px`;
    this.preview.style.top = `${top}px`;
    this.preview.classList.add('show');
  }

  private onClick(e: MouseEvent) {
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
      case 'menu':
        this.screen = 'menu';
        this.pending = null;
        if (this.aiTimer !== null) window.clearTimeout(this.aiTimer);
        return this.render();
      case 'reveal':
        this.revealedFor = s ? activePlayer(s).id : null;
        this.render();
        return this.dealOpening();
      case 'toggle-log':
        this.showLog = !this.showLog;
        return this.render();
      case 'toggle-sound':
        sound.toggleMute();
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
        this.pileView = arg as 'deck' | 'discard';
        return this.render();
      case 'cancel':
        this.pending = null;
        this.pileView = null;
        return this.render();
    }

    if (!s || !this.canAct()) return;
    const me = activePlayer(s);

    switch (act) {
      case 'play': {
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
    this.root.querySelector('.log-list')?.scrollTo({ top: 1e9 });
    this.fitHand();
    // Elements were replaced: keep the preview only if the pointer is still over a card.
    const under = document.elementFromPoint(this.pointer.x, this.pointer.y)?.closest<HTMLElement>('[data-card]');
    if (under && this.root.contains(under)) this.showPreview(under);
    else this.preview.classList.remove('show');
  }

  /** Overlap hand cards like a fan when they don't fit side by side. */
  private fitHand() {
    const hand = this.root.querySelector<HTMLElement>('.hand');
    if (!hand) return;
    const cards = [...hand.querySelectorAll<HTMLElement>(':scope > .card')];
    if (cards.length < 2) return;
    const gap = 12;
    const w = cards[0].offsetWidth;
    const need = cards.length * w + (cards.length - 1) * gap;
    const overlap = Math.max(0, (need - hand.clientWidth) / (cards.length - 1));
    cards.forEach((c, i) => {
      if (i > 0) c.style.marginLeft = overlap ? `${-overlap}px` : '';
    });
  }

  private renderMenu(): string {
    const hasSave = loadSave() !== null;
    const seats = this.seats
      .map((seat, i) => {
        const locked = i < BALANCE.minPlayers;
        return `
        <div class="seat ${seat.enabled ? '' : 'seat-off'}">
          <button class="pill-btn" data-act="seat-toggle" data-arg="${i}" ${locked ? 'disabled' : ''}>
            ${seat.enabled ? '●' : '○'} seat ${i + 1}
          </button>
          <input data-seat-name="${i}" value="${esc(seat.name)}" maxlength="18" ${seat.enabled ? '' : 'disabled'} />
          <button class="pill-btn" data-act="seat-ai" data-arg="${i}" ${seat.enabled ? '' : 'disabled'}>
            ${seat.isAI ? 'ai' : 'human'}
          </button>
        </div>`;
      })
      .join('');

    return `
    <main class="menu">
      ${petalBackdrop()}
      <div class="title-block">
        <div class="title-sun"></div>
        <h1>blue loop</h1>
        <p class="tagline">•cool your star · ignite theirs•</p>
      </div>
      <section class="glass menu-panel">
        <div class="bar-title">new game</div>
        <div class="menu-body">
          ${seats}
          <div class="menu-actions">
            <button class="btn-primary" data-act="new-game">launch</button>
            ${hasSave ? '<button class="btn" data-act="continue">continue</button>' : ''}
          </div>
        </div>
      </section>
      <section class="glass menu-panel">
        <div class="bar-title">how to play</div>
        <ul class="rules">
          <li>Every sun starts at <b>0</b>. At <b>${BALANCE.supernovaAt}</b> it goes supernova and that player is out. The last sun standing wins.</li>
          <li>Play cards for money. Spend it on <b>Solar Flare</b> to heat an enemy sun, or <b>Thermosiphon</b> to cool your own (down to ${BALANCE.minHeat}), as often as you can afford.</li>
          <li><b>Command</b> cards upgrade your actions or planets. Solar Flare has 3 upgrade slots (up to 4 heat). Thermosiphon has 1 (up to 2 cooling).</li>
          <li>Buy stronger cards from the display, and complete objectives to earn more Command cards.</li>
          <li>The stability bar drains by one every round. When it empties, <b>Stellar Instability</b> heats every sun at the start of each turn.</li>
        </ul>
      </section>
      <footer class="studio">coronal mass games · prototype build</footer>
    </main>`;
  }

  private renderGame(): string {
    const s = this.state!;
    return `
      <main class="game">
        ${petalBackdrop()}
        ${this.renderHud()}
        ${this.renderRivals()}
        ${this.renderDisplay()}
        ${this.renderDock()}
        ${this.renderStage()}
        ${this.showLog ? this.renderLog() : ''}
        ${this.renderOverlay(s)}
      </main>`;
  }

  private renderHud(): string {
    const s = this.state!;
    const active = activePlayer(s);
    const me = this.viewer();
    const mine = active.id === me.id && !active.isAI;
    const core = ((me.heat - BALANCE.minHeat) / (BALANCE.supernovaAt - BALANCE.minHeat)) * 100;
    const avatars = s.players
      .map(
        (p) => `
        <div class="avatar ${p.id === active.id ? 'avatar-active' : ''}" title="${esc(p.name)} · ${esc(systemDef(p.systemId).name)} · sun ${p.heat}">
          ${sunOrb({ heat: p.heat, systemId: p.systemId, size: 38, dead: p.eliminated })}
        </div>`,
      )
      .join('');

    // Stability drains one segment per completed round; empty means instability.
    const total = BALANCE.instabilityStartsRound - 1;
    const remaining = Math.max(0, total - (s.round - 1));
    const instab = instabilityHeat(s);
    const segments = Array.from({ length: total }, (_, i) => `<i class="${i < remaining ? 'on' : ''}"></i>`).join('');
    const globals = s.globals
      .filter((g) => g.turnsRemaining > 0)
      .map((g) => `<span class="global" title="${esc(GLOBALS[g.id].text)} (${g.turnsRemaining} turns left)">${esc(GLOBALS[g.id].name.toLowerCase())}</span>`)
      .join('');

    const feed = s.log
      .slice(-3)
      .map((l, i, all) => `<div class="feed-line ${i === all.length - 1 ? 'feed-new' : ''}">${esc(l.text)}</div>`)
      .join('');

    const aiTurn = active.isAI && !isGameOver(s);
    return `
      <header class="hud">
        <div class="hud-left">
          <div class="round-badge">
            <button class="numeral" data-act="menu" title="Round ${s.round} · back to menu">${roman(s.round)}</button>
            <div class="core-bar" title="Your sun: ${me.heat} (supernova at ${BALANCE.supernovaAt})">
              <div class="core-fill" style="width:${core}%"></div>
              <span>core ${me.heat} / ${BALANCE.supernovaAt}</span>
            </div>
          </div>
          <div class="stability ${instab ? 'unstable' : ''}" title="${instab
            ? `Stellar Instability: every sun heats by ${instab} at the start of its turn.`
            : `Drains by one each round. When empty, every sun heats at the start of its turn.`}">
            <span class="stability-label">${instab ? `instability +${instab}` : `stability ${remaining}`}</span>
            <div class="stability-bar">${segments}</div>
          </div>
          ${globals ? `<div class="globals">${globals}</div>` : ''}
        </div>
        <div class="turn-block">
          <div class="turn-pill ${mine ? 'turn-mine' : ''}">•${mine ? 'your turn' : `${esc(active.name.toLowerCase())}'s turn`}•</div>
          <div class="feed">${feed}</div>
        </div>
        <div class="hud-right">
          <div class="players-panel glass-dark">
            <div class="players-title">players</div>
            <div class="avatars">${avatars}</div>
          </div>
          <div class="hud-controls">
            <button class="pill-btn" data-act="toggle-sound" title="Sound">${sound.muted ? 'sound off' : 'sound on'}</button>
            <button class="pill-btn" data-act="speed" title="How fast AI turns play">ai: ${this.speed}</button>
            <button class="pill-btn" data-act="toggle-log">log</button>
            ${aiTurn ? '<button class="pill-btn pill-strong" data-act="skip-ai" title="Resolve AI turns instantly">skip ai ›</button>' : ''}
          </div>
        </div>
      </header>`;
  }

  private renderRivals(): string {
    const s = this.state!;
    const me = this.viewer();
    const active = activePlayer(s);
    const rivals = s.players.filter((p) => p.id !== me.id);
    return `
      <section class="rivals">
        ${rivals
          .map((p) => {
            const sys = systemDef(p.systemId);
            return `
            <article class="rival ${p.id === active.id ? 'rival-active' : ''} ${p.eliminated ? 'rival-dead' : ''}">
              <div class="orb-anchor" data-anchor="player:${p.id}">${sunOrb({ heat: p.heat, systemId: p.systemId, size: 76, dead: p.eliminated })}</div>
              <div class="rival-info">
                <div class="rival-name">${esc(p.name)}${p.isAI ? ' <span class="tag">ai</span>' : ''}</div>
                <div class="rival-sys" title="${esc(sys.abilityName)}: ${esc(sys.abilityText)}">${esc(sys.name.toLowerCase())}</div>
                <div class="rival-stats">
                  <span title="Shields">⛨ ${p.shields}</span>
                  <span title="Solar Flare heat">▲ ${flareHeat(p)}</span>
                  <span title="Thermosiphon cooling">▼ ${thermoCool(p)}</span>
                  <span title="Cards in hand / deck / discard">▤ ${p.hand.length}·${p.deck.length}·${p.discard.length}</span>
                  ${p.claimedObjectives.length ? `<span title="Objectives">★ ${p.claimedObjectives.length}</span>` : ''}
                </div>
              </div>
            </article>`;
          })
          .join('')}
      </section>`;
  }

  private renderDisplay(): string {
    const s = this.state!;
    const me = activePlayer(s);
    return `
      <section class="display">
        <div class="section-label" data-anchor="market">•display• <span>${s.marketDeck.length} in deck</span></div>
        <div class="cards">${s.display
          .map((c, i) => (c ? this.renderCard(c, { slot: i, buyer: me }) : '<div class="card card-empty"></div>'))
          .join('')}</div>
      </section>`;
  }

  private renderObjectives(viewer: PlayerState): string {
    const s = this.state!;
    return s.objectives
      .map((id) => {
        const o = objectiveDef(id);
        const claimers = s.players.filter((p) => p.claimedObjectives.includes(id));
        const mine = viewer.claimedObjectives.includes(id);
        return `
          <div class="objective ${mine ? 'obj-mine' : ''}" data-anchor="obj:${id}" tabindex="0">
            ${objectiveGlyph(id)}
            ${claimers.length && !mine ? `<span class="obj-count">${claimers.length}</span>` : ''}
            <div class="popover">
              <b>${esc(o.name.toLowerCase())}</b>
              <p>${esc(o.text)}</p>
              <p class="muted">Reward: a Command Directive. Each player can complete it once.</p>
              ${claimers.length ? `<p class="claimed">✓ ${claimers.map((p) => esc(p.name)).join(', ')}</p>` : ''}
            </div>
          </div>`;
      })
      .join('');
  }

  private renderDock(): string {
    const s = this.state!;
    const me = this.viewer();
    const sys = systemDef(me.systemId);
    const act = this.canAct();
    const busy = this.pending !== null;
    const hidden = this.needsHandoff();

    const planets = me.planets
      .map((pl) => {
        const pips = Array.from({ length: BALANCE.maxPlanetLevel }, (_, i) => `<i class="${i < pl.level ? 'on' : ''}"></i>`).join('');
        const total = trackLevel(me, pl.track);
        return `
          <div class="planet track-${pl.track}" data-anchor="upgrade:${pl.id}" tabindex="0">
            ${TRACK_ICON[pl.track]} ${esc(pl.name.toLowerCase())}<span class="pips">${pips}</span>
            <div class="popover">
              <b>${esc(pl.name.toLowerCase())} · ${pl.track} · level ${pl.level}/${BALANCE.maxPlanetLevel}</b>
              <p>All your ${pl.track} planets together (level ${total}): ${planetEffect(pl.track, total)}.</p>
              ${pl.level < BALANCE.maxPlanetLevel ? `<p class="muted">Upgrade with a Command card.</p>` : ''}
            </div>
          </div>`;
      })
      .join('');

    const fc = flareCost(s, me);
    const tc = thermoCost(me);
    const tiles = `
      <div data-anchor="upgrade:thermosiphon">${actionTile({ action: 'thermosiphon', upgrades: me.upgrades.thermosiphon, cost: tc, power: thermoCool(me), enabled: act && !busy && me.money >= tc && me.heat > BALANCE.minHeat })}</div>
      <div data-anchor="upgrade:solarFlare">${actionTile({ action: 'solarFlare', upgrades: me.upgrades.solarFlare, cost: fc, power: flareHeat(me), enabled: act && !busy && me.money >= fc })}</div>`;

    const hasMoneyCards = me.hand.some((c) => cardDef(c.defId).effects.every((e) => e.type === 'money'));
    const hand = hidden ? '<div class="hand-hidden">hand hidden</div>' : me.hand.map((c) => this.renderCard(c, { hand: true })).join('');
    // Group repeats ("stardust ×5"); the first copy carries the uid so it animates.
    const groups = new Map<string, CardInstance[]>();
    for (const c of me.inPlay) groups.set(c.defId, [...(groups.get(c.defId) ?? []), c]);
    const played = [...groups.values()].map((cs) => this.renderMini(cs[cs.length - 1], cs.length)).join('');

    const pile = (kind: 'deck' | 'discard', count: number) => `
      <button class="pile pile-${kind} ${count ? '' : 'pile-empty'}" data-anchor="${kind}" data-act="view-pile" data-arg="${kind}" title="View your ${kind}">
        <div class="pile-stack">${count ? '<i></i><i></i><i></i>' : ''}</div>
        <span class="pile-count">${count}</span>
        <span class="pill">•${kind}•</span>
      </button>`;

    return `
      <section class="dock">
        <div class="home-col">
          <div class="objectives-row" title="Objectives">${this.renderObjectives(me)}</div>
          <div class="home glass">
            <div class="orb-anchor" data-anchor="player:${me.id}">${sunOrb({ heat: me.heat, systemId: me.systemId, size: 96, dead: me.eliminated })}</div>
            <div class="home-info">
              <div class="home-name">${esc(me.name)}</div>
              <div class="home-sys" title="${esc(sys.abilityText)}">${esc(sys.name.toLowerCase())} · <i>${esc(sys.abilityName.toLowerCase())}</i></div>
              <div class="home-stats">
                <span title="Shields">⛨ ${me.shields}</span>
                <span title="Income per turn">◈ +${incomeFor(me)}</span>
                <span title="Hand size">✋ ${handSizeFor(me)}</span>
                ${shieldPierce(me) ? `<span title="Shield pierce">⚔ ${shieldPierce(me)}</span>` : ''}
              </div>
              <div class="planets">${planets}</div>
            </div>
          </div>
        </div>
        ${pile('deck', me.deck.length)}
        <div class="actions">${tiles}</div>
        <div class="hand-zone">
          <div class="hand-bar">
            <div class="money" title="Money this turn">◈ ${me.money}</div>
            <button class="btn" data-act="play-all" ${act && hasMoneyCards && !busy ? '' : 'disabled'} title="Play every plain money card in your hand">play money</button>
            <div class="in-play">${played}</div>
          </div>
          <div class="cards hand">${hand}</div>
        </div>
        ${pile('discard', me.discard.length)}
        <button class="btn-primary end-turn" data-act="end-turn" ${act && !busy ? '' : 'disabled'}>end turn</button>
      </section>`;
  }

  private renderCard(c: CardInstance, opts: { slot?: number; hand?: boolean; buyer?: PlayerState; static?: boolean }): string {
    const def = cardDef(c.defId);
    const act = this.canAct() && !this.pending;
    let attrs = 'disabled';
    let cost = '';
    let costAttr = '';
    if (opts.slot !== undefined && opts.buyer) {
      const price = marketCost(opts.buyer, c.defId);
      if (act && opts.buyer.money >= price) attrs = `data-act="buy" data-arg="${opts.slot}"`;
      cost = `<span class="coin ${price < def.cost ? 'coin-discount' : ''}">${price}</span>`;
      costAttr = `data-cost="${price}"`;
    } else if (opts.hand && act) {
      attrs = `data-act="play" data-arg="${c.uid}"`;
    }
    return `
      <button class="card kind-${def.kind}" ${opts.static ? '' : `data-uid="${c.uid}"`} data-card="${def.id}" ${costAttr} ${attrs} style="--kc:${KIND_COLOUR[def.kind]}">
        <div class="card-glyph">${cardGlyph(def.id, def.kind)}</div>
        ${cost}
        <div class="card-name">${esc(def.name.toLowerCase())}</div>
        <div class="card-text">${esc(def.text)}</div>
        <div class="card-kind">•${def.kind === 'basic' ? 'money' : def.kind}•</div>
      </button>`;
  }

  /** Small card for the "in play" strip. */
  private renderMini(c: CardInstance, count = 1): string {
    const def = cardDef(c.defId);
    return `
      <div class="mini kind-${def.kind}" data-uid="${c.uid}" data-card="${def.id}" style="--kc:${KIND_COLOUR[def.kind]}">
        ${cardGlyph(def.id, def.kind)}
        ${count > 1 ? `<b>×${count}</b>` : ''}
      </div>`;
  }

  /** The magnified hover view. */
  private bigCard(defId: string, cost?: number): string {
    const def = cardDef(defId);
    const shownCost = cost ?? def.cost;
    return `
      <div class="card card-big kind-${def.kind}" style="--kc:${KIND_COLOUR[def.kind]}">
        <div class="card-glyph">${cardGlyph(def.id, def.kind)}</div>
        ${shownCost > 0 ? `<span class="coin ${shownCost < def.cost ? 'coin-discount' : ''}">${shownCost}</span>` : ''}
        <div class="card-name">${esc(def.name.toLowerCase())}</div>
        <div class="card-text">${esc(def.text)}</div>
        <div class="card-kind">•${def.kind === 'basic' ? 'money' : def.kind}•</div>
      </div>`;
  }

  private renderStage(): string {
    const st = this.stage;
    const s = this.state!;
    if (!st || isGameOver(s)) return '';
    const actor = s.players.find((p) => p.id === st.actorId)!;
    const target = st.targetId ? s.players.find((p) => p.id === st.targetId) : undefined;
    const card = { uid: st.uid, defId: st.defId };
    return `
      <div class="stage">
        <div class="stage-caption">${esc(actor.name.toLowerCase())} ${st.verb}${target ? ` · targeting ${esc(target.name.toLowerCase())}` : ''}</div>
        ${this.renderCard(card, {})}
      </div>`;
  }

  private renderLog(): string {
    const s = this.state!;
    return `
      <aside class="log-drawer glass">
        <button class="bar-title bar-btn" data-act="toggle-log">log · close</button>
        <div class="log-list">${s.log.slice(-120).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>
      </aside>`;
  }

  private renderPile(kind: 'deck' | 'discard'): string {
    const me = this.viewer();
    if (kind === 'deck') {
      // The draw order is secret: show what is in the deck, grouped and sorted.
      const counts = new Map<string, number>();
      for (const c of me.deck) counts.set(c.defId, (counts.get(c.defId) ?? 0) + 1);
      const rows = [...counts.entries()]
        .sort((a, b) => cardDef(a[0]).name.localeCompare(cardDef(b[0]).name))
        .map(([defId, n]) => `<div class="pile-card">${this.renderCard({ uid: defId, defId }, { static: true })}<span class="pile-n">×${n}</span></div>`)
        .join('');
      return `
        <div class="bar-title">your deck · ${me.deck.length} cards</div>
        <div class="modal-body">
          <p class="muted center-text">Draw order is hidden. When your deck runs out, your discard pile is shuffled to form a new one.</p>
          <div class="pile-grid">${rows || '<p class="muted">Your deck is empty.</p>'}</div>
        </div>`;
    }
    const rows = [...me.discard]
      .reverse()
      .map((c) => `<div class="pile-card">${this.renderCard(c, { static: true })}</div>`)
      .join('');
    return `
      <div class="bar-title">your discard pile · ${me.discard.length} cards</div>
      <div class="modal-body">
        <p class="muted center-text">Most recent first.</p>
        <div class="pile-grid">${rows || '<p class="muted">Your discard pile is empty.</p>'}</div>
      </div>`;
  }

  private renderOverlay(s: GameState): string {
    const winner = s.players.find((p) => p.id === s.winnerId);
    if (winner) {
      return `
        <div class="overlay"><div class="modal">
          <div class="bar-title">supernova cascade complete</div>
          <div class="modal-body center">
            ${sunOrb({ heat: winner.heat, systemId: winner.systemId, size: 120 })}
            <h2>${esc(winner.name)} wins</h2>
            <p>${esc(systemDef(winner.systemId).name)} is the last sun standing after ${s.round} rounds.</p>
            <button class="btn-primary" data-act="menu">back to menu</button>
          </div>
        </div></div>`;
    }
    if (this.needsHandoff()) {
      const p = activePlayer(s);
      return `
        <div class="overlay"><div class="modal">
          <div class="bar-title">pass to ${esc(p.name.toLowerCase())}</div>
          <div class="modal-body center">
            <p>Hand the controls to ${esc(p.name)}, then reveal your hand.</p>
            <button class="btn-primary" data-act="reveal">reveal hand</button>
          </div>
        </div></div>`;
    }
    if (this.pileView) {
      return `
        <div class="overlay overlay-soft" data-act="cancel"><div class="modal modal-wide modal-pile">
          ${this.renderPile(this.pileView)}
          <button class="modal-cancel" data-act="cancel">close · esc</button>
        </div></div>`;
    }
    const pend = this.pending;
    if (!pend) return '';
    const me = activePlayer(s);

    if (pend.kind === 'flare' || pend.need === 'target') {
      const title = pend.kind === 'flare' ? 'select solar flare target' : `select ${cardDef(me.hand.find((c) => c.uid === pend.uid)!.defId).name.toLowerCase()} target`;
      const foes = livingOpponents(s, me)
        .map(
          (p) => `
          <button class="target" data-act="target" data-arg="${p.id}">
            ${sunOrb({ heat: p.heat, systemId: p.systemId, size: 96 })}
            <span class="target-name">${esc(p.name.toLowerCase())}</span>
            <span class="target-meta">⛨ ${p.shields}</span>
          </button>`,
        )
        .join('');
      return `
        <div class="overlay overlay-soft" data-act="cancel"><div class="modal modal-wide">
          <div class="bar-title">${esc(title)}</div>
          <div class="modal-body targets">${foes}</div>
          <button class="modal-cancel" data-act="cancel">cancel · esc</button>
        </div></div>`;
    }

    // Upgrade choice for a Command card.
    const options = upgradeOptions(me);
    const actionChoices = (['solarFlare', 'thermosiphon'] as const)
      .map((a) => {
        const available = options.includes(a);
        return actionTile({
          action: a,
          upgrades: me.upgrades[a],
          cost: a === 'solarFlare' ? flareCost(s, me) : thermoCost(me),
          power: a === 'solarFlare' ? flareHeat(me) : thermoCool(me),
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
        const after = trackLevel(me, pl.track) + 1;
        return `
          <button class="planet planet-choice track-${pl.track}" ${available ? `data-act="upgrade" data-arg="${pl.id}"` : 'disabled'}>
            <span>${TRACK_ICON[pl.track]} ${esc(pl.name.toLowerCase())}<span class="pips">${pips}</span></span>
            <small>${available ? `→ ${planetEffect(pl.track, after)}` : 'max level'}</small>
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
        <button class="modal-cancel" data-act="cancel">cancel · esc</button>
      </div></div>`;
  }
}
