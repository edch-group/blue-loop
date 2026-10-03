import { BALANCE, coverCard, plainText, breakable, breakdownValue, CARDS, CARD_KINDS, KIND_NAME, cardCost, cardDef, commandCardsFor, copyLimit, craftCost, deckProblems, ownsDeck, RACE_NAMES, RARITIES, RARITY_NAME, type CardDef, type CardKind, type Rarity } from '../engine';
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
  /** The page of the card pool shown, and how many cards a page held when it was drawn. */
  private page = 0;
  /** The pool's layout the pages were cut to (unset: cut afresh at the next draw). */
  private layout: PoolLayout | null = null;
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
    this.page = 0;
    this.refreshPool();
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
        this.page = 0;
        break;
      }
      case 'db-new':
        this.starter = null;
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: 'New deck', race: 0, cards: [] };
        this.filters = noFilters();
        this.page = 0;
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
          // In place: the pool takes its new size and is paged afresh (the rest of the page stays as it is).
          const pool = document.querySelector<HTMLElement>('.db-pool');
          if (!pool) break;
          pool.dataset.grid = arg;
          document.querySelectorAll<HTMLElement>('.db-grid-btn').forEach((b) => b.classList.toggle('on', b.dataset.arg === arg));
          const first = this.firstShown();
          this.layout = null;
          this.refreshPool(first);
        }
        return true;
      case 'db-page': {
        const pages = Math.max(1, this.pages(d!).length);
        this.page = Math.max(0, Math.min(pages - 1, arg === 'next' ? this.page + 1 : arg === 'prev' ? this.page - 1 : Number(arg)));
        this.refreshPool();
        document.querySelector('.db-pool')?.scrollTo({ top: 0 });
        return true;
      }
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
        this.page = 0;
        this.refreshPool();
        return true;
      }
      case 'db-sort':
        if (['race', 'name', 'type', 'rarity', 'cost'].includes(arg)) this.filters.sort = arg as Filters['sort'];
        this.page = 0;
        this.refreshPool();
        return true;
      case 'db-toggle':
        if (arg === 'characters' || arg === 'inDeck') this.filters[arg] = !this.filters[arg];
        this.page = 0;
        this.refreshPool();
        return true;
      case 'db-clear':
        this.filters = { ...noFilters(), q: this.filters.q };
        this.page = 0;
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
        if (this.refreshFocus()) return true;
        break;
      // Crafting and breaking down are the server's to do (it keeps the collection); the page updates once it answers.
      case 'db-craft':
      case 'db-break':
        void (act === 'db-craft' ? craftCard(arg) : breakCard(arg)).then((why) => {
          if (why) this.host.toast(why);
          // Only the pool's tiles (owned counts, locks) and the craft panel change.
          if (!this.editing || !document.querySelector('.db-pool')) return this.host.render();
          this.refreshPool();
          this.refreshFocus();
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
        else if (cardDef(arg).kind === 'command' && commands >= commandCardsFor(BALANCE.maxDeckSize)) this.host.toast(`A deck holds at most ${commandCardsFor(BALANCE.maxDeckSize)} Heroes (one per ${BALANCE.cardsPerCommand} cards).`);
        else d.cards.push(arg);
        d.race = deckRace(d);
        // (A craft prompt that just opened is drawn in place too.)
        if (this.focus === arg) {
          if (this.refreshFocus()) return true;
        } else if (this.updateDeckInPlace(d, arg)) return true;
        break;
      }
      case 'db-remove': {
        if (!d) return true;
        const i = d.cards.lastIndexOf(arg);
        if (i >= 0) d.cards.splice(i, 1);
        d.race = deckRace(d);
        if (this.updateDeckInPlace(d, arg)) return true;
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
      ${this.header('decks', '<button class="btn btn-small btn-new-deck" data-act="db-new"><span class="plus-badge" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M6 2.5v7M2.5 6h7"/></svg></span>new deck</button>')}
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
    const pool = this.poolCards(d);
    // (Saving a deck that isn't ready yet says what it still needs.)
    return `
      <div class="setup-body db-editor">
        <div class="db-pool-side">
          ${this.renderFilters(d)}
          <div class="db-pool" data-grid="${this.grid}">${pool.join('') || '<p class="muted">No cards match these filters.</p>'}</div>
          ${this.pagerHtml(d)}
        </div>
        <aside class="db-deck-side">
          <input class="db-name" data-db-name value="${esc(d.name)}" maxlength="24" aria-label="Deck name" />
          ${this.tallyHtml(d)}
          <div class="db-focus-slot">${this.focus ? this.renderFocus(this.focus) : ''}</div>
          <div class="db-rows">${this.rowsHtml(d)}</div>
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

  /** The deck's count of cards and of Command cards, against what it needs. */
  private tallyHtml(d: SavedDeck): string {
    const commands = d.cards.filter((id) => cardDef(id).kind === 'command').length;
    return `<div class="db-tally"><b class="${d.cards.length >= BALANCE.deckSize && d.cards.length <= BALANCE.maxDeckSize ? 'ok' : ''}" title="${BALANCE.deckSize}–${BALANCE.maxDeckSize} cards">${d.cards.length}/${d.cards.length > BALANCE.deckSize ? BALANCE.maxDeckSize : BALANCE.deckSize}</b> cards · <b class="${commands === commandCardsFor(d.cards.length) ? 'ok' : ''}" title="One Hero per ${BALANCE.cardsPerCommand} cards">${commands}/${commandCardsFor(d.cards.length)}</b> ${commandCardsFor(d.cards.length) === 1 ? 'hero' : 'heroes'}</div>`;
  }

  /** The deck, card by card: a slim row in the card's own colours with its picture, by type then name. */
  private rowsHtml(d: SavedDeck): string {
    const count = (id: string) => d.cards.filter((x) => x === id).length;
    const rows = [...new Set(d.cards)]
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
    return rows || '<div class="db-rows-empty">No cards yet.<br />Tap a card to add it.</div>';
  }

  /**
   * A card added or removed: update the deck's list and count, and that one card's tile in the pool, where
   * they stand (redrawing the whole pool, hundreds of cards, made every tap slow). False if it can't.
   */
  private updateDeckInPlace(d: SavedDeck, id: string): boolean {
    const side = document.querySelector<HTMLElement>('.db-deck-side');
    const rows = side?.querySelector<HTMLElement>('.db-rows');
    const tally = side?.querySelector<HTMLElement>('.db-tally');
    if (!side || !rows || !tally) return false;
    const top = rows.scrollTop;
    tally.outerHTML = this.tallyHtml(d);
    rows.innerHTML = this.rowsHtml(d);
    rows.scrollTop = top;
    const n = d.cards.filter((x) => x === id).length;
    document.querySelectorAll<HTMLElement>(`.db-pool .db-card[data-card="${id}"]`).forEach((tile) => {
      tile.classList.toggle('db-card-in', n > 0);
      const have = tile.querySelector<HTMLElement>('.db-have');
      if (have) {
        have.classList.toggle('on', n > 0);
        have.textContent = `${n}/${owned(id)}`;
        have.title = `${n} in this deck, ${owned(id)} owned: tap to craft or break down`;
      }
    });
    return true;
  }

  /**
   * The card pool's tiles, as the filters let them through: Command cards first, lying landscape in a
   * row of their own, then everything else (one scrolling grid).
   */
  private poolCards(d: SavedDeck): string[] {
    const count = (id: string) => d.cards.filter((x) => x === id).length;
    const tile = (c: CardDef) => {
      const n = count(c.id);
      const have = owned(c.id);
      const cmd = c.kind === 'command';
      return `
          <button class="db-card ${cmd ? 'db-card-cmd' : ''} ${n ? 'db-card-in' : ''} ${have ? '' : 'db-card-locked'} ${this.focus === c.id ? 'db-card-focus' : ''}" data-act="db-add" data-arg="${c.id}" data-card="${c.id}" style="--kc:${KIND_COLOUR[c.kind]}">
            <span class="card kind-${c.kind}${c.race !== undefined ? ` race-${c.race}` : ''} rarity-${c.rarity ?? 'dwarf'}${cmd ? ' card-landscape' : ''}">
              <span class="card-glyph">${cardArtLite(c, true)}</span>${stabilityBadge(c)}
              <span class="card-name">${esc(c.name.toLowerCase())}</span>
              <span class="card-text">${cardTextHtml(c.text)}</span>
              <span class="card-kind">${typeLine(c)}</span>
            </span>
            <span class="db-have ${n ? 'on' : ''}" data-act="db-focus" data-arg="${c.id}" title="${n} in this deck, ${have} owned: tap to craft or break down">${n}/${have}</span>
            <span class="db-zoom" data-act="db-zoom" data-arg="${c.id}" title="Read it large (or right-click the card)">⤢</span>
          </button>`;
    };
    // One page at a time: drawing every card at once (hundreds of pictures) made the builder slow.
    const pages = this.pages(d);
    this.page = Math.max(0, Math.min(this.page, pages.length - 1));
    const list = pages[this.page] ?? [];
    const commands = list.filter((c) => c.kind === 'command');
    const rest = list.filter((c) => c.kind !== 'command');
    return [...(commands.length ? [`<div class="db-pool-cmds">${commands.map(tile).join('')}</div>`] : []), ...rest.map(tile)];
  }

  /** After a filter changes: the pool, the ticks and the filter count update in place (no redraw). */
  private refreshPool(keepCard?: string): void {
    const d = this.editing;
    const pool = document.querySelector<HTMLElement>('.db-pool');
    if (!d || !pool) return this.host.render();
    // (Pages cut to a new size keep the card that led the old page in view.)
    if (keepCard) this.page = this.pageOf(d, keepCard);
    pool.innerHTML = this.poolCards(d).join('') || '<p class="muted">No cards match these filters.</p>';
    sizePool();
    fitWhenSeen(pool.querySelectorAll<HTMLElement>('.db-card'));
    this.updatePager(d);
    // Now laid out: if a page holds a different number of cards than guessed, draw it again to fit.
    if (this.settlePage()) return this.refreshPool();
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

  /**
   * The pool cut into pages, a page being as many rows as fit the pool's height: Heroes first, in rows of
   * their own (they lie landscape, so fewer to a row), then the rest.
   */
  private pages(d: SavedDeck): CardDef[][] {
    const L = (this.layout ??= poolLayout(this.grid));
    const all = this.filtered(d);
    const rows: { cards: CardDef[]; h: number }[] = [];
    const chunk = (list: CardDef[], n: number, h: number) => {
      for (let i = 0; i < list.length; i += n) rows.push({ cards: list.slice(i, i + n), h });
    };
    chunk(all.filter((c) => c.kind === 'command'), L.cmdCols, L.cmdH);
    chunk(all.filter((c) => c.kind !== 'command'), L.cols, L.cardH);
    // Rows go onto a page while they fit its height, and until it holds a fair few cards (on a small
    // screen a page then scrolls a little, rather than there being a hundred pages of two cards).
    const pages: CardDef[][] = [];
    let page: CardDef[] = [];
    let used = 0;
    for (const row of rows) {
      if (page.length >= MIN_PAGE && used + L.gap + row.h > L.height) {
        pages.push(page);
        page = [];
        used = 0;
      }
      used += (page.length ? L.gap : 0) + row.h;
      page.push(...row.cards);
    }
    if (page.length) pages.push(page);
    return pages;
  }

  /** The page a card is on (the first page if it isn't shown). */
  private pageOf(d: SavedDeck, id: string): number {
    return Math.max(0, this.pages(d).findIndex((page) => page.some((c) => c.id === id)));
  }

  /** The card leading the page shown. */
  private firstShown(): string | undefined {
    return document.querySelector<HTMLElement>('.db-pool .db-card')?.dataset.card;
  }

  /** After the pool is laid out: true if the pages should be cut to a different size (the pool is redrawn). */
  settlePage(): boolean {
    const fit = poolLayout(this.grid);
    const d = this.editing;
    if (!d || !this.layout || sameLayout(fit, this.layout)) return false;
    const first = this.firstShown();
    this.layout = fit;
    if (first) this.page = this.pageOf(d, first);
    return true;
  }

  /** Called once the page is drawn: page the pool to fit the screen it got. */
  afterRender() {
    if (this.editing && this.settlePage()) this.refreshPool();
  }

  /** A swipe across the pool turns the page (left: the next one). True if it did. */
  swipe(dx: number): boolean {
    if (!this.editing || !document.querySelector('.db-pager:not([hidden])')) return false;
    return this.onClick('db-page', dx < 0 ? 'next' : 'prev');
  }

  /** The page buttons beneath the pool (none with a single page). */
  private pagerHtml(d: SavedDeck): string {
    const pages = this.pages(d).length;
    if (pages <= 1) return '<nav class="db-pager" hidden></nav>';
    const dots = Array.from({ length: pages }, (_, i) => `<button class="db-page-dot ${i === this.page ? 'on' : ''}" data-act="db-page" data-arg="${i}" aria-label="Page ${i + 1}"></button>`).join('');
    return `<nav class="db-pager" aria-label="Card pages">
        <button class="db-page-btn" data-act="db-page" data-arg="prev" ${this.page === 0 ? 'disabled' : ''} aria-label="Previous page">‹</button>
        <span class="db-page-dots">${dots}</span><small class="db-page-n">${this.page + 1} / ${pages}</small>
        <button class="db-page-btn" data-act="db-page" data-arg="next" ${this.page >= pages - 1 ? 'disabled' : ''} aria-label="Next page">›</button>
      </nav>`;
  }

  private updatePager(d: SavedDeck) {
    const nav = document.querySelector<HTMLElement>('.db-pager');
    if (nav) nav.outerHTML = this.pagerHtml(d);
  }

  /** The craft panel opened, changed or shut, in place: the panel and the pool's highlighted card. False if it can't. */
  private refreshFocus(): boolean {
    const slot = document.querySelector<HTMLElement>('.db-focus-slot');
    if (!slot) return false;
    slot.innerHTML = this.focus ? this.renderFocus(this.focus) : '';
    document.querySelectorAll<HTMLElement>('.db-pool .db-card').forEach((t) => t.classList.toggle('db-card-focus', t.dataset.card === this.focus));
    return true;
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
    // (A fixed order: cards never move in the grid as the deck changes.)
    const byRace = (a: CardDef, b: CardDef) => (a.race ?? 9) - (b.race ?? 9);
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
    const kinds: [string, string][] = CARD_KINDS.map((k): [string, string] => [k, KIND_NAME[k]]);
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

/**
 * Size the deck builder's card pool to fill its width: as many columns as fit at the view's card size
 * (--dbw), each then widened to share the leftover space, so the cards reach both edges at any size.
 * (Fixed sizes, worked out here: cards that stretch themselves made laying out hundreds of them slow.)
 * Command cards, which lie landscape, get their own columns: at least two, about as many as three fit
 * where four cards do.
 */
/** The pool's last layout: columns, and how many rows of cards its height holds, by grid size. */
/** The pool as last laid out: cards to a row, and the heights of a row and of the pool (in pixels). */
interface PoolLayout {
  cols: number;
  cmdCols: number;
  cardH: number;
  cmdH: number;
  height: number;
  gap: number;
}
const fitted: Partial<Record<string, PoolLayout>> = {};
/** The fewest cards a page holds. */
const MIN_PAGE = 16;
const GUESS: Record<string, PoolLayout> = {
  sm: { cols: 8, cmdCols: 6, cardH: 160, cmdH: 100, height: 600, gap: 6 },
  md: { cols: 5, cmdCols: 4, cardH: 240, cmdH: 150, height: 600, gap: 10 },
  lg: { cols: 3, cmdCols: 2, cardH: 340, cmdH: 210, height: 600, gap: 10 },
};
function poolLayout(grid: string): PoolLayout {
  return fitted[grid] ?? GUESS[grid] ?? GUESS.md;
}
const sameLayout = (a: PoolLayout, b: PoolLayout) =>
  a.cols === b.cols && a.cmdCols === b.cmdCols && Math.abs(a.cardH - b.cardH) < 2 && Math.abs(a.cmdH - b.cmdH) < 2 && Math.abs(a.height - b.height) < 2;

export function sizePool(root: ParentNode = document) {
  const pool = root.querySelector<HTMLElement>('.db-pool');
  if (!pool) return;
  const css = getComputedStyle(pool);
  const width = pool.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
  if (!(width > 0)) return;
  const gap = parseFloat(css.columnGap) || 10;
  // The view's card size, in pixels (--dbw is a clamp() of the screen size: measure it).
  const probe = document.createElement('i');
  probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--dbw);height:0';
  pool.appendChild(probe);
  const base = probe.offsetWidth || 140;
  probe.remove();
  const fit = (min: number, least = 1) => {
    const cols = Math.max(least, Math.floor((width + gap) / (min + gap)));
    return { cols, w: Math.floor(((width - (cols - 1) * gap) / cols) * 10) / 10 };
  };
  const card = fit(base);
  pool.style.gridTemplateColumns = `repeat(${card.cols}, ${card.w}px)`;
  pool.style.setProperty('--cardw', `${card.w}px`);
  // How many rows fill the pool's height, from a card as now laid out (a page is that many full rows).
  const grid = pool.dataset.grid ?? 'md';
  const cmd = fit(base * 1.3, 2);
  // Row heights, from the cards as now laid out (or as last seen, for a kind not on this page).
  const was = fitted[grid] ?? GUESS[grid] ?? GUESS.md;
  const one = pool.querySelector<HTMLElement>(':scope > .db-card');
  const hero = pool.querySelector<HTMLElement>('.db-pool-cmds > .db-card');
  fitted[grid] = {
    cols: card.cols,
    cmdCols: cmd.cols,
    cardH: one?.offsetHeight || was.cardH,
    cmdH: hero?.offsetHeight || was.cmdH,
    height: pool.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom),
    gap: parseFloat(css.rowGap) || gap,
  };
  const cmds = pool.querySelector<HTMLElement>('.db-pool-cmds');
  if (cmds) {
    cmds.style.gridTemplateColumns = `repeat(${cmd.cols}, ${cmd.w}px)`;
    cmds.style.setProperty('--cmdcw', `${cmd.w}px`);
  }
}
