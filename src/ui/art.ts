import { BALANCE, MAX_UPGRADES, type CoreAction } from '../engine';

/**
 * Procedural art: placeholders until commissioned artwork arrives. Swap any
 * of these functions for <img> tags without touching game logic.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Sun tint by temperature, deliberately muted so it sits inside the white
 * theme: pale ice (cold) → pearl (0) → soft ember (near supernova).
 */
export function heatTint(heat: number, threshold: number, alpha = 1): string {
  if (heat <= 0) {
    const t = Math.min(1, heat / BALANCE.minHeat);
    return `hsl(205 ${lerp(10, 38, t)}% ${lerp(97, 86, t)}% / ${alpha})`;
  }
  const t = Math.min(1, heat / threshold);
  return `hsl(${lerp(35, 10, t)} ${lerp(15, 55, t)}% ${lerp(96, 80, t)}% / ${alpha})`;
}

/** A player's sun: a pearl orb with a thin ring showing how close it is to supernova. */
export function sunOrb(opts: { heat: number; threshold: number; size: number; dead?: boolean; label?: string }): string {
  const { heat, threshold, size, dead } = opts;
  const pct = Math.max(0, Math.min(1, (heat - BALANCE.minHeat) / (threshold - BALANCE.minHeat))) * 100;
  const danger = heat > 0 && heat >= threshold - 3;
  return `
    <div class="orb ${dead ? 'orb-dead' : ''} ${danger ? 'orb-danger' : ''}" style="--size:${size}px;--tint:${heatTint(heat, threshold)};--glow:${heatTint(heat, threshold, 0.9)};--pct:${pct}%">
      <div class="orb-ring"></div>
      <div class="orb-core"></div>
      <div class="orb-label">${dead ? '✸' : (opts.label ?? heat)}</div>
    </div>`;
}

/** Soft petal mandala behind the play area (the "blue loop" motif). */
export function petalBackdrop(): string {
  const petals = Array.from({ length: 12 }, (_, i) => `<ellipse cx="500" cy="170" rx="95" ry="330" transform="rotate(${i * 30} 500 170)" />`).join('');
  const inner = Array.from({ length: 18 }, (_, i) => {
    const r = i * 20 + 10;
    return `<path d="M500 170 L526 -30 L500 -90 L474 -30 Z" transform="rotate(${r} 500 170)" />`;
  }).join('');
  return `
    <svg class="petals" viewBox="0 -300 1000 900" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs>
        <radialGradient id="glow" cx="50%" cy="0%" r="70%">
          <stop offset="0%" stop-color="#fff" stop-opacity="1" />
          <stop offset="40%" stop-color="#fbfaf6" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#fbfaf6" stop-opacity="0" />
        </radialGradient>
      </defs>
      <g class="petal-outer">${petals}</g>
      <g class="petal-inner">${inner}</g>
      <circle cx="500" cy="170" r="520" fill="url(#glow)" />
    </svg>`;
}

const ACTION_META: Record<CoreAction, { label: string; art: string }> = {
  solarFlare: { label: 'solar flare', art: 'art-flare' },
  thermosiphon: { label: 'thermosiphon', art: 'art-thermo' },
  coolingChamber: { label: 'cooling chamber', art: 'art-chamber' },
};

/**
 * A core action tile. Upgrade slots are frosted shapes that light up when
 * filled: Solar Flare has three small squares, Thermosiphon one large
 * square, Cooling Chamber three vertical bars.
 */
export function actionTile(opts: {
  action: CoreAction;
  upgrades: number;
  /** Money cost (omit for the passive Cooling Chamber). */
  cost?: number;
  /** Chip value: heat dealt, cooling, or max health. */
  power: number;
  enabled: boolean;
  compact?: boolean;
  actAttr?: string;
}): string {
  const { action, upgrades, cost, power, enabled } = opts;
  const meta = ACTION_META[action];
  const max = MAX_UPGRADES[action];
  const slots = Array.from({ length: max }, (_, i) => `<i class="slot slot-${i} ${i < upgrades ? 'filled' : ''}"></i>`).join('');
  const arc = action === 'solarFlare' ? `<div class="flare-ring" style="--p:${(power / (max + 1)) * 100}%"></div>` : '';
  const attr = opts.actAttr ?? (enabled ? `data-act="${action}"` : 'disabled');
  const icon = action === 'solarFlare' ? '▲' : action === 'thermosiphon' ? '▼' : '♥';
  const title = action === 'solarFlare' ? 'Heat dealt per flare' : action === 'thermosiphon' ? 'Cooling per use' : 'Max health (supernova threshold)';
  return `
    <button class="tile tile-${action} ${opts.compact ? 'tile-compact' : ''}" ${attr}>
      <div class="tile-art ${meta.art}"></div>
      ${arc}
      <div class="slots slots-${action}">${slots}</div>
      <div class="tile-chips">
        ${cost !== undefined ? `<span class="chip-glass" title="Cost">◈${cost}</span>` : ''}
        <span class="chip-glass" title="${title}">${icon}${power}</span>
      </div>
      <div class="pill">${meta.label}</div>
    </button>`;
}

/**
 * Compact action button for the dock rail: a small art thumbnail, the
 * action's current power, its upgrade pips and (if it has one) its cost.
 */
export function actionChip(opts: { action: CoreAction; upgrades: number; cost?: number; power: number; enabled: boolean; actAttr?: string }): string {
  const { action, upgrades, cost, power, enabled } = opts;
  const meta = ACTION_META[action];
  const max = MAX_UPGRADES[action];
  const pips = Array.from({ length: max }, (_, i) => `<i class="${i < upgrades ? 'on' : ''}"></i>`).join('');
  const icon = action === 'solarFlare' ? '▲' : action === 'thermosiphon' ? '▼' : '♥';
  const attr = opts.actAttr ?? (enabled ? `data-act="${action}"` : 'disabled');
  return `
    <button class="action-chip chip-${action}" ${attr} title="${meta.label}">
      <span class="chip-art ${meta.art}"></span>
      <span class="chip-body">
        <span class="chip-power">${icon}${power}</span>
        <span class="chip-pips">${pips}</span>
      </span>
      ${cost !== undefined ? `<span class="chip-cost">◈${cost}</span>` : '<span class="chip-cost chip-passive">max</span>'}
      <span class="chip-label">${meta.label}</span>
    </button>`;
}

const ROMAN: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n: number): string {
  if (n >= 40) return String(n);
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}
