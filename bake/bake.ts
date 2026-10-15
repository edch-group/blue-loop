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
import { GUARD_SHIELD_SVG, GUARD_SVG, HUB_ICONS, SHIELD_SVG } from '../src/ui/app';
import { shownKind } from '../src/engine/cards';
import { effectMark, keywordList, raceTraitTags } from '../src/ui/glyphs';
import { plainText } from '../src/engine/keywords';
import { SUBRACES, raceTrait } from '../src/engine/races';
import { baseHealth, persists } from '../src/engine/game';

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

/** A menu icon on its own, as the hub draws it (`small`: as the header links do), or the title block. */
function icon(name: string, size: number, small = false): void {
  if (name === 'title-sun') {
    // (The sun alone, with room all round for its glow.)
    stage.innerHTML = `<main class="menu menu-title" style="display:block;min-height:0;background:none"><div class="title-block" id="piece" style="padding:240px"><div class="title-sun"></div></div></main>`;
    return;
  }
  if (name === 'title') {
    stage.innerHTML = `<main class="menu menu-title" style="display:block;min-height:0;background:none"><div class="title-block" id="piece" style="padding:240px 80px 40px">${'<div class="title-sun"></div><h1 class="title">blue loop</h1>'}</div></main>`;
    return;
  }
  const svg = HUB_ICONS[name as keyof typeof HUB_ICONS];
  stage.innerHTML = small
    ? `<span class="hub-link-icon" id="piece" style="display:block;width:${size}px;height:${size}px">${svg}</span>`
    : `<span class="hub-icon" id="piece" style="display:block;width:${size}px;height:${size}px">${svg}</span>`;
}
Object.assign(window, { icon, iconNames: () => Object.keys(HUB_ICONS) });

/** One of the battle's corner icons (the log, fullscreen, the settings gear), drawn as its round button draws it. */
const HUD_ICONS = { log: LOG_ICON, fullscreen: FULLSCREEN_ICON, 'exit-fullscreen': EXIT_FULLSCREEN_ICON, settings: MENU_ICON };
function hudIcon(name: keyof typeof HUD_ICONS, size: number): void {
  stage.innerHTML = `<span class="icon-btn" id="piece" style="width:${size}px;height:${size}px;font-size:${size / 34 * 17.6}px;background:none;border:none;box-shadow:none">${HUD_ICONS[name]}</span>`;
}
Object.assign(window, { hudIcon, hudIconNames: () => Object.keys(HUD_ICONS) });

/** A race's emblem (factions.ts factionAvatar: its painted badge, or its line art on a pearl disc), as a challenge tile shows it. */
function faction(id: string, size: number): void {
  stage.innerHTML = `<span id="piece" class="ch-emblem" style="display:block;width:${size}px;height:${size}px">${factionAvatar(id, 'ch-emblem-mark')}</span>`;
  const el = stage.querySelector('.fav') as HTMLElement;
  el.style.width = el.style.height = `${size}px`;
}
Object.assign(window, { faction });

// (Every face the game uses loaded before anything is drawn.)
void Promise.all(['400 1em Orbitron', '500 1em Orbitron', '700 1em Orbitron', '300 1em "Exo 2"', '400 1em "Exo 2"', '600 1em "Exo 2"'].map((f) => document.fonts.load(f))).then(() =>
  Object.assign(window, { face, badges, ready: true }),
);

import { registeredCardDefs } from '../src/engine/cards';
import { EXIT_FULLSCREEN_ICON, FULLSCREEN_ICON, LOG_ICON, MENU_ICON } from '../src/ui/menu-icon';
// (And the built heroes' own cards, outside the pool: the Captain and the crew, each at its start.)
const BUILT_IDS = ['human_captain', 'companion_lancer', 'companion_engineer', 'companion_defector', 'companion_shade', 'companion_seer'];
Object.assign(window, { allIds: () => [...registeredCardDefs().map((d) => d.id), ...BUILT_IDS.filter((id) => !registeredCardDefs().some((d) => d.id === id))] });

// ---- Sound: the web game's own effects and scores, rendered offline (scripts/bake-sound.mjs) ----

import { sound } from '../src/ui/sound';
import heatFire from '../src/assets/sfx/heat-fire.mp3?inline';
import sunHit from '../src/assets/sfx/sun-hit.mp3?inline';
import cardHit from '../src/assets/sfx/card-hit.mp3?inline';
import riftTick from '../src/assets/sfx/rift-tick.mp3?inline';

const RATE = 44100;
// (The board's class, reached through its one instance; its workings are private to TypeScript only.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Board = any;

/** An offline board on a fresh context, its recordings decoded, its timers run as the render reaches them. */
async function offlineBoard(seconds: number): Promise<{ r: Board; ctx: OfflineAudioContext }> {
  const ctx = new OfflineAudioContext(2, Math.ceil(RATE * seconds), RATE);
  const Ctor = (sound as Board).constructor;
  const r: Board = new Ctor(true);
  r.ctx = ctx;
  r.decoded = new Map<string, AudioBuffer>();
  for (const url of [heatFire, sunHit, cardHit, riftTick]) {
    const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
    r.decoded.set(url, await ctx.decodeAudioData(bytes));
  }
  r.build(ctx);
  r.timers = [];
  return { r, ctx };
}

/** Run the board's timers as the render reaches them (every quarter second). */
function tick(r: Board, ctx: OfflineAudioContext, seconds: number, stopAt = Infinity) {
  for (let t = 0.25; t < seconds; t += 0.25)
    void ctx.suspend(t).then(() => {
      if (t + 0.6 >= stopAt) r.playing = null;
      const now = ctx.currentTime;
      const due = r.timers.filter((x: { at: number }) => x.at <= now);
      r.timers = r.timers.filter((x: { at: number }) => x.at > now);
      for (const x of due) x.fn();
      void ctx.resume();
    });
}

/** 16-bit stereo WAV of a render's first `frames` frames, as base64. */
function wav(buf: AudioBuffer, frames = buf.length): string {
  const bytes = new Uint8Array(44 + frames * 4);
  const view = new DataView(bytes.buffer);
  const text = (o: number, t: string) => [...t].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 4, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, RATE, true); view.setUint32(28, RATE * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 4, true);
  const l = buf.getChannelData(0), r = buf.getChannelData(1);
  for (let i = 0; i < frames; i++) {
    view.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true);
    view.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 32767, true);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** One effect (a method of the board, with its arguments), rendered with its tail, the silence after it trimmed. */
async function bakeEffect(method: string, args: unknown[], seconds: number): Promise<string> {
  const { r, ctx } = await offlineBoard(seconds);
  tick(r, ctx, seconds);
  r[method](...args);
  const buf = await ctx.startRendering();
  let end = buf.length;
  const l = buf.getChannelData(0), rr = buf.getChannelData(1);
  while (end > RATE * 0.05 && Math.abs(l[end - 1]) < 1e-4 && Math.abs(rr[end - 1]) < 1e-4) end--;
  return wav(buf, Math.min(buf.length, end + Math.round(RATE * 0.02)));
}

/**
 * One whole pass of a score (as the reversed scores are made: its form's length, the tails ringing past its end
 * folded back onto its start), so it loops seamlessly.
 */
async function bakeScore(scene: 'ambient' | 'battle' | 'boss' | 'voyage', loop: number): Promise<string> {
  const tail = 6;
  const { r, ctx } = await offlineBoard(loop + tail);
  r.scene = scene;
  r.playing = scene;
  for (const [bus, level] of r.faders(scene)) bus.gain.value = level;
  r.score(ctx, scene);
  tick(r, ctx, loop + tail, loop);
  const buf = await ctx.startRendering();
  const length = Math.round(RATE * loop);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = length; i < d.length; i++) d[i - length] += d[i];
  }
  return wav(buf, length);
}
import { HEROES } from '../src/ui/voice';
import { factionAvatar } from '../src/ui/factions';
Object.assign(window, { bakeEffect, bakeScore, heroLines: () => Object.fromEntries(Object.entries(HEROES).map(([id, h]) => [id, h.lines])) });

// ---- The Stellari's skill tree (campaign.ts renderShop): each skill's mark, what each level says, the flower ----
import { PETAL, UPGRADE_LOOK, UP_BRANCHES } from '../src/ui/campaign';
import { META_UPGRADES } from '../src/engine/meta';
/** A skill's mark, in white (the game tints it), as its disc draws it. */
function upIcon(id: string, size: number): void {
  const look = UPGRADE_LOOK[id];
  stage.innerHTML = `<span id="piece" style="display:block;width:${size}px;height:${size}px;color:#fff">${look?.icon ?? ''}</span>`;
  const svg = stage.querySelector('svg');
  if (svg) svg.setAttribute('style', `width:${size}px;height:${size}px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;display:block`);
}
/** The Stellari as the tree draws it: fine white lines, a faint white veil. */
function upFlower(size: number): void {
  stage.innerHTML = `<span id="piece" style="display:block;width:${size}px">${stellariaFlower()}</span>`;
  const svg = stage.querySelector('svg')!;
  svg.setAttribute('style', `width:${size}px;height:auto;display:block`);
  for (const e of svg.querySelectorAll('ellipse, path')) e.setAttribute('style', 'fill:rgba(255,255,255,0.26);stroke:rgba(255,255,255,0.95);stroke-width:1.4;vector-effect:non-scaling-stroke');
  for (const e of svg.querySelectorAll('.petal-inner path')) (e as SVGElement).style.strokeWidth = '1';
}
/** Each skill's words at each level (say, value), and the branches (their names, directions and colours). */
const upLooks = () => ({
  branches: UP_BRANCHES,
  skills: Object.fromEntries(
    META_UPGRADES.filter((u) => u.group !== 'unlock').map((u) => {
      const look = UPGRADE_LOOK[u.id];
      const levels = Array.from({ length: u.max + 1 }, (_, i) => i + 1);
      return [u.id, { icon: !!look, say: levels.map((l) => (look ? look.say(l) : u.text)), value: levels.map((l) => (look ? look.value(l) : '')) }];
    }),
  ),
});
Object.assign(window, { upIcon, upFlower, upLooks, upIds: () => META_UPGRADES.filter((u) => u.group !== 'unlock').map((u) => u.id) });
/** One of the campaign's currency marks (the petal), on its own. */
function currency(name: string, size: number): void {
  const svg = ({ petal: PETAL } as Record<string, string>)[name] ?? '';
  stage.innerHTML = `<span id="piece" style="display:block;width:${size}px;height:${size}px">${svg}</span>`;
  stage.querySelector('svg')?.setAttribute('style', `width:${size}px;height:${size}px;display:block`);
}
Object.assign(window, { currency });

// ---- Loot (loot3d.ts): a ship part by its kind and rarity, the petal, the cache, as their small 3D views draw them ----
import { mountLoot3d } from '../src/ui/loot3d';
function loot(what: string, size: number): void {
  stage.innerHTML = `<canvas id="piece" class="part-3d" data-loot3d="${what}" style="display:block;width:${size}px;height:${size}px"></canvas>`;
  mountLoot3d(stage);
}
Object.assign(window, { loot });

// ---- The shop's booster packs and the deck builder's marks (app.ts packFace, builder.ts), for scripts/bake-menus.mjs ----
import { PROGRESSION, RACE_NAMES } from '../src/engine';
import { modeArt } from '../src/ui/glyphs';
/** A booster pack as the shop's row shows it: the foil wrapper, turned a little, its shadow under it (its sheen still). */
function pack(kind: string, width: number): void {
  const k = kind === 'general' ? 'general' : Number(kind);
  const name = k === 'general' ? 'general' : RACE_NAMES[k].toLowerCase();
  const emblem = k === 'general' ? `<span class="pack-icon">${HUB_ICONS.pack}</span>` : factionAvatar(`f${k + 1}`, 'pack-emblem');
  stage.innerHTML = `<span class="pack-slot" id="piece" style="display:inline-block;padding:24px 34px 40px 24px"><span class="pack pack-${k}" style="width:${width}px"><span class="pack-tear"></span><span class="pack-body"><span class="pack-brand">blue loop</span>${emblem}<span class="pack-name">${name}</span><span class="pack-count">${PROGRESSION.boosterSize} cards</span></span><span class="pack-shine" style="animation:none;background-position:150% 0"></span></span></span>`;
}
/** A game mode's picture as the deck list's switch shows it (`off`: greyed, as when the other is picked). */
function modePic(m: 'core' | 'lost', width: number, off: boolean): void {
  stage.innerHTML = `<span class="db-mode-art" id="piece" style="width:${width}px;margin:0;${off ? 'filter:grayscale(1) opacity(0.55)' : 'filter:none'}">${modeArt(m)}</span>`;
}
/** The deck builder's small marks, in white (the game tints them): a deck's copy, share and delete, the filters' funnel, the card sizes, import. */
const DB_ICONS: Record<string, string> = {
  copy: '<svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5"/></svg>',
  share: '<svg viewBox="0 0 16 16"><circle cx="12" cy="3.5" r="1.8"/><circle cx="4" cy="8" r="1.8"/><circle cx="12" cy="12.5" r="1.8"/><path d="M5.6 7.1l4.8-2.7M5.6 8.9l4.8 2.7"/></svg>',
  delete: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9l.7-8.5M7 7v4.5M9 7v4.5"/></svg>',
  upload: '<svg viewBox="0 0 16 16"><path d="M8 10.5V2.5M4.8 5.5 8 2.3l3.2 3.2M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2"/></svg>',
  filter: '<svg viewBox="0 0 16 16"><path d="M2.5 3.5h11L9.2 8.6v4.2l-2.4-1.3V8.6z"/></svg>',
  'grid-sm': `<svg viewBox="0 0 14 14" class="fill">${[0, 5, 10].flatMap((y) => [0, 5, 10].map((x) => `<rect x="${x}" y="${y}" width="4" height="4" rx="1"/>`)).join('')}</svg>`,
  'grid-md': `<svg viewBox="0 0 14 14" class="fill">${[0, 7.5].flatMap((y) => [0, 7.5].map((x) => `<rect x="${x}" y="${y}" width="6.5" height="6.5" rx="1.5"/>`)).join('')}</svg>`,
  'grid-lg': '<svg viewBox="0 0 14 14" class="fill"><rect width="14" height="14" rx="2.5"/></svg>',
};
function dbIcon(name: string, size: number): void {
  stage.innerHTML = `<span id="piece" style="display:block;width:${size}px;height:${size}px">${DB_ICONS[name]}</span>`;
  const svg = stage.querySelector('svg')!;
  const fill = svg.classList.contains('fill');
  svg.setAttribute('style', `width:${size}px;height:${size}px;display:block;${fill ? 'fill:#fff;stroke:none' : 'fill:none;stroke:#fff;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round'}`);
}
Object.assign(window, { pack, modePic, dbIcon, dbIconNames: () => Object.keys(DB_ICONS) });

// ---- The menu's backdrop (art.ts petalBackdrop): its two rings, each square about the heart, and its glow ----
import { petalBackdrop } from '../src/ui/art';
/** One layer of the backdrop: 'outer', 'inner' (a square about the heart, 680 of its units) or 'glow' (its whole frame). */
function mandala(layer: string, size: number): void {
  stage.innerHTML = `<div id="piece" style="position:relative;width:${size}px;height:${layer === 'glow' ? size * 0.9 : size}px">${petalBackdrop()}</div>`;
  for (const svg of stage.querySelectorAll('svg')) {
    const keep = svg.classList.contains(`petal-${layer}`);
    if (!keep) { svg.remove(); continue; }
    svg.setAttribute('viewBox', layer === 'glow' ? '0 -300 1000 900' : '160 -170 680 680');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden');
    for (const e of svg.querySelectorAll('ellipse, path')) (e as SVGElement).setAttribute('style', `fill:rgba(255,255,255,0.26);stroke:rgba(255,255,255,0.95);stroke-width:${layer === 'inner' ? 1 : 1.4}`);
    svg.querySelector('.heat-core')?.remove();
  }
}
Object.assign(window, { mandala });

// ---- The settings panel's Stellari (settings.ts settingsPanel), still, for scripts/bake-menus.mjs ----
/** The flower that rises half out of the settings panel's foot, with its soft shadows, a margin round it for them. */
function settingsFlower(size: number): void {
  stage.innerHTML = `<div id="piece" style="padding:${size * 0.06}px;display:inline-block"><i class="settings-flower" style="position:relative;display:block;left:0;bottom:0;transform:none;opacity:1;width:${size}px;height:${size}px">${stellariaFlower()}</i></div>`;
  (stage.querySelector('.stellaria-flower') as SVGElement).style.animation = 'none';
}
Object.assign(window, { settingsFlower });

/**
 * A card's explanations as the web's inspector lists them beside it (app.ts explainCard, for a card not in play):
 * its race and what that gives it, its traits, a boss card's action, and each keyword and rule it carries. Drawn
 * into a zoom view, then read back row by row with the colours the page gives them, and each mark's picture.
 */
function explain(id: string): { race: boolean; head: string; colour: string; icon: string | null; body: string }[] {
  const def = cardDef(id);
  const first = [raceNoteOf(id), ...raceTraitTags(def).map((g) => `<div><b class="kw kw-trait ${g.nerf ? 'kw-trait-nerf' : ''}">${g.name}</b><span>${g.text}</span></div>`)].filter(Boolean);
  if (def.bossAction && def.overlordPart !== 'lost lord') {
    const words = def.bossAction.say ?? plainText(def.text.includes('Action:') ? def.text.slice(def.text.indexOf('Action:') + 7) : def.text).trim();
    first.push(`<div><b class="kw kw-removal">${def.bossAction.name}</b><span>${'Its action, when its turn comes: ' + words}</span></div>`);
  }
  stage.innerHTML = `<div class="zoom-card">${keywordList(def.text, persists(id) ? { health: baseHealth(id) } : {}, first)}</div>`;
  return [...stage.querySelectorAll<HTMLElement>('.kw-list > div')].map((row) => {
    const b = row.querySelector<HTMLElement>('b');
    const svg = b?.querySelector('svg');
    return {
      race: row.classList.contains('kw-race-row'),
      head: (b?.textContent ?? '').trim(),
      colour: b ? getComputedStyle(b).color : '',
      icon: svg ? svg.outerHTML : null,
      body: (row.querySelector('span')?.textContent ?? '').trim(),
    };
  });
}

/** app.ts raceNote: a race card's race (and sub-race), and the theme that rides on every card of it. */
function raceNoteOf(defId: string): string {
  const def = cardDef(defId);
  if (def.race === undefined) return '';
  const t = raceTrait(def.race);
  const sub = def.sub && SUBRACES[def.sub] ? ` · ${SUBRACES[def.sub].name}` : '';
  const head = `<b class="kw kw-race">${RACE_NAMES[def.race]}${sub}</b>`;
  const theme = def.sub && SUBRACES[def.sub] ? SUBRACES[def.sub].theme : t ? plainText(t.bonus) : '';
  if (!theme) return `<div class="kw-race-row">${head}</div>`;
  return `<div class="kw-race-row">${head}<span>${theme.replace(/\.*$/, '.')}</span></div>`;
}

/** A mark's picture on its own (its SVG as drawn in the list, in its row's colour, `size` px). */
function mark(svg: string, colour: string, size: number): void {
  stage.innerHTML = `<div class="kw-list" style="padding:0;background:none;box-shadow:none"><b id="mark" class="kw kw-sym" style="color:${colour};width:${size}px;height:${size}px;display:grid;font-size:${size}px">${svg.replace('<svg ', `<svg style="width:${size}px;height:${size}px;margin:0" `)}</b></div>`;
}
Object.assign(window, { explain, mark });

/**
 * A Hero's pick's mark on its own (app.ts heroPicks: .hero-pick-mark), its effect's symbol in its colour on the white
 * disc in its gold ring (`atk`: the attack's, in red), without its count (Unity sets that over it).
 */
function heroMark(kind: string, atk: boolean): void {
  stage.innerHTML = `<div style="padding:4px;display:inline-block"><span id="mark" class="hero-pick-mark ${atk ? 'hero-pick-mark-atk' : ''}" style="display:block">${effectMark(kind)}</span></div>`;
}
Object.assign(window, { heroMark });
