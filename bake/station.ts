/**
 * The stations' pictures for the Unity game (scripts/bake-station.mjs): the ship tab's schematic, its hull and each
 * slot's shape on its own (in white, the game tints them), the materials token and the research station's flask.
 */
import { HULL_PATH, SLOT_SHAPE } from '../src/ui/hangar';
import campaignSrc from '../src/ui/campaign.ts?raw';
import indexSrc from '../index.html?raw';

const stage = document.getElementById('stage')!;
// (The tokens' shared paint, as the game's page carries it.)
const defs = indexSrc.match(/<svg width="0"[\s\S]*?<\/defs><\/svg>/)?.[0] ?? '';
document.body.insertAdjacentHTML('afterbegin', defs);
/** A mark the game keeps to itself (not exported): taken from its source. */
const mark = (name: string) => campaignSrc.match(new RegExp(`const ${name} =[\\s\\S]*?'(<svg[\\s\\S]*?</svg>)'`))?.[1] ?? '';

const box = (w: number, inner: string) =>
  (stage.innerHTML = `<svg id="piece" viewBox="0 0 400 240" style="display:block;width:${w}px;height:${w * 0.6}px;overflow:visible">${inner}</svg>`);

/** The hull in blueprint lines over its grid, its spine dashed (the slots drawn apart). */
function hull(w: number): void {
  const grid = Array.from({ length: 9 }, (_, i) => `<path d="M${i * 50} 0V240"/>`).join('') + Array.from({ length: 6 }, (_, i) => `<path d="M0 ${i * 48}H400"/>`).join('');
  box(w, `<g style="stroke:rgba(95,134,184,0.12);stroke-width:0.8;fill:none">${grid}</g>
    <path d="${HULL_PATH}" style="fill:#fff;stroke:#8ea6c8;stroke-width:1.4"/>
    <path d="M90 120 H340" style="stroke:rgba(95,134,184,0.3);stroke-width:0.8;stroke-dasharray:3 4;fill:none"/>`);
}

/** A slot's shape in white: its fill, its line (fitted or lit), or its dashed line (empty). */
function slot(id: keyof typeof SLOT_SHAPE, mode: 'fill' | 'line' | 'dash', w: number): void {
  const style = mode === 'fill' ? 'fill:#fff;stroke:none' : mode === 'line' ? 'fill:none;stroke:#fff;stroke-width:1.7' : 'fill:none;stroke:#fff;stroke-width:1.2;stroke-dasharray:4 3';
  box(w, `<path d="${SLOT_SHAPE[id]}" style="${style};stroke-linejoin:round" fill-rule="evenodd"/>`);
}

/** The materials token, or the research station's flask. */
function token(name: 'MATERIALS' | 'RESEARCH_ICON', size: number): void {
  stage.innerHTML = `<span id="piece" style="display:block;width:${size}px;height:${size}px">${mark(name)}</span>`;
  stage.querySelector('svg')?.setAttribute('style', `width:${size}px;height:${size}px;display:block`);
}

Object.assign(window, { hull, slot, token, slots: () => Object.keys(SLOT_SHAPE), ready: true });
