import {
  activePlayer,
  applyAction,
  BALANCE,
  cardDef,
  cardNeedsPlanet,
  cardNeedsTarget,
  chooseAIAction,
  createGame,
  cryoCost,
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
  systemDef,
  upgradeablePlanets,
  type Action,
  type CardInstance,
  type GameState,
  type PlayerSetup,
  type PlayerState,
} from '../engine';
import { clearSave, loadSave, save } from './storage';

type Screen = 'menu' | 'game';

/** A card or flare waiting for the player to pick a target or planet. */
type Pending =
  | { kind: 'flare' }
  | { kind: 'card'; uid: string; need: 'target' | 'planet' };

const AI_STEP_MS = 450;
const TRACK_ICON: Record<string, string> = { weapons: '⚔', defences: '⛨', economy: '◈', resources: '⬢' };

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
  private toast = '';
  private aiTimer: number | null = null;
  /** Human player whose hand was last revealed (for hot-seat handoff). */
  private revealedFor: string | null = null;
  private seats: MenuSeat[] = [
    { name: 'Commander', isAI: false, enabled: true },
    { name: 'Xel\'Naru', isAI: true, enabled: true },
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
    this.state = createGame({ seed: (Math.random() * 2 ** 31) | 0, players });
    this.revealedFor = null;
    this.screen = 'game';
    this.afterChange();
  }

  private continueGame() {
    const saved = loadSave();
    if (!saved) return;
    this.state = saved;
    this.revealedFor = null;
    this.screen = 'game';
    this.afterChange();
  }

  private dispatch(action: Action) {
    if (!this.state) return;
    try {
      this.state = applyAction(this.state, action);
      this.toast = '';
    } catch (err) {
      if (err instanceof GameError) this.toast = err.message;
      else throw err;
    }
    this.pending = null;
    this.afterChange();
  }

  private afterChange() {
    const s = this.state;
    if (s) {
      if (isGameOver(s)) clearSave();
      else save(s);
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

  private humans(): PlayerState[] {
    return this.state?.players.filter((p) => !p.isAI) ?? [];
  }

  /** Hot-seat: hide the hand until the next human confirms they have the device. */
  private needsHandoff(): boolean {
    const s = this.state!;
    const p = activePlayer(s);
    return !p.isAI && this.humans().length > 1 && this.revealedFor !== p.id && !isGameOver(s);
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
    }

    if (!s || isGameOver(s) || activePlayer(s).isAI) return;
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
        if (cardNeedsPlanet(card.defId) && upgradeablePlanets(me).length > 0) {
          this.pending = { kind: 'card', uid: arg, need: 'planet' };
          return this.render();
        }
        return this.dispatch({ type: 'playCard', cardUid: arg });
      }
      case 'play-all':
        return this.dispatch({ type: 'playAllMoney' });
      case 'buy':
        return this.dispatch({ type: 'buyCard', slot: Number(arg) });
      case 'flare': {
        const foes = livingOpponents(s, me);
        if (foes.length === 1) return this.dispatch({ type: 'solarFlare', targetId: foes[0].id });
        this.pending = { kind: 'flare' };
        return this.render();
      }
      case 'cryo':
        return this.dispatch({ type: 'cryostasis' });
      case 'end-turn':
        return this.dispatch({ type: 'endTurn' });
      case 'cancel':
        this.pending = null;
        return this.render();
      case 'target': {
        const p = this.pending;
        if (p?.kind === 'flare') return this.dispatch({ type: 'solarFlare', targetId: arg });
        if (p?.kind === 'card') return this.dispatch({ type: 'playCard', cardUid: p.uid, targetId: arg });
        return;
      }
      case 'planet': {
        const p = this.pending;
        if (p?.kind === 'card') return this.dispatch({ type: 'playCard', cardUid: p.uid, planetId: arg });
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
          <button class="chip" data-act="seat-toggle" data-arg="${i}" ${locked ? 'disabled' : ''}>
            ${seat.enabled ? '●' : '○'} Seat ${i + 1}
          </button>
          <input data-seat-name="${i}" value="${esc(seat.name)}" maxlength="18" ${seat.enabled ? '' : 'disabled'} />
          <button class="chip" data-act="seat-ai" data-arg="${i}" ${seat.enabled ? '' : 'disabled'}>
            ${seat.isAI ? 'AI' : 'Human'}
          </button>
        </div>`;
      })
      .join('');

    return `
    <main class="menu">
      <div class="title-block">
        <div class="title-sun"></div>
        <h1>BLUE LOOP</h1>
        <p class="tagline">Cool your star. Ignite theirs.</p>
      </div>
      <section class="panel menu-panel">
        <h2>New game</h2>
        ${seats}
        <div class="menu-actions">
          <button class="primary" data-act="new-game">Launch</button>
          ${hasSave ? '<button data-act="continue">Continue saved game</button>' : ''}
        </div>
      </section>
      <section class="panel menu-panel rules">
        <h2>How to play</h2>
        <ul>
          <li>Every sun starts at <b>0</b>. At <b>${BALANCE.supernovaAt}</b> it goes supernova and that player is out. The last sun standing wins.</li>
          <li>Play cards for money. Spend <b>${BALANCE.solarFlareCost}</b> on a <b>Solar Flare</b> to heat an enemy sun, or <b>${BALANCE.cryostasisCost}</b> on <b>Cryostasis</b> to cool yours (down to ${BALANCE.minHeat}). Use them as often as you can afford.</li>
          <li>Buy stronger cards from the 8-card display. <b>Command</b> cards upgrade your planets: weapons, defences, economy, resources.</li>
          <li>Complete objectives to earn extra Command cards.</li>
          <li>From round ${BALANCE.instabilityStartsRound}, <b>Stellar Instability</b> heats every sun at the start of each turn.</li>
        </ul>
      </section>
      <footer class="studio">Coronal Mass Games · prototype build</footer>
    </main>`;
  }

  private renderGame(): string {
    const s = this.state!;
    const active = activePlayer(s);
    const winner = s.players.find((p) => p.id === s.winnerId);
    const instab = instabilityHeat(s);

    const header = `
      <header class="topbar">
        <button class="chip" data-act="menu">☰ Menu</button>
        <div class="round">Round ${s.round}</div>
        <div class="turn-of">${esc(active.name)}'s turn</div>
        <div class="instability ${instab ? 'hot' : ''}">
          ${instab ? `⚠ Stellar Instability +${instab}/turn` : `Stability: instability begins round ${BALANCE.instabilityStartsRound}`}
        </div>
        <div class="globals">${s.globals
          .map((g) => `<span class="global" title="${esc(GLOBALS[g.id].text)}">${esc(GLOBALS[g.id].name)} · ${Math.max(g.turnsRemaining, 0)}</span>`)
          .join('')}</div>
      </header>`;

    const players = `<section class="players">${s.players.map((p) => this.renderPlayer(p)).join('')}</section>`;

    const objectives = `
      <section class="panel objectives">
        <h3>Objectives</h3>
        ${s.objectives
          .map((id) => {
            const o = objectiveDef(id);
            const who = s.players.filter((p) => p.claimedObjectives.includes(id)).map((p) => esc(p.name));
            return `<div class="objective"><b>${esc(o.name)}</b> ${esc(o.text)}${who.length ? `<div class="claimed">✓ ${who.join(', ')}</div>` : ''}</div>`;
          })
          .join('')}
        <p class="muted">Reward: a Command Directive, once per player.</p>
      </section>`;

    const market = `
      <section class="panel market">
        <h3>Display <span class="muted">(${s.marketDeck.length} left in deck)</span></h3>
        <div class="cards">${s.display
          .map((c, i) => (c ? this.renderCard(c, { slot: i, buyer: active }) : '<div class="card empty">Empty</div>'))
          .join('')}</div>
      </section>`;

    const log = `
      <aside class="panel log">
        <h3>Log</h3>
        <div class="log-list">${s.log.map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>
      </aside>`;

    let overlay = '';
    if (winner) {
      overlay = `
        <div class="overlay"><div class="panel dialog">
          <h2>${esc(winner.name)} wins!</h2>
          <p>${esc(systemDef(winner.systemId).name)} is the last sun standing after ${s.round} rounds.</p>
          <button class="primary" data-act="menu">Back to menu</button>
        </div></div>`;
    } else if (this.needsHandoff()) {
      overlay = `
        <div class="overlay"><div class="panel dialog">
          <h2>Pass to ${esc(active.name)}</h2>
          <p>Hand the controls to ${esc(active.name)}, then reveal your hand.</p>
          <button class="primary" data-act="reveal">Reveal hand</button>
        </div></div>`;
    }

    return `
      <main class="game">
        ${header}
        ${players}
        <div class="middle">
          ${market}
          ${objectives}
          ${log}
        </div>
        ${this.renderHand(active)}
        ${this.toast ? `<div class="toast">${esc(this.toast)}</div>` : ''}
        ${overlay}
      </main>`;
  }

  private renderPlayer(p: PlayerState): string {
    const s = this.state!;
    const active = activePlayer(s);
    const sys = systemDef(p.systemId);
    const isActive = p.id === active.id;
    const targeting = this.pending && (this.pending.kind === 'flare' || this.pending.need === 'target');
    const canTarget = targeting && !p.eliminated && p.id !== active.id;
    const pickPlanet = this.pending?.kind === 'card' && this.pending.need === 'planet' && isActive;

    const pct = ((p.heat - BALANCE.minHeat) / (BALANCE.supernovaAt - BALANCE.minHeat)) * 100;
    const planets = p.planets
      .map((pl) => {
        const pips = Array.from({ length: BALANCE.maxPlanetLevel }, (_, i) => `<i class="${i < pl.level ? 'on' : ''}"></i>`).join('');
        const clickable = pickPlanet && pl.level < BALANCE.maxPlanetLevel;
        return `<button class="planet track-${pl.track}" ${clickable ? `data-act="planet" data-arg="${pl.id}"` : 'tabindex="-1"'} title="${pl.track}">
          <span>${TRACK_ICON[pl.track]} ${esc(pl.name)}</span><span class="pips">${pips}</span>
        </button>`;
      })
      .join('');

    return `
      <article class="panel player ${isActive ? 'active' : ''} ${p.eliminated ? 'dead' : ''} ${canTarget ? 'targetable' : ''}"
        ${canTarget ? `data-act="target" data-arg="${p.id}"` : ''}>
        <div class="player-head">
          <div class="sun" style="--heat:${p.heat}">${p.eliminated ? '✸' : p.heat}</div>
          <div>
            <div class="pname">${esc(p.name)}${p.isAI ? ' <span class="tag">AI</span>' : ''}</div>
            <div class="sys" title="${esc(sys.abilityText)}">${esc(sys.name)} · <i>${esc(sys.abilityName)}</i></div>
          </div>
        </div>
        <div class="thermo"><div class="thermo-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div><div class="thermo-zero"></div></div>
        <div class="stats">
          <span title="Shields">⛨ ${p.shields}</span>
          <span title="Income per turn">◈ +${incomeFor(p)}</span>
          <span title="Hand size">✋ ${handSizeFor(p)}</span>
          <span title="Deck / discard">▤ ${p.deck.length}/${p.discard.length}</span>
          ${p.claimedObjectives.length ? `<span title="Objectives">★ ${p.claimedObjectives.length}</span>` : ''}
        </div>
        <div class="planets">${planets}</div>
        <div class="ability muted">${esc(sys.abilityText)}</div>
        ${canTarget ? '<div class="target-hint">Click to target</div>' : ''}
      </article>`;
  }

  private renderCard(c: CardInstance, opts: { slot?: number; hand?: boolean; buyer?: PlayerState }): string {
    const def = cardDef(c.defId);
    const s = this.state!;
    const me = activePlayer(s);
    const humanTurn = !me.isAI && !isGameOver(s) && !this.needsHandoff();
    let attrs = '';
    let costLabel = '';
    if (opts.slot !== undefined && opts.buyer) {
      const cost = marketCost(opts.buyer, c.defId);
      const affordable = humanTurn && opts.buyer.money >= cost;
      attrs = affordable ? `data-act="buy" data-arg="${opts.slot}"` : 'disabled';
      costLabel = `<span class="cost ${cost < def.cost ? 'discount' : ''}">${cost}</span>`;
    } else if (opts.hand) {
      attrs = humanTurn && !this.pending ? `data-act="play" data-arg="${c.uid}"` : 'disabled';
    }
    return `
      <button class="card kind-${def.kind}" ${attrs}>
        <div class="card-top"><span class="card-name">${esc(def.name)}</span>${costLabel}</div>
        <div class="card-kind">${def.kind}</div>
        <div class="card-text">${esc(def.text)}</div>
      </button>`;
  }

  private renderHand(p: PlayerState): string {
    const s = this.state!;
    if (isGameOver(s)) return '';
    if (p.isAI) {
      return `
        <section class="panel hand-area">
          <div class="hand-bar"><b>${esc(p.name)}</b> is plotting… <span class="muted">${p.hand.length} cards in hand · ${p.money} money</span></div>
          <div class="cards played">${p.inPlay.map((c) => this.renderCard(c, {})).join('')}</div>
        </section>`;
    }
    if (this.needsHandoff()) return '<section class="panel hand-area"><div class="hand-bar muted">Hand hidden</div></section>';

    const fc = flareCost(s, p);
    const cc = cryoCost(p);
    const hasMoneyCards = p.hand.some((c) => cardDef(c.defId).effects.every((e) => e.type === 'money'));
    const busy = this.pending !== null;
    const prompt = this.pending
      ? `<div class="prompt">${
          this.pending.kind === 'flare' || this.pending.need === 'target' ? 'Choose an enemy sun to target.' : 'Choose one of your planets to upgrade.'
        } <button class="chip" data-act="cancel">Cancel (Esc)</button></div>`
      : '';

    return `
      <section class="panel hand-area">
        <div class="hand-bar">
          <div class="money">◈ ${p.money}</div>
          <button data-act="play-all" ${hasMoneyCards && !busy ? '' : 'disabled'}>Play all money</button>
          <button class="flare" data-act="flare" ${p.money >= fc && !busy ? '' : 'disabled'}>☀ Solar Flare · ${fc} <span class="muted">(+${flareHeat(p)})</span></button>
          <button class="cryo" data-act="cryo" ${p.money >= cc && p.heat > BALANCE.minHeat && !busy ? '' : 'disabled'}>❄ Cryostasis · ${cc}</button>
          <button class="primary" data-act="end-turn" ${busy ? 'disabled' : ''}>End turn</button>
        </div>
        ${prompt}
        <div class="cards">${p.hand.map((c) => this.renderCard(c, { hand: true })).join('')}</div>
        ${p.inPlay.length ? `<div class="played-label muted">In play</div><div class="cards played">${p.inPlay.map((c) => this.renderCard(c, {})).join('')}</div>` : ''}
      </section>`;
  }
}
