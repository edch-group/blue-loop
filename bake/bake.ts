/**
 * The web game's own card faces, drawn on their own for the Unity game to use as pictures (scripts/bake-cards.mjs
 * screenshots them). A face is everything printed on the card; what changes in play (its attack, stability and
 * defence, shields, growth, highlights) Unity draws over it.
 */
import '@fontsource/orbitron/latin-400.css';
import '@fontsource/orbitron/latin-500.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/exo-2/latin-300.css';
import '@fontsource/exo-2/latin-400.css';
import '@fontsource/exo-2/latin-600.css';
import '../src/styles.css';
import { cardDef } from '../src/engine';
import { stellariaFlower } from '../src/ui/art';
import { cardBackFace, cardArtLite, cardBodyHtml, cardJewels, cardStock, fullArt, KIND_COLOUR, raceRow, typeLine } from '../src/ui/glyphs';
import { cardCost } from '../src/engine/game';
import { GUARD_SHIELD_SVG, GUARD_SVG, SHIELD_SVG } from '../src/ui/app';
import { shownKind } from '../src/engine/cards';

const stage = document.getElementById('stage')!;
document.body.style.background = '#ffffff';
document.body.style.margin = '0';

/** A card's face: `table` as it stands in play (compact), `face` as in the hand or the inspector. */
function face(id: string, variant: 'table' | 'face', width: number): void {
  const def = cardDef(id);
  const race = def.race !== undefined ? ` race-${def.race}` : '';
  const full = fullArt(def.id) ? ` card-full${cardCost(def.id) > 0 ? ' card-costed' : ''}` : '';
  const cls = variant === 'table' ? 'card-table' : 'card-big';
  stage.innerHTML = `<div class="bake-${variant}" style="--tcw:${width}px;--pw:${width}px;padding:0">
    <div class="card ${cls} kind-${def.kind}${race}${full} rarity-${def.rarity ?? 'dwarf'}" style="--kc:${KIND_COLOUR[shownKind(def)]};box-shadow:none;margin:0">
      ${cardStock(def)}<div class="card-glyph">${cardArtLite(def, true)}</div>${raceRow(def)}
      <div class="card-name">${def.name.toLowerCase()}</div>
      <div class="card-text">${cardBodyHtml(def)}</div>
      <div class="card-kind">${typeLine(def)}</div>
    </div></div>`;
}

/**
 * A card in play's badges for one value: its attack and stability jewels and its defence shield (a Guard's too), on a
 * bare table card, for the bake to take each on its own. `low`: the stability jewel's low look; `dim`: a dimmed attack.
 */
function badges(n: number, width: number, opts: { low?: boolean; dim?: boolean } = {}): void {
  const def = (guard: boolean) => `<b class="stat-def stat-def-floor ${guard ? 'stat-def-guard' : ''}">${guard ? GUARD_SVG + GUARD_SHIELD_SVG : SHIELD_SVG}<span class="def-n">${n}</span></b>`;
  const card = (inner: string, cls = '') => `<div class="card card-table kind-attack ${cls}" style="--tcw:${width}px;--kc:#888;background:none;border:none;box-shadow:none;margin:${width * 0.3}px">${inner}</div>`;
  stage.innerHTML = `<div class="board-plane" style="display:flex;flex-wrap:wrap">${card(cardJewels({ atk: n, hp: n, dim: opts.dim, lowHp: opts.low }), 'b-jewels')}${card(def(false), 'b-def')}${card(def(true), 'b-guard')}</div>`;
}

/** The board's own pieces: a card's back (`back`), and the Stellari's flower (`flower`). */
function piece(kind: 'back' | 'flower', width: number): void {
  stage.innerHTML =
    kind === 'back'
      ? `<div class="card card-table" style="--tcw:${width}px;box-shadow:none;margin:0;padding:0">${cardBackFace()}</div>`
      : `<div id="piece" style="width:${width}px;height:${width}px">${stellariaFlower()}</div>`;
}
Object.assign(window, { piece });

// (Every face the game uses loaded before anything is drawn.)
void Promise.all(['400 1em Orbitron', '500 1em Orbitron', '700 1em Orbitron', '300 1em "Exo 2"', '400 1em "Exo 2"', '600 1em "Exo 2"'].map((f) => document.fonts.load(f))).then(() =>
  Object.assign(window, { face, badges, ready: true }),
);

import { registeredCardDefs } from '../src/engine/cards';
Object.assign(window, { allIds: () => registeredCardDefs().map((d) => d.id) });
