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
  upgradeOptions,
  type Action,
  type CardInstance,
  type GameState,
  type PlayerSetup,
  type PlayerState,
} from '../engine';
import { actionTile, petalBackdrop, roman, sunOrb } from './art';
import { clearSave, loadSave, save } from './storage';

type Screen = 'menu' | 'game';

/** A flare or card waiting for the player to pick a target or an upgrade. */
type Pending =
  | { kind: 'flare' }
  | { kind: 'card'; uid: string; need: 'target' | 'upgrade' };

interface Toast {
  text: string;
  tone: 'info' | 'error';
  id: number;
}

const AI_STEP_MS = 520;
const TOAST_MS = 2600;
const TRACK_ICON: Record<string, string> = { weapons: '⚔', defences: '⛨', economy: '◈', resources: '⬢' };
const TRACK_TEXT: Record<string, string> = {
  weapons: 'Your heat ignores 1 enemy shield per 2 weapon levels.',
  defences: '+1 shield each turn per 2 defence levels.',
  economy: '+1 money each turn per level.',
  resources: '+1 hand size per 2 resource levels.',
};
/** Log lines worth surfacing as a toast. */
const TOAST_PATTERN = /heats to|SUPERNOVA|completes|upgrades|wins|shields absorb|Instability/;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface MenuSeat {
  name: string;
  isAI: boolean;
  enabled: boolean;
}

export class App {
  private screen: Screen = 'menu';
  private state: GameState | null = null;
  private pending: Pending | null = null;
  private toast: Toast | null = null;
  private toastSeq = 0;
  private aiTimer: number | null = null;
  private showLog = false;
  /** Human player whose hand was last revealed (for hot-seat handoff). */
  private revealedFor: string | null = null;
  /** Whose home system sits in the dock: the current or most recent human. */
  private viewerId: string | null = null;
  private seats: MenuSeat[] = [
    { name: 'Commander', isAI: false, enabled: true },
    { name: "Xel'Naru", isAI: true, enabled: true },
    { name: 'Vorthane', isAI: true, enabled: false },
    { name: 'Ixquor', isAI: true, enabled: false },
  ];

  constructor(private root: HTMLElement) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
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
    this.screen = 'game';
    this.afterChange();
  }

  private dispatch(action: Action) {
    const prev = this.state;
    if (!prev) return;
    try {
      this.state = applyAction(prev, action);
      this.surfaceLog(prev, this.state);
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
      this.showToast(err.message, 'error');
    }
    this.pending = null;
    this.afterChange();
  }

  /** Show the most important new log line as a toast. */
  private surfaceLog(prev: GameState, next: GameState) {
    const lastPrev = prev.log[prev.log.length - 1];
    const start = lastPrev ? next.log.lastIndexOf(lastPrev) + 1 : 0;
    const fresh = next.log.slice(Math.max(start, 0)).map((l) => l.text);
    const hit = [...fresh].reverse().find((t) => TOAST_PATTERN.test(t));
    if (hit) this.showToast(hit, 'info');
  }

  private showToast(text: string, tone: Toast['tone']) {
    const id = ++this.toastSeq;
    this.toast = { text, tone, id };
    window.setTimeout(() => {
      if (this.toast?.id === id) {
        this.toast = null;
        this.render();
      }
    }, TOAST_MS);
  }

  private afterChange() {
    const s = this.state;
    if (s) {
      if (isGameOver(s)) clearSave();
      else save(s);
      const active = activePlayer(s);
      if (!active.isAI) this.viewerId = active.id;
    }
    this.render();
    this.scheduleAI();
  }

  private scheduleAI() {
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer);
    this.aiTimer = null;
    const s = this.state;
    if (this.screen !== 'game' || !s || isGameOver(s) || !activePlayer(s).isAI) return;
    this.aiTimer = window.setTimeout(() => {
      this.aiTimer = null;
      if (this.state === s) this.dispatch(chooseAIAction(s));
    }, AI_STEP_MS);
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
    if (e.key === 'Escape' && this.pending) {
      this.pending = null;
      this.render();
    }
  }

  private onClick(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || el.hasAttribute('disabled')) return;
    // The dimmed backdrop cancels, but clicks inside the modal must not.
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
        return this.render();
      case 'toggle-log':
        this.showLog = !this.showLog;
        return this.render();
      case 'cancel':
        this.pending = null;
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
      case 'solarFlare':
        this.pending = { kind: 'flare' };
        return this.render();
      case 'thermosiphon':
        return this.dispatch({ type: 'thermosiphon' });
      case 'end-turn':
        return this.dispatch({ type: 'endTurn' });
      case 'target': {
        const p = this.pending;
        if (p?.kind === 'flare') return this.dispatch({ type: 'solarFlare', targetId: arg });
        if (p?.kind === 'card') return this.dispatch({ type: 'playCard', cardUid: p.uid, targetId: arg });
        return;
      }
      case 'upgrade': {
        const p = this.pending;
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
          <li>From round ${BALANCE.instabilityStartsRound}, <b>Stellar Instability</b> heats every sun at the start of each turn.</li>
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
        ${this.renderSide()}
        ${this.renderDock()}
        ${this.toast ? `<div class="toast toast-${this.toast.tone}">${esc(this.toast.text)}</div>` : ''}
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
    const last = s.log[s.log.length - 1]?.text ?? '';

    return `
      <header class="hud">
        <div class="round-badge">
          <button class="numeral" data-act="menu" title="Round ${s.round} · menu">${roman(s.round)}</button>
          <div class="core-bar" title="Your sun: ${me.heat} (supernova at ${BALANCE.supernovaAt})">
            <div class="core-fill" style="width:${core}%"></div>
            <span>core ${me.heat} / ${BALANCE.supernovaAt}</span>
          </div>
        </div>
        <div class="turn-block">
          <div class="turn-pill ${mine ? 'turn-mine' : ''}">•${mine ? 'your turn' : `${esc(active.name.toLowerCase())}'s turn`}•</div>
          <div class="ticker">${esc(last)}</div>
        </div>
        <div class="players-panel glass-dark">
          <div class="players-title">players</div>
          <div class="avatars">${avatars}</div>
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
              ${sunOrb({ heat: p.heat, systemId: p.systemId, size: 92, dead: p.eliminated })}
              <div class="rival-name">${esc(p.name)}${p.isAI ? ' <span class="tag">ai</span>' : ''}</div>
              <div class="rival-sys" title="${esc(sys.abilityName)}: ${esc(sys.abilityText)}">${esc(sys.name.toLowerCase())}</div>
              <div class="rival-stats">
                <span title="Shields">⛨ ${p.shields}</span>
                <span title="Solar Flare heat">▲ ${flareHeat(p)}</span>
                <span title="Thermosiphon cooling">▼ ${thermoCool(p)}</span>
                <span title="Cards in hand">✋ ${p.hand.length}</span>
                ${p.claimedObjectives.length ? `<span title="Objectives">★ ${p.claimedObjectives.length}</span>` : ''}
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
        <div class="section-label">•display• <span>${s.marketDeck.length} in deck</span></div>
        <div class="cards">${s.display
          .map((c, i) => (c ? this.renderCard(c, { slot: i, buyer: me }) : '<div class="card card-empty"></div>'))
          .join('')}</div>
      </section>`;
  }

  private renderSide(): string {
    const s = this.state!;
    const instab = instabilityHeat(s);
    const globals = s.globals
      .filter((g) => g.turnsRemaining > 0)
      .map((g) => `<div class="global" title="${esc(GLOBALS[g.id].text)}">${esc(GLOBALS[g.id].name.toLowerCase())} <span>${g.turnsRemaining}</span></div>`)
      .join('');
    const objectives = s.objectives
      .map((id) => {
        const o = objectiveDef(id);
        const who = s.players.filter((p) => p.claimedObjectives.includes(id)).map((p) => esc(p.name));
        return `<div class="objective"><b>${esc(o.name.toLowerCase())}</b><span>${esc(o.text)}</span>${who.length ? `<em>✓ ${who.join(', ')}</em>` : ''}</div>`;
      })
      .join('');
    return `
      <aside class="side">
        <div class="glass side-block">
          <div class="bar-title">${instab ? `instability +${instab}` : 'stability'}</div>
          <div class="side-body">
            ${instab
              ? `<p class="warn">Every sun heats by ${instab} at the start of its turn.</p>`
              : `<p class="muted">Stellar Instability begins in round ${BALANCE.instabilityStartsRound}.</p>`}
            ${globals}
          </div>
        </div>
        <div class="glass side-block">
          <div class="bar-title">objectives</div>
          <div class="side-body">${objectives}<p class="muted">Reward: one Command Directive each.</p></div>
        </div>
        <div class="glass side-block log ${this.showLog ? 'log-open' : ''}">
          <button class="bar-title bar-btn" data-act="toggle-log">log ${this.showLog ? '▾' : '▸'}</button>
          ${this.showLog ? `<div class="log-list">${s.log.slice(-60).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>` : ''}
        </div>
      </aside>`;
  }

  private renderDock(): string {
    const s = this.state!;
    const me = this.viewer();
    const sys = systemDef(me.systemId);
    const act = this.canAct();
    const busy = this.pending !== null;
    const hidden = this.needsHandoff() || (activePlayer(s).id === me.id && activePlayer(s).isAI);

    const planets = me.planets
      .map((pl) => {
        const pips = Array.from({ length: BALANCE.maxPlanetLevel }, (_, i) => `<i class="${i < pl.level ? 'on' : ''}"></i>`).join('');
        return `<div class="planet track-${pl.track}" title="${TRACK_TEXT[pl.track]}">${TRACK_ICON[pl.track]} ${esc(pl.name.toLowerCase())}<span class="pips">${pips}</span></div>`;
      })
      .join('');

    const fc = flareCost(s, me);
    const tc = thermoCost(me);
    const tiles = `
      ${actionTile({ action: 'thermosiphon', upgrades: me.upgrades.thermosiphon, cost: tc, power: thermoCool(me), enabled: act && !busy && me.money >= tc && me.heat > BALANCE.minHeat })}
      ${actionTile({ action: 'solarFlare', upgrades: me.upgrades.solarFlare, cost: fc, power: flareHeat(me), enabled: act && !busy && me.money >= fc })}`;

    const hasMoneyCards = me.hand.some((c) => cardDef(c.defId).effects.every((e) => e.type === 'money'));
    const hand = hidden
      ? '<div class="hand-hidden">hand hidden</div>'
      : me.hand.map((c) => this.renderCard(c, { hand: true })).join('');
    const played = me.inPlay.length
      ? `<div class="in-play">${me.inPlay.map((c) => `<span>${esc(cardDef(c.defId).name.toLowerCase())}</span>`).join('')}</div>`
      : '';

    return `
      <section class="dock">
        <div class="home glass">
          ${sunOrb({ heat: me.heat, systemId: me.systemId, size: 104, dead: me.eliminated })}
          <div class="home-info">
            <div class="home-name">${esc(me.name)}</div>
            <div class="home-sys" title="${esc(sys.abilityText)}">${esc(sys.name.toLowerCase())} · <i>${esc(sys.abilityName.toLowerCase())}</i></div>
            <div class="home-stats">
              <span title="Shields">⛨ ${me.shields}</span>
              <span title="Income per turn">◈ +${incomeFor(me)}</span>
              <span title="Hand size">✋ ${handSizeFor(me)}</span>
              <span title="Deck / discard">▤ ${me.deck.length}/${me.discard.length}</span>
              ${shieldPierce(me) ? `<span title="Shield pierce">⚔ ${shieldPierce(me)}</span>` : ''}
            </div>
            <div class="planets">${planets}</div>
          </div>
        </div>
        <div class="actions">${tiles}</div>
        <div class="hand-zone">
          <div class="hand-bar">
            <div class="money" title="Money this turn">◈ ${me.money}</div>
            <button class="btn" data-act="play-all" ${act && hasMoneyCards && !busy ? '' : 'disabled'}>play all money</button>
            ${played}
          </div>
          <div class="cards hand">${hand}</div>
        </div>
        <button class="btn-primary end-turn" data-act="end-turn" ${act && !busy ? '' : 'disabled'}>end turn</button>
      </section>`;
  }

  private renderCard(c: CardInstance, opts: { slot?: number; hand?: boolean; buyer?: PlayerState }): string {
    const def = cardDef(c.defId);
    const act = this.canAct() && !this.pending;
    let attrs = 'disabled';
    let cost = '';
    if (opts.slot !== undefined && opts.buyer) {
      const price = marketCost(opts.buyer, c.defId);
      if (act && opts.buyer.money >= price) attrs = `data-act="buy" data-arg="${opts.slot}"`;
      cost = `<span class="coin ${price < def.cost ? 'coin-discount' : ''}">${price}</span>`;
    } else if (opts.hand && act) {
      attrs = `data-act="play" data-arg="${c.uid}"`;
    }
    return `
      <button class="card kind-${def.kind}" ${attrs}>
        <div class="card-art"></div>
        ${cost}
        <div class="card-name">${esc(def.name.toLowerCase())}</div>
        <div class="card-text">${esc(def.text)}</div>
        <div class="card-kind">•${def.kind}•</div>
      </button>`;
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
        return `
          <button class="planet planet-choice track-${pl.track}" ${available ? `data-act="upgrade" data-arg="${pl.id}"` : 'disabled'} title="${TRACK_TEXT[pl.track]}">
            ${TRACK_ICON[pl.track]} ${esc(pl.name.toLowerCase())}<span class="pips">${pips}</span>
            <small>${pl.track}</small>
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
