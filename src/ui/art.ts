import { BALANCE, MAX_UPGRADES, type CoreAction } from '../engine';

/**
 * Procedural art: placeholders until commissioned artwork arrives. Swap any
 * of these functions for <img> tags without touching game logic.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Sun colour by temperature: icy blue (-10), white (0), furnace red (10). */
export function heatColor(heat: number, lightShift = 0): string {
  if (heat <= 0) {
    // Fixed blue hue so cooling fades white → ice blue, never through green.
    const t = heat / BALANCE.minHeat; // 0 → 1 as it cools
    return `hsl(206 ${lerp(25, 85, t)}% ${lerp(96, 60, t) + lightShift}%)`;
  }
  const t = heat / BALANCE.supernovaAt;
  return `hsl(${lerp(45, 6, t)} ${lerp(40, 95, t)}% ${lerp(96, 55, t) + lightShift}%)`;
}

/** Each solar system has its own rim tint so players are recognisable at a glance. */
const SYSTEM_HUE: Record<string, number> = {
  helios_reach: 44,
  vulcan_forge: 14,
  aegis_cluster: 200,
  midas_belt: 50,
  cryon_drift: 190,
  tempest_binary: 265,
  obsidian_veil: 230,
  nova_crown: 330,
};
export const systemHue = (id: string) => SYSTEM_HUE[id] ?? 210;

/** A player's sun: a glowing core in its heat colour, ringed in its system tint. */
export function sunOrb(opts: { heat: number; systemId: string; size: number; label?: string; dead?: boolean }): string {
  const { heat, systemId, size, dead } = opts;
  const pct = ((heat - BALANCE.minHeat) / (BALANCE.supernovaAt - BALANCE.minHeat)) * 100;
  const core = heatColor(heat);
  const deep = heatColor(heat, -22);
  const hue = systemHue(systemId);
  return `
    <div class="orb ${dead ? 'orb-dead' : ''}" style="--size:${size}px;--core:${core};--deep:${deep};--rim:hsl(${hue} 45% 70%);--pct:${pct}%">
      <div class="orb-ring"></div>
      <div class="orb-core"></div>
      <div class="orb-label">${dead ? '✸' : (opts.label ?? heat)}</div>
    </div>`;
}

/** Soft petal mandala behind the play area (the "blue loop" motif). */
export function petalBackdrop(): string {
  const petals = Array.from({ length: 12 }, (_, i) => {
    const r = i * 30;
    return `<ellipse cx="500" cy="170" rx="95" ry="330" transform="rotate(${r} 500 170)" />`;
  }).join('');
  const inner = Array.from({ length: 18 }, (_, i) => {
    const r = i * 20 + 10;
    return `<path d="M500 170 L${500 + 26} ${170 - 200} L500 ${170 - 260} L${500 - 26} ${170 - 200} Z" transform="rotate(${r} 500 170)" />`;
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
};

/**
 * A core action tile. Upgrade slots are frosted squares that light up when
 * filled: Solar Flare has three small ones, Thermosiphon one large one.
 */
export function actionTile(opts: {
  action: CoreAction;
  upgrades: number;
  cost: number;
  power: number;
  enabled: boolean;
  compact?: boolean;
  actAttr?: string;
}): string {
  const { action, upgrades, cost, power, enabled } = opts;
  const meta = ACTION_META[action];
  const max = MAX_UPGRADES[action];
  const slots = Array.from({ length: max }, (_, i) => `<i class="slot slot-${i} ${i < upgrades ? 'filled' : ''}"></i>`).join('');
  // Solar Flare's arc shows heat per flare out of its maximum (1 + upgrades).
  const arc = action === 'solarFlare' ? `<div class="flare-ring" style="--p:${(power / (max + 1)) * 100}%"></div>` : '';
  const attr = opts.actAttr ?? (enabled ? `data-act="${action}"` : 'disabled');
  return `
    <button class="tile tile-${action} ${opts.compact ? 'tile-compact' : ''}" ${attr}>
      <div class="tile-art ${meta.art}"></div>
      ${arc}
      <div class="slots slots-${action}">${slots}</div>
      <div class="tile-chips">
        <span class="chip-glass" title="Cost">◈ ${cost}</span>
        <span class="chip-glass" title="${action === 'solarFlare' ? 'Heat dealt' : 'Cooling'}">${action === 'solarFlare' ? '▲' : '▼'} ${power}</span>
      </div>
      <div class="pill">•${meta.label}•</div>
    </button>`;
}

const ROMAN: [number, string][] = [
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
export function roman(n: number): string {
  if (n >= 40) return String(n);
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}
