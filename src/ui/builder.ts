import { BALANCE, coverCard, decodeDeck, encodeDeck, isProfane, PRESET_DECKS, mainRace, plainText, breakable, breakdownValue, CARD_KINDS, KIND_NAME, cardCost, cardDef, commandCardsFor, copyLimit, craftCost, deckProblems, RACE_NAMES, RARITIES, RARITY_NAME, RACE_TRAITS, SUBRACES, allCardDefs, inMode, modeOf, setRulesMode, CORE_RACES, GAME_MODES, type GameMode, type CardDef, type Rarity } from '../engine';
import { customDecks, deckWithCards, deleteDeck, deckById, missingCopies, PRESETS, saveDeck, setStartersHidden, startersHidden, type SavedDeck } from './decks';
import { FACTION_COLOUR, factionAvatar } from './factions';
import { raceRow, raceTraitTags, cardArtLite, cardStock, cardBodyHtml, KIND_COLOUR, stabilityBadge, typeLine, typeWords } from './glyphs';
import { fitCardText } from './fittext';
import { owned, profile } from './profile';
import { breakCard, communityDecks, countDeckSave, craftCard, shareDeck, unshareDeck, type CommunityDeck } from './account';

interface BuilderHost {
  render(): void;
  toast(text: string): void;
  /** Leave the builder (back to quickplay). */
  done(): void;
  /** Show a card large. */
  zoom(id: string): void;
}

/**
 * The builder put to another use (the campaign's base): its own pool of cards and counts, a deck that
 * changes as you tap (each change made at once, in the campaign), or no deck at all (the armoury), and
 * its own side panel and card panel.
 */
export interface BuilderMode {
  /** Copies of a card there are to build with (in the deck and spare). */
  owned(id: string): number;
  /** The cards the pool offers. */
  cards(): CardDef[];
  /** The deck being built, as it now stands; null for none (the side shows only `head`). */
  deck(): { name: string; race: number; cards: string[] } | null;
  /** Put a card in, take one out: why not, or null once done. */
  add?(id: string): string | null;
  remove?(id: string): string | null;
  /** With no deck: a card tapped (the mode redraws). */
  tap?(id: string): void;
  /** A card's corner badge, in place of "in the deck / owned". */
  badge?(id: string, inDeck: number): { text: string; title: string; on: boolean };
  /** Whether a card is picked (outlined). */
  picked?(id: string): boolean;
  /** The side panel's head: army tabs, a character. */
  head(): string;
  /** The deck's tally line, in place of the 30–40 cards and Heroes count (a campaign army's 10 cards). */
  tally?(cards: string[]): string;
  /** The side panel's foot: the card picked, what can be done with it. */
  foot?(): string;
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
const noFilters = (): Filters => ({ q: '', race: new Set(), kind: new Set(), rarity: new Set(), cost: new Set(), own: new Set(), sort: 'cost', characters: false, inDeck: false });
/** A card's cost as the cost filter groups it: 0–3, 4+ or X. */
const costGroup = (c: CardDef) => (c.spendAll ? 'x' : String(Math.min(4, cardCost(c.id))));
const RARITY_ORDER: Record<Rarity, number> = { dwarf: 0, stellar: 1, anomaly: 2 };

/** The card-size buttons: many small cards, some medium, a few large. */
const GRID_ICON = {
  sm: `<svg viewBox="0 0 14 14" aria-hidden="true">${[0, 5, 10].flatMap((y) => [0, 5, 10].map((x) => `<rect x="${x}" y="${y}" width="4" height="4" rx="1"/>`)).join('')}</svg>`,
  md: `<svg viewBox="0 0 14 14" aria-hidden="true">${[0, 7.5].flatMap((y) => [0, 7.5].map((x) => `<rect x="${x}" y="${y}" width="6.5" height="6.5" rx="1.5"/>`)).join('')}</svg>`,
  lg: '<svg viewBox="0 0 14 14" aria-hidden="true"><rect width="14" height="14" rx="2.5"/></svg>',
};

/** The filters button: a funnel. */
const FILTER_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11L9.2 8.6v4.2l-2.4-1.3V8.6z"/></svg>';

/** A page arrow, drawn (a text ‹ › sits off-centre in the font). */
const CHEVRON = (way: 'left' | 'right') => `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="${way === 'left' ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6 4.5 9.5'}"/></svg>`;

/** Text as searched: lower case, every run of anything but letters and digits a single space. */
const normal = (t: string) => ` ${t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

/** The words of a search, each to be found somewhere on the card. */
function searchTerms(q: string): string[] {
  return normal(q).trim().split(' ').filter(Boolean);
}

/**
 * Every word on a card, for the search: its name, its text as it reads (keywords by name, with their numbers),
 * its type as shown (Support, Hero...), its race and sub-race, its race's traits (name and meaning), its
 * and rarity.
 */
const searchIndex = new Map<string, string>();
function searchText(c: CardDef): string {
  let s = searchIndex.get(c.id);
  if (s === undefined) {
    const sub = c.sub && SUBRACES[c.sub] ? SUBRACES[c.sub].name : '';
    s = normal(
      [
        c.name,
        plainText(c.text),
        KIND_NAME[c.kind],
        c.race !== undefined ? RACE_NAMES[c.race] : 'neutral',
        sub,
        ...raceTraitTags(c).flatMap((t) => [t.name, t.text]),
        // (and the race's bonus and nerf even where they're folded into its numbers: Sun-lances, Regrowth)
        ...(c.race !== undefined && RACE_TRAITS[c.race] ? [RACE_TRAITS[c.race].bonus, RACE_TRAITS[c.race].nerf] : []),
        RARITY_NAME[c.rarity ?? 'dwarf'],
      ].join(' '),
    );
    searchIndex.set(c.id, s);
  }
  return s;
}

/** Whether every word of a search is on the card (each the start of a word on it, or within one). */
function matches(c: CardDef, terms: string[]): boolean {
  const s = searchText(c);
  return terms.every((t) => s.includes(t));
}

/** A short fingerprint of a string (to tell whether a page of cards changed). */
function hash(t: string): string {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return `${t.length}:${(h >>> 0).toString(36)}`;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The deck builder: a list of decks (the starters, which can be
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

  /** Put to another use (the campaign's base), or the menu's own deck builder (null). */
  private mode: BuilderMode | null = null;
  /** Which game mode's decks the list shows (and a new deck is built for). */
  private gm: GameMode = (() => {
    try {
      return localStorage.getItem('blue-loop:db-mode') === 'lost' ? 'lost' : 'core';
    } catch {
      return 'core';
    }
  })();

  /** A panel over the deck list: pasting in a deck code, or sharing one of your decks (its code, and the community). */
  private panel: { kind: 'import' } | { kind: 'share'; id: string } | null = null;
  /** What's typed in the panels and the community search (kept across redraws). */
  private texts: Record<string, string> = {};
  /** The community page: how it's sorted, what it's searching for, and the decks it has (null: still loading). */
  private community: { sort: 'popular' | 'new' | 'mine'; q: string; decks: CommunityDeck[] | null; error?: string } | null = null;
  /** The shared deck the deck being edited was opened from (its save counts towards the deck). */
  private fromCommunity: string | null = null;

  constructor(private host: BuilderHost) {
    // A tap anywhere off the filters popover (and off its button, which toggles it itself) shuts it.
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.filtersOpen || !document.querySelector('.db-filters-pop')) return;
        if ((e.target as Element | null)?.closest?.('.db-filter-wrap')) return;
        this.filtersOpen = false;
        this.host.render();
      },
      true,
    );
  }

  /** Use the builder for something else (or, with null, for the menu's decks again). */
  setMode(mode: BuilderMode | null) {
    if (mode !== this.mode) {
      this.page = 0;
      this.focus = null;
      this.filtersOpen = false;
    }
    this.mode = mode;
    this.syncMode();
  }

  /** In a mode, the deck shown is always the mode's deck as it now stands. */
  private syncMode() {
    if (!this.mode) return;
    const d = this.mode.deck();
    this.editing = { id: 'mode', name: d?.name ?? '', cards: d ? [...d.cards] : [] };
  }

  private owned(id: string): number {
    return this.mode ? this.mode.owned(id) : owned(id);
  }

  open() {
    this.editing = this.starter = null;
  }

  onInput(value: string) {
    if (this.editing) this.editing.name = value.slice(0, 24);
  }

  /** Typing in a panel (a deck code, a note) or the community search. */
  onText(key: string, value: string) {
    this.texts[key] = value.slice(0, key === 'code' ? 4000 : 160);
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
        else if (this.community) this.community = null;
        else this.host.done();
        break;
      case 'db-gm':
        if (arg !== 'core' && arg !== 'lost') return true;
        this.gm = arg;
        try {
          localStorage.setItem('blue-loop:db-mode', arg);
        } catch {
          // only a convenience
        }
        break;
      case 'db-panel-close':
        this.panel = null;
        break;
      case 'db-import-open':
        this.panel = { kind: 'import' };
        this.texts.code = '';
        break;
      case 'db-import': {
        const got = decodeDeck(this.texts.code ?? '');
        if (!got) {
          this.host.toast("That isn't a deck code. Deck codes start with BL1-.");
          return true;
        }
        if (!got.cards.length) {
          this.host.toast("None of that deck's cards are in this game.");
          return true;
        }
        this.panel = null;
        this.keepDeck(got.name, got.cards, got.unknown.length ? ` (${got.unknown.length} card${got.unknown.length === 1 ? '' : 's'} this game doesn't know left out)` : '');
        break;
      }
      case 'db-share-open':
        this.panel = { kind: 'share', id: arg };
        this.texts.note = '';
        break;
      case 'db-copy-code': {
        const src = deckById(arg);
        if (!src) return true;
        const code = encodeDeck(src);
        if (!navigator.clipboard) this.host.toast('Copy the code from the box.');
        else
          void navigator.clipboard.writeText(code).then(
            () => this.host.toast('Deck code copied: send it to a friend, who imports it from their decks page.'),
            () => this.host.toast('Copy the code from the box.'),
          );
        return true;
      }
      case 'db-publish': {
        const src = deckById(arg);
        if (!src) return true;
        const why = shareProblem(src);
        if (why) {
          this.host.toast(why);
          return true;
        }
        if (isProfane(this.texts.note ?? '')) {
          this.host.toast('Keep it clean: change the note.');
          return true;
        }
        void shareDeck(src, this.texts.note ?? '', profile().name || 'Commander').then((err) => {
          if (err) return this.host.toast(err);
          this.panel = null;
          this.host.toast(`Shared with the community, credited to ${profile().name || 'Commander'}.`);
          if (this.community) void this.loadCommunity();
          this.host.render();
        });
        return true;
      }
      case 'db-community':
        this.community = { sort: 'popular', q: '', decks: null };
        this.texts.cq = '';
        void this.loadCommunity();
        break;
      case 'db-csort':
        if (!this.community || !['popular', 'new', 'mine'].includes(arg)) return true;
        this.community.sort = arg as 'popular' | 'new' | 'mine';
        this.community.decks = null;
        void this.loadCommunity();
        break;
      case 'db-csearch':
        if (!this.community) return true;
        this.community.q = (this.texts.cq ?? '').trim();
        this.community.decks = null;
        void this.loadCommunity();
        break;
      case 'db-csave': {
        const c = this.community?.decks?.find((x) => x.id === arg);
        if (!c) return true;
        if (deckWithCards(c.cards)) {
          this.host.toast('You already have a deck with these cards.');
          return true;
        }
        countDeckSave(c.id);
        c.saves += c.mine ? 0 : 1;
        this.keepDeck(c.name, c.cards, '');
        break;
      }
      case 'db-copen': {
        const c = this.community?.decks?.find((x) => x.id === arg);
        if (!c) return true;
        this.starter = null;
        this.fromCommunity = c.mine ? null : c.id;
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: c.name, cards: [...c.cards], mode: guessMode(c.cards) };
        this.filters = noFilters();
        this.page = 0;
        break;
      }
      case 'db-cremove':
        void unshareDeck(arg).then((err) => {
          if (err) return this.host.toast(err);
          if (this.community?.decks) this.community.decks = this.community.decks.filter((x) => x.id !== arg);
          this.host.toast('Taken down. Copies others saved stay theirs.');
          this.host.render();
        });
        return true;
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
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: src.name, cards: [...src.cards], mode: modeOf(src) };
        this.filters = noFilters();
        this.page = 0;
        break;
      }
      case 'db-new':
        this.starter = null;
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: 'New deck', cards: [], mode: this.gm };
        this.filters = noFilters();
        this.page = 0;
        break;
      case 'db-copy': {
        const src = deckById(arg);
        if (!src) return true;
        this.starter = null;
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: `${src.name} copy`, cards: [...src.cards], mode: modeOf(src) };
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
      case 'db-hide-starters':
        setStartersHidden(!startersHidden());
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
        if (this.mode) return this.modeAdd(d, arg);
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
        // (A craft prompt that just opened is drawn in place too.)
        if (this.focus === arg) {
          if (this.refreshFocus()) return true;
        } else if (this.updateDeckInPlace(d, arg)) return true;
        break;
      }
      case 'db-remove': {
        if (!d) return true;
        if (this.mode) {
          const why = this.mode.remove?.(arg);
          if (why) this.host.toast(why);
          this.syncMode();
          if (this.updateDeckInPlace(this.editing!, arg)) return true;
          break;
        }
        const i = d.cards.lastIndexOf(arg);
        if (i >= 0) d.cards.splice(i, 1);
        if (this.updateDeckInPlace(d, arg)) return true;
        break;
      }
      case 'db-save': {
        if (!d) return true;
        const problems = deckProblems(d.cards, modeOf(d));
        if (problems.length) {
          this.host.toast(problems[0]);
          return true;
        }
        d.name = d.name.trim() || 'Unnamed deck';
        const st = this.starter;
        const changed = !st || d.name !== st.name || [...d.cards].sort().join() !== [...st.cards].sort().join();
        if (st && !changed) {
          // Nothing to keep: the starter is still there as it was.
          this.editing = this.starter = null;
          break;
        }
        if (st && d.name === st.name) d.name = `${st.name} copy`.slice(0, 24);
        const dup = customDecks().some((x) => x.id !== d.id && [...x.cards].sort().join() === [...d.cards].sort().join());
        saveDeck(d);
        if (this.fromCommunity && !dup) countDeckSave(this.fromCommunity);
        this.fromCommunity = null;
        const short = this.toCollect(d.cards);
        if (short) this.host.toast(`Saved. ${short}`);
        else if (st) this.host.toast(`Saved as a new deck: ${d.name}. The starter stays as it was.`);
        this.editing = this.starter = null;
        break;
      }
      default:
        return false;
    }
    this.host.render();
    return true;
  }

  /** A deck from elsewhere (a code, a shared list) kept among your own: what it still needs said, if anything. */
  private keepDeck(name: string, cards: string[], extra: string) {
    const same = deckWithCards(cards);
    if (same) {
      this.host.toast(`You already have this deck: ${same.name}.`);
      return;
    }
    const mode = guessMode(cards);
    saveDeck({ id: `deck-${Date.now().toString(36)}`, name: name.slice(0, 24) || 'Imported deck', cards: [...cards], mode });
    const short = this.toCollect(cards);
    const why = deckProblems(cards, mode)[0];
    this.host.toast(`Added to your decks${extra}. ${short || (why ? `Not finished yet: ${why}` : 'Ready to play.')}`);
  }

  /** What a deck still needs before you can play it: the cards to collect, and the flux crafting them would take. */
  private toCollect(cards: string[]): string {
    const missing = missingCopies(cards);
    if (!missing.length) return '';
    const n = missing.reduce((t, m) => t + m.n, 0);
    const flux = missing.reduce((t, m) => t + m.n * craftCost(m.id), 0);
    return `${n} card${n === 1 ? '' : 's'} still to collect before you can play it (⟁${flux} to craft them all; you have ⟁${profile().flux}).`;
  }

  /** Fetch the community's decks for the page as it's set. */
  private async loadCommunity() {
    const c = this.community;
    if (!c) return;
    try {
      const decks = await communityDecks(c.sort === 'new' ? 'new' : 'popular', c.q, c.sort === 'mine');
      if (this.community !== c) return;
      c.decks = decks;
      c.error = undefined;
    } catch (e) {
      if (this.community !== c) return;
      c.decks = [];
      c.error = e instanceof Error ? e.message : 'Couldn’t load the community decks.';
    }
    this.host.render();
  }

  /** A card tapped in a mode: put in the deck at once, or (with no deck) handed to the mode. */
  private modeAdd(d: SavedDeck, id: string): boolean {
    const m = this.mode!;
    if (!m.deck()) {
      m.tap?.(id);
      return true;
    }
    const copies = d.cards.filter((x) => x === id).length;
    const why = copies >= this.owned(id) && copies < copyLimit(id) ? `No spare ${cardDef(id).name} in your reserve.` : m.add?.(id) ?? null;
    if (why) this.host.toast(why);
    this.syncMode();
    if (!this.updateDeckInPlace(this.editing!, id)) this.host.render();
    return true;
  }

  render(): string {
    // (Cards show as they play in the deck's mode.)
    if (!this.mode) setRulesMode(this.editing ? modeOf(this.editing) : 'lost');
    if (this.mode) {
      this.syncMode();
      return this.renderEditor(this.editing!);
    }
    // A deck just opened: remember it as it was.
    if (this.editing && this.editing !== this.openedAs) {
      this.openedAs = this.editing;
      this.openedSnap = snap(this.editing);
      this.confirmExit = false;
    }
    return this.editing ? this.renderEditor(this.editing) : this.community ? this.renderCommunity() : this.renderList() + this.renderPanel();
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
        // (Open it by tapping the box: a starter to look through, your own to edit.)
        actions: `<button class="pill-btn" data-act="db-copy" data-arg="${d.id}">copy</button>${d.preset ? '' : `<button class="pill-btn" data-act="db-share-open" data-arg="${d.id}">share</button><button class="pill-btn" data-act="db-delete" data-arg="${d.id}">delete</button>`}`,
        tag: d.preset ? undefined : wishTag(d.cards),
      });
    const gm = this.gm;
    const mine = customDecks().filter((d) => modeOf(d) === gm);
    const presets = PRESETS.filter((d) => modeOf(d) === gm);
    const hide = startersHidden();
    const tabs = (['core', 'lost'] as const).map((m) => `<button class="db-seg-btn ${gm === m ? 'on' : ''}" data-act="db-gm" data-arg="${m}" data-tip="${esc(GAME_MODES[m].blurb)}">${GAME_MODES[m].name.toLowerCase()}</button>`).join('');
    return `
      ${this.header('decks', `<span class="db-head-actions"><button class="btn btn-small db-switch ${hide ? 'on' : ''}" data-act="db-hide-starters" role="switch" aria-checked="${hide}">hide starters<span class="switch-track" aria-hidden="true"><i></i></span></button><button class="btn btn-small" data-act="db-community">community</button><button class="btn btn-small" data-act="db-import-open">import</button><button class="btn btn-small btn-new-deck" data-act="db-new"><span class="plus-badge" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M6 2.5v7M2.5 6h7"/></svg></span>new deck</button></span>`)}
      <div class="setup-body db-list-body">
        <div class="db-list">
          <div class="db-gm-row"><span class="db-seg db-gm" role="group" aria-label="Game mode">${tabs}</span><small class="muted">${esc(GAME_MODES[gm].blurb)}</small></div>
          <div class="section-label db-group">your decks</div>
          ${mine.length ? `<div class="db-boxes">${mine.map(box).join('')}</div>` : '<p class="muted center-text">No decks of your own yet. Start a new one, or copy a starter to change it.</p>'}
          ${hide ? '' : `<div class="section-label db-group">races</div>
          <div class="db-boxes">${presets.filter((d) => !d.mixed).map(box).join('')}</div>
          ${presets.some((d) => d.mixed) ? `<div class="section-label db-group">mechanics</div>
          <div class="db-boxes">${presets.filter((d) => d.mixed).map(box).join('')}</div>` : ''}`}
        </div>
      </div>`;
  }

  /** The panel over the deck list, if one is open: import a deck code, or share a deck. */
  private renderPanel(): string {
    const p = this.panel;
    if (!p) return '';
    if (p.kind === 'import')
      return `<div class="overlay overlay-soft db-confirm-overlay"><div class="modal db-confirm db-panel">
        <b>import a deck</b>
        <p>Paste a deck code (it starts with BL1-). The deck joins your decks; any cards you don't own yet show as still to collect.</p>
        <textarea class="db-code" data-db-text="code" rows="3" placeholder="BL1-…" spellcheck="false">${esc(this.texts.code ?? '')}</textarea>
        <div class="db-confirm-actions"><button class="btn" data-act="db-panel-close">cancel</button><button class="btn-primary btn-small" data-act="db-import">import</button></div>
      </div></div>`;
    const d = deckById(p.id);
    if (!d || d.preset) return '';
    const why = shareProblem(d);
    return `<div class="overlay overlay-soft db-confirm-overlay"><div class="modal db-confirm db-panel">
        <b>share ${esc(d.name.toLowerCase())}</b>
        <p>Its deck code: anyone can paste it into their decks page to get this deck.</p>
        <div class="db-code-row"><input class="db-code" readonly value="${esc(encodeDeck(d))}" aria-label="Deck code" /><button class="btn btn-small" data-act="db-copy-code" data-arg="${d.id}">copy</button></div>
        <div class="section-label">share with the community</div>
        ${
          why
            ? `<p class="muted">${esc(why)}</p>`
            : `<p>Anyone can find it on the community page and save a copy, credited to <b>${esc(profile().name || 'Commander')}</b>.</p>
        <textarea class="db-note" data-db-text="note" rows="2" maxlength="160" placeholder="A note: what it does, how to play it (optional)">${esc(this.texts.note ?? '')}</textarea>`
        }
        <div class="db-confirm-actions"><button class="btn" data-act="db-panel-close">close</button>${why ? '' : `<button class="btn-primary btn-small" data-act="db-publish" data-arg="${d.id}">share</button>`}</div>
      </div></div>`;
  }

  /** The community's decks: shared lists to look through and save, credited to who shared them. */
  private renderCommunity(): string {
    const c = this.community!;
    const tab = (k: string, label: string) => `<button class="pill-btn ${c.sort === k ? 'on' : ''}" data-act="db-csort" data-arg="${k}">${label}</button>`;
    const box = (x: CommunityDeck) => {
      const missing = missingCopies(x.cards).reduce((t, m) => t + m.n, 0);
      const have = x.cards.length - missing;
      return `<div class="db-cdeck">${deckBox(
        { id: x.id, name: x.name, cards: x.cards },
        {
          act: 'db-copen',
          title: x.note ? `${x.note} (tap to look through it)` : 'Look through it',
          tag: missing ? `${have}/${x.cards.length} owned` : 'all owned',
        },
      )}<div class="db-credit"><span>by ${esc(x.author)}</span><span title="Players who saved it">★ ${x.saves}</span></div>${x.note ? `<p class="db-cnote">${esc(x.note)}</p>` : ''}<div class="db-deck-actions db-cactions"><button class="pill-btn" data-act="db-csave" data-arg="${x.id}">save</button>${x.mine ? `<button class="pill-btn" data-act="db-cremove" data-arg="${x.id}" title="Take it off the community page (copies others saved stay theirs)">unshare</button>` : ''}</div></div>`;
    };
    const body =
      c.decks === null
        ? '<p class="muted center-text">Loading…</p>'
        : c.error
          ? `<p class="muted center-text">${esc(c.error)}</p>`
          : c.decks.length
            ? `<div class="db-boxes db-cboxes">${c.decks.map(box).join('')}</div>`
            : `<p class="muted center-text">${c.sort === 'mine' ? 'You haven’t shared a deck yet. Share one from your decks page.' : c.q ? 'No shared decks match that.' : 'No decks shared yet. Be the first: share one from your decks page.'}</p>`;
    return `
      ${this.header('community decks')}
      <div class="setup-body db-list-body">
        <div class="db-list">
        <div class="db-community-bar">
          <span class="db-ctabs">${tab('popular', 'most saved')}${tab('new', 'newest')}${tab('mine', 'shared by me')}</span>
          <span class="db-csearch"><input data-db-text="cq" value="${esc(this.texts.cq ?? '')}" maxlength="40" placeholder="search names and players" aria-label="Search the community decks" /><button class="btn btn-small" data-act="db-csearch">search</button></span>
        </div>
        <p class="muted db-chint">Save a deck to keep it with your own. Cards you don't own yet show as still to collect: craft them with flux or find them in boosters, and the deck is yours to play.</p>
        ${body}
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
        ${this.mode ? this.modeSide(d) : `<aside class="db-deck-side">
          <div class="db-name-row"><input class="db-name" data-db-name value="${esc(d.name)}" maxlength="24" aria-label="Deck name" /><small class="db-mode-chip" data-tip="${esc(GAME_MODES[modeOf(d)].blurb)}">${GAME_MODES[modeOf(d)].name.toLowerCase()}</small></div>
          ${this.tallyHtml(d)}
          <div class="db-focus-slot">${this.focus ? this.renderFocus(this.focus) : ''}</div>
          <div class="db-rows">${this.rowsHtml(d)}</div>
          <div class="db-actions"><button class="btn btn-small btn-exit" data-act="db-exit">exit</button><button class="btn-primary btn-small" data-act="db-save">save</button></div>
        </aside>`}
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

  /** A mode's side panel: its head, then the deck (if it has one), then its foot. */
  private modeSide(d: SavedDeck): string {
    const m = this.mode!;
    const deck = m.deck();
    return `
        <aside class="db-deck-side db-mode-side ${deck ? '' : 'db-keeper-side'}">
          ${m.head()}
          ${deck ? `<b class="db-mode-title">${esc(d.name.toLowerCase())}</b>${this.tallyHtml(d)}<div class="db-rows">${this.rowsHtml(d)}</div>` : ''}
          <div class="db-mode-foot">${m.foot?.() ?? ''}</div>
        </aside>`;
  }

  /** The deck's count of cards and of Command cards, against what it needs. */
  private tallyHtml(d: SavedDeck): string {
    if (this.mode?.tally) return `<div class="db-tally">${this.mode.tally(d.cards)}</div>`;
    const commands = d.cards.filter((id) => cardDef(id).kind === 'command').length;
    const missing = missingCopies(d.cards);
    const need = missing.reduce((t, m) => t + m.n, 0);
    const flux = missing.reduce((t, m) => t + m.n * craftCost(m.id), 0);
    const collect = need ? `<span class="db-tally-need" title="Cards in this deck you don't own yet: craft them with flux (you have ⟁${profile().flux}), or find them in boosters">${need} to collect · ⟁${flux}</span>` : '';
    return `<div class="db-tally">${collect}<b class="${d.cards.length >= BALANCE.deckSize && d.cards.length <= BALANCE.maxDeckSize ? 'ok' : ''}" title="${BALANCE.deckSize}–${BALANCE.maxDeckSize} cards">${d.cards.length}/${d.cards.length > BALANCE.deckSize ? BALANCE.maxDeckSize : BALANCE.deckSize}</b> cards · <b class="${commands === commandCardsFor(d.cards.length) ? 'ok' : ''}" title="One Hero per ${BALANCE.cardsPerCommand} cards">${commands}/${commandCardsFor(d.cards.length)}</b> ${commandCardsFor(d.cards.length) === 1 ? 'hero' : 'heroes'}</div>`;
  }

  /** The deck, card by card: a slim row in the card's own colours with its picture, by energy cost then name. */
  private rowsHtml(d: SavedDeck): string {
    const count = (id: string) => d.cards.filter((x) => x === id).length;
    const rows = [...new Set(d.cards)]
      .sort((a, b) => costOrder(cardDef(a)) - costOrder(cardDef(b)) || cardDef(a).name.localeCompare(cardDef(b).name))
      .map((id) => {
        const c = cardDef(id);
        const short = this.mode ? 0 : Math.max(0, count(id) - this.owned(id));
        return `
        <button class="db-row rarity-${c.rarity ?? 'dwarf'} ${short ? 'db-row-missing' : ''}" data-act="db-remove" data-arg="${id}" data-card="${id}" style="--kc:${KIND_COLOUR[c.kind]}" title="${short ? `${short} still to collect (tap it in the cards to craft it). ` : ''}Tap to remove one">
          <span class="db-row-art">${cardArtLite(c)}</span>
          <span class="db-row-name"><b>${esc(c.name.toLowerCase())}</b><small>${typeWords(c)}</small></span>
          ${short ? `<small class="db-row-need">need ${short}</small>` : ''}<b class="db-row-n">×${count(id)}</b><i>−</i>
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
        have.textContent = this.badge(id, n).text;
        have.title = this.badge(id, n).title;
      }
    });
    return true;
  }

  /** The card pool's tiles on the page shown, as the filters let them through (the Heroes lie landscape). */
  private poolCards(d: SavedDeck): string[] {
    const count = (id: string) => d.cards.filter((x) => x === id).length;
    const tile = (c: CardDef) => {
      const n = count(c.id);
      const have = this.owned(c.id);
      const cmd = c.kind === 'command';
      const badge = this.badge(c.id, n);
      return `
          <button class="db-card ${cmd ? 'db-card-cmd' : ''} ${n ? 'db-card-in' : ''} ${have ? '' : 'db-card-locked'} ${this.focus === c.id || this.mode?.picked?.(c.id) ? 'db-card-focus' : ''}" data-act="db-add" data-arg="${c.id}" data-card="${c.id}" style="--kc:${KIND_COLOUR[c.kind]}">
            <span class="card kind-${c.kind}${c.race !== undefined ? ` race-${c.race}` : ''} rarity-${c.rarity ?? 'dwarf'}">
              ${cardStock(c)}<span class="card-glyph">${cardArtLite(c, true)}</span>${raceRow(c)}${stabilityBadge(c)}
              <span class="card-name">${esc(c.name.toLowerCase())}</span>
              <span class="card-text">${cardBodyHtml(c)}</span>
              <span class="card-kind">${typeLine(c)}</span>
            </span>
            <span class="db-have ${badge.on ? 'on' : ''}" ${this.mode ? '' : `data-act="db-focus" data-arg="${c.id}"`} title="${esc(badge.title)}">${badge.text}</span>
            <span class="db-zoom" data-act="db-zoom" data-arg="${c.id}" title="Read it large (or right-click the card)">⤢</span>
          </button>`;
    };
    // One page at a time: drawing every card at once (hundreds of pictures) made the builder slow.
    const pages = this.pages(d);
    this.page = Math.max(0, Math.min(this.page, pages.length - 1));
    return (pages[this.page] ?? []).map(tile);
  }

  /** A tile's corner badge: by default, copies in the deck of copies owned. */
  private badge(id: string, n: number): { text: string; title: string; on: boolean } {
    if (this.mode?.badge) return this.mode.badge(id, n);
    const have = this.owned(id);
    return { text: `${n}/${have}`, title: this.mode ? `${n} in this deck, ${have} in all` : `${n} in this deck, ${have} owned: tap to craft or break down`, on: n > 0 };
  }

  /** After a filter changes: the pool, the ticks and the filter count update in place (no redraw). */
  private refreshPool(keepCard?: string): void {
    const d = this.editing;
    const pool = document.querySelector<HTMLElement>('.db-pool');
    if (!d || !pool) return this.host.render();
    // (Pages cut to a new size keep the card that led the old page in view.)
    if (keepCard) this.page = this.pageOf(d, keepCard);
    const html = this.poolCards(d).join('') || '<p class="muted">No cards match these filters.</p>';
    // The same page as before (a letter typed that changes nothing shown): leave it be, rather than draw the
    // cards afresh and fit their text again (which made the text jump at every keystroke).
    // (Its signature: the cards' markup, at the card size and layout they were fitted for.)
    const L = this.layout;
    const sig = `${this.grid}|${L ? `${L.cols}x${L.cmdCols}|${Math.round(L.cardH)}|${Math.round(L.height)}` : '-'}|${hash(html)}`;
    if (pool.dataset.sig !== sig) {
      pool.dataset.sig = sig;
      pool.innerHTML = html;
      sizePool();
      // A page holds only what fits on screen, so its text is fitted at once, before it is painted.
      fitCardText(pool);
    }
    this.updatePager(d);
    // Now laid out: if a page holds a different number of cards than guessed, draw it again to fit.
    if (this.settlePage()) return this.refreshPool();
    const pop = document.querySelector<HTMLElement>('.db-filters-pop');
    const btn = document.querySelector<HTMLElement>('.db-filter-btn');
    const bar = document.createElement('div');
    bar.innerHTML = this.renderFilters(d);
    // The ticks, values and button label, copied across from a fresh render of the toolbar.
    const fresh = bar.querySelector<HTMLElement>('.db-filters-pop');
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
    const freshBtn = bar.querySelector<HTMLElement>('.db-filter-btn');
    if (btn && freshBtn) {
      btn.className = freshBtn.className;
      btn.innerHTML = freshBtn.innerHTML;
    }
  }

  /**
   * The pool cut into pages, a page being exactly as many full rows as fit the pool's height (at least
   * one), so a page never scrolls: Heroes among the other cards, in the order picked (by cost unless changed).
   */
  private pages(d: SavedDeck): CardDef[][] {
    const L = (this.layout ??= poolLayout(this.grid));
    const all = this.filtered(d);
    // (Heroes stand upright like every other card, so they share its columns.)
    const cols = L.cols;
    const h = L.cardH;
    void h;
    const rows = L.rows ?? ROWS[this.grid] ?? 2;
    const per = cols * rows;
    const pages: CardDef[][] = [];
    for (let i = 0; i < all.length; i += per) pages.push(all.slice(i, i + per));
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
    this.placeFilters();
  }

  /** The filters popover opens under its button, pulled back left only as far as keeps it on screen. */
  private placeFilters() {
    const pop = document.querySelector<HTMLElement>('.db-filters-pop');
    if (!pop) return;
    pop.style.left = '0px';
    const over = pop.getBoundingClientRect().right - (window.innerWidth - 12);
    if (over > 0) pop.style.left = `${-over}px`;
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
        <button class="db-page-btn" data-act="db-page" data-arg="prev" ${this.page === 0 ? 'disabled' : ''} aria-label="Previous page">${CHEVRON('left')}</button>
        <span class="db-page-dots">${dots}</span><small class="db-page-n">${this.page + 1} / ${pages}</small>
        <button class="db-page-btn" data-act="db-page" data-arg="next" ${this.page >= pages - 1 ? 'disabled' : ''} aria-label="Next page">${CHEVRON('right')}</button>
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
    const terms = searchTerms(f.q);
    const inDeck = new Set(d.cards);
    // (The races this deck's cards come from: the "this deck's races" filter.)
    const deckRaces = new Set(d.cards.map((id) => cardDef(id).race).filter((r): r is number => r !== undefined));
    const flux = profile().flux;
    const core = !this.mode && modeOf(d) === 'core';
    const list = (this.mode ? this.mode.cards() : allCardDefs()).filter((c) => {
      if (core && !inMode(c, 'core')) return false;
      if (terms.length && !matches(c, terms)) return false;
      const race = c.race === undefined ? 'neutral' : String(c.race);
      if (f.race.size && !f.race.has(race) && !(f.race.has('deck') && (c.race === undefined || deckRaces.has(c.race)))) return false;
      if (f.kind.size && !f.kind.has(c.kind)) return false;
      if (f.rarity.size && !f.rarity.has(c.rarity ?? 'dwarf')) return false;
      if (f.cost.size && !f.cost.has(costGroup(c))) return false;
      if (f.own.size) {
        const have = this.owned(c.id);
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
      cost: (a, b) => costOrder(a) - costOrder(b) || a.name.localeCompare(b.name),
    };
    return list.sort(order[f.sort]);
  }

  /**
   * The card view's toolbar: search, the filters button (its popover: dropdowns of
   * ticks, and toggles), card sizes.
   */
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
    const core = !this.mode && modeOf(d) === 'core';
    const races: [string, string][] = [['deck', "this deck's races + neutral"], ['neutral', 'neutral'], ...RACE_NAMES.map((n, i): [string, string] => [String(i), n.toLowerCase()]).filter(([i]) => !core || CORE_RACES.includes(Number(i)))];
    const kinds: [string, string][] = CARD_KINDS.map((k): [string, string] => [k, KIND_NAME[k]]);
    const rarities: [string, string][] = RARITIES.map((r): [string, string] => [r, RARITY_NAME[r].toLowerCase()]);
    const costs: [string, string][] = [['0', 'free'], ['1', '1 energy'], ['2', '2 energy'], ['3', '3 energy'], ['4', '4 or more'], ['x', 'X (all you have)']];
    const owns: [string, string][] = [['owned', 'owned'], ['missing', 'not owned'], ['craftable', 'craftable now']];
    const sorts: [string, string][] = [['cost', 'by cost'], ['race', 'by race'], ['name', 'by name'], ['type', 'by type'], ['rarity', 'by rarity']];
    const toggle = (key: 'characters' | 'inDeck', label: string) => `<button class="pill-btn ${f[key] ? 'pill-on' : ''}" data-act="db-toggle" data-arg="${key}">${label}</button>`;
    // How many filters are set (the search aside), shown on the filter button.
    const set = MULTI.filter((k) => f[k].size).length + (f.sort !== 'cost' ? 1 : 0) + (f.characters ? 1 : 0) + (f.inDeck ? 1 : 0);
    const sizes = (['sm', 'md', 'lg'] as const)
      .map((g) => `<button class="db-seg-btn db-grid-btn ${this.grid === g ? 'on' : ''}" data-act="db-grid" data-arg="${g}" title="${{ sm: 'Small cards', md: 'Medium cards', lg: 'Large cards' }[g]}" aria-label="${{ sm: 'Small cards', md: 'Medium cards', lg: 'Large cards' }[g]}">${GRID_ICON[g]}</button>`)
      .join('');
    return `
      <div class="db-toolbar">
        <input class="db-search" data-db-search type="search" value="${esc(f.q)}" placeholder="search cards" aria-label="Search cards" />
        <span class="db-filter-wrap">
        <button class="db-filter-btn ${this.filtersOpen ? 'open' : ''} ${set ? 'set' : ''}" data-act="db-filters" aria-expanded="${this.filtersOpen}" title="Filters" aria-label="Filters${set ? ` (${set} set)` : ''}">${FILTER_ICON}${set ? `<b class="db-filter-n">${set}</b>` : ''}</button>
        ${
          this.filtersOpen
            ? `<div class="db-filters-pop">
          ${multi('race', 'race', races, 'every race')}
          ${multi('kind', 'type', kinds, 'every type')}
          ${multi('cost', 'cost', costs, 'any cost')}
          ${multi('rarity', 'rarity', rarities, 'every rarity')}
          ${this.mode ? '' : multi('own', 'collection', owns, 'all cards')}
          ${drop('sort', 'order', sorts, (v) => f.sort === v, 'db-sort', sorts.find(([v]) => v === f.sort)?.[1] ?? '')}
          <div class="db-filters-toggles">${toggle('characters', 'characters')}${toggle('inDeck', 'in this deck')}</div>
          <div class="db-filters-foot">${set ? '<button class="pill-btn" data-act="db-clear">clear</button>' : ''}<button class="pill-btn" data-act="db-filters">done</button></div>
        </div>`
            : ''
        }
        </span>
        <span class="db-seg db-grid-sizes" role="group" aria-label="Card size">${sizes}</span>
      </div>`;
  }
}

/**
 * A deck as a deck box: a little 3D box in its race's colour, its cover the hero of its most expensive
 * Command card (its emblem if it has none), the deck's make-up beneath and any buttons under that.
 */
/** A deck from elsewhere (a code, a shared list) has no mode: Core if its cards are all Core's. */
function guessMode(cards: string[]): GameMode {
  return deckProblems(cards, 'core').some((p) => /Lost Races|too much/.test(p)) ? 'lost' : 'core';
}

export function deckBox(d: SavedDeck, opts: { act: string; title: string; actions?: string; selected?: boolean; disabled?: boolean; tag?: string }): string {
  const legal = deckProblems(d.cards, modeOf(d)).length === 0;
  return `
    <div class="db-deck db-deck-open ${legal ? '' : 'db-deck-bad'} ${opts.selected ? 'db-deck-on' : ''}" ${opts.disabled ? 'aria-disabled="true"' : `data-act="${opts.act}" data-arg="${d.id}"`} role="button" tabindex="0" title="${esc(opts.title)}" style="--dc:${deckColour(d)}">
      <div class="deck-box">
        <span class="deck-box-top"></span><span class="deck-box-side"></span>
        <div class="deck-box-front">
          ${deckCover(d)}
          <b class="deck-box-name">${esc(d.name.toLowerCase())}</b>
          <small class="deck-box-race">${esc(deckRacesLabel(d))}</small>
        </div>
        ${opts.tag ? `<i class="deck-box-tag">${esc(opts.tag)}</i>` : ''}
      </div>
      ${opts.actions ? `<div class="db-deck-actions">${opts.actions}</div>` : ''}
    </div>`;
}

/** Why a deck can't be shared with the community (null if it can): unfinished, a starter as it comes, or a name with profanity. */
function shareProblem(d: SavedDeck): string | null {
  if (d.preset) return 'Starter decks can’t be shared.';
  const why = deckProblems(d.cards, modeOf(d))[0];
  if (why) return `Finish the deck to share it: ${why}`;
  const key = [...d.cards].sort().join();
  if (PRESET_DECKS.some((s) => [...s.cards].sort().join() === key)) return 'This is a starter deck as it comes: change it to make it your own, then share it.';
  if (isProfane(d.name)) return 'Keep it clean: give the deck another name to share it.';
  return null;
}

/** A deck of your own that still needs cards you don't own: how many (else nothing). */
function wishTag(cards: string[]): string | undefined {
  const n = missingCopies(cards).reduce((t, m) => t + m.n, 0);
  return n ? `${n} to collect` : undefined;
}

/** A deck's round cover: its hero's picture, or the emblem of the race most of its cards are from. */
export function deckCover(d: SavedDeck): string {
  const hero = d.cover ? cardDef(d.cover) : coverCard(d.cards);
  const race = mainRace(d.cards);
  return `<span class="deck-box-cover">${hero ? cardArtLite(hero) : factionAvatar(race === undefined ? 'neutral' : `f${race + 1}`, 'db-emblem')}</span>`;
}

/** A deck box's colour: that of the race most of its cards are from (a deck has no race of its own), else grey. */
export function deckColour(d: { cards: string[] }): string {
  const race = mainRace(d.cards);
  return (race !== undefined && FACTION_COLOUR[`f${race + 1}`]) || '#9aa0ac';
}

/** What a deck's cards are, in a word or two: the races they come from (most first), or neutral. */
function deckRacesLabel(d: SavedDeck): string {
  const counts = new Map<number, number>();
  for (const id of d.cards) {
    const r = cardDef(id).race;
    if (r !== undefined) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const races = [...counts].sort((a, b) => b[1] - a[1]).map(([r]) => RACE_NAMES[r].toLowerCase());
  if (!races.length) return 'neutral';
  return races.length > 2 ? `${races.slice(0, 2).join(' · ')} +${races.length - 2}` : races.join(' · ');
}

/** A deck as it stands, to compare (its name and cards, in any order). */
function snap(d: SavedDeck): string {
  return `${d.name.trim()}|${[...d.cards].sort().join(',')}`;
}

/** Where a card falls in energy-cost order (X, spending all you have, last). */
const costOrder = (c: CardDef) => (c.spendAll ? 9 : cardCost(c.id));

/** The pool as last laid out: cards to a row (portrait cards, and Heroes), and the heights of a row and of the pool (in pixels). */
interface PoolLayout {
  cols: number;
  cmdCols: number;
  cardH: number;
  cmdH: number;
  height: number;
  gap: number;
  /** Rows a page shows (one fewer on a short screen). */
  rows?: number;
}
const fitted: Partial<Record<string, PoolLayout>> = {};
/** Rows of cards each view shows. */
const ROWS: Record<string, number> = { sm: 3, md: 2, lg: 1 };
const GUESS: Record<string, PoolLayout> = {
  sm: { cols: 8, cmdCols: 6, cardH: 160, cmdH: 100, height: 600, gap: 6 },
  md: { cols: 5, cmdCols: 4, cardH: 240, cmdH: 150, height: 600, gap: 10 },
  lg: { cols: 3, cmdCols: 2, cardH: 340, cmdH: 210, height: 600, gap: 10 },
};
function poolLayout(grid: string): PoolLayout {
  return fitted[grid] ?? GUESS[grid] ?? GUESS.md;
}
const sameLayout = (a: PoolLayout, b: PoolLayout) =>
  a.cols === b.cols && a.cmdCols === b.cmdCols && Math.abs(a.cardH - b.cardH) < 2 && Math.abs(a.cmdH - b.cmdH) < 2 && Math.abs(a.height - b.height) < 2 && a.rows === b.rows;

/**
 * Size the deck builder's card pool to fill its width: as many columns as fit at the view's card size
 * (--dbw), each then widened to share the leftover space, so the cards reach both edges at any size.
 * (Fixed sizes, worked out here: cards that stretch themselves made laying out hundreds of them slow.)
 * Heroes, which lie landscape, get their own columns: at least two, about as many as three fit where
 * four cards do. The layout is kept, so the pages can be cut to just the rows the pool's height holds.
 */
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
  // Each view shows a set number of rows (small 3, medium 2, large 1): the cards are sized to the pool's
  // height for them, with as many columns as then fit across (and never wider than the view's own size
  // would make them fill the width).
  const height = pool.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
  const rowGap = parseFloat(css.rowGap) || gap;
  // (On a short screen, a phone on its side, a row fewer: cards too small to read are no use.)
  const rows = Math.max(1, (ROWS[pool.dataset.grid ?? 'md'] ?? 2) - (height < 300 ? 1 : 0));
  // (A card is 1.4 times as tall as it is wide; a little more room each, for its gem standing above it.)
  const byHeight = Math.floor((((height - (rows - 1) * rowGap) / rows) / 1.52) * 10) / 10;
  const card = height > 0 && byHeight > 0 ? { cols: Math.max(1, Math.floor((width + gap) / (byHeight + gap))), w: byHeight } : fit(base);
  if (card.cols * card.w + (card.cols - 1) * gap > width) card.w = Math.floor(((width - (card.cols - 1) * gap) / card.cols) * 10) / 10;
  const cmd = fit(base * 1.3, 2);
  pool.style.gridTemplateColumns = `repeat(${card.cols}, ${card.w}px)`;
  pool.style.setProperty('--cardw', `${card.w}px`);
  pool.style.setProperty('--cmdcw', `${cmd.w}px`);
  // (A card is 5:7, standing for a card and lying for a Hero.)
  fitted[pool.dataset.grid ?? 'md'] = {
    cols: card.cols,
    cmdCols: cmd.cols,
    cardH: card.w * 1.4,
    cmdH: cmd.w / 1.4,
    height,
    gap: rowGap,
    rows,
  };
}
