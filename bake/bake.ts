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
import { cardBackFace, cardArtLite, cardBodyHtml, cardJewels, cardStock, fullArt, KIND_COLOUR, raceRow, stabilityBadge, typeLine } from '../src/ui/glyphs';
import { fitCardText } from '../src/ui/fittext';
import { cardCost } from '../src/engine/game';
import { GUARD_SHIELD_SVG, GUARD_SVG, HUB_ICONS, SHIELD_SVG } from '../src/ui/app';
import { shownKind } from '../src/engine/cards';
import { effectMark, keywordList, raceTraitTags, symbolIcon } from '../src/ui/glyphs';
import { plainText } from '../src/engine/keywords';
import { SUBRACES, raceTrait } from '../src/engine/races';
import { baseAttack, baseHealth, persists } from '../src/engine/game';

const stage = document.getElementById('stage')!;
document.body.style.background = '#ffffff';
document.body.style.margin = '0';
// (The places a card is shown in, for faceIn: the card keeps every rule they give it, but they draw nothing of their
// own, lay it out at the page's top left and hide nothing of it; its badges are there, unseen.)
document.head.insertAdjacentHTML(
  'beforeend',
  `<style>
    .bake-wrap { display: block !important; position: static !important; inset: auto !important; width: max-content !important; height: auto !important; margin: 0 !important; padding: 0 !important; background: none !important; border: 0 !important; box-shadow: none !important; transform: none !important; filter: none !important; opacity: 1 !important; overflow: visible !important; animation: none !important; perspective: none !important; }
    .bake-wrap::before, .bake-wrap::after { display: none !important; }
    .bake-wrap .card { box-shadow: none !important; transition: none !important; animation: none !important; }
    .bake-wrap .card-jewels, .bake-wrap .stat-def { visibility: hidden !important; }
  </style>`,
);

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
 * A card's face as the web draws it at one size, in the place it stands there (its floors on fonts and art make a
 * small card no shrunken large one): `table`, in play on the board (.board-plane .tableau .card.card-table at --tcw);
 * `hand`, in the hand (.table-view > .dock .hand > .card at --hw); `stage`, a card on its own as the stage draws it
 * (.stage .card at --scw; the reply's cards, the shop's reveal and the deck builder's are the same card). Its markup is the board's own (app.ts renderCard), its badges there but unseen (Unity sets its own over it),
 * its text fitted as the web fits it (fittext.ts). (The page's own size gives the phone's rules or not.)
 */
function faceIn(id: string, ctx: 'table' | 'hand' | 'stage', width: number): void {
  const def = cardDef(id);
  const race = def.race !== undefined ? ` race-${def.race}` : '';
  const full = fullArt(def.id) ? ` card-full${cardCost(def.id) > 0 ? ' card-costed' : ''}` : '';
  const stats =
    ctx === 'table'
      ? `<b class="stat-def stat-def-floor">${SHIELD_SVG}<span class="def-n">1</span></b>${cardJewels({ atk: baseAttack(def) > 0 ? baseAttack(def) : undefined, hp: baseHealth(def.id), hero: def.kind === 'command' })}`
      : stabilityBadge(def);
  const tag = ctx === 'stage' ? 'div' : 'button';
  const card = `<${tag} class="card kind-${def.kind}${race}${full} rarity-${def.rarity ?? 'dwarf'} ${ctx === 'table' ? 'card-table' : ''}${ctx === 'stage' ? ' card-still' : ''}" data-card="${def.id}" style="--kc:${KIND_COLOUR[shownKind(def)]}">
        ${cardStock(def)}<div class="card-glyph">${cardArtLite(def, true)}</div>${raceRow(def)}
        ${stats}
        <div class="card-name">${def.name.toLowerCase()}</div>
        <div class="card-text">${cardBodyHtml(def)}</div>
        <div class="card-kind">${typeLine(def)}</div>
      </${tag}>`;
  const wrap = (cls: string, inner: string, style = '') => `<div class="${cls} bake-wrap"${style ? ` style="${style}"` : ''}>${inner}</div>`;
  stage.innerHTML =
    ctx === 'table'
      ? wrap('table-view', wrap('game', wrap('display board', wrap('board3d', wrap('board-plane', wrap('tableau tableau-mine', wrap('tableau-row-wrap', wrap('tableau-row', card)))))), `--tcw:${width}px`))
      : ctx === 'hand'
        ? wrap('table-view', wrap('dock dock-raised', wrap('hand-zone', wrap('hand', card)), `--hw:${width}px`))
        : wrap('table-view', wrap('stage', card, `--scw:${width}px`));
  fitCardText(stage);
}
Object.assign(window, { faceIn });

/**
 * A card in play's badges for one value: its attack and stability jewels and its defence shield (a Guard's too), on a
 * bare table card, for the bake to take each on its own. `low`: the stability jewel's low look; `dim`: a dimmed attack;
 * `dent`: the shield worn (.stat-dented); `pv`: the number as a choosable card shows it hovered while heat is aimed
 * (app.ts pv: .card-choosable:hover .pv-after, the value the heat would leave, in red).
 */
function badges(n: number, width: number, opts: { low?: boolean; dim?: boolean; dent?: boolean; pv?: boolean } = {}): void {
  const num = opts.pv ? `<span class="pv-after" style="display:inline;color:#d8452b">${n}</span>` : `${n}`;
  const def = (guard: boolean) => `<b class="stat-def stat-def-floor ${opts.dent ? 'stat-dented' : ''} ${guard ? 'stat-def-guard' : ''}">${guard ? GUARD_SVG + GUARD_SHIELD_SVG : SHIELD_SVG}<span class="def-n">${num}</span></b>`;
  const card = (inner: string, cls = '') => `<div class="card card-table kind-attack ${cls}" style="--tcw:${width}px;--kc:#888;background:none;border:none;box-shadow:none;margin:${width * 0.3}px">${inner}</div>`;
  stage.innerHTML = `<div class="board-plane" style="display:flex;flex-wrap:wrap">${card(cardJewels({ atk: n, hp: num, dim: opts.dim, lowHp: opts.low }), 'b-jewels')}${card(def(false), 'b-def')}${card(def(true), 'b-guard')}</div>`;
}

// (The places a card in play or in hand stands in, for marks: as bake-wrap, but the card itself keeps its own look.)
document.head.insertAdjacentHTML(
  'beforeend',
  `<style>
    .bake-m { display: block !important; position: static !important; inset: auto !important; width: max-content !important; height: auto !important; margin: 0 !important; padding: 0 !important; background: none !important; border: 0 !important; box-shadow: none !important; transform: none !important; filter: none !important; opacity: 1 !important; overflow: visible !important; animation: none !important; perspective: none !important; }
    .bake-m::before, .bake-m::after { display: none !important; }
    .bake-m.tableau-row, .bake-m.hand { padding: 60px !important; }
    .bake-m .card { background: transparent !important; border-color: transparent !important; transition: none !important; transform: none !important; }
    .bake-m .card::before, .bake-m .card.card-full::after { display: none !important; }
    .bake-m .card > :not(.bake-keep) { visibility: hidden !important; }
    .bake-m .card .bake-keep, .bake-m .card .bake-keep * { animation: none !important; }
  </style>`,
);

/** app.ts chillMark: a chilled card's snowflake, its chill in the middle. */
const chillMark = (n: number) => `<span class="chill-mark" aria-hidden="true"><svg viewBox="-12 -12 24 24">${[0, 60, 120, 180, 240, 300].map((a) => `<g transform="rotate(${a})"><path d="M0 -4.4V-10.5M0 -7l-2.6 -2.4M0 -7l2.6 -2.4"/></g>`).join('')}</svg><b>${n}</b></span>`;

/**
 * What app.ts renderCard sets on a card beyond its face, one at a time, for scripts/bake-marks.mjs to take on its own
 * (the card itself drawn clear; the mark `#m` on it, or the card's own look: its class `kind`, the card itself `#m`): in
 * play (`table`, --tcw) or in hand (`hand`, --hw). `frame`: an animated look held that many seconds in (none: at rest).
 */
function marks(ctx: 'table' | 'hand', width: number, kind: string, n: number, frame?: number): void {
  const keep = (html: string) => html.replace(/^<(\w+) class="/, '<$1 id="m" class="bake-keep ');
  let inner = '';
  let cls = '';
  if (kind === 'shields') inner = keep(`<b class="card-shields">${symbolIcon('shield')}<span>${n}</span></b>`);
  else if (kind === 'growth') inner = keep(`<span class="growth">${n}</span>`);
  else if (kind === 'chill') inner = keep(chillMark(n));
  else if (kind === 'aimheat') inner = keep(`<b class="boss-aim-heat">${symbolIcon('heat')}<span>${n}</span></b>`);
  else if (kind === 'discount') inner = keep(`<b class="card-discount">−${n}</b>`);
  else if (kind.startsWith('boon-') || kind === 'guns') {
    // (app.ts boonMarks, roomMarks: a mark in the card's room row, along its top.)
    const k = kind === 'guns' ? 'guns' : kind.slice(5);
    inner = `<span class="card-room bake-keep"><i id="m" class="boon-mark${kind === 'guns' ? ' room-mark' : ''}">${effectMark(k)}${n ? `<small>${n}</small>` : ''}</i></span>`;
  } else if (kind.startsWith('fused-')) {
    // (A Fusion card tucked behind: its id after "fused-"; n, its place behind, 0 the nearest.)
    const fd = cardDef(kind.slice(6));
    inner = `<span class="fused-behind bake-keep" id="m" style="--fi:${n};--fk:${KIND_COLOUR[shownKind(fd)]}"><i>${fd.name.toLowerCase()}</i></span>`;
    cls = ' card-has-fused';
  } else cls = ` ${kind}`;
  const anim = frame === undefined ? 'animation:none' : `animation-delay:-${frame}s;animation-play-state:paused`;
  const plain = kind === 'card-frozen' || kind === 'card-chilled' || !!inner;
  const card = `<div class="card kind-attack rarity-dwarf ${ctx === 'table' ? 'card-table' : ''}${cls}"${inner ? '' : ' id="m"'} style="--kc:#888;${anim}${plain ? ';box-shadow:none' : ''}">${inner}</div>`;
  const wrap = (c: string, html: string, style = '') => `<div class="${c} bake-m"${style ? ` style="${style}"` : ''}>${html}</div>`;
  stage.innerHTML =
    ctx === 'table'
      ? wrap('table-view', wrap('game', wrap('display board', wrap('board3d', wrap('board-plane', wrap('tableau tableau-mine', wrap('tableau-row-wrap', wrap('tableau-row', card)))))), `--tcw:${width}px`))
      : wrap('table-view', wrap('dock dock-raised', wrap('hand-zone', wrap('hand', card)), `--hw:${width}px`));
}
Object.assign(window, { marks, fusionIds: () => registeredCardDefs().filter((d) => d.fusion).map((d) => d.id) });

/** The board's own pieces: a card's back (`back`), and the Stellari's flower (`flower`). */
function piece(kind: 'back' | 'flower', width: number): void {
  stage.innerHTML =
    kind === 'back'
      ? `<div class="card card-table" style="--tcw:${width}px;box-shadow:none;margin:0;padding:0">${cardBackFace()}</div>`
      : `<div id="piece" style="width:${width}px;height:${width}px">${stellariaFlower()}</div>`;
}
Object.assign(window, { piece });

/** A menu icon on its own, as the hub draws it (`small`: as the header links do; options as its corner button colours it), or the title block. */
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
    ? `<span class="hub-link-icon" id="piece" style="display:block;width:${size}px;height:${size}px${name === 'options' ? ';color:#5f8fc4' : ''}">${svg}</span>`
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
  // (The star chime's two parts, at any note: as the board's starHover voices them, its notes the only thing changed.)
  r.starTone = (midi: number) => {
    const [main, shimmer] = starVoices(r);
    r.voice(hzOf(midi), main[1]);
    r.voice(hzOf(midi) * (shimmer[0] / main[0]), shimmer[1]);
  };
  r.starUp = (midi: number) => r.voice(hzOf(midi), { ...starVoices(r)[2][1], delay: 0 });
  return { r, ctx };
}

const hzOf = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * The voices the board's starHover makes (sound.ts: the chord's tone, its octave shimmer, the chord's next tone up a
 * moment after), each [frequency, its options], read by having it chime once with its voices caught, not sounded.
 */
function starVoices(r: Board): [number, Record<string, unknown>][] {
  const calls: [number, Record<string, unknown>][] = [];
  const voice = r.voice;
  const playing = r.playing;
  r.voice = (f: number, o: Record<string, unknown>) => calls.push([f, o]);
  r.playing = null;
  r.lastHover = -Infinity;
  r.starHover(0);
  r.voice = voice;
  r.playing = playing;
  return calls;
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

/** 16-bit stereo WAV of a render's first `frames` frames (from frame `from`), as base64. */
function wav(buf: AudioBuffer, frames = buf.length, from = 0): string {
  const bytes = new Uint8Array(44 + frames * 4);
  const view = new DataView(bytes.buffer);
  const text = (o: number, t: string) => [...t].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 4, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, RATE, true); view.setUint32(28, RATE * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 4, true);
  const l = buf.getChannelData(0), r = buf.getChannelData(1);
  for (let i = 0; i < frames; i++) {
    view.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[from + i])) * 32767, true);
    view.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[from + i])) * 32767, true);
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
/**
 * A score's one pass, `loop` seconds. Folded (for looping): what rings on past its end laid back over its start, so
 * the loop is seamless. Not folded: its first pass as the web plays it from silence (the intro, before the loop).
 */
async function bakeScore(scene: 'ambient' | 'battle' | 'boss' | 'voyage', loop: number, fold = true): Promise<string> {
  const tail = 6;
  const { r, ctx } = await offlineBoard(loop + tail);
  r.scene = scene;
  r.playing = scene;
  // (The chords as they sound through the pass, [second, pitch classes], kept in bakeChords: the star chime is tuned
  // to the one sounding, as the board's hearChord keeps it.)
  const chords: [number, number[]][] = [];
  r.hearChord = (midis: number[], delay: number) => {
    const at = ctx.currentTime + delay;
    if (at < loop) chords.push([Math.round(at * 1000) / 1000, [...new Set(midis.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b)]);
  };
  Object.assign(window, { bakeChords: chords });
  for (const [bus, level] of r.faders(scene)) bus.gain.value = level;
  r.score(ctx, scene);
  tick(r, ctx, loop + tail, loop);
  const buf = await ctx.startRendering();
  const length = Math.round(RATE * loop);
  if (fold)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = length; i < d.length; i++) d[i - length] += d[i];
    }
  return wav(buf, length);
}
/**
 * A sound that runs for as long as it is on (the boosters' thrust): `length` seconds of it once it has settled (from
 * `from`, past its swell and the hall's filling), a whole number of every cycle in it, so it loops seamlessly.
 */
async function bakeLoop(method: string, args: unknown[], from: number, length: number): Promise<string> {
  const { r, ctx } = await offlineBoard(from + length);
  r[method](...args);
  const buf = await ctx.startRendering();
  return wav(buf, Math.round(RATE * length), Math.round(RATE * from));
}

/** A recording (a hero's line, base64 data URL) played as the board plays it (sound.ts clip): in the hall, through the master. */
async function bakeVoice(url: string): Promise<string> {
  const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
  const seconds = (await new OfflineAudioContext(2, RATE, RATE).decodeAudioData(bytes.slice(0))).duration + 5;
  const { r, ctx } = await offlineBoard(seconds);
  r.decoded.set(url, await ctx.decodeAudioData(bytes));
  r.clip(url);
  const buf = await ctx.startRendering();
  let end = buf.length;
  const l = buf.getChannelData(0), rr = buf.getChannelData(1);
  while (end > RATE * 0.05 && Math.abs(l[end - 1]) < 1e-4 && Math.abs(rr[end - 1]) < 1e-4) end--;
  return wav(buf, Math.min(buf.length, end + Math.round(RATE * 0.02)));
}
import { HEROES } from '../src/ui/voice';
import { factionAvatar } from '../src/ui/factions';
Object.assign(window, { bakeEffect, bakeScore, bakeLoop, bakeVoice, heroLines: () => Object.fromEntries(Object.entries(HEROES).map(([id, h]) => [id, h.lines])) });

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
/**
 * A booster pack as the shop's row shows it: the foil wrapper, turned a little, its shadow under it (its sheen still).
 * `part` 'open' or 'tear': as a bought one is torn open (.pack-ripped), facing straight on, its body (no strip) or its
 * tear strip alone; 'off': too dear to buy (.pack-slot[disabled] .pack: greyed and faded, its shadow gone); 'flat':
 * whole, facing straight on, its shadow under it (the game turns it as the row does, and as it lifts under the pointer).
 */
function pack(kind: string, width: number, part = ''): void {
  const k = kind === 'general' ? 'general' : Number(kind);
  const name = k === 'general' ? 'general' : RACE_NAMES[k].toLowerCase();
  const emblem = k === 'general' ? `<span class="pack-icon">${HUB_ICONS.pack}</span>` : factionAvatar(`f${k + 1}`, 'pack-emblem');
  const flat = part === 'off' ? 'filter:saturate(0.4) opacity(0.6);' : part ? 'transform:none;' : '';
  const hideTear = part === 'open' ? ' style="visibility:hidden"' : '';
  const hideBody = part === 'tear' ? ' style="visibility:hidden"' : '';
  stage.innerHTML = `<span class="pack-slot" id="piece" style="display:inline-block;padding:24px 34px 40px 24px"><span class="pack pack-${k}" style="width:${width}px;${flat}"><span class="pack-tear"${hideTear}></span><span class="pack-body"${hideBody}><span class="pack-brand">blue loop</span>${emblem}<span class="pack-name">${name}</span><span class="pack-count">${PROGRESSION.boosterSize} cards</span></span><span class="pack-shine" style="animation:none;background-position:150% 0;${part === 'tear' ? 'visibility:hidden' : ''}"></span></span></span>`;
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
  people: '<svg viewBox="0 0 16 16"><circle cx="6" cy="5.5" r="2.3"/><path d="M1.8 13.5c.4-2.4 2.1-3.8 4.2-3.8s3.8 1.4 4.2 3.8"/><circle cx="11.2" cy="6.2" r="1.8"/><path d="M11 9.8c1.7.1 3 1.3 3.3 3.2"/></svg>',
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

/**
 * A boon's mark beside a Hero (app.ts heroRail, boonMarks: .boon-mark.hero-boon), its effect's symbol in its colour on
 * the cream disc in its faint gold ring, as on a table card 200 px wide (--tcw), without its count (Unity sets that).
 */
function boonMark(kind: string): void {
  stage.innerHTML = `<div style="padding:4px;display:inline-block;--tcw:200px"><i id="mark" class="boon-mark hero-boon" style="display:grid">${effectMark(kind)}</i></div>`;
}

/**
 * What a relic's power does, marked over its badge (app.ts relicActionMark, .relic-action): its effect's symbol in its
 * colour on the white disc, over a badge 84 px across (.relic-panel-badge), the badge itself left out.
 */
function relicAction(kind: string): void {
  stage.innerHTML = `<style>.bake-ra::before { display: none !important; }</style><div class="cmp-relic bake-ra" style="width:84px;height:84px;padding:0;background:none;box-shadow:none;animation:none"><span class="relic-action">${effectMark(kind)}</span></div>`;
}
Object.assign(window, { boonMark, relicAction });

// ---- The glossary (glossary.ts glossarySections) as data, for scripts/bake-glossary.mjs ----
import { glossarySections } from '../src/ui/glossary';
import GLOSSARY_FIGURES from '../src/ui/glossary-figures.json';

/** A colour as the page computes it ("rgb(208, 89, 42)"), as #rrggbb. */
const hexOf = (rgb: string) => '#' + (rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');

/**
 * A run of words in the glossary as the page draws it: plain words; bold ones (`b`); a keyword (`kw`, its classes: its
 * words as written, its colour, size, weight and letter-spacing (in ems), whether in the display face and in capitals,
 * and its mark if it has one, `icon`); or a kind of card's dot (`dot`, its colour).
 */
type GlossaryRun = { text?: string; b?: boolean; kw?: string; colour?: string; size?: number; weight?: number; spacing?: number; display?: boolean; caps?: boolean; icon?: string; dot?: string };

function glossaryRuns(el: Element, icons: Record<string, string>): GlossaryRun[] {
  const runs: GlossaryRun[] = [];
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (n.textContent) runs.push({ text: n.textContent });
      continue;
    }
    const e = n as HTMLElement;
    if (e.matches('b.kw')) {
      if (e.querySelector('.gain-dots')) throw new Error('glossary: a keyword drawn as energy dots, which the Unity page does not draw');
      const cs = getComputedStyle(e);
      const size = parseFloat(cs.fontSize);
      const run: GlossaryRun = {
        text: e.textContent ?? '',
        kw: e.className,
        colour: hexOf(cs.color),
        size,
        weight: Number(cs.fontWeight),
        spacing: Math.round(((parseFloat(cs.letterSpacing) || 0) / size) * 1000) / 1000,
        display: cs.fontFamily.includes('Orbitron'),
        caps: cs.textTransform === 'uppercase',
      };
      // (Its mark, kept by the keyword's name: drawn once, in white, for the game to tint.)
      const svg = e.querySelector('svg');
      if (svg) {
        run.icon = (e.getAttribute('aria-label') ?? '').split(' ')[0].toLowerCase();
        icons[run.icon] = svg.outerHTML;
      }
      runs.push(run);
    } else if (e.tagName === 'B') runs.push({ text: e.textContent ?? '', b: true });
    else if (e.matches('i.rule-dot')) runs.push({ dot: hexOf(getComputedStyle(e).backgroundColor) });
    else throw new Error(`glossary: <${e.tagName.toLowerCase()} class="${e.className}"> in its words, which the Unity page does not draw`);
  }
  return runs;
}

/**
 * The glossary's sections, each as the blocks its page is made of, as glossary.ts writes them (h3, lead, fig, terms,
 * steps, kw), with its pictures' sizes and each keyword mark's SVG.
 */
function glossary() {
  const icons: Record<string, string> = {};
  const terms = (dl: Element) => [...dl.children].map((row) => ({ dt: glossaryRuns(row.querySelector('dt')!, icons), dd: glossaryRuns(row.querySelector('dd')!, icons) }));
  const sections = Object.entries(glossarySections()).map(([id, [name, html]]) => {
    stage.innerHTML = `<div class="gl-page">${html()}</div>`;
    const blocks = [...stage.firstElementChild!.children].map((e) => {
      if (e.matches('h3')) return { t: 'h3', text: e.textContent };
      if (e.matches('p.gl-lead')) return { t: 'lead', runs: glossaryRuns(e, icons) };
      if (e.matches('dl.gl-terms')) return { t: 'terms', rows: terms(e) };
      if (e.matches('ol.gl-steps')) return { t: 'steps', items: [...e.children].map((li) => ({ title: li.querySelector(':scope > b')!.textContent, runs: glossaryRuns(li.querySelector(':scope > span')!, icons) })) };
      if (e.matches('section.gl-kw')) return { t: 'kw', title: e.querySelector('h4')!.textContent, rows: terms(e.querySelector('dl.gl-terms')!) };
      if (e.matches('figure.gl-fig')) {
        if (e.querySelector('figcaption')) throw new Error('glossary: a figure caption, which the Unity page does not draw');
        const labels = [...e.querySelectorAll<HTMLElement>('.gl-label')].map((l) => {
          const pin = e.querySelector<HTMLElement>(`[data-pin="${l.dataset.mark}"]`)!;
          return {
            key: l.dataset.mark,
            n: Number(l.querySelector('i')!.textContent),
            title: l.querySelector('b')!.textContent,
            text: l.querySelector('span')!.textContent,
            side: l.parentElement!.classList.contains('gl-fig-l') ? 'l' : 'r',
            x: parseFloat(pin.style.left),
            y: parseFloat(pin.style.top),
          };
        });
        return { t: 'fig', fig: [...e.classList].find((c) => c.startsWith('gl-fig-'))!.slice(7), labels };
      }
      throw new Error(`glossary: <${e.tagName.toLowerCase()} class="${e.className}">, which the Unity page does not draw`);
    });
    return { id, name, blocks };
  });
  const figures = Object.fromEntries(Object.entries(GLOSSARY_FIGURES as Record<string, { w: number; h: number }>).map(([k, f]) => [k, { w: f.w, h: f.h }]));
  return { sections, figures, icons };
}
Object.assign(window, { glossary });
