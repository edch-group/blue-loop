import {
  applyCampaignAction,
  armoryPrice,
  attackOptions,
  CAMPAIGN,
  CAMPAIGN_MISSIONS,
  campaignMissionDef,
  campaignPlayer,
  canGarrison,
  canUpgradePlanet,
  cardDef,
  cardUpgradePrice,
  CARD_UPGRADES,
  createCampaign,
  factionById,
  factionIncome,
  GameError,
  garrisonBonus,
  missionProgress,
  nodeById,
  ownedNodes,
  SOLAR_SYSTEMS,
  systemDef,
  upgradeCost,
  type CampaignAction,
  type CampaignNode,
  type CampaignState,
  type CardSource,
  type GameState,
} from '../engine';
import { systemDiagram } from './art';
import { cardGlyph, KIND_COLOUR } from './glyphs';
import { sound } from './sound';

const KEY = 'blue-loop:campaign:v1';

export function loadCampaign(): CampaignState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CampaignState) : null;
  } catch {
    return null;
  }
}
function saveCampaign(s: CampaignState | null) {
  try {
    if (s && !s.winner) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const lower = (t: string) => esc(t.toLowerCase());

/** Muted faction tints: the player's blue loop, then the three rivals. */
export const FACTION_COLOUR: Record<string, string> = { f1: '#6f9fd8', f2: '#d48a7c', f3: '#c9a95e', f4: '#a08bcb' };
const NEUTRAL = '#c9cbd0';
const CREDITS = '❖';
const MATERIALS = '⬡';
const TRACK_ICON: Record<string, string> = { weapons: '⚔', defences: '⛨', economy: '◈', resources: '⬢' };

/** What the campaign screen needs from the app that hosts it. */
export interface CampaignHost {
  render(): void;
  toast(text: string): void;
  /** Play a campaign battle on the battle screen. */
  playBattle(game: GameState): void;
  toMenu(): void;
}

type Sheet =
  | { kind: 'deck'; slot?: number }
  | { kind: 'armory' }
  | { kind: 'missions' }
  | { kind: 'log' }
  | { kind: 'station'; nodeId: string }
  | { kind: 'attack'; fromId: string; toId: string }
  | { kind: 'help' };

export class CampaignView {
  state: CampaignState | null = null;
  private selected: string | null = null;
  /** What happened in the last battle or turn, shown once the player is free to read it. */
  private report: { title: string; lines: string[] } | null = null;
  private sheet: Sheet | null = null;
  /** New-campaign setup choices. */
  private setup = { rivals: 3, offers: [] as string[], home: '' };

  constructor(private host: CampaignHost) {}

  // ---- Lifecycle ------------------------------------------------------------

  /** Open the new-campaign screen. */
  openSetup() {
    this.state = null;
    this.sheet = null;
    const pool = SOLAR_SYSTEMS.map((s) => s.id).sort(() => Math.random() - 0.5);
    this.setup.offers = pool.slice(0, 2);
    this.setup.home = this.setup.offers[0];
  }

  resume(): boolean {
    const s = loadCampaign();
    if (!s) return false;
    this.state = s;
    this.sheet = null;
    this.selected = null;
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
    saveCampaign(this.state);
    return true;
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
      case 'cmp-home':
        this.setup.home = arg;
        break;
      case 'cmp-start':
        this.state = createCampaign({ seed: (Math.random() * 2 ** 31) | 0, rivals: this.setup.rivals, homeSystemId: this.setup.home });
        this.selected = ownedNodes(this.state, this.state.playerId)[0].id;
        saveCampaign(this.state);
        sound.objective();
        break;
      case 'cmp-select':
        this.selected = this.selected === arg ? null : arg;
        sound.hover();
        break;
      case 'cmp-sheet':
        this.sheet = { kind: arg as 'deck' | 'armory' | 'missions' | 'log' | 'help' };
        break;
      case 'cmp-close':
        if (this.report && !this.sheet) this.report = null;
        else if (this.sheet?.kind === 'deck' && this.sheet.slot !== undefined) this.sheet = { kind: 'deck' };
        else this.sheet = null;
        break;
      case 'cmp-attack-pick':
        this.sheet = { kind: 'attack', fromId: el.dataset.from!, toId: arg };
        break;
      case 'cmp-fight':
      case 'cmp-auto': {
        if (this.sheet?.kind !== 'attack') break;
        const { fromId, toId } = this.sheet;
        this.sheet = null;
        if (!this.apply({ type: 'attack', fromId, toId })) break;
        sound.flare();
        if (act === 'cmp-auto') this.finishBattle(this.state!.battle!.game, true);
        else this.host.playBattle(this.state!.battle!.game);
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
        if (this.apply({ type: 'heal', nodeId: arg })) sound.upgrade();
        break;
      case 'cmp-planet':
        if (this.apply({ type: 'upgradePlanet', nodeId: el.dataset.node!, planet: n() })) sound.upgrade();
        break;
      case 'cmp-buy':
        if (this.apply({ type: 'buyCard', slot: n() })) sound.buy();
        break;
      case 'cmp-upgrade-card':
        if (this.apply({ type: 'upgradeCard', from: el.dataset.from as CardSource, index: n() })) sound.upgrade();
        break;
      case 'cmp-slot':
        this.sheet = { kind: 'deck', slot: n() };
        break;
      case 'cmp-swap': {
        if (this.sheet?.kind !== 'deck' || this.sheet.slot === undefined) break;
        if (this.apply({ type: 'deckSwap', slot: this.sheet.slot, reserveIndex: arg === '' ? null : n() })) sound.play();
        this.sheet = { kind: 'deck' };
        break;
      }
      case 'cmp-station-open':
        this.sheet = { kind: 'station', nodeId: arg };
        break;
      case 'cmp-station': {
        if (this.sheet?.kind !== 'station') break;
        if (this.apply({ type: 'station', nodeId: this.sheet.nodeId, from: el.dataset.from as CardSource, index: n() })) sound.play();
        this.sheet = null;
        break;
      }
      case 'cmp-recall':
        if (this.apply({ type: 'recall', nodeId: el.dataset.node!, uid: arg })) sound.play();
        break;
      case 'cmp-end-turn':
        if (this.withReport('turn report', () => this.apply({ type: 'endTurn' }))) {
          sound.endTurn();
          this.selected = null;
        }
        break;
      case 'cmp-menu':
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

  render(): string {
    if (!this.state) return this.renderSetup();
    const s = this.state;
    const me = campaignPlayer(s);
    const inc = factionIncome(s, me.id);
    return `
      <main class="cmp">
        <header class="cmp-top">
          <div class="cmp-turn"><span class="cmp-turn-n">turn ${s.turn}</span><small>/${CAMPAIGN.turnLimit}</small></div>
          <div class="cmp-purse" title="Credits repair and upgrade systems. Materials buy and upgrade cards.">
            <span><b>${CREDITS} ${me.credits}</b><small>+${inc.credits}</small></span>
            <span><b>${MATERIALS} ${me.materials}</b><small>+${inc.materials}</small></span>
            <span class="cmp-held">${ownedNodes(s, me.id).length}/${s.nodes.length} systems</span>
          </div>
          <nav class="cmp-nav">
            <button class="pill-btn" data-act="cmp-sheet" data-arg="deck">deck</button>
            <button class="pill-btn" data-act="cmp-sheet" data-arg="armory">armory</button>
            <button class="pill-btn" data-act="cmp-sheet" data-arg="missions">missions</button>
            <button class="pill-btn" data-act="cmp-sheet" data-arg="log">log</button>
            <button class="pill-btn" data-act="cmp-sheet" data-arg="help">?</button>
            <button class="icon-btn" data-act="cmp-menu" aria-label="Menu">≡</button>
          </nav>
        </header>
        <section class="cmp-map">${this.renderMap()}</section>
        <aside class="cmp-side glass">${this.selected ? this.renderNode(nodeById(s, this.selected)) : this.renderOverview()}</aside>
        <div class="cmp-end">
          <button class="btn-primary" data-act="cmp-end-turn" ${s.phase !== 'player' ? 'disabled' : ''}>end turn</button>
        </div>
        ${this.renderOverlay()}
      </main>`;
  }

  private renderSetup(): string {
    const systems = this.setup.offers
      .map((id) => {
        const sys = systemDef(id);
        return `
        <button class="cmp-home-pick ${this.setup.home === id ? 'on' : ''}" data-act="cmp-home" data-arg="${id}">
          ${systemDiagram(sys.planets)}
          <b>${lower(sys.name)}</b>
          <span>+ ${esc(sys.abilityText)}</span>
          <span class="sys-drawback">− ${esc(sys.drawbackText)}</span>
        </button>`;
      })
      .join('');
    const rivals = [1, 2, 3]
      .map((r) => `<button class="pill-btn ${this.setup.rivals === r ? 'pill-on' : ''}" data-act="cmp-rivals" data-arg="${r}">${r}</button>`)
      .join('');
    return `
      <main class="cmp cmp-setup">
        <section class="glass cmp-setup-panel">
          <div class="bar-title">new campaign · universe domination</div>
          <div class="modal-body">
            <p class="muted">Start from one solar system. Conquer the systems linked to yours, then Settle, Absorb or Supernova each one. Hold ${Math.round(CAMPAIGN.dominationShare * 100)}% of the universe, outlast every rival, or hold the most after ${CAMPAIGN.turnLimit} turns.</p>
            <div class="cmp-label">home system</div>
            <div class="cmp-home-row">${systems}</div>
            <div class="cmp-label">rival factions <span class="cmp-rivals">${rivals}</span></div>
            <div class="menu-actions">
              <button class="btn-primary" data-act="cmp-start">begin campaign</button>
              <button class="btn" data-act="cmp-menu">back</button>
            </div>
          </div>
        </section>
      </main>`;
  }

  private renderMap(): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const targets = new Map(me.attacked || s.phase !== 'player' ? [] : attackOptions(s, me.id).map((o) => [o.toId, o.fromIds]));
    const drawn = new Set<string>();
    const links = s.nodes
      .flatMap((n) =>
        n.links.map((id) => {
          const key = [n.id, id].sort().join('-');
          if (drawn.has(key)) return '';
          drawn.add(key);
          const m = nodeById(s, id);
          const same = n.owner && n.owner === m.owner;
          return `<line x1="${n.x}" y1="${n.y}" x2="${m.x}" y2="${m.y}" class="cmp-link ${same ? 'cmp-link-held' : ''}" ${same ? `style="--fc:${FACTION_COLOUR[n.owner!]}"` : ''} />`;
        }),
      )
      .join('');
    const nodes = s.nodes
      .map((n) => {
        const colour = n.owner ? FACTION_COLOUR[n.owner] : NEUTRAL;
        const target = targets.has(n.id);
        const stationed = n.garrison.length;
        const cls = [
          'cmp-node',
          n.owner === me.id ? 'cmp-mine' : '',
          target ? 'cmp-target' : '',
          this.selected === n.id ? 'cmp-selected' : '',
          n.hazard.length ? 'cmp-hazard' : '',
          s.battle?.nodeId === n.id ? 'cmp-contested' : '',
        ].join(' ');
        return `
          <g class="${cls}" data-act="cmp-select" data-arg="${n.id}" style="--fc:${colour}" transform="translate(${n.x} ${n.y})">
            <circle class="cmp-hit" r="44" />
            ${target ? '<circle class="cmp-target-ring" r="34" />' : ''}
            ${n.hazard.length ? '<circle class="cmp-hazard-ring" r="30" />' : ''}
            <circle class="cmp-halo" r="26" />
            <circle class="cmp-sun" r="15" />
            ${n.home ? '<circle class="cmp-home-ring" r="21" />' : ''}
            <text class="cmp-name" y="44">${lower(n.name)}</text>
            ${stationed ? `<text class="cmp-badge" x="22" y="-16">▣${stationed}</text>` : ''}
            ${n.damage ? `<text class="cmp-badge cmp-dmg" x="-22" y="-16">✸${n.damage}</text>` : ''}
          </g>`;
      })
      .join('');
    return `<svg class="cmp-svg" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet">${links}${nodes}</svg>`;
  }

  private renderOverview(): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const factions = s.factions
      .map((f) => {
        const held = ownedNodes(s, f.id).length;
        return `<div class="cmp-faction ${f.eliminated ? 'out' : ''}" style="--fc:${FACTION_COLOUR[f.id]}"><i></i><span>${f.id === me.id ? 'you' : lower(f.name)}</span><b>${f.eliminated ? 'eliminated' : `${held} system${held === 1 ? '' : 's'}`}</b></div>`;
      })
      .join('');
    const missions = me.missions.map((m) => this.missionRow(m.id, missionProgress(s, me, m))).join('');
    const log = s.log
      .slice(-8)
      .map((l) => `<div>${esc(l.text)}</div>`)
      .join('');
    const canAttack = !me.attacked && s.phase === 'player' && attackOptions(s, me.id).length > 0;
    return `
      <div class="section-label">factions</div>
      <div class="cmp-factions">${factions}</div>
      <p class="cmp-hint">${canAttack ? 'Tap a system with a dashed ring to attack it (one attack per turn). Tap one of yours to manage it.' : me.attacked ? 'You have attacked this turn. Manage your systems, then end the turn.' : 'Manage your systems, then end the turn.'}</p>
      <div class="section-label">missions</div>
      <div class="cmp-missions">${missions}</div>
      <div class="section-label">log</div>
      <div class="cmp-log">${log}</div>`;
  }

  private missionRow(id: string, progress: number): string {
    const def = campaignMissionDef(id);
    return `<div class="cmp-mission"><b>${lower(def.name)}</b><span>${esc(def.text)}</span><em>${progress}/${def.target}</em></div>`;
  }

  private renderNode(n: CampaignNode): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const sys = systemDef(n.systemId);
    const mine = n.owner === me.id;
    const owner = n.owner ? factionById(s, n.owner) : null;
    const planets = sys.planets
      .map((pl, j) => {
        const level = pl.level + (n.boosts[j] ?? 0);
        const pips = [0, 1, 2].map((i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
        const up =
          mine && canUpgradePlanet(n, j)
            ? `<button class="pill-btn" data-act="cmp-planet" data-node="${n.id}" data-arg="${j}" ${me.credits < upgradeCost(n, j) ? 'disabled' : ''}>+1 · ${CREDITS}${upgradeCost(n, j)}</button>`
            : '';
        return `<div class="cmp-planet"><span>${TRACK_ICON[pl.track]} ${lower(pl.name)}</span><span class="pips">${pips}</span>${up}</div>`;
      })
      .join('');
    const g = garrisonBonus(n);
    const bonus = [
      g.opening.money && `+${g.opening.money} money`,
      g.opening.draw && `+${g.opening.draw} cards`,
      g.opening.shields && `+${g.opening.shields} shields`,
      g.bombard && `attacker starts +${g.bombard} heat`,
      g.chill && `sun starts ${g.chill} cooler`,
      g.planetLevels && `+${g.planetLevels} planet level${g.planetLevels > 1 ? 's' : ''}`,
    ].filter(Boolean);
    const garrison = n.garrison
      .map((c) => {
        const def = cardDef(c.defId);
        const state = c.status === 'stationed' ? 'stationed' : c.status === 'arriving' ? 'arrives next turn' : 'leaves next turn';
        const recall = mine && c.status === 'stationed' ? `<button class="pill-btn" data-act="cmp-recall" data-node="${n.id}" data-arg="${c.uid}">recall</button>` : '';
        return `<div class="cmp-gar ${c.status}" style="--kc:${KIND_COLOUR[def.kind]}"><span class="cmp-gar-glyph">${cardGlyph(def.id, def.kind)}</span><span><b>${lower(def.name)}</b><small>${state}</small></span>${recall}</div>`;
      })
      .join('');
    const slotsFree = CAMPAIGN.garrisonSlots - n.garrison.length;
    const froms = !me.attacked && s.phase === 'player' ? attackOptions(s, me.id).find((o) => o.toId === n.id)?.fromIds ?? [] : [];
    const attack = froms.length
      ? `<div class="cmp-actions">${froms.map((f) => `<button class="btn-primary" data-act="cmp-attack-pick" data-arg="${n.id}" data-from="${f}">attack from ${lower(nodeById(s, f).name)}</button>`).join('')}</div>`
      : '';
    const status = n.hazard.length ? '<p class="cmp-warn">Supernova remnant: rivals cannot advance into it this turn.</p>' : '';
    return `
      <div class="cmp-node-head" style="--fc:${n.owner ? FACTION_COLOUR[n.owner] : NEUTRAL}">
        <i></i>
        <div><h3>${lower(n.name)}</h3><small>${owner ? (mine ? 'your system' : lower(owner.name)) : `neutral · sentinels tier ${n.tier + 1}`}${n.home ? ' · home' : ''}</small></div>
        <button class="icon-btn" data-act="cmp-select" data-arg="${n.id}" aria-label="Close">×</button>
      </div>
      ${status}
      ${attack}
      <div class="cmp-sys"><b>${lower(sys.name)}</b><span>+ ${esc(sys.abilityText)}</span><span class="sys-drawback">− ${esc(sys.drawbackText)}</span></div>
      <div class="cmp-yield">yield ${CREDITS} ${n.yield.credits} · ${MATERIALS} ${n.yield.materials} per turn</div>
      <div class="section-label">planets</div>
      <div class="cmp-planets">${planets}</div>
      ${
        n.damage || mine
          ? `<div class="cmp-damage"><span>damage ✸ ${n.damage}${n.damage ? ` <small>(its sun starts ${n.damage} hotter)</small>` : ''}</span>${
              mine && n.damage ? `<button class="pill-btn" data-act="cmp-heal" data-arg="${n.id}" ${me.credits < CAMPAIGN.healCostPerPoint ? 'disabled' : ''}>repair 1 · ${CREDITS}${CAMPAIGN.healCostPerPoint}</button>` : ''
            }</div>`
          : ''
      }
      <div class="section-label">garrison <span>${n.garrison.length}/${CAMPAIGN.garrisonSlots}</span></div>
      <div class="cmp-garrison">${garrison || '<p class="muted">No cards stationed.</p>'}</div>
      ${bonus.length ? `<p class="cmp-bonus">If attacked: ${bonus.join(', ')}.</p>` : ''}
      ${mine && slotsFree > 0 ? `<button class="btn" data-act="cmp-station-open" data-arg="${n.id}">send a card</button>` : ''}`;
  }

  // ---- Overlays -------------------------------------------------------------------

  private renderOverlay(): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    if (s.winner) {
      const won = s.winner === me.id;
      return this.modal(
        won ? 'victory' : 'defeat',
        `<div class="center"><h2>${won ? 'the universe is yours' : `${lower(factionById(s, s.winner).name)} dominates`}</h2>
          <p>${won ? `You control ${ownedNodes(s, me.id).length} of ${s.nodes.length} systems after ${s.turn} turns.` : 'Your last system has fallen, or a rival held more of the universe.'}</p>
          <button class="btn-primary" data-act="cmp-abandon">back to menu</button></div>`,
      );
    }
    if (s.battle) {
      const b = s.battle;
      const node = nodeById(s, b.nodeId);
      const attacker = factionById(s, b.attacker);
      const mine = b.attacker === me.id;
      return this.modal(
        mine ? 'battle in progress' : 'incoming attack',
        `<div class="center"><h2>${mine ? `the battle for ${lower(node.name)}` : `${lower(attacker.name)} attacks ${lower(node.name)}`}</h2>
          <p>${mine ? 'Return to the battle, or let your commanders finish it.' : 'Defend your system in battle, or let your commanders resolve it automatically.'}</p>
          ${this.matchup(nodeById(s, b.fromId), node)}
          <div class="menu-actions center-row"><button class="btn-primary" data-act="cmp-defend">${mine ? 'resume battle' : 'defend'}</button><button class="btn" data-act="cmp-defend-auto">auto-resolve</button></div></div>`,
      );
    }
    if (s.conquest) {
      const n = nodeById(s, s.conquest.nodeId);
      const spoils = n.garrison.length ? ` Its garrison (${n.garrison.map((g) => cardDef(g.defId).name).join(', ')}) is yours either way.` : '';
      const opt = (id: string, title: string, text: string) => `<button class="cmp-choice" data-act="cmp-conquer" data-arg="${id}"><b>${title}</b><span>${text}</span></button>`;
      return this.modal(
        `${lower(n.name)} has fallen`,
        `<p class="muted">Decide the system's fate.${esc(spoils)}</p>
         <div class="cmp-choices">
          ${opt('settle', 'settle', `Take control. ${CREDITS} +${n.yield.credits} and ${MATERIALS} +${n.yield.materials} every turn, and a new front to defend.`)}
          ${opt('absorb', 'absorb', `Strip it: ${CREDITS} +${n.yield.credits * CAMPAIGN.absorbTurns} and ${MATERIALS} +${n.yield.materials * CAMPAIGN.absorbTurns} now. It is left neutral and depleted.`)}
          ${opt('supernova', 'supernova', 'Detonate its sun. It is left neutral, and no rival can advance into it for a turn.')}
         </div>`,
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
        return this.renderDeck(sh.slot);
      case 'armory': {
        const cards = s.armory
          .map(
            (id, i) =>
              `<button class="cmp-pick" data-act="cmp-buy" data-arg="${i}" ${me.materials < armoryPrice(id) ? 'disabled' : ''}>${cardHtml(id)}<span class="cmp-price">${MATERIALS} ${armoryPrice(id)}</span></button>`,
          )
          .join('');
        return this.modal(
          'armory',
          `<div class="cmp-cards">${cards || '<p class="muted">Sold out. New stock arrives next turn.</p>'}</div>
           <p class="muted center-text">Bought cards join your reserve. Stock changes every turn. You have ${MATERIALS} ${me.materials}.</p>`,
          true,
        );
      }
      case 'missions': {
        const active = me.missions.map((m) => this.missionRow(m.id, missionProgress(s, me, m))).join('');
        return this.modal(
          'missions',
          `<div class="cmp-missions">${active || '<p class="muted">All missions complete.</p>'}</div>
           <p class="muted">Each completed mission pays ${CREDITS} ${CAMPAIGN.missionCredits} and ${MATERIALS} ${CAMPAIGN.missionMaterials}, and lets you choose a new card. ${CAMPAIGN_MISSIONS.length} missions in all.</p>`,
          true,
        );
      }
      case 'log':
        return this.modal('campaign log', `<div class="log-list">${s.log.map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`, true);
      case 'help':
        return this.modal(
          'how the campaign works',
          `<ul class="rules">
            <li><b>Attack</b> one system per turn: any system linked to one you control. The battle is a normal game, played from your system against theirs.</li>
            <li><b>Win</b> and choose: <b>Settle</b> it, <b>Absorb</b> its resources, or <b>Supernova</b> it to block rivals for a turn.</li>
            <li>A winner's sun carries its heat home as <b>damage</b> (it starts battles hotter). Repair it with ${CREDITS} credits; upgrade planets with credits too.</li>
            <li>Your battle <b>deck is always 10 cards</b>; empty slots are Stardust. Earn cards from missions, buy them in the armory and upgrade them with ${MATERIALS} materials.</li>
            <li><b>Send cards</b> to a system's garrison (up to ${CAMPAIGN.garrisonSlots}) to defend it: each gives its power as a head start when the system is attacked. Cards take a turn to arrive and a turn to return. If the system falls, the conqueror takes them.</li>
          </ul>`,
          true,
        );
      case 'station': {
        const n = nodeById(s, sh.nodeId);
        const pick = (list: string[], from: CardSource) =>
          list
            .map((id, i) => (canGarrison(id) ? `<button class="cmp-pick" data-act="cmp-station" data-from="${from}" data-arg="${i}">${cardHtml(id)}<span class="cmp-price">${from}</span></button>` : ''))
            .join('');
        const cards = pick(me.reserve, 'reserve') + pick(me.deck, 'deck');
        return this.modal(
          `send a card to ${lower(n.name)}`,
          `<div class="cmp-cards">${cards || '<p class="muted">No cards to send. Stardust cannot garrison; win missions or visit the armory for more.</p>'}</div>
           <p class="muted center-text">It arrives next turn and defends from then on. A deck card leaves a Stardust in its slot.</p>`,
          true,
        );
      }
      case 'attack': {
        const from = nodeById(s, sh.fromId);
        const to = nodeById(s, sh.toId);
        return this.modal(
          `attack ${lower(to.name)}`,
          `<div class="center">${this.matchup(from, to)}
            <div class="menu-actions center-row"><button class="btn-primary" data-act="cmp-fight">fight</button><button class="btn" data-act="cmp-auto">auto-resolve</button><button class="btn" data-act="cmp-close">cancel</button></div></div>`,
        );
      }
    }
  }

  private matchup(from: CampaignNode, to: CampaignNode): string {
    const s = this.state!;
    const side = (n: CampaignNode, label: string) => {
      const sys = systemDef(n.systemId);
      const who = n.owner ? factionById(s, n.owner).name : `${n.name} Sentinels`;
      return `<div class="cmp-side-card" style="--fc:${n.owner ? FACTION_COLOUR[n.owner] : NEUTRAL}"><small>${label}</small><b>${lower(who)}</b><span>${lower(n.name)} · ${lower(sys.name)}</span>${n.damage ? `<span class="cmp-dmg">✸ ${n.damage} damage</span>` : ''}</div>`;
    };
    const g = garrisonBonus(to);
    const def = [g.opening.money && `+${g.opening.money} money`, g.opening.shields && `+${g.opening.shields} shields`, g.opening.draw && `+${g.opening.draw} cards`, g.bombard && `+${g.bombard} heat on the attacker`, g.chill && `${g.chill} cooler`, g.planetLevels && `+${g.planetLevels} planet levels`].filter(Boolean);
    return `<div class="cmp-matchup">${side(from, 'attacker')}<span class="cmp-vs">vs</span>${side(to, 'defender')}</div>${def.length ? `<p class="cmp-bonus">Defender's garrison: ${def.join(', ')}.</p>` : ''}`;
  }

  private renderDeck(slot?: number): string {
    const me = campaignPlayer(this.state!);
    const upgrade = (id: string, from: CardSource, i: number) => {
      const price = cardUpgradePrice(id);
      if (price === null) return '';
      return `<button class="pill-btn" data-act="cmp-upgrade-card" data-from="${from}" data-arg="${i}" ${me.materials < price ? 'disabled' : ''} title="Upgrade into ${esc(cardDef(CARD_UPGRADES[id]).name)}">→ ${lower(cardDef(CARD_UPGRADES[id]).name)} · ${MATERIALS}${price}</button>`;
    };
    if (slot !== undefined) {
      const current = me.deck[slot];
      const options = me.reserve.map((id, i) => `<button class="cmp-pick" data-act="cmp-swap" data-arg="${i}">${cardHtml(id)}</button>`).join('');
      return this.modal(
        `deck slot ${slot + 1}: ${lower(cardDef(current).name)}`,
        `<p class="muted center-text">Choose a reserve card for this slot${current !== 'stardust' ? `, or put ${esc(cardDef(current).name)} back in reserve` : ''}.</p>
         <div class="cmp-cards">${options || '<p class="muted">Your reserve is empty.</p>'}</div>
         <div class="center-row">${current !== 'stardust' ? '<button class="btn" data-act="cmp-swap" data-arg="">replace with stardust</button>' : ''}<button class="btn" data-act="cmp-close">back</button></div>`,
      );
    }
    const deck = me.deck
      .map((id, i) => `<div class="cmp-deck-slot"><button class="cmp-pick" data-act="cmp-slot" data-arg="${i}">${cardHtml(id)}</button>${upgrade(id, 'deck', i)}</div>`)
      .join('');
    const reserve = me.reserve.map((id, i) => `<div class="cmp-deck-slot">${cardHtml(id)}${upgrade(id, 'reserve', i)}</div>`).join('');
    return this.modal(
      `battle deck · ${CAMPAIGN.deckSize} cards`,
      `<p class="muted center-text">Tap a card to swap it. Upgrades cost ${MATERIALS} materials (you have ${me.materials}).</p>
       <div class="cmp-cards cmp-deck">${deck}</div>
       <div class="section-label">reserve · ${me.reserve.length}</div>
       <div class="cmp-cards cmp-deck">${reserve || '<p class="muted">Cards you win or buy wait here until you put them in your deck.</p>'}</div>`,
      true,
    );
  }

  private modal(title: string, body: string, closable = false): string {
    return `
      <div class="overlay ${closable ? 'overlay-soft' : ''}" ${closable ? 'data-act="cmp-close"' : ''}>
        <div class="modal modal-wide cmp-modal">
          <div class="bar-title">${title}${closable ? '<button class="modal-x" data-act="cmp-close" aria-label="Close">×</button>' : ''}</div>
          <div class="modal-body">${body}</div>
        </div>
      </div>`;
  }
}

/** A small read-only card face. */
function cardHtml(defId: string): string {
  const def = cardDef(defId);
  return `
    <div class="card cmp-card kind-${def.kind}" style="--kc:${KIND_COLOUR[def.kind]}">
      <div class="card-glyph">${cardGlyph(def.id, def.kind)}</div>
      <div class="card-name">${lower(def.name)}</div>
      <div class="card-text">${esc(def.text)}</div>
      <div class="card-kind">${def.kind === 'basic' ? 'money' : def.kind}</div>
    </div>`;
}
