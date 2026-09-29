import {
  ACTION_NAME,
  activeField,
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
import { actionChip, actionTile, roman, sunOrb, systemDiagram, systemOrrery3d } from './art';
import { backdrop } from './backdrop';
import { anchorRect, flyFrom, ghost, projectile, pulse, reducedMotion, snapshot, type Snapshot } from './fx';
import { cardGlyph, KIND_COLOUR, objectiveGlyph, rewardGlyph } from './glyphs';
import { sound } from './sound';
import { clearSave, loadSave, save } from './storage';
import { CampaignView, loadCampaign } from './campaign';
import { MENU_ICON } from './menu-icon';
import { factionAvatar } from './factions';

type Screen = 'menu' | 'game' | 'campaign';
type MenuPage = 'title' | 'hub' | 'quickplay' | 'options';

const HUB_ICONS = {
  campaign: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 34 22 26 36 32M22 26 26 12 36 32M10 34 14 16 26 12"/><circle cx="10" cy="34" r="3.2"/><circle cx="22" cy="26" r="2.6"/><circle cx="36" cy="32" r="3.6"/><circle cx="26" cy="12" r="3"/><circle cx="14" cy="16" r="2.4"/></svg>`,
  quickplay: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="24" r="8"/><circle cx="36" cy="24" r="4.5"/><path d="M26 24h4M27.5 20.5 31 24l-3.5 3.5"/></svg>`,
  options: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 15h28M10 24h28M10 33h28"/><circle cx="18" cy="15" r="3.2"/><circle cx="31" cy="24" r="3.2"/><circle cx="22" cy="33" r="3.2"/></svg>`,
};
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
  /** A player's solar system card. */
  | { kind: 'system'; playerId: string }
  /** Game-start choice between two offered systems (or peeking at a rival's). */
  | { kind: 'draft'; view?: string }
  | { kind: 'objective'; id: string }
  | { kind: 'field' }
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
  chooseSystem: 600,
};
const TOAST_MS = 2600;
/** The card whose glyph represents each field. */
const FIELD_CARD: Record<string, string> = {
  solarStorm: 'solar_storm',
  iceAge: 'ice_age',
  tradeBoom: 'trade_boom',
  magneticStorm: 'magnetic_storm',
  solarMaximum: 'solar_maximum',
  nebulaDrift: 'nebula_drift',
};
const LONG_PRESS_MS = 450;
const TRACK_ICON: Record<string, string> = { weapons: '⚔', defences: '⛨', economy: '◈', resources: '⬢' };
/** Log lines worth emphasising: hits, supernovas, claims, upgrades and so on. */
const KEY_LOG = /heats to|SUPERNOVA|completes|claims|takes the reward|upgrades|wins|shields absorb|Instability|brings/;
const HOT = '#f0a07a';

const ACTION_TEXT: Record<CoreAction, string> = {
  solarFlare: `Spend money to heat an enemy sun. Deals 1 heat for ${BALANCE.solarFlareCost} money; each upgrade adds +1 heat and +${BALANCE.solarFlareCostPerUpgrade} cost (max ${1 + BALANCE.solarFlareMaxUpgrades} heat). Use as often as you can afford.`,
  thermosiphon: `Spend money to cool your own sun. Cools 1, +1 per upgrade (max ${1 + BALANCE.thermosiphonMaxUpgrades}). Use as often as you can afford.`,
  coolingChamber: `Passive. Each upgrade raises your max health (the heat at which your sun goes supernova) by ${BALANCE.coolingChamberHealthPerUpgrade}, from ${BALANCE.supernovaAt} up to ${BALANCE.supernovaAt + BALANCE.coolingChamberMaxUpgrades * BALANCE.coolingChamberHealthPerUpgrade}.`,
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What a planet's track does at a given level, in plain words. */
function planetEffect(track: Planet['track'], level: number): string {
  switch (track) {
    case 'economy':
      return `+${level * BALANCE.economyIncomePerLevel} money at the start of each turn`;
    case 'defences':
      return `+${plural(level * BALANCE.shieldsPerDefenceLevel, 'shield')} each turn`;
    case 'weapons':
      return `your heat ignores ${plural(level * BALANCE.piercePerWeaponLevel, 'enemy shield')}`;
    case 'resources':
      return `+${plural(level * BALANCE.resourceCardsPerLevel, 'card')} in hand`;
  }
}

interface MenuSeat {
  name: string;
  isAI: boolean;
  enabled: boolean;
}

export class App {
  private screen: Screen = 'menu';
  /** Which page of the front end is showing: title → hub (campaign · quickplay · options) → setup. */
  private menuPage: MenuPage = 'title';
  private state: GameState | null = null;
  private pending: Pending | null = null;
  private stage: Stage | null = null;
  /** Second step of a reward that needs a choice (what to upgrade, which card). */
  private rewardStep: 'command' | 'requisition' | null = null;
  private sheet: Sheet | null = null;
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
  /** Whose home system sits in the dock: the current or most recent human. */
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
    window.addEventListener('pointerdown', (e) => {
      sound.unlock();
      this.touch = e.pointerType === 'touch';
    }, { capture: true });
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
      .map((s, seat) => ({ name: s.name.trim() || 'Unnamed', isAI: s.isAI, enabled: s.enabled, species: seat }))
      .filter((s) => s.enabled)
      .map(({ enabled: _enabled, ...p }) => p);
    this.begin(createGame({ seed: (Math.random() * 2 ** 31) | 0, players, draft: true }));
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
    this.persist(state);
    this.syncViewer();
    this.render();
    if (state.phase === 'setup') this.startDraft();
    else {
      this.dealOpening();
      this.announceTurn(400);
    }
    this.scheduleAI(900);
  }

  /**
   * System choice: the board is shown first, then a "select solar system"
   * banner, then the two offered systems.
   */
  private startDraft() {
    const s = this.state;
    if (!s || s.phase !== 'setup' || this.needsHandoff()) return;
    const p = activePlayer(s);
    if (p.isAI || p.id !== this.viewer().id) return;
    this.showBanner('select solar system', s.players.filter((pl) => !pl.isAI).length > 1 ? p.name : 'choose one of two', 500);
    window.setTimeout(() => {
      if (this.state?.phase === 'setup' && activePlayer(this.state).id === p.id) {
        this.sheet = { kind: 'draft' };
        this.render();
      }
    }, 2300);
  }

  /**
   * "Your turn" banner: a soft bloom across the middle of the screen whenever
   * play comes back to a human who can see their hand. Lives outside the
   * re-rendered root so it survives state changes.
   */
  private announceTurn(delay = 0) {
    const s = this.state;
    if (!s || isGameOver(s) || this.needsHandoff() || s.phase === 'setup') return;
    const p = activePlayer(s);
    if (p.isAI || p.id !== this.viewer().id) return;
    const humans = s.players.filter((pl) => !pl.isAI).length;
    this.showBanner('your turn', humans > 1 ? p.name : `round ${roman(s.round)}`, delay);
  }

  /** Large centred announcement (bloom, sweep, chord), outside the re-rendered root. */
  private showBanner(text: string, sub: string, delay = 0) {
    window.setTimeout(() => {
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
    if (animate) backdrop.spin();
    const turnPassed = activePlayer(prev).id !== activePlayer(next).id;
    this.state = next;
    this.pending = null;
    if (this.sheet?.kind === 'card' || action.type === 'chooseSystem') this.sheet = null;
    this.stage = actor.isAI ? this.stageFor(prev, actor, action) : null;
    this.persist(next);
    this.syncViewer();
    this.render();
    if (before) {
      this.surfaceLog(prev);
      this.animate(prev, next, action, actor, before);
    }
    if (action.type === 'chooseSystem') {
      if (next.phase === 'play') {
        this.dealOpening();
        this.announceTurn(300);
      } else this.startDraft(); // next human to choose (after the hand-off screen)
    } else if (turnPassed) this.announceTurn(450);
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
      if (old && el.parentElement?.classList.contains('hand')) {
        // A card already in hand that the fan moved: slide it along the fan, in the hand's own space.
        this.refan(el, old.html);
        return;
      }
      if (old) {
        const r = el.getBoundingClientRect();
        if (Math.abs(r.left - old.rect.left) > 2 || Math.abs(r.top - old.rect.top) > 2) flyFrom(el, old.rect);
        return;
      }
      if (inHand.has(uid)) {
        const delay = (endingTurn ? 420 : 60) + drawIndex * 110;
        this.dealCard(el, delay);
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
  private surfaceLog(prev: GameState) {
    // Only entries added by this action (state is cloned per action, so compare ids, not objects).
    const lastSeq = prev.log[prev.log.length - 1]?.seq ?? 0;
    // The log panel is always on screen, so new lines glow there instead of popping up as toasts.
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

  /** True when the viewer may act right now. */
  private canAct(): boolean {
    const s = this.state!;
    const me = activePlayer(s);
    return !me.isAI && me.id === this.viewer().id && !isGameOver(s) && !this.needsHandoff() && s.pendingRewards.length === 0 && s.phase !== 'setup';
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
    this.peekBtn.classList.toggle('show', open);
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
    // Zoomed cards sit at the middle right, clear of the hand and the display.
    this.preview.style.left = `${Math.min(window.innerWidth - w - 16, window.innerWidth * 0.78 - w / 2)}px`;
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
    if (act.startsWith('cmp-') && this.campaign.onClick(act, arg, el)) return;

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
        if (s?.phase === 'setup') return this.startDraft();
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
      case 'systems':
        this.sheet = { kind: 'system', playerId: this.viewer().id };
        return this.render();
      case 'draft-pick':
        return this.dispatch({ type: 'chooseSystem', systemId: arg });
      case 'draft-view':
        this.sheet = { kind: 'draft', view: arg || undefined };
        return this.render();
      case 'view-field':
        this.sheet = { kind: 'field' };
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
        if (this.sheet?.kind === 'draft') return; // a system must be chosen
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
    this.root.innerHTML = this.screen === 'menu' ? this.renderMenu() : this.screen === 'campaign' ? this.campaign.render() : this.renderGame();
    document.body.classList.toggle('screen-campaign', this.screen === 'campaign');
    // The rotating star lies on the battle board, under the display; elsewhere it fills the screen.
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

  private renderMenu(): string {
    const page = this.menuPage;
    const body = page === 'title' ? this.renderTitlePage() : page === 'hub' ? this.renderHub() : page === 'quickplay' ? this.renderQuickplay() : this.renderOptions();
    return `
    <main class="menu menu-${page} ${page === 'quickplay' || page === 'options' ? 'setup-page' : ''}">
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
  private setupPage(title: string, body: string, foot: string): string {
    return `
      <header class="setup-top">
        <button class="btn btn-small" data-act="menu-page" data-arg="hub">‹ back</button>
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
        return `
        <div class="seat-tile ${seat.enabled ? '' : 'seat-off'}">
          <button class="pill-btn seat-in" data-act="seat-toggle" data-arg="${i}" ${locked ? 'disabled' : ''}>${seat.enabled ? '● playing' : '○ empty'}</button>
          ${factionAvatar(`f${i + 1}`, 'seat-emblem')}
          <input data-seat-name="${i}" value="${esc(seat.name)}" maxlength="18" ${seat.enabled ? '' : 'disabled'} aria-label="Seat ${i + 1} name" />
          <button class="pill-btn" data-act="seat-ai" data-arg="${i}" ${seat.enabled ? '' : 'disabled'}>${seat.isAI ? 'ai' : 'human'}</button>
        </div>`;
      })
      .join('');
    return this.setupPage(
      'quickplay',
      `<div class="seat-row">${seats}</div>`,
      `${hasSave ? '<button class="btn" data-act="continue">continue game</button>' : ''}
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
        <li>Every sun starts at <b>0</b> with <b>${BALANCE.supernovaAt}</b> max health. Reach it and your sun goes supernova. The last sun standing wins.</li>
        <li>Play cards for money. Spend it on <b>Solar Flare</b> to heat an enemy sun, or <b>Thermosiphon</b> to cool your own (down to ${BALANCE.minHeat}), as often as you can afford.</li>
        <li><b>Command</b> cards upgrade an action or a planet. Solar Flare: 3 upgrades, each +1 heat and +1 cost (up to 4 heat for 5 money). Thermosiphon: 1 (up to 2 cooling). <b>Cooling Chamber</b>: 3 upgrades, +${BALANCE.coolingChamberHealthPerUpgrade} max health each (up to ${BALANCE.supernovaAt + 3 * BALANCE.coolingChamberHealthPerUpgrade}).</li>
        <li><b>Objectives</b> are shared: the first player to meet one claims it and picks a reward (each reward once per player). Buy <b>mission</b> cards for personal objectives: play one, meet its condition, and pick a reward.</li>
        <li>The stability bar drains by one each round. When it empties, <b>Stellar Instability</b> heats every sun at the start of each turn.</li>
      </ul>`;
  }

  private renderGame(): string {
    const s = this.state!;
    // The whole play area is a table seen in perspective; pop-ups, the played-card
    // stage and the rotate hint sit outside it so they stay flat and readable.
    return `
      <main class="table-view">
        <div class="game">
          ${this.renderTop()}
          ${this.renderDisplay()}
          ${this.renderLogPanel()}
          ${this.renderDock()}
        </div>
        ${this.hudHtml}
        ${this.renderStage()}
        ${this.renderOverlay(s)}
        <div class="rotate-hint"><div><h1 class="title">blue loop</h1><p>turn your device sideways to play</p></div></div>
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
   * Whoever's turn it is glows green.
   */
  private renderPlayers(): string {
    const s = this.state!;
    const active = activePlayer(s);
    const me = this.viewer();
    const playing = s.phase !== 'setup' && !isGameOver(s);
    const cards = [me, ...s.players.filter((p) => p.id !== me.id)]
      .map((p) => {
        const mine = p.id === me.id;
        const extras = mine
          ? ` · ◈+${incomeFor(p)} · ✋${handSizeFor(p)}${shieldPierce(p) ? ` · ⚔${shieldPierce(p)}` : ''}`
          : ` · ▲${flareHeat(p, s)}`;
        const tally = `${p.claimedObjectives.length ? ` · ★${p.claimedObjectives.length}` : ''}${p.missions.length ? ` · ◎${p.missions.length}` : ''}`;
        return `
        <button class="rival ${mine ? 'rival-me' : ''} ${playing && p.id === active.id ? 'rival-active' : ''} ${p.eliminated ? 'rival-dead' : ''}" data-act="view-system" data-arg="${p.id}" title="${esc(p.name)} · ${esc(systemDef(p.systemId).name)}${mine ? ' (you)' : ''}">
          <div class="orb-anchor" data-anchor="player:${p.id}">${sunOrb({ heat: p.heat, threshold: supernovaThreshold(p), size: 40, dead: p.eliminated })}</div>
          <div class="rival-info">
            <span class="rival-name">${esc(p.name.toLowerCase())}${mine ? '<i class="rival-you">you</i>' : ''}</span>
            <span class="rival-stats"><b><span data-heat-of="${p.id}">${p.heat}</span>/${supernovaThreshold(p)}</b><em>⛨<span data-shields-of="${p.id}">${p.shields}</span>${extras}${tally}</em></span>
          </div>
        </button>`;
      })
      .join('');
    return `<aside class="rivals">${cards}</aside>`;
  }

  private renderTop(): string {
    const s = this.state!;
    const active = activePlayer(s);
    const me = this.viewer();
    const field = activeField(s);
    const living = s.players.filter((p) => !p.eliminated).length;
    const globals = field
      ? `<button class="field" data-act="view-field" title="${esc(GLOBALS[field.id].text)}">
          ${cardGlyph(FIELD_CARD[field.id], 'global')}
          <span class="field-name">${esc(GLOBALS[field.id].name.toLowerCase())}</span>
          <span class="field-rounds">${Math.ceil(field.turnsRemaining / living)}</span>
        </button>`
      : '';

    const aiTurn = active.isAI && !isGameOver(s);
    // Off the table, flat: round and stability top centre; menu and turn controls top right.
    this.hudHtml = `
      <div class="hud">
        <div class="hud-players">${this.renderPlayers()}</div>
        <div class="hud-round">${this.renderRoundBar()}</div>
        <div class="hud-controls">
          ${globals}
          ${aiTurn ? '<button class="pill-btn" data-act="skip-ai" title="Resolve AI turns instantly">skip ›</button>' : ''}
          ${this.campaignBattle && !isGameOver(s) ? '<button class="pill-btn" data-act="campaign-auto" title="Let your commanders finish this battle">auto-resolve</button>' : ''}
          <button class="icon-btn" data-act="open-menu" aria-label="Menu">${MENU_ICON}</button>
        </div>
      </div>`;
    // On the table: objective pills along the top edge, from the left.
    return `<header class="top">${this.renderObjectivesRow(me)}</header>`;
  }

  /** The flat HUD above the table (built with the top row, rendered outside the tilted board). */
  private hudHtml = '';

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

  private renderDisplay(): string {
    const s = this.state!;
    const me = activePlayer(s);
    return `
      <section class="display">
        <div class="board3d">
          <div class="board-plane">
            <div class="board-floor"></div>
            <div class="board-star-slot"></div>
            <div class="cards">${s.display
              .map((c, i) => (c ? this.renderCard(c, { slot: i, buyer: me }) : '<div class="card card-empty"></div>'))
              .join('')}</div>
          </div>
        </div>
        <div class="section-label board-label" data-anchor="market">display <span>${s.marketDeck.length} left</span></div>
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
      <div data-anchor="upgrade:solarFlare">${actionChip({ action: 'solarFlare', upgrades: me.upgrades.solarFlare, cost: fc, power: flareHeat(me, s), enabled: act && !busy && me.money >= fc })}</div>
      <div data-anchor="upgrade:thermosiphon">${actionChip({ action: 'thermosiphon', upgrades: me.upgrades.thermosiphon, cost: tc, power: thermoCool(me), enabled: act && !busy && me.money >= tc && me.heat > BALANCE.minHeat })}</div>
      <div data-anchor="upgrade:coolingChamber">${actionChip({ action: 'coolingChamber', upgrades: me.upgrades.coolingChamber, power: max, enabled: true })}</div>`;

    const hasMoneyCards = me.hand.some((c) => cardDef(c.defId).effects.every((e) => e.type === 'money'));
    const hand = hidden ? '<div class="hand-hidden">hand hidden</div>' : me.hand.map((c) => this.renderCard(c, { hand: true })).join('');
    const groups = new Map<string, CardInstance[]>();
    for (const c of me.inPlay) groups.set(c.defId, [...(groups.get(c.defId) ?? []), c]);
    const played = [...groups.values()].map((cs) => this.renderMini(cs[cs.length - 1], cs.length)).join('');

    return `
      <section class="dock ${s.phase === 'setup' ? 'dock-setup' : ''}">
        <div class="command">
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
            <span class="obj-icon">${objectiveGlyph(id)}</span>
            <span class="obj-body"><span class="obj-name">${esc(o.name.toLowerCase())}</span><small class="obj-text">${esc(o.text)}</small></span>
            <div class="popover"><b>${esc(o.name.toLowerCase())}</b><p>${esc(o.text)}</p><p class="muted">First to meet it claims it.</p></div>
          </button>`;
      })
      .join('');
    const missions = me.missions
      .map((m) => {
        const o = objectiveDef(missionOf(m.defId));
        return `
          <button class="objective obj-mission" data-act="view-mission" data-arg="${m.uid}" data-player="${me.id}" style="--kc:${KIND_COLOUR.mission}">
            <span class="obj-icon">${cardGlyph(m.defId, 'mission')}</span>
            <span class="obj-body"><span class="obj-name">mission · ${esc(o.name.toLowerCase())}</span><small class="obj-text">${esc(o.text)}</small></span>
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
      const price = marketCost(opts.buyer, c.defId, this.state!);
      if ((act && opts.buyer.money >= price) || this.touch) attrs = `data-act="buy" data-arg="${opts.slot}"`;
      cost = `<span class="coin ${price < def.cost ? 'coin-discount' : ''}">${price}</span>`;
      costAttr += ` data-cost="${price}"`;
    } else if (opts.hand && (act || this.touch)) {
      attrs = `data-act="play" data-arg="${c.uid}"`;
    }
    // Display cards stay at full strength; affordability shows as a highlight (on your turn) or a muted price.
    let buyState = '';
    if (opts.slot !== undefined && opts.buyer) {
      buyState = opts.buyer.money >= marketCost(opts.buyer, c.defId, this.state!) ? (act ? 'card-affordable' : '') : 'card-pricey';
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
            <button class="btn" data-act="systems">solar systems</button>
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
      case 'draft':
        return this.renderDraft(sh.view);
      case 'field': {
        const f = activeField(s!);
        if (!f) return '';
        const setter = s!.players.find((p) => p.id === f.sourcePlayerId)!;
        const living = s!.players.filter((p) => !p.eliminated).length;
        return this.sheetFrame(
          esc(GLOBALS[f.id].name.toLowerCase()),
          `<div class="obj-sheet">${cardGlyph(FIELD_CARD[f.id], 'global')}<p>${esc(GLOBALS[f.id].text)}</p>
           <p class="muted">Applies to every player equally · ${Math.ceil(f.turnsRemaining / living)} round(s) left · played by ${esc(setter.name)}. Another global card replaces it.</p></div>`,
        );
      }
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
          cost = marketCost(me, sh.defId, s);
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

  /**
   * Solar system card: the player's system, ability, planets and progress,
   * with small tabs above it to flick between every player's system.
   */
  private renderSystemSheet(p: PlayerState): string {
    const s = this.state!;
    const me = this.viewer();
    const sys = systemDef(p.systemId);
    const tabs = [me, ...s.players.filter((o) => o.id !== me.id)]
      .map(
        (o) => `
        <button class="sys-tab ${o.id === p.id ? 'sys-tab-on' : ''} ${o.eliminated ? 'sys-tab-dead' : ''}" data-act="view-system" data-arg="${o.id}">
          ${sunOrb({ heat: o.heat, threshold: supernovaThreshold(o), size: 26, dead: o.eliminated, label: '' })}
          <span>${o.id === me.id ? 'you' : esc(o.name.toLowerCase())}</span>
        </button>`,
      )
      .join('');
    const planets = p.planets
      .map((pl) => {
        const pips = Array.from({ length: BALANCE.maxPlanetLevel }, (_, i) => `<i class="${i < pl.level ? 'on' : ''}"></i>`).join('');
        return `
          <div class="sys-planet">
            <span class="sys-planet-name">${TRACK_ICON[pl.track]} ${esc(pl.name.toLowerCase())}</span>
            <span class="pips">${pips}</span>
            <span class="sys-planet-effect">${pl.track} · ${pl.level ? planetEffect(pl.track, pl.level) : `each level: ${planetEffect(pl.track, 1)}`}</span>
          </div>`;
      })
      .join('');
    const ups = (['solarFlare', 'thermosiphon', 'coolingChamber'] as const)
      .map((a) => {
        const pips = Array.from({ length: MAX_UPGRADES[a] }, (_, i) => `<i class="${i < p.upgrades[a] ? 'on' : ''}"></i>`).join('');
        return `<span class="sys-up">${ACTION_NAME[a].toLowerCase()} <span class="pips">${pips}</span></span>`;
      })
      .join('');
    const whose = p.id === me.id ? 'your solar system' : `${esc(p.name.toLowerCase())}'s solar system`;
    return `
      <div class="overlay overlay-inspect" data-act="cancel">
        <div class="sys-wrap sheet">
          <div class="sys-tabs">${tabs}</div>
          <div class="sys-card">
            <div class="sys-kicker">${whose}</div>
            ${systemDiagram(p.planets)}
            <h2 class="sys-name">${esc(sys.name.toLowerCase())}</h2>
            <p class="sys-flavor">${esc(sys.flavor)}</p>
            <div class="sys-ability"><b>${esc(sys.abilityName.toLowerCase())}</b><span>+ ${esc(sys.abilityText)}</span><span class="sys-drawback">− ${esc(sys.drawbackText)}</span></div>
            ${p.conditions?.length ? `<div class="sys-conditions">${p.conditions.map((c) => `<div><b>${esc(c.name.toLowerCase())}</b>${esc(c.text)}</div>`).join('')}</div>` : ''}
            <div class="sys-planets">${planets}</div>
            <div class="sys-ups">${ups}</div>
            <div class="sys-stats">
              <span>heat ${p.heat}/${supernovaThreshold(p)}</span><span>⛨ ${p.shields}</span><span>◈ +${incomeFor(p)}/turn</span><span>✋ ${handSizeFor(p)}</span>
              ${p.rewards.length ? `<span>rewards: ${p.rewards.map((r) => esc(rewardDef(r).name.toLowerCase())).join(', ')}</span>` : ''}
              ${p.missions.length ? `<span>missions: ${p.missions.map((m) => esc(objectiveDef(missionOf(m.defId)).name.toLowerCase())).join(', ')}</span>` : ''}
            </div>
            <button class="modal-cancel" data-act="cancel">close</button>
          </div>
        </div>
      </div>`;
  }

  /** The two offered systems side by side, with tabs to peek at rivals' chosen systems. */
  private renderDraft(view?: string): string {
    const s = this.state!;
    const me = activePlayer(s);
    if (!me.systemOffers) return '';
    const rivals = s.players.filter((p) => p.id !== me.id);
    const tabs = [
      `<button class="sys-tab ${!view ? 'sys-tab-on' : ''}" data-act="draft-view" data-arg=""><span>your options</span></button>`,
      ...rivals.map(
        (o) => `<button class="sys-tab ${view === o.id ? 'sys-tab-on' : ''}" data-act="draft-view" data-arg="${o.id}" ${o.systemOffers ? 'disabled' : ''}>
          ${sunOrb({ heat: o.heat, threshold: supernovaThreshold(o), size: 26, label: '' })}<span>${esc(o.name.toLowerCase())}</span></button>`,
      ),
    ].join('');
    const card = (sysId: string, pick: boolean) => {
      const sys = systemDef(sysId);
      const planets = sys.planets
        .map((pl) => `<div class="sys-planet"><span class="sys-planet-name">${TRACK_ICON[pl.track]} ${esc(pl.name.toLowerCase())}</span><span class="sys-planet-effect">${pl.track}${pl.level ? ` · starts at level ${pl.level}` : ''}</span></div>`)
        .join('');
      return `
        <div class="sys-card draft-card">
          ${systemOrrery3d(sys.planets)}
          <h2 class="sys-name">${esc(sys.name.toLowerCase())}</h2>
          <p class="sys-flavor">${esc(sys.flavor)}</p>
          <div class="sys-ability"><b>${esc(sys.abilityName.toLowerCase())}</b><span>+ ${esc(sys.abilityText)}</span><span class="sys-drawback">− ${esc(sys.drawbackText)}</span></div>
          <div class="sys-planets">${planets}</div>
          ${pick ? `<button class="btn-primary sys-begin" data-act="draft-pick" data-arg="${sys.id}">choose</button>` : '<div class="sys-spacer"></div>'}
        </div>`;
    };
    const rival = view ? s.players.find((p) => p.id === view) : undefined;
    const body = rival
      ? `<div class="draft-cards draft-one"><div class="sys-kicker">${esc(rival.name.toLowerCase())}'s solar system</div>${card(rival.systemId, false)}</div>`
      : `<div class="draft-cards">${me.systemOffers!.map((id) => card(id, true)).join('')}</div>`;
    return `
      <div class="overlay overlay-inspect overlay-draft">
        <div class="sys-wrap draft-wrap sheet">
          <div class="sys-tabs">${tabs}</div>
          ${body}
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
            power: a === 'solarFlare' ? flareHeat(me, s) : a === 'thermosiphon' ? thermoCool(me) : supernovaThreshold(me),
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
          power: a === 'solarFlare' ? flareHeat(me, s) : a === 'thermosiphon' ? thermoCool(me) : supernovaThreshold(me),
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
