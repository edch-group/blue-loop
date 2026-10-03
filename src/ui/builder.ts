import { BALANCE, coverCard, plainText, breakable, breakdownValue, CARDS, CARD_KINDS, cardCost, cardDef, commandCardsFor, copyLimit, craftCost, deckProblems, ownsDeck, RACE_NAMES, RARITIES, RARITY_NAME, type CardDef, type CardKind, type Rarity } from '../engine';
import { customDecks, deleteDeck, deckById, PRESETS, saveDeck, type SavedDeck } from './decks';
import { FACTION_COLOUR, factionAvatar } from './factions';
import { cardArtLite, cardTextHtml, KIND_COLOUR, stabilityBadge, typeLine, typeWords } from './glyphs';
import { fitWhenSeen } from './fittext';
import { owned, profile } from './profile';
import { breakCard, craftCard } from './account';

interface BuilderHost {
  render(): void;
  toast(text: string): void;
  /** Leave the builder (back to quickplay). */
  done(): void;
  /** Show a card large. */
  zoom(id: string): void;
}

/**
 * The card view's filters: a search, and for race, type, rarity, cost and collection any number of
 * values ticked (none ticked lets everything through), an order, and two toggles.
 */
interface Filters {
  q: string;
  race: Set<string>;
  kind: Set<string>;
  rarity: Set<string>;
  cost: Set<string>;
  own: Set<string>;
  sort: 'race' | 'name' | 'type' | 'rarity' | 'cost';
  characters: boolean;
  inDeck: boolean;
}

type MultiKey = 'race' | 'kind' | 'rarity' | 'cost' | 'own';
const MULTI: MultiKey[] = ['race', 'kind', 'rarity', 'cost', 'own'];
const noFilters = (): Filters => ({ q: '', race: new Set(), kind: new Set(), rarity: new Set(), cost: new Set(), own: new Set(), sort: 'race', characters: false, inDeck: false });
/** A card's cost as the cost filter groups it: 0–3, 4+ or X. */
const costGroup = (c: CardDef) => (c.spendAll ? 'x' : String(Math.min(4, cardCost(c.id))));
const RARITY_ORDER: Record<Rarity, number> = { dwarf: 0, stellar: 1, anomaly: 2 };

/** The card-size buttons: many small cards, some medium, a few large. */
const GRID_ICON = {
  sm: `<svg viewBox="0 0 14 14" aria-hidden="true">${[0, 5, 10].flatMap((y) => [0, 5, 10].map((x) => `<rect x="${x}" y="${y}" width="4" height="4" rx="1"/>`)).join('')}</svg>`,
  md: `<svg viewBox="0 0 14 14" aria-hidden="true">${[0, 7.5].flatMap((y) => [0, 7.5].map((x) => `<rect x="${x}" y="${y}" width="6.5" height="6.5" rx="1.5"/>`)).join('')}</svg>`,
  lg: '<svg viewBox="0 0 14 14" aria-hidden="true"><rect width="14" height="14" rx="2.5"/></svg>',
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The deck builder: a list of decks (the four race presets, which can be
 * copied, and the player's own), and an editor with the whole card pool on the
 * left and the deck on the right. A deck saves once it is legal.
 */
export class DeckBuilder {
  private editing: SavedDeck | null = null;
  /** Opened from a starter deck: the starter as it was (a changed starter saves as a copy of its own). */
  private starter: SavedDeck | null = null;
  private filters: Filters = noFilters();
  /** A card opened to craft or break down. */
  private focus: string | null = null;
  /** The filters popover, open or shut, and which of its dropdowns is open. */
  private filtersOpen = false;
  private dropOpen: string | null = null;
  /** The deck as it was opened (to tell whether leaving would lose changes), and the leave-without-saving question. */
  private openedAs: SavedDeck | null = null;
  private openedSnap = '';
  private confirmExit = false;
  /** How big the cards in the pool are (small fits more on a screen). Remembered on this device. */
  private grid: 'sm' | 'md' | 'lg' = (() => {
    try {
      const g = localStorage.getItem('blue-loop:db-grid');
      return g === 'sm' || g === 'lg' ? g : 'md';
    } catch {
      return 'md';
    }
  })();

  constructor(private host: BuilderHost) {}

  open() {
    this.editing = this.starter = null;
  }

  onInput(value: string) {
    if (this.editing) this.editing.name = value.slice(0, 24);
  }

  /** The card search, as it is typed. */
  onSearch(value: string) {
    this.filters.q = value.slice(0, 40);
    this.host.render();
  }

  /** Handle a `db-` action; returns true if it was one. */
  onClick(act: string, arg: string): boolean {
    const d = this.editing;
    switch (act) {
      case 'db-back':
        if (this.editing) this.editing = this.starter = null;
        else this.host.done();
        break;
      case 'db-exit':
        // Leave the deck: ask first if that would lose changes.
        if (d && snap(d) !== this.openedSnap) this.confirmExit = true;
        else this.editing = this.starter = null;
        break;
      case 'db-exit-keep':
        this.confirmExit = false;
        break;
      case 'db-exit-discard':
        this.confirmExit = false;
        this.editing = this.starter = null;
        break;
      case 'db-view': {
        // A starter opens just as a deck of your own does; change anything and it saves as a copy.
        const src = deckById(arg);
        if (!src) return true;
        this.starter = src;
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: src.name, race: src.race, cards: [...src.cards] };
        this.filters = noFilters();
        break;
      }
      case 'db-new':
        this.starter = null;
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: 'New deck', race: 0, cards: [] };
        this.filters = noFilters();
        break;
      case 'db-copy': {
        const src = deckById(arg);
        if (!src) return true;
        this.starter = null;
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: `${src.name} copy`, race: src.race, cards: [...src.cards] };
        break;
      }
      case 'db-edit': {
        const src = deckById(arg);
        if (src && !src.preset) {
          this.starter = null;
          this.editing = { ...src, cards: [...src.cards] };
        }
        break;
      }
      case 'db-delete':
        deleteDeck(arg);
        break;
      case 'db-filters':
        this.filtersOpen = !this.filtersOpen;
        break;
      case 'db-grid':
        if (arg === 'sm' || arg === 'md' || arg === 'lg') {
          this.grid = arg;
          try {
            localStorage.setItem('blue-loop:db-grid', arg);
          } catch {
            // only a convenience
          }
        }
        break;
      // The filters change in place: the popover stays as it is, and only the cards (and the ticks) update.
      case 'db-drop':
        this.dropOpen = this.dropOpen === arg ? null : arg;
        document.querySelectorAll<HTMLElement>('.db-drop').forEach((el) => el.classList.toggle('open', el.dataset.drop === this.dropOpen));
        return true;
      case 'db-opt': {
        const [key, value] = arg.split(':') as [MultiKey, string];
        const set = this.filters[key];
        if (set.has(value)) set.delete(value);
        else set.add(value);
        this.refreshPool();
        return true;
      }
      case 'db-sort':
        if (['race', 'name', 'type', 'rarity', 'cost'].includes(arg)) this.filters.sort = arg as Filters['sort'];
        this.refreshPool();
        return true;
      case 'db-toggle':
        if (arg === 'characters' || arg === 'inDeck') this.filters[arg] = !this.filters[arg];
        this.refreshPool();
        return true;
      case 'db-clear':
        this.filters = { ...noFilters(), q: this.filters.q };
        this.refreshPool();
        return true;
      case 'db-race':
        if (d) d.race = Number(arg);
        break;
      case 'db-zoom':
        this.host.zoom(arg);
        return true;
      case 'db-focus':
        this.focus = this.focus === arg ? null : arg;
        break;
      // Crafting and breaking down are the server's to do (it keeps the collection); the page updates once it answers.
      case 'db-craft':
      case 'db-break':
        void (act === 'db-craft' ? craftCard(arg) : breakCard(arg)).then((why) => {
          if (why) this.host.toast(why);
          this.host.render();
        });
        return true;
      case 'db-add': {
        if (!d) return true;
        const copies = d.cards.filter((id) => id === arg).length;
        const commands = d.cards.filter((id) => cardDef(id).kind === 'command').length;
        // A card you don't own (or not enough copies of): offer to craft it.
        if (copies >= owned(arg) && copies < copyLimit(arg)) {
          this.focus = arg;
          this.host.toast(owned(arg) ? `You own ${owned(arg)} ${cardDef(arg).name}: craft another to add it.` : `You don't own ${cardDef(arg).name} yet: craft it with flux, or find it in a booster.`);
        } else if (d.cards.length >= BALANCE.maxDeckSize) this.host.toast(`A deck holds at most ${BALANCE.maxDeckSize} cards.`);
        else if (copies >= copyLimit(arg)) this.host.toast(copyLimit(arg) === 1 ? `${cardDef(arg).name} is an Anomaly: one copy per deck.` : `At most ${BALANCE.maxCopies} copies of a card.`);
        else if (cardDef(arg).kind === 'command' && commands >= commandCardsFor(BALANCE.maxDeckSize)) this.host.toast(`A deck holds at most ${commandCardsFor(BALANCE.maxDeckSize)} Command cards (one per ${BALANCE.cardsPerCommand} cards).`);
        else d.cards.push(arg);
        d.race = deckRace(d);
        break;
      }
      case 'db-remove': {
        if (!d) return true;
        const i = d.cards.lastIndexOf(arg);
        if (i >= 0) d.cards.splice(i, 1);
        d.race = deckRace(d);
        break;
      }
      case 'db-save': {
        if (!d) return true;
        const problems = deckProblems(d.cards);
        if (problems.length) {
          this.host.toast(problems[0]);
          return true;
        }
        if (!ownsDeck(profile().collection, d.cards)) {
          this.host.toast('This deck uses cards you no longer own.');
          return true;
        }
        d.name = d.name.trim() || 'Unnamed deck';
        const st = this.starter;
        const changed = !st || d.name !== st.name || d.race !== st.race || [...d.cards].sort().join() !== [...st.cards].sort().join();
        if (st && !changed) {
          // Nothing to keep: the starter is still there as it was.
          this.editing = this.starter = null;
          break;
        }
        if (st && d.name === st.name) d.name = `${st.name} copy`.slice(0, 24);
        saveDeck(d);
        if (st) this.host.toast(`Saved as a new deck: ${d.name}. The starter stays as it was.`);
        this.editing = this.starter = null;
        break;
      }
      default:
        return false;
    }
    this.host.render();
    return true;
  }

  render(): string {
    // A deck just opened: remember it as it was.
    if (this.editing && this.editing !== this.openedAs) {
      this.openedAs = this.editing;
      this.openedSnap = snap(this.editing);
      this.confirmExit = false;
    }
    return this.editing ? this.renderEditor(this.editing) : this.renderList();
  }

  private header(title: string, action = '<span></span>'): string {
    return `
      <header class="setup-top">
        <button class="btn btn-small" data-act="db-back">‹ back</button>
        <h2 class="menu-heading">${title}</h2>
        ${action}
      </header>`;
  }

  private renderList(): string {
    const box = (d: SavedDeck) =>
      deckBox(d, {
        act: d.preset ? 'db-view' : 'db-edit',
        title: d.preset ? 'Look through it (changes save as a copy)' : 'Edit it',
        actions: d.preset
          ? `<button class="pill-btn" data-act="db-view" data-arg="${d.id}">view</button><button class="pill-btn" data-act="db-copy" data-arg="${d.id}">copy</button>`
          : `<button class="pill-btn" data-act="db-edit" data-arg="${d.id}">edit</button><button class="pill-btn" data-act="db-delete" data-arg="${d.id}">delete</button>`,
      });
    const mine = customDecks();
    return `
      ${this.header('decks', '<button class="btn btn-small btn-new-deck" data-act="db-new">+ new deck</button>')}
      <div class="setup-body db-list-body">
        <div class="db-list">
          <div class="section-label">race starters</div>
          <div class="db-boxes">${PRESETS.map(box).join('')}</div>
          <div class="section-label">your decks</div>
          ${mine.length ? `<div class="db-boxes">${mine.map(box).join('')}</div>` : '<p class="muted">No decks of your own yet. Start a new one, or copy a starter to change it.</p>'}
        </div>
      </div>`;
  }

  private renderEditor(d: SavedDeck): string {
    const count = (id: string) => d.cards.filter((x) => x === id).length;
    const pool = this.poolCards(d);
    // The deck, card by card: a pill in the card's own colours with its picture, by type then name.
    const grouped = [...new Set(d.cards)]
      .sort((a, b) => cardDef(a).kind.localeCompare(cardDef(b).kind) || cardDef(a).name.localeCompare(cardDef(b).name))
      .map((id) => {
        const c = cardDef(id);
        return `
        <button class="db-row rarity-${c.rarity ?? 'dwarf'}" data-act="db-remove" data-arg="${id}" data-card="${id}" style="--kc:${KIND_COLOUR[c.kind]}" title="Tap to remove one">
          <span class="db-row-art">${cardArtLite(c)}</span>
          <span class="db-row-name"><b>${esc(c.name.toLowerCase())}</b><small>${typeWords(c)}</small></span>
          <b class="db-row-n">×${count(id)}</b><i>−</i>
        </button>`;
      })
      .join('');
    const commands = d.cards.filter((id) => cardDef(id).kind === 'command').length;
    // (Saving a deck that isn't ready yet says what it still needs.)
    return `
      <div class="setup-body db-editor">
        <div class="db-pool-side">
          ${this.renderFilters(d)}
          <div class="db-pool" data-grid="${this.grid}">${pool.join('') || '<p class="muted">No cards match these filters.</p>'}</div>
        </div>
        <aside class="db-deck-side">
          <input class="db-name" data-db-name value="${esc(d.name)}" maxlength="24" aria-label="Deck name" />
          <div class="db-tally"><b class="${d.cards.length >= BALANCE.deckSize && d.cards.length <= BALANCE.maxDeckSize ? 'ok' : ''}" title="${BALANCE.deckSize}–${BALANCE.maxDeckSize} cards">${d.cards.length}/${d.cards.length > BALANCE.deckSize ? BALANCE.maxDeckSize : BALANCE.deckSize}</b> cards · <b class="${commands === commandCardsFor(d.cards.length) ? 'ok' : ''}" title="One Command card per ${BALANCE.cardsPerCommand} cards">${commands}/${commandCardsFor(d.cards.length)}</b> command</div>
          ${this.focus ? this.renderFocus(this.focus) : ''}
          <div class="db-rows">${grouped || '<p class="muted">Tap cards on the left to add them.</p>'}</div>
          <div class="db-actions"><button class="btn btn-small btn-exit" data-act="db-exit">exit</button><button class="btn-primary btn-small" data-act="db-save">save</button></div>
        </aside>
      </div>
      ${
        this.confirmExit
          ? `<div class="overlay overlay-soft db-confirm-overlay"><div class="modal db-confirm">
              <b>leave without saving?</b>
              <p>Your changes to ${esc(d.name || 'this deck')} will be lost.</p>
              <div class="db-confirm-actions"><button class="btn" data-act="db-exit-keep">keep editing</button><button class="btn btn-danger" data-act="db-exit-discard">leave</button></div>
            </div></div>`
          : ''
      }`;
  }

  /** The card pool's tiles, as the filters let them through. */
  private poolCards(d: SavedDeck): string[] {
    const count = (id: string) => d.cards.filter((x) => x === id).length;
    return this.filtered(d)
      .map((c) => {
        const n = count(c.id);
        const have = owned(c.id);
        return `
          <button class="db-card ${n ? 'db-card-in' : ''} ${have ? '' : 'db-card-locked'} ${this.focus === c.id ? 'db-card-focus' : ''}" data-act="db-add" data-arg="${c.id}" data-card="${c.id}" style="--kc:${KIND_COLOUR[c.kind]}">
            <span class="card kind-${c.kind}${c.race !== undefined ? ` race-${c.race}` : ''} rarity-${c.rarity ?? 'dwarf'}">
              <span class="card-glyph">${cardArtLite(c, true)}</span>${stabilityBadge(c)}
              <span class="card-name">${esc(c.name.toLowerCase())}</span>
              <span class="card-text">${cardTextHtml(c.text)}</span>
              <span class="card-kind">${typeLine(c)}</span>
            </span>
            <span class="db-have ${n ? 'on' : ''}" data-act="db-focus" data-arg="${c.id}" title="${n} in this deck, ${have} owned: tap to craft or break down">${n}/${have}</span>
            <span class="db-zoom" data-act="db-zoom" data-arg="${c.id}" title="Read it large (or right-click the card)">⤢</span>
          </button>`;
      });
  }

  /** After a filter changes: the pool, the ticks and the filter count update in place (no redraw). */
  private refreshPool() {
    const d = this.editing;
    const pool = document.querySelector<HTMLElement>('.db-pool');
    if (!d || !pool) return this.host.render();
    pool.innerHTML = this.poolCards(d).join('') || '<p class="muted">No cards match these filters.</p>';
    fitWhenSeen(pool.querySelectorAll<HTMLElement>('.db-card'));
    const pop = document.querySelector<HTMLElement>('.db-filters-pop');
    const btn = document.querySelector<HTMLElement>('.db-filter-btn');
    const html = document.createElement('div');
    html.innerHTML = this.renderFilters(d);
    // The ticks, values and button label, copied across from a fresh render of the toolbar.
    const fresh = html.querySelector<HTMLElement>('.db-filters-pop');
    if (pop && fresh) {
      pop.querySelectorAll<HTMLElement>('[data-act="db-opt"], [data-act="db-sort"], [data-act="db-toggle"]').forEach((el) => {
        const twin = fresh.querySelector<HTMLElement>(`[data-act="${el.dataset.act}"][data-arg="${el.dataset.arg}"]`);
        if (twin) el.className = twin.className;
      });
      pop.querySelectorAll<HTMLElement>('.db-drop-val').forEach((el, i) => (el.textContent = fresh.querySelectorAll('.db-drop-val')[i]?.textContent ?? ''));
      const foot = pop.querySelector('.db-filters-foot');
      const freshFoot = fresh.querySelector('.db-filters-foot');
      if (foot && freshFoot) foot.innerHTML = freshFoot.innerHTML;
    }
    const freshBtn = html.querySelector<HTMLElement>('.db-filter-btn');
    if (btn && freshBtn) {
      btn.className = freshBtn.className;
      btn.textContent = freshBtn.textContent;
    }
  }

  /** Crafting: make another copy with flux, or break a spare one down for half its cost. */
  private renderFocus(id: string): string {
    const def = cardDef(id);
    const p = profile();
    const have = owned(id);
    const cost = craftCost(id);
    const spare = breakable(p.collection, id);
    return `
      <div class="db-focus">
        <div class="db-focus-head"><b>${esc(def.name.toLowerCase())}</b><button class="pill-btn" data-act="db-focus" data-arg="${id}">close</button></div>
        <small>owned ${have} · a deck may hold ${copyLimit(id)} · you have ⟁${p.flux} flux</small>
        <div class="db-focus-actions">
          <button class="btn btn-small" data-act="db-craft" data-arg="${id}" ${p.flux < cost ? 'disabled' : ''}>craft · ⟁${cost}</button>
          <button class="btn btn-small" data-act="db-break" data-arg="${id}" ${spare ? '' : 'disabled'} title="${spare ? '' : 'Starter cards are kept'}">break down · +⟁${breakdownValue(id)}</button>
        </div>
      </div>`;
  }

  /** The cards the filters let through, in the chosen order. */
  private filtered(d: SavedDeck): CardDef[] {
    const f = this.filters;
    const q = f.q.trim().toLowerCase();
    const inDeck = new Set(d.cards);
    const flux = profile().flux;
    const list = CARDS.filter((c) => {
      if (q && !`${c.name} ${plainText(c.text)} ${c.kind} ${c.race !== undefined ? RACE_NAMES[c.race] : 'neutral'}`.toLowerCase().includes(q)) return false;
      const race = c.race === undefined ? 'neutral' : String(c.race);
      if (f.race.size && !f.race.has(race) && !(f.race.has('deck') && (c.race === undefined || c.race === d.race))) return false;
      if (f.kind.size && !f.kind.has(c.kind)) return false;
      if (f.rarity.size && !f.rarity.has(c.rarity ?? 'dwarf')) return false;
      if (f.cost.size && !f.cost.has(costGroup(c))) return false;
      if (f.own.size) {
        const have = owned(c.id);
        const ok = (f.own.has('owned') && have > 0) || (f.own.has('missing') && have === 0) || (f.own.has('craftable') && have < copyLimit(c.id) && craftCost(c.id) <= flux);
        if (!ok) return false;
      }
      if (f.characters && !c.character) return false;
      if (f.inDeck && !inDeck.has(c.id)) return false;
      return true;
    });
    const byRace = (a: CardDef, b: CardDef) => (a.race === d.race ? -1 : 0) - (b.race === d.race ? -1 : 0) || (a.race ?? 9) - (b.race ?? 9);
    const order: Record<Filters['sort'], (a: CardDef, b: CardDef) => number> = {
      race: byRace,
      name: (a, b) => a.name.localeCompare(b.name),
      type: (a, b) => CARD_KINDS.indexOf(a.kind) - CARD_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name),
      rarity: (a, b) => RARITY_ORDER[b.rarity ?? 'dwarf'] - RARITY_ORDER[a.rarity ?? 'dwarf'] || a.name.localeCompare(b.name),
      cost: (a, b) => (a.spendAll ? 9 : cardCost(a.id)) - (b.spendAll ? 9 : cardCost(b.id)) || a.name.localeCompare(b.name),
    };
    return list.sort(order[f.sort]);
  }

  /** The card view's toolbar: search, the filters button (its popover: dropdowns of ticks, and toggles), card sizes. */
  private renderFilters(d: SavedDeck): string {
    const f = this.filters;
    // A dropdown in the app's own style: its head names what is ticked; its rows tick on and off.
    const drop = (key: string, label: string, rows: [string, string][], picked: (v: string) => boolean, act: string, summary: string) => `
      <div class="db-drop ${this.dropOpen === key ? 'open' : ''}" data-drop="${key}">
        <button class="db-drop-head" data-act="db-drop" data-arg="${key}"><small>${label}</small><span class="db-drop-val">${esc(summary)}</span><i class="db-drop-caret"></i></button>
        <div class="db-drop-list" role="${act === 'db-sort' ? 'radiogroup' : 'group'}">${rows
          .map(([v, t]) => `<button class="db-opt ${act === 'db-sort' ? 'db-opt-radio' : ''} ${picked(v) ? 'on' : ''}" data-act="${act}" data-arg="${act === 'db-sort' ? v : `${key}:${v}`}"><i class="db-check"></i>${esc(t)}</button>`)
          .join('')}</div>
      </div>`;
    const multi = (key: MultiKey, label: string, rows: [string, string][], none: string) => {
      const on = rows.filter(([v]) => f[key].has(v)).map(([, t]) => t);
      return drop(key, label, rows, (v) => f[key].has(v), 'db-opt', on.length === 0 ? none : on.length === 1 ? on[0] : `${on.length} picked`);
    };
    const races: [string, string][] = [['deck', `${RACE_NAMES[d.race].toLowerCase()} + neutral`], ['neutral', 'neutral'], ...RACE_NAMES.map((n, i): [string, string] => [String(i), n.toLowerCase()])];
    const kinds: [string, string][] = CARD_KINDS.map((k): [string, string] => [k, k]);
    const rarities: [string, string][] = RARITIES.map((r): [string, string] => [r, RARITY_NAME[r].toLowerCase()]);
    const costs: [string, string][] = [['0', 'free'], ['1', '1 energy'], ['2', '2 energy'], ['3', '3 energy'], ['4', '4 or more'], ['x', 'X (all you have)']];
    const owns: [string, string][] = [['owned', 'owned'], ['missing', 'not owned'], ['craftable', 'craftable now']];
    const sorts: [string, string][] = [['race', 'by race'], ['name', 'by name'], ['type', 'by type'], ['cost', 'by cost'], ['rarity', 'by rarity']];
    const toggle = (key: 'characters' | 'inDeck', label: string) => `<button class="pill-btn ${f[key] ? 'pill-on' : ''}" data-act="db-toggle" data-arg="${key}">${label}</button>`;
    // How many filters are set (the search aside), shown on the filter button.
    const set = MULTI.filter((k) => f[k].size).length + (f.sort !== 'race' ? 1 : 0) + (f.characters ? 1 : 0) + (f.inDeck ? 1 : 0);
    const sizes = (['sm', 'md', 'lg'] as const)
      .map((g) => `<button class="db-grid-btn ${this.grid === g ? 'on' : ''}" data-act="db-grid" data-arg="${g}" title="${{ sm: 'Small cards', md: 'Medium cards', lg: 'Large cards' }[g]}" aria-label="${{ sm: 'Small cards', md: 'Medium cards', lg: 'Large cards' }[g]}">${GRID_ICON[g]}</button>`)
      .join('');
    return `
      <div class="db-toolbar">
        <input class="db-search" data-db-search type="search" value="${esc(f.q)}" placeholder="search cards" aria-label="Search cards" />
        <button class="pill-btn db-filter-btn ${this.filtersOpen || set ? 'pill-on' : ''}" data-act="db-filters" aria-expanded="${this.filtersOpen}">filters${set ? ` · ${set}` : ''}</button>
        <span class="db-grid-sizes" role="group" aria-label="Card size">${sizes}</span>
        ${
          this.filtersOpen
            ? `<div class="db-filters-pop">
          ${multi('race', 'race', races, 'every race')}
          ${multi('kind', 'type', kinds, 'every type')}
          ${multi('cost', 'cost', costs, 'any cost')}
          ${multi('rarity', 'rarity', rarities, 'every rarity')}
          ${multi('own', 'collection', owns, 'all cards')}
          ${drop('sort', 'order', sorts, (v) => f.sort === v, 'db-sort', sorts.find(([v]) => v === f.sort)?.[1] ?? '')}
          <div class="db-filters-toggles">${toggle('characters', 'characters')}${toggle('inDeck', 'in this deck')}</div>
          <div class="db-filters-foot">${set ? '<button class="pill-btn" data-act="db-clear">clear</button>' : ''}<button class="pill-btn" data-act="db-filters">done</button></div>
        </div>`
            : ''
        }
      </div>`;
  }
}

/**
 * A deck as a deck box: a little 3D box in its race's colour, its cover the hero of its most expensive
 * Command card (its emblem if it has none), the deck's make-up beneath and any buttons under that.
 */
export function deckBox(d: SavedDeck, opts: { act: string; title: string; actions?: string; selected?: boolean; disabled?: boolean }): string {
  const counts = (kind: CardKind) => d.cards.filter((id) => cardDef(id).kind === kind).length;
  const legal = deckProblems(d.cards).length === 0;
  return `
    <div class="db-deck db-deck-open ${legal ? '' : 'db-deck-bad'} ${opts.selected ? 'db-deck-on' : ''}" ${opts.disabled ? 'aria-disabled="true"' : `data-act="${opts.act}" data-arg="${d.id}"`} role="button" tabindex="0" title="${esc(opts.title)}" style="--dc:${FACTION_COLOUR[`f${d.race + 1}`] ?? '#9aa0ac'}">
      <div class="deck-box">
        <span class="deck-box-top"></span><span class="deck-box-side"></span>
        <div class="deck-box-front">
          ${deckCover(d)}
          <b class="deck-box-name">${esc(d.name.toLowerCase())}</b>
          <small class="deck-box-race">${esc(RACE_NAMES[d.race].toLowerCase())}</small>
        </div>
      </div>
      <small class="db-deck-sub">${d.preset ? 'starter' : legal ? `${d.cards.length} cards` : 'incomplete'} · ${counts('attack')} atk · ${counts('defence')} def · ${counts('growth')} gro</small>
      ${opts.actions ? `<div class="db-deck-actions">${opts.actions}</div>` : ''}
    </div>`;
}

/** A deck's round cover: its hero's picture, or its race's emblem. */
export function deckCover(d: SavedDeck): string {
  const hero = coverCard(d.cards);
  return `<span class="deck-box-cover">${hero ? cardArtLite(hero) : factionAvatar(`f${d.race + 1}`, 'db-emblem')}</span>`;
}

/** A deck as it stands, to compare (its name and cards, in any order). */
function snap(d: SavedDeck): string {
  return `${d.name.trim()}|${[...d.cards].sort().join(',')}`;
}

/** A deck's race, from its cards: its cover hero's, or else its most common race (unchanged with neither). */
function deckRace(d: SavedDeck): number {
  const hero = coverCard(d.cards);
  if (hero?.race !== undefined) return hero.race;
  const counts = [0, 0, 0, 0];
  for (const id of d.cards) {
    const r = cardDef(id).race;
    if (r !== undefined) counts[r]++;
  }
  const best = Math.max(...counts);
  return best > 0 ? counts.indexOf(best) : d.race;
}
