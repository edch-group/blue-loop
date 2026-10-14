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
  if (name === 'title') {
    stage.innerHTML = `<main class="menu menu-title" style="display:block;min-height:0;background:none"><div class="title-block" id="piece" style="padding:40px 80px">${'<div class="title-sun"></div><h1 class="title">blue loop</h1>'}</div></main>`;
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

// (Every face the game uses loaded before anything is drawn.)
void Promise.all(['400 1em Orbitron', '500 1em Orbitron', '700 1em Orbitron', '300 1em "Exo 2"', '400 1em "Exo 2"', '600 1em "Exo 2"'].map((f) => document.fonts.load(f))).then(() =>
  Object.assign(window, { face, badges, ready: true }),
);

import { registeredCardDefs } from '../src/engine/cards';
import { EXIT_FULLSCREEN_ICON, FULLSCREEN_ICON, LOG_ICON, MENU_ICON } from '../src/ui/menu-icon';
Object.assign(window, { allIds: () => registeredCardDefs().map((d) => d.id) });

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
Object.assign(window, { bakeEffect, bakeScore });
