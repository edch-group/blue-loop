import { BALANCE, breakable, breakdownValue, CARDS, cardDef, copyLimit, craftCost, deckProblems, ownsDeck, RACE_NAMES, type CardKind } from '../engine';
import { customDecks, deleteDeck, deckById, PRESETS, saveDeck, type SavedDeck } from './decks';
import { factionAvatar } from './factions';
import { cardArt, KIND_COLOUR, stabilityBadge, typeLine } from './glyphs';
import { breakDown, craft, owned, profile } from './profile';

interface BuilderHost {
  render(): void;
  toast(text: string): void;
  /** Leave the builder (back to quickplay). */
  done(): void;
}

type Filter = 'all' | 'owned' | 'missing' | 'race' | 'neutral' | 'characters' | 'stellar' | 'anomaly' | CardKind;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The deck builder: a list of decks (the four race presets, which can be
 * copied, and the player's own), and an editor with the whole card pool on the
 * left and the deck on the right. A deck saves once it is legal.
 */
export class DeckBuilder {
  private editing: SavedDeck | null = null;
  private filter: Filter = 'all';
  /** A card opened to craft or break down. */
  private focus: string | null = null;

  constructor(private host: BuilderHost) {}

  open() {
    this.editing = null;
  }

  onInput(value: string) {
    if (this.editing) this.editing.name = value.slice(0, 24);
  }

  /** Handle a `db-` action; returns true if it was one. */
  onClick(act: string, arg: string): boolean {
    const d = this.editing;
    switch (act) {
      case 'db-back':
        if (this.editing) this.editing = null;
        else this.host.done();
        break;
      case 'db-new':
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: 'New deck', race: 0, cards: [] };
        this.filter = 'all';
        break;
      case 'db-copy': {
        const src = deckById(arg);
        if (!src) return true;
        this.editing = { id: `deck-${Date.now().toString(36)}`, name: `${src.name} copy`, race: src.race, cards: [...src.cards] };
        break;
      }
      case 'db-edit': {
        const src = deckById(arg);
        if (src && !src.preset) this.editing = { ...src, cards: [...src.cards] };
        break;
      }
      case 'db-delete':
        deleteDeck(arg);
        break;
      case 'db-filter':
        this.filter = arg as Filter;
        break;
      case 'db-race':
        if (d) d.race = Number(arg);
        break;
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
        } else if (d.cards.length >= BALANCE.deckSize) this.host.toast(`A deck holds exactly ${BALANCE.deckSize} cards.`);
        else if (copies >= copyLimit(arg)) this.host.toast(copyLimit(arg) === 1 ? `${cardDef(arg).name} is an Anomaly: one copy per deck.` : `At most ${BALANCE.maxCopies} copies of a card.`);
        else if (cardDef(arg).kind === 'command' && commands >= BALANCE.commandCards) this.host.toast(`A deck holds exactly ${BALANCE.commandCards} Command cards.`);
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
        saveDeck(d);
        this.editing = null;
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
        <div class="db-deck ${legal ? '' : 'db-deck-bad'}">
          ${factionAvatar(`f${d.race + 1}`, 'db-emblem')}
          <div class="db-deck-info">
            <b>${esc(d.name.toLowerCase())}</b>
            <small>${d.preset ? `${esc(RACE_NAMES[d.race].toLowerCase())} starter` : legal ? `${d.cards.length} cards` : 'incomplete'} · ${counts('attack')} attack · ${counts('defence')} defence · ${counts('growth')} growth</small>
          </div>
          <div class="db-deck-actions">
            ${d.preset ? `<button class="pill-btn" data-act="db-copy" data-arg="${d.id}">copy</button>` : `<button class="pill-btn" data-act="db-edit" data-arg="${d.id}">edit</button><button class="pill-btn" data-act="db-delete" data-arg="${d.id}">delete</button>`}
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
    const pool = CARDS.filter((c) => {
      switch (this.filter) {
        case 'all':
          return true;
        case 'owned':
          return owned(c.id) > 0;
        case 'missing':
          return owned(c.id) === 0;
        case 'race':
          return c.race === d.race;
        case 'neutral':
          return c.race === undefined && c.kind !== 'command' && c.kind !== 'global';
        case 'characters':
          return !!c.character;
        case 'stellar':
        case 'anomaly':
          return c.rarity === this.filter;
        default:
          return c.kind === this.filter;
      }
    })
      .sort((a, b) => (a.race === d.race ? -1 : 0) - (b.race === d.race ? -1 : 0) || (a.race ?? 9) - (b.race ?? 9))
      .map((c) => {
        const n = count(c.id);
        const have = owned(c.id);
        return `
          <button class="db-card ${n ? 'db-card-in' : ''} ${have ? '' : 'db-card-locked'} ${this.focus === c.id ? 'db-card-focus' : ''}" data-act="db-add" data-arg="${c.id}" data-card="${c.id}" style="--kc:${KIND_COLOUR[c.kind]}">
            <span class="card kind-${c.kind}${c.race !== undefined ? ` race-${c.race}` : ''} rarity-${c.rarity ?? 'dwarf'}">
              <span class="card-glyph">${cardArt(c, true)}</span>${stabilityBadge(c)}
              <span class="card-name">${esc(c.name.toLowerCase())}</span>
              <span class="card-text">${esc(c.text)}</span>
              <span class="card-kind">${typeLine(c)}</span>
            </span>
            ${n ? `<b class="db-count">×${n}</b>` : ''}
            <span class="db-own" data-act="db-focus" data-arg="${c.id}" title="Craft or break down">${have ? `owned ${have}` : 'not owned'} · ⟁</span>
          </button>`;
      })
      .join('');
    const grouped = [...new Set(d.cards)]
      .sort((a, b) => cardDef(a).kind.localeCompare(cardDef(b).kind) || cardDef(a).name.localeCompare(cardDef(b).name))
      .map(
        (id) => `
        <button class="db-row" data-act="db-remove" data-arg="${id}" style="--kc:${KIND_COLOUR[cardDef(id).kind]}" title="Tap to remove one">
          <span class="db-row-dot"></span><span>${esc(cardDef(id).name.toLowerCase())}</span><b>×${count(id)}</b><i>−</i>
        </button>`,
      )
      .join('');
    const commands = d.cards.filter((id) => cardDef(id).kind === 'command').length;
    const problems = deckProblems(d.cards);
    const filters: [Filter, string][] = [
      ['all', 'all'],
      ['owned', 'owned'],
      ['missing', 'not owned'],
      ['race', RACE_NAMES[d.race].toLowerCase()],
      ['neutral', 'neutral'],
      ['characters', 'characters'],
      ['stellar', 'stellar'],
      ['anomaly', 'anomaly'],
      ['attack', 'attack'],
      ['defence', 'defence'],
      ['growth', 'growth'],
      ['global', 'global'],
      ['command', 'command'],
      ['lightspeed', 'lightspeed'],
    ];
    return `
      ${this.header('deck builder')}
      <div class="setup-body db-editor">
        <div class="db-pool-side">
          <div class="db-filters">${filters.map(([f, label]) => `<button class="pill-btn ${this.filter === f ? 'pill-on' : ''}" data-act="db-filter" data-arg="${f}">${esc(label)}</button>`).join('')}</div>
          <div class="db-pool">${pool}</div>
        </div>
        <aside class="db-deck-side">
          <input class="db-name" data-db-name value="${esc(d.name)}" maxlength="24" aria-label="Deck name" />
          <div class="db-races">${[0, 1, 2, 3].map((r) => `<button class="db-race ${d.race === r ? 'on' : ''}" data-act="db-race" data-arg="${r}" title="${esc(RACE_NAMES[r])}">${factionAvatar(`f${r + 1}`, 'db-race-emblem')}</button>`).join('')}</div>
          <div class="db-tally"><b class="${d.cards.length === BALANCE.deckSize ? 'ok' : ''}">${d.cards.length}/${BALANCE.deckSize}</b> cards · <b class="${commands === BALANCE.commandCards ? 'ok' : ''}">${commands}/${BALANCE.commandCards}</b> command</div>
          ${this.focus ? this.renderFocus(this.focus) : ''}
          <div class="db-rows">${grouped || '<p class="muted">Tap cards on the left to add them.</p>'}</div>
        </aside>
      </div>
      <footer class="setup-foot">
        <span class="db-problem">${problems.length ? esc(problems[0]) : 'Ready to play.'}</span>
        <button class="btn-primary" data-act="db-save" ${problems.length ? 'disabled' : ''}>save deck</button>
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
}
