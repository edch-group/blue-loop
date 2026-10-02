import { BALANCE, plainText, breakable, breakdownValue, CARDS, CARD_KINDS, cardDef, commandCardsFor, copyLimit, craftCost, deckProblems, ownsDeck, RACE_NAMES, RARITIES, RARITY_NAME, type CardDef, type CardKind, type Rarity } from '../engine';
import { customDecks, deleteDeck, deckById, PRESETS, saveDeck, type SavedDeck } from './decks';
import { factionAvatar } from './factions';
import { cardArtLite, cardTextHtml, KIND_COLOUR, stabilityBadge, typeLine, typeWords } from './glyphs';
import { breakDown, craft, owned, profile } from './profile';

interface BuilderHost {
  render(): void;
  toast(text: string): void;
  /** Leave the builder (back to quickplay). */
  done(): void;
  /** Show a card large. */
  zoom(id: string): void;
}

/** The card view's filters: a search, and a choice of race, type, rarity, ownership and order. */
interface Filters {
  q: string;
  race: 'any' | 'deck' | 'neutral' | '0' | '1' | '2' | '3';
  kind: 'any' | CardKind;
  rarity: 'any' | Rarity;
  own: 'any' | 'owned' | 'missing' | 'craftable';
  sort: 'race' | 'name' | 'type' | 'rarity';
  characters: boolean;
  inDeck: boolean;
}

const NO_FILTERS: Filters = { q: '', race: 'any', kind: 'any', rarity: 'any', own: 'any', sort: 'race', characters: false, inDeck: false };
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
  private filters: Filters = { ...NO_FILTERS };
  /** A card opened to craft or break down. */
  private focus: string | null = null;
  /** The filters popover, open or shut. */
  private filtersOpen = false;
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

  /** A filter dropdown changed. */
  onSelect(name: string, value: string) {
    if (name === 'race' || name === 'kind' || name === 'rarity' || name === 'own' || name === 'sort') (this.filters as unknown as Record<string, string>)[name] = value;
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
      case 'db-view': {
        // A starter opens just as a deck of your own does; change anything and it saves as a copy.
        const src = deckById(arg);
        if (!src) return true;
        this.starter = src;
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: src.name, race: src.race, cards: [...src.cards] };
        this.filters = { ...NO_FILTERS };
        break;
      }
      case 'db-new':
        this.starter = null;
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: 'New deck', race: 0, cards: [] };
        this.filters = { ...NO_FILTERS };
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
      case 'db-toggle':
        if (arg === 'characters' || arg === 'inDeck') this.filters[arg] = !this.filters[arg];
        break;
      case 'db-clear':
        this.filters = { ...NO_FILTERS };
        break;
      case 'db-race':
        if (d) d.race = Number(arg);
        break;
      case 'db-zoom':
        this.host.zoom(arg);
        return true;
      case 'db-focus':
        this.focus = this.focus === arg ? null : arg;
        break;
      case 'db-craft': {
        const why = craft(arg);
        if (why) this.host.toast(why);
        break;
      }
      case 'db-break': {
        const why = breakDown(arg);
        if (why) this.host.toast(why);
        break;
      }
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
        break;
      }
      case 'db-remove': {
        if (!d) return true;
        const i = d.cards.lastIndexOf(arg);
        if (i >= 0) d.cards.splice(i, 1);
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
    return this.editing ? this.renderEditor(this.editing) : this.renderList();
  }

  private header(title: string): string {
    return `
      <header class="setup-top">
        <button class="btn btn-small" data-act="db-back">‹ back</button>
        <h2 class="menu-heading">${title}</h2>
        <span></span>
      </header>`;
  }

  private renderList(): string {
    const row = (d: SavedDeck) => {
      const counts = (kind: CardKind) => d.cards.filter((id) => cardDef(id).kind === kind).length;
      const legal = deckProblems(d.cards).length === 0;
      return `
        <div class="db-deck db-deck-open ${legal ? '' : 'db-deck-bad'}" data-act="${d.preset ? 'db-view' : 'db-edit'}" data-arg="${d.id}" role="button" tabindex="0" title="${d.preset ? 'Look through it (changes save as a copy)' : 'Edit it'}">
          ${factionAvatar(`f${d.race + 1}`, 'db-emblem')}
          <div class="db-deck-info">
            <b>${esc(d.name.toLowerCase())}</b>
            <small>${d.preset ? `${esc(RACE_NAMES[d.race].toLowerCase())} starter` : legal ? `${d.cards.length} cards` : 'incomplete'} · ${counts('attack')} attack · ${counts('defence')} defence · ${counts('growth')} growth</small>
          </div>
          <div class="db-deck-actions">
            ${d.preset ? `<button class="pill-btn" data-act="db-view" data-arg="${d.id}">view</button><button class="pill-btn" data-act="db-copy" data-arg="${d.id}">copy</button>` : `<button class="pill-btn" data-act="db-edit" data-arg="${d.id}">edit</button><button class="pill-btn" data-act="db-delete" data-arg="${d.id}">delete</button>`}
          </div>
        </div>`;
    };
    const mine = customDecks();
    return `
      ${this.header('decks')}
      <div class="setup-body db-list-body">
        <div class="db-list">
          <div class="section-label">race starters</div>
          ${PRESETS.map(row).join('')}
          <div class="section-label">your decks</div>
          ${mine.length ? mine.map(row).join('') : '<p class="muted">No decks of your own yet. Start a new one, or copy a starter to change it.</p>'}
        </div>
      </div>
      <footer class="setup-foot"><button class="btn-primary" data-act="db-new">new deck</button></footer>`;
  }

  private renderEditor(d: SavedDeck): string {
    const count = (id: string) => d.cards.filter((x) => x === id).length;
    const pool = this.filtered(d)
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
            ${n ? `<b class="db-count">×${n}</b>` : ''}
            <span class="db-zoom" data-act="db-zoom" data-arg="${c.id}" title="Read it large (or right-click the card)">⤢</span>
            <span class="db-own" data-act="db-focus" data-arg="${c.id}" title="Craft or break down">${have ? `owned ${have}` : 'not owned'} · ⟁</span>
          </button>`;
      });
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
    const problems = deckProblems(d.cards);
    // (The card count is in the tally above the deck: the footer only names other problems.)
    const shownProblem = problems.find((p) => !/^A deck needs \d/.test(p));
    return `
      ${this.header('deck builder')}
      <div class="setup-body db-editor">
        <div class="db-pool-side">
          ${this.renderFilters(d)}
          <div class="db-pool" data-grid="${this.grid}">${pool.join('') || '<p class="muted">No cards match these filters.</p>'}</div>
        </div>
        <aside class="db-deck-side">
          ${this.starter ? `<div class="db-starter-note">${esc(RACE_NAMES[this.starter.race].toLowerCase())} starter · any change saves as a copy</div>` : ''}
          <input class="db-name" data-db-name value="${esc(d.name)}" maxlength="24" aria-label="Deck name" />
          <div class="db-races">${[0, 1, 2, 3].map((r) => `<button class="db-race ${d.race === r ? 'on' : ''}" data-act="db-race" data-arg="${r}" title="${esc(RACE_NAMES[r])}">${factionAvatar(`f${r + 1}`, 'db-race-emblem')}</button>`).join('')}</div>
          <div class="db-tally"><b class="${d.cards.length >= BALANCE.deckSize && d.cards.length <= BALANCE.maxDeckSize ? 'ok' : ''}" title="${BALANCE.deckSize}–${BALANCE.maxDeckSize} cards">${d.cards.length}/${d.cards.length > BALANCE.deckSize ? BALANCE.maxDeckSize : BALANCE.deckSize}</b> cards · <b class="${commands === commandCardsFor(d.cards.length) ? 'ok' : ''}" title="One Command card per ${BALANCE.cardsPerCommand} cards">${commands}/${commandCardsFor(d.cards.length)}</b> command</div>
          ${this.focus ? this.renderFocus(this.focus) : ''}
          <div class="db-rows">${grouped || '<p class="muted">Tap cards on the left to add them.</p>'}</div>
        </aside>
      </div>
      <footer class="setup-foot">
        <span class="db-problem">${shownProblem ? esc(shownProblem) : ''}</span>
        <button class="btn-primary" data-act="db-save" ${problems.length ? 'disabled' : ''}>${this.starter ? 'save as copy' : 'save deck'}</button>
      </footer>`;
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
      if (f.race === 'deck' && c.race !== undefined && c.race !== d.race) return false;
      if (f.race === 'neutral' && c.race !== undefined) return false;
      if (f.race !== 'any' && f.race !== 'deck' && f.race !== 'neutral' && c.race !== Number(f.race)) return false;
      if (f.kind !== 'any' && c.kind !== f.kind) return false;
      if (f.rarity !== 'any' && (c.rarity ?? 'dwarf') !== f.rarity) return false;
      if (f.own === 'owned' && owned(c.id) === 0) return false;
      if (f.own === 'missing' && owned(c.id) > 0) return false;
      if (f.own === 'craftable' && (owned(c.id) >= copyLimit(c.id) || craftCost(c.id) > flux)) return false;
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
    };
    return list.sort(order[f.sort]);
  }

  /** The card view's toolbar: search, the dropdowns, and the toggles. */
  private renderFilters(d: SavedDeck): string {
    const f = this.filters;
    const select = (name: string, value: string, options: [string, string][], label: string) =>
      `<label class="db-select"><small>${label}</small><select data-db-select="${name}">${options.map(([v, t]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    const races: [string, string][] = [['any', 'every race'], ['deck', `${RACE_NAMES[d.race].toLowerCase()} + neutral`], ['neutral', 'neutral only'], ...RACE_NAMES.map((n, i): [string, string] => [String(i), n.toLowerCase()])];
    const kinds: [string, string][] = [['any', 'every type'], ...CARD_KINDS.map((k): [string, string] => [k, k])];
    const rarities: [string, string][] = [['any', 'every rarity'], ...RARITIES.map((r): [string, string] => [r, RARITY_NAME[r].toLowerCase()])];
    const owns: [string, string][] = [['any', 'all cards'], ['owned', 'owned'], ['missing', 'not owned'], ['craftable', 'craftable now']];
    const sorts: [string, string][] = [['race', 'by race'], ['name', 'by name'], ['type', 'by type'], ['rarity', 'by rarity']];
    const toggle = (key: 'characters' | 'inDeck', label: string) => `<button class="pill-btn ${f[key] ? 'pill-on' : ''}" data-act="db-toggle" data-arg="${key}">${label}</button>`;
    // How many filters are set (the search aside), shown on the filter button.
    const set = (['race', 'kind', 'rarity', 'own'] as const).filter((k) => f[k] !== 'any').length + (f.sort !== 'race' ? 1 : 0) + (f.characters ? 1 : 0) + (f.inDeck ? 1 : 0);
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
          ${select('race', f.race, races, 'race')}
          ${select('kind', f.kind, kinds, 'type')}
          ${select('rarity', f.rarity, rarities, 'rarity')}
          ${select('own', f.own, owns, 'collection')}
          ${select('sort', f.sort, sorts, 'order')}
          <div class="db-filters-toggles">${toggle('characters', 'characters')}${toggle('inDeck', 'in this deck')}</div>
          <div class="db-filters-foot">${set ? '<button class="pill-btn" data-act="db-clear">clear</button>' : ''}<button class="pill-btn" data-act="db-filters">done</button></div>
        </div>`
            : ''
        }
      </div>`;
  }
}
