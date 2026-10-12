import { SHIP_SLOTS, shipPart, type PartKind, type PartSlot } from '../engine';

/**
 * The ship tab's schematic [direction: it should look like a ship schematic, with the parts all slotting into and
 * filling part of it; the parts themselves the exact shape of the part of the ship they represent]: the Captain's
 * ship from above, its nose to the right, drawn in blueprint lines; each slot outlined where its part goes (dashed
 * while empty), and each part drawn as the very shape that fills its slot, in its rarity's colour.
 */

/** The hull, from above (not a slot: the frame the parts fit round). */
export const HULL_PATH = 'M70 120 C70 96 96 84 130 82 L250 80 C300 80 336 96 356 120 C336 144 300 160 250 160 L130 158 C96 156 70 144 70 120 Z';

/** Each slot's shape, in the schematic's own units (400 × 240). */
export const SLOT_SHAPE: Record<PartSlot, string> = {
  // Plates down both flanks, joined across the spine fore and aft: a shell round the middle of the hull.
  armour:
    'M118 86 L262 84 L276 96 L262 100 L118 102 L104 94 Z M118 154 L262 156 L276 144 L262 140 L118 138 L104 146 Z M150 102 L162 102 L162 138 L150 138 Z M236 101 L248 101 L248 139 L236 139 Z',
  // A domed emitter on the spine, its rim of vents.
  shield: 'M200 104 C214 104 224 111 224 120 C224 129 214 136 200 136 C186 136 176 129 176 120 C176 111 186 104 200 104 Z M193 98 L207 98 L205 104 L195 104 Z M193 142 L207 142 L205 136 L195 136 Z',
  // A turret over the port flank, its twin barrels forward.
  port: 'M232 50 C242 50 250 57 250 66 C250 75 242 80 232 80 C222 80 214 75 214 66 C214 57 222 50 232 50 Z M248 58 L296 56 L296 61 L250 63 Z M248 69 L296 71 L296 76 L250 74 Z',
  // Its twin over the starboard flank.
  starboard:
    'M232 160 C242 160 250 165 250 174 C250 183 242 190 232 190 C222 190 214 183 214 174 C214 165 222 160 232 160 Z M248 166 L296 164 L296 169 L250 171 Z M248 177 L296 179 L296 184 L250 182 Z',
  // Two nacelles at the stern, their bells flared.
  booster: 'M28 92 L76 94 L84 100 L76 106 L28 108 L18 112 L18 88 Z M28 132 L76 134 L84 140 L76 146 L28 148 L18 152 L18 128 Z',
  // A ring round the spine, aft of the dome: the drive's coil, its core within.
  warp: 'M124 98 C140 98 150 108 150 120 C150 132 140 142 124 142 C108 142 98 132 98 120 C98 108 108 98 124 98 Z M124 108 C117 108 110 113 110 120 C110 127 117 132 124 132 C131 132 138 127 138 120 C138 113 131 108 124 108 Z',
};

/** Where each slot's shape lies (for drawing a part alone): x, y, width, height. */
const SLOT_BOX: Record<PartSlot, [number, number, number, number]> = {
  armour: [100, 80, 180, 80],
  shield: [172, 94, 56, 52],
  port: [210, 46, 90, 38],
  starboard: [210, 156, 90, 38],
  booster: [14, 84, 74, 72],
  warp: [94, 94, 60, 52],
};

/** A rarity's colours: its fill and its line. */
export const RARITY_INK: Record<string, [string, string]> = {
  dwarf: ['#cfe0f5', '#5f86b8'],
  stellar: ['#f6e3b0', '#b8892f'],
  anomaly: ['#e2d6f6', '#7a5cc0'],
};

const KIND_SLOT: Record<PartKind, PartSlot> = { armour: 'armour', shield: 'shield', weapon: 'port', booster: 'booster', warp: 'warp' };

/** A part drawn alone: the very shape of the slot it fills, in its rarity's colours. */
export function partShape(id: string): string {
  const p = shipPart(id);
  if (!p) return '';
  const slot = KIND_SLOT[p.kind];
  const [x, y, w, h] = SLOT_BOX[slot];
  const [fill, line] = RARITY_INK[p.rarity];
  const pad = 4;
  return `<svg class="part-shape" viewBox="${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}" aria-hidden="true"><path d="${SLOT_SHAPE[slot]}" fill="${fill}" stroke="${line}" stroke-width="1.6" stroke-linejoin="round" fill-rule="evenodd"/></svg>`;
}

/**
 * The schematic: the hull in blueprint lines, every slot outlined (dashed while empty, filled with its part when
 * fitted), each a button. `picked`: the part in hand, its slots lit to show where it goes.
 */
export function schematic(fitted: Partial<Record<PartSlot, string>>, picked: string | null, fits: PartSlot[], act = 'cmp-slot'): string {
  const grid = Array.from({ length: 9 }, (_, i) => `<path d="M${i * 50} 0V240" />`).join('') + Array.from({ length: 6 }, (_, i) => `<path d="M0 ${i * 48}H400" />`).join('');
  const slots = SHIP_SLOTS.map((sl) => {
    const p = shipPart(fitted[sl.id]);
    const [fill, line] = p ? RARITY_INK[p.rarity] : ['transparent', '#8ea6c8'];
    // (Lit where the part in hand could go: not where it already is.)
    const lit = picked && fits.includes(sl.id) && fitted[sl.id] !== picked;
    return `<g class="hg-slot ${p ? 'hg-fitted' : 'hg-empty'} ${lit ? 'hg-lit' : ''}" data-act="${act}" data-arg="${sl.id}" role="button" aria-label="${sl.name}${p ? `: ${p.name}` : ''}">
      <path d="${SLOT_SHAPE[sl.id]}" fill="${fill}" stroke="${line}" stroke-width="${p ? 1.6 : 1.2}" ${p ? '' : 'stroke-dasharray="4 3"'} stroke-linejoin="round" fill-rule="evenodd"/>
    </g>`;
  }).join('');
  return `<svg class="hg-schematic" viewBox="0 0 400 240" aria-label="Your ship">
    <g class="hg-grid">${grid}</g>
    <path class="hg-hull" d="${HULL_PATH}"/>
    <path class="hg-spine" d="M90 120 H340"/>
    ${slots}
  </svg>`;
}
