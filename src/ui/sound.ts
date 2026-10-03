import { markDirty } from './account';
/**
 * Atmospheric audio, synthesised with Web Audio (no asset files yet).
 *
 * Every effect uses soft waveforms, slow attacks and a long shared "space"
 * reverb, so actions swell and bloom rather than click. A generative ambient
 * score (drone, slowly shifting pad chords and distant chimes; just synths,
 * no noise) plays underneath the menus; matches get a low, minimal pulse,
 * opened by the sound of a ship powering down. Each effect is one method, so recorded audio can replace
 * any of them later without touching the rest of the game.
 */

const PREFS_KEY = 'blue-loop:sound';

/** A tiny silent WAV. Playing it (looped) from a tap moves iOS into media playback, so the silent switch no longer mutes the game. */
function silentWav(): string {
  const rate = 8000, samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (o: number, t: string) => [...t].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + samples, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  text(36, 'data'); view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8-bit silence
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}
const MUSIC_KEY = 'blue-loop:music';

/** A-aeolian flavoured chords (frequencies in Hz) the score drifts between. */
const CHORDS: number[][] = [
  [110.0, 164.81, 246.94, 329.63], // Am(add9)
  [87.31, 130.81, 196.0, 329.63], // Fmaj7
  [98.0, 146.83, 220.0, 293.66], // Gsus / Dm feel
  [73.42, 110.0, 174.61, 261.63], // Dm7
  [82.41, 123.47, 185.0, 246.94], // Em(add4) — the eerie one
];
/** Pentatonic chime notes for the distant sparkles. */
const CHIMES = [659.25, 783.99, 880.0, 987.77, 1174.66, 1318.51, 1567.98];

export type MusicScene = 'ambient' | 'battle';

// ---- Battle theme -----------------------------------------------------------
// Low, pulsing and minimal, so it sits under the board's own sounds: a soft bass
// pulse holds one chord for about fifteen seconds, then shifts for a moment,
// with a few more sounds coming in very briefly, and settles back. After a
// couple of rounds the shifts grow a little and the pulse gains a touch more.

const BATTLE_BPM = 96;
const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midi = (name: string) => {
  const m = /^([A-G]#?)(-?\d)$/.exec(name)!;
  return (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
};
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** The chord the pulse holds (B minor), and the brief shifts away from it: each a bass root and a soft swell. */
const HOME = midi('B1');
const SHIFTS: { root: number; swell: number[] }[][] = [
  // Early rounds: one bar on G.
  [{ root: midi('G1'), swell: ['B4', 'D5', 'G5'].map(midi) }],
  // Later rounds: G, then A, leaning back home.
  [
    { root: midi('G1'), swell: ['B4', 'D5', 'G5'].map(midi) },
    { root: midi('A1'), swell: ['C#5', 'E5', 'A5'].map(midi) },
  ],
];
/** Bars the pulse holds home before each shift (2.5s a bar). */
const HOLD_BARS = 6;
/** Accents across the bar's eighths: the beat is felt, the rest barely there. */
const BASS_ACCENTS = [1, 0.35, 0.55, 0.35, 0.8, 0.35, 0.55, 0.4];

class SoundBoard {
  private ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  /** The battle theme's two faders: one lightly reverbed (bass, kick), one drenched like the ambient score. */
  private battleBus: GainNode | null = null;
  private battleLush: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastHover = 0;
  private lastRustle = 0;
  private musicTimers: number[] = [];
  private musicNodes: AudioNode[] = [];
  /** Which score is sounding (null: none). */
  private playing: MusicScene | null = null;
  /** Which score the current screen wants. */
  private scene: MusicScene = 'ambient';
  private silent: HTMLAudioElement | null = null;
  muted = false;
  musicOn = true;

  constructor() {
    try {
      this.muted = localStorage.getItem(PREFS_KEY) === 'muted';
      this.musicOn = localStorage.getItem(MUSIC_KEY) !== 'off';
    } catch {
      // Storage unavailable: defaults.
    }
    // Phones only allow audio to start from a completed gesture: on iOS a finger
    // going down does not count, lifting it (or a click or key press) does. Keep
    // listening, so audio also comes back after the app has been in the background.
    for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) {
      window.addEventListener(type, () => this.unlock(), { capture: true, passive: true });
    }
    // Leaving the app (home screen, app switcher, locking the phone) silences the game
    // completely; coming back resumes it. Without this, iOS keeps "media" playing.
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? this.sleep() : this.wake()));
    window.addEventListener('pagehide', () => this.sleep());
    window.addEventListener('pageshow', () => this.wake());
  }

  private sleep() {
    this.stopMusic(true);
    this.releasePlayback();
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  private wake() {
    if (document.visibilityState !== 'visible' || !this.ctx) return;
    // Resuming may need a fresh tap on iOS; the gesture listeners above retry until it runs.
    this.unlock();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.store(PREFS_KEY, this.muted ? 'muted' : 'on');
    if (this.muted) {
      this.stopMusic();
      this.releasePlayback();
    } else {
      this.mediaPlayback();
      if (this.musicOn) this.startMusic();
    }
  }

  /** Muted: stop claiming media playback, so the phone's other audio can carry on. */
  private releasePlayback() {
    this.silent?.pause();
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'auto';
    } catch {
      // ignore
    }
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    this.store(MUSIC_KEY, this.musicOn ? 'on' : 'off');
    if (this.musicOn && !this.muted) this.startMusic();
    else this.stopMusic();
  }

  private store(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
      markDirty();
    } catch {
      // ignore
    }
  }

  /** Browsers only allow audio after a user gesture; call from input handlers. */
  unlock() {
    if (document.visibilityState === 'hidden') return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = (this.ctx = new Ctx());
      const master = ctx.createGain();
      master.gain.value = 0.8;
      // Gentle limiter so swells never clip.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      master.connect(comp).connect(ctx.destination);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(4.5, 2.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      this.reverb.connect(wet).connect(master);

      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(master);
      this.sfx.connect(this.reverb);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.0001;
      this.musicBus.connect(master);
      this.musicBus.connect(this.reverb);

      this.battleBus = ctx.createGain();
      this.battleBus.gain.value = 0.0001;
      this.battleBus.connect(master);
      const battleSend = ctx.createGain();
      battleSend.gain.value = 0.25;
      this.battleBus.connect(battleSend).connect(this.reverb);
      this.battleLush = ctx.createGain();
      this.battleLush.gain.value = 0.0001;
      this.battleLush.connect(master);
      this.battleLush.connect(this.reverb);

      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (!this.muted) this.mediaPlayback();
    if (this.ctx.state !== 'running') {
      // Resuming is asynchronous: start the music once the context is actually running.
      void this.ctx
        .resume()
        .then(() => {
          if (this.musicOn && !this.muted) this.startMusic();
        })
        .catch(() => undefined);
    } else if (this.musicOn && !this.muted) this.startMusic();
  }

  /**
   * On iPhone, Web Audio follows the silent switch unless the page is playing
   * media. Ask for playback (Safari 17+) and, for older iOS, loop a silent clip.
   */
  private mediaPlayback() {
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session && session.type !== 'playback') session.type = 'playback';
    } catch {
      // Not supported: the silent clip below covers it.
    }
    try {
      if (!this.silent) {
        this.silent = new Audio(silentWav());
        this.silent.loop = true;
        this.silent.setAttribute('playsinline', '');
      }
      if (this.silent.paused) void this.silent.play().catch(() => undefined);
    } catch {
      // No HTMLAudioElement: nothing more to do.
    }
  }

  /** Synthetic hall: stereo noise with an exponential tail. */
  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private ready(): AudioContext | null {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  /** A soft voice: sine/triangle with a slow attack, optional glide, vibrato and lowpass. */
  private voice(
    freq: number,
    opts: {
      dur: number;
      attack?: number;
      gain?: number;
      type?: OscillatorType;
      to?: number;
      delay?: number;
      detune?: number;
      vibrato?: number;
      cutoff?: number;
      out?: AudioNode;
    },
  ) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const attack = opts.attack ?? 0.12;
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
    if (opts.detune) osc.detune.value = opts.detune;
    if (opts.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.2;
      depth.gain.value = opts.vibrato;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + opts.dur + 0.1);
    }
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = opts.cutoff ?? 4000;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    osc.connect(f).connect(g).connect(opts.out ?? this.sfx!);
    osc.start(t);
    osc.stop(t + opts.dur + 0.1);
  }

  /** Filtered noise swell (wind, whooshes, solar roar). */
  private breath(opts: { dur: number; freq: number; to?: number; q?: number; gain?: number; attack?: number; delay?: number; type?: BiquadFilterType; out?: AudioNode }) {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuf) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.Q.value = opts.q ?? 0.8;
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.08;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f).connect(g).connect(opts.out ?? this.sfx!);
    src.start(t, Math.random());
    src.stop(t + opts.dur + 0.1);
  }

  /** A glassy bell: fundamental plus a quiet inharmonic partial, long decay. */
  private bell(freq: number, delay = 0, gain = 0.05) {
    this.voice(freq, { dur: 2.4, attack: 0.02, gain, delay });
    this.voice(freq * 2.76, { dur: 1.2, attack: 0.02, gain: gain * 0.25, delay });
  }

  // ---- Effects ------------------------------------------------------------

  hover() {
    const now = performance.now();
    if (now - this.lastHover < 90) return;
    this.lastHover = now;
    this.voice(1318.5, { dur: 0.7, attack: 0.05, gain: 0.012, cutoff: 3000 });
  }
  /** A card or deck under the pointer: the dry rustle of paper (a few tiny bright crackles over a soft brush). */
  rustle() {
    const now = performance.now();
    if (now - this.lastRustle < 70) return;
    this.lastRustle = now;
    this.breath({ dur: 0.16, freq: 2400, to: 3600, q: 0.7, gain: 0.022, attack: 0.03, type: 'bandpass' });
    for (let i = 0; i < 3; i++)
      this.breath({ dur: 0.035 + Math.random() * 0.03, freq: 4200 + Math.random() * 2600, q: 1.6, gain: 0.014 + Math.random() * 0.01, attack: 0.004, delay: 0.015 + i * 0.03 + Math.random() * 0.02, type: 'bandpass' });
  }
  /** One point repaired: a single short, soft tick. */
  repair() {
    this.voice(1046.5, { dur: 0.09, attack: 0.003, gain: 0.022, cutoff: 4200 });
  }
  /** A button press in the menus: a soft glassy tick. */
  click() {
    this.voice(1760, { dur: 0.16, attack: 0.004, gain: 0.03, cutoff: 5200 });
    this.voice(2637, { dur: 0.1, attack: 0.003, gain: 0.012, delay: 0.012, cutoff: 6000 });
  }
  draw(delay = 0) {
    this.breath({ dur: 0.6, freq: 900, to: 2600, q: 1.2, gain: 0.05, attack: 0.18, delay });
    this.voice(659.25, { dur: 0.9, attack: 0.12, gain: 0.018, delay: delay + 0.05 });
  }
  shuffle() {
    for (let i = 0; i < 4; i++) this.breath({ dur: 0.5, freq: 700 + i * 300, to: 1800, gain: 0.04, attack: 0.15, delay: i * 0.14 });
  }
  play() {
    this.breath({ dur: 0.9, freq: 400, to: 1600, gain: 0.05, attack: 0.25 });
    this.voice(440, { dur: 1.6, attack: 0.18, gain: 0.05, cutoff: 1800 });
    this.voice(659.25, { dur: 1.6, attack: 0.25, gain: 0.03, cutoff: 1800, detune: 4 });
  }
  buy() {
    this.bell(880, 0, 0.045);
    this.bell(1318.5, 0.14, 0.035);
    this.bell(1760, 0.28, 0.02);
  }
  flare() {
    // A solar-wind roar that swells, with a deep rising undertone.
    this.breath({ dur: 1.8, freq: 180, to: 1400, type: 'lowpass', q: 2, gain: 0.16, attack: 0.55 });
    this.voice(55, { dur: 1.8, attack: 0.5, gain: 0.12, to: 110, type: 'triangle', cutoff: 400 });
  }
  /** Heat thrown at a rival: a short rising rush that leads into the strike (the strike is the blow). */
  launch() {
    this.breath({ dur: 0.5, freq: 400, to: 2200, type: 'bandpass', q: 1.2, gain: 0.06, attack: 0.3 });
  }
  /**
   * The targeting beam sweeping onto a card: an airy swish that rises as it flies, then (if it takes the card
   * away) a falling rush as the card is swept off the table.
   */
  whoosh(delay = 0, removes = true) {
    this.breath({ dur: 0.55, freq: 500, to: 3200, type: 'bandpass', q: 1.6, gain: 0.09, attack: 0.32, delay });
    this.breath({ dur: 0.45, freq: 1800, to: 5200, type: 'highpass', q: 0.7, gain: 0.03, attack: 0.28, delay: delay + 0.05 });
    if (removes) {
      this.breath({ dur: 0.8, freq: 2600, to: 220, type: 'bandpass', q: 1.1, gain: 0.1, attack: 0.08, delay: delay + 0.5 });
      this.voice(330, { dur: 0.7, attack: 0.05, gain: 0.025, to: 110, type: 'triangle', cutoff: 1200, delay: delay + 0.5 });
    }
  }
  thermo() {
    // Frost settling: a descending hiss and crystalline shimmer.
    this.breath({ dur: 1.6, freq: 6000, to: 1200, type: 'bandpass', q: 1.5, gain: 0.05, attack: 0.3 });
    [1567.98, 1318.51, 987.77].forEach((f, i) => this.voice(f, { dur: 1.8, attack: 0.25, gain: 0.018, delay: i * 0.18, vibrato: 4 }));
  }
  impact(hot: boolean) {
    if (hot) {
      this.voice(65, { dur: 1.6, attack: 0.04, gain: 0.16, to: 40, cutoff: 300 });
      this.breath({ dur: 1.1, freq: 300, to: 90, type: 'lowpass', gain: 0.08, attack: 0.05 });
    } else {
      this.bell(1174.66, 0, 0.03);
    }
  }
  /** Your sun takes enemy heat: a heavy, low blow with a searing crackle (bigger hits land harder). */
  hurt(amount = 1) {
    const g = Math.min(1.6, 0.8 + amount * 0.12);
    this.voice(49, { dur: 1.4, attack: 0.01, gain: 0.2 * g, to: 30, type: 'triangle', cutoff: 260 });
    this.voice(98, { dur: 0.5, attack: 0.005, gain: 0.08 * g, to: 55, type: 'square', cutoff: 500 });
    this.breath({ dur: 0.9, freq: 2400, to: 300, type: 'bandpass', q: 0.8, gain: 0.12 * g, attack: 0.01 });
  }
  /** You land heat on a rival: a bright crack, then a rolling burn. */
  strike(amount = 1) {
    const g = Math.min(1.5, 0.8 + amount * 0.1);
    this.breath({ dur: 0.35, freq: 5000, to: 1200, type: 'highpass', q: 0.7, gain: 0.1 * g, attack: 0.004 });
    this.voice(130.8, { dur: 1.0, attack: 0.01, gain: 0.1 * g, to: 65, type: 'triangle', cutoff: 900 });
    this.breath({ dur: 1.2, freq: 900, to: 160, type: 'lowpass', q: 1.2, gain: 0.07 * g, attack: 0.06, delay: 0.05 });
  }
  /** Shields take a hit: a glassy clang. */
  block() {
    this.voice(880, { dur: 0.7, attack: 0.003, gain: 0.05, type: 'triangle', cutoff: 5000 });
    this.voice(1244.5, { dur: 0.9, attack: 0.003, gain: 0.03, cutoff: 5000, detune: 7 });
    this.breath({ dur: 0.25, freq: 4200, to: 2500, type: 'bandpass', q: 2, gain: 0.06, attack: 0.003 });
  }
  shield() {
    this.voice(523.25, { dur: 1.6, attack: 0.2, gain: 0.03, type: 'triangle', vibrato: 6, cutoff: 2000 });
    this.voice(784, { dur: 1.6, attack: 0.3, gain: 0.02, vibrato: 6 });
  }
  /**
   * A hero takes the field: a rising rush, then a deep boom under a swelling brass-like chord, crowned with
   * bells. Much bigger than an ordinary card.
   */
  hero() {
    const hit = 0.5;
    this.breath({ dur: hit + 0.1, freq: 220, to: 3200, type: 'bandpass', q: 1.4, gain: 0.08, attack: hit });
    this.voice(55, { dur: 2.6, attack: 0.01, gain: 0.24, to: 31, type: 'triangle', cutoff: 320, delay: hit });
    this.breath({ dur: 1.8, freq: 1400, to: 70, type: 'lowpass', q: 1, gain: 0.17, attack: 0.02, delay: hit });
    // The chord: open fifths on D, low and wide, slightly detuned against itself like a brass section.
    [73.42, 110, 146.83, 220, 293.66].forEach((f, i) =>
      this.voice(f, { dur: 3.4, attack: 0.3, gain: 0.05 - i * 0.006, type: 'sawtooth', cutoff: 1300, detune: i % 2 ? 7 : -7, delay: hit + 0.02 }),
    );
    [587.33, 880, 1174.66, 1760].forEach((f, i) => this.bell(f, hit + 0.3 + i * 0.13, 0.03));
  }
  upgrade() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.bell(f, i * 0.16, 0.035));
  }
  objective() {
    // A slow shimmering chord bloom.
    [440, 554.37, 659.25, 880].forEach((f, i) => this.voice(f, { dur: 3.2, attack: 0.8, gain: 0.03, delay: i * 0.08, vibrato: 3 }));
    this.bell(1760, 0.6, 0.025);
  }
  turn() {
    [220, 329.63, 440].forEach((f, i) => this.voice(f, { dur: 2.6, attack: 0.9, gain: 0.03, delay: i * 0.1, cutoff: 1400 }));
  }
  endTurn() {
    this.breath({ dur: 1.2, freq: 1600, to: 300, gain: 0.05, attack: 0.3 });
  }
  supernova() {
    this.breath({ dur: 4, freq: 3000, to: 60, type: 'lowpass', q: 1, gain: 0.3, attack: 0.6 });
    this.voice(41.2, { dur: 4.5, attack: 0.4, gain: 0.28, to: 27.5, cutoff: 200 });
    this.voice(82.4, { dur: 3.5, attack: 1.2, gain: 0.08, type: 'triangle', cutoff: 600 });
  }
  error() {
    this.voice(146.83, { dur: 0.6, attack: 0.04, gain: 0.05, to: 130, cutoff: 500 });
  }

  // ---- Score ---------------------------------------------------------------

  /** The screen asks for a score: crossfade to it if music is playing (a battle opens with its fanfare). */
  setScene(scene: MusicScene) {
    if (scene === this.scene) return;
    this.scene = scene;
    if (this.playing) {
      this.stopMusic();
      this.startMusic();
    }
  }

  startMusic() {
    const ctx = this.ready();
    if (!ctx || this.playing || !this.musicBus || !this.battleBus || !this.battleLush) return;
    this.playing = this.scene;
    const now = ctx.currentTime;
    const buses: [GainNode, number, number][] =
      this.scene === 'battle' ? [[this.battleBus, 0.85, 0.05], [this.battleLush, 0.8, 0.05]] : [[this.musicBus, 0.5, 6]];
    for (const [bus, level, fade] of buses) {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), now);
      bus.gain.exponentialRampToValueAtTime(level, now + fade);
    }
    if (this.scene === 'battle') this.battleScore(ctx, this.battleBus, this.battleLush);
    else this.ambientScore(ctx, this.musicBus);
  }

  private ambientScore(ctx: AudioContext, bus: GainNode) {
    // Low drone: two detuned triangles through a slowly breathing lowpass.
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 260;
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.03;
    lfoDepth.gain.value = 140;
    lfo.connect(lfoDepth).connect(droneFilter.frequency);
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.09;
    droneFilter.connect(droneGain).connect(bus);
    const drones = [55, 55 * 1.5, 110].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = [-6, 5, 2][i];
      o.connect(droneFilter);
      o.start();
      return o;
    });
    lfo.start();

    this.musicNodes = [...drones, lfo, droneFilter, droneGain];

    // Pad chords every ~11s, sparkles every few seconds.
    let chord = 0;
    const pad = () => {
      if (this.playing !== 'ambient') return;
      const notes = CHORDS[chord % CHORDS.length];
      chord += 1 + Math.floor(Math.random() * 2);
      notes.forEach((f, i) => {
        const opts = { dur: 14, attack: 4 + i * 0.6, gain: 0.022, type: 'triangle' as OscillatorType, cutoff: 900, out: bus };
        this.voice(f * 2, opts);
        this.voice(f * 2, { ...opts, detune: 9, gain: 0.014 });
      });
      this.musicTimers.push(window.setTimeout(pad, 10500 + Math.random() * 3000));
    };
    const sparkle = () => {
      if (this.playing !== 'ambient') return;
      const f = CHIMES[Math.floor(Math.random() * CHIMES.length)];
      this.voice(f, { dur: 4, attack: 0.6, gain: 0.008 + Math.random() * 0.006, vibrato: 2, out: bus });
      this.musicTimers.push(window.setTimeout(sparkle, 2500 + Math.random() * 6000));
    };
    pad();
    this.musicTimers.push(window.setTimeout(sparkle, 3000));
  }

  /** A held, soft note at an exact time: a gentle swell in, a sustain that sags a little, a slow release, late vibrato. */
  private note(
    at: number,
    freq: number,
    len: number,
    opts: { gain: number; type?: OscillatorType; to?: number; cutoff?: number; detune?: number; attack?: number; release?: number; vibrato?: boolean; out: AudioNode },
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.setValueAtTime(freq, at);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + len + (opts.release ?? 0.5));
    if (opts.detune) osc.detune.value = opts.detune;
    const attack = opts.attack ?? 0.08;
    const rel = opts.release ?? 0.5;
    if (opts.vibrato && len > 0.5) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 4.8;
      depth.gain.setValueAtTime(0, at);
      depth.gain.setValueAtTime(0, at + 0.35);
      depth.gain.linearRampToValueAtTime(freq * 0.006, at + len);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + len + rel + 0.05);
    }
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = opts.cutoff ?? 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(opts.gain, at + attack);
    g.gain.linearRampToValueAtTime(opts.gain * 0.75, at + Math.max(len, attack + 0.01));
    g.gain.linearRampToValueAtTime(0, at + Math.max(len, attack + 0.01) + rel);
    osc.connect(f).connect(g).connect(opts.out);
    osc.start(at);
    osc.stop(at + len + rel + 0.05);
  }

  /** Seconds from now until an audio-clock time (never negative), for the delay-based effect voices. */
  private until(at: number) {
    return Math.max(0, at - this.ctx!.currentTime);
  }

  /**
   * A ship powering down as the match begins: the turbine whine winding down with its air and hum, and systems
   * blinking off one by one, into near silence.
   */
  private powerDown(t0: number, out: AudioNode) {
    const d = this.until(t0);
    // The whine and hum hold, then wind down as they fade.
    this.note(t0 + 0.05, 1500, 2.4, { gain: 0.028, to: 70, attack: 0.03, release: 1.0, cutoff: 3200, out });
    this.note(t0 + 0.05, 2250, 2.2, { gain: 0.01, type: 'sine', to: 105, attack: 0.03, release: 0.9, out });
    this.note(t0, 110, 2.6, { gain: 0.07, to: 38, attack: 0.02, release: 1.0, cutoff: 320, out });
    this.breath({ dur: 3.4, freq: 2600, to: 110, type: 'lowpass', q: 1.2, gain: 0.07, attack: 0.5, delay: d + 0.05, out });
    [988, 740, 554, 415].forEach((f, i) => this.voice(f, { dur: 0.35, attack: 0.004, gain: 0.014, to: f * 0.94, delay: d + 0.7 + i * 0.55, out }));
  }

  /**
   * The battle theme: the ship powers down, the pulse rises out of the dark, then rounds of holding home and
   * briefly shifting. Bars are scheduled just ahead of the audio clock.
   */
  private battleScore(ctx: AudioContext, bus: GainNode, lush: GainNode) {
    const step = 60 / BATTLE_BPM / 4;
    const barLen = step * 16;
    const t0 = ctx.currentTime + 0.05;
    const start = t0 + 3.6; // after the power-down

    // The bass runs through one shared filter that breathes slowly (as the menu drone does), then out dry, into
    // the hall, and into a faint, dark echo.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(120, start);
    filter.frequency.linearRampToValueAtTime(260, start + barLen * 3);
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoDepth.gain.value = 70;
    lfo.connect(lfoDepth).connect(filter.frequency);
    const hall = ctx.createGain();
    hall.gain.value = 0.4;
    const echo = ctx.createDelay(2);
    echo.delayTime.value = step * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.25;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 400;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    filter.connect(bus);
    filter.connect(hall).connect(lush);
    filter.connect(echo).connect(tone).connect(feedback).connect(echo);
    tone.connect(wet).connect(bus);
    lfo.start(t0);
    this.musicNodes = [filter, lfo, lfoDepth, hall, echo, feedback, tone, wet];
    const brighten = (at: number, to: number, over: number) => {
      filter.frequency.setValueAtTime(filter.frequency.value, at);
      filter.frequency.linearRampToValueAtTime(to, at + over);
    };

    this.powerDown(t0, lush);

    /** One bar of the pulse: soft eighths, a detuned pair long enough to blur into a hum, a sine under the beat. */
    const pulse = (at: number, rootNote: number, more: boolean) => {
      const root = rootNote + 12;
      BASS_ACCENTS.forEach((accent, e) => {
        // In later rounds the last eighth lifts to the fifth.
        const n = more && e === 7 ? root + 7 : root;
        const d = this.until(at + e * 2 * step);
        const opts = { dur: step * 3, attack: 0.03, gain: 0.08 * accent, type: 'triangle' as OscillatorType, cutoff: 2000, delay: d, out: filter };
        this.voice(hz(n), { ...opts, detune: -6 });
        this.voice(hz(n), { ...opts, detune: 6, gain: 0.055 * accent });
      });
      this.voice(hz(root - 12), { dur: step * 6, attack: 0.03, gain: 0.06, cutoff: 140, delay: this.until(at), out: bus });
    };

    /** A brief shift: the bass moves, the filter opens a touch, and a soft chord swells and fades within the bar. */
    const shift = (at: number, sh: { root: number; swell: number[] }, more: boolean) => {
      pulse(at, sh.root, more);
      brighten(at, 380, barLen * 0.4);
      brighten(at + barLen * 0.6, 260, barLen * 0.8);
      sh.swell.forEach((n, i) => {
        const opts = { dur: barLen * 1.1, attack: barLen * 0.4, gain: 0.012, type: 'triangle' as OscillatorType, cutoff: 1100, delay: this.until(at + i * 0.06), out: lush };
        this.voice(hz(n), opts);
        this.voice(hz(n), { ...opts, detune: 8, gain: 0.008 });
      });
      // A faint glint high above, in later rounds only.
      if (more) this.voice(hz(sh.swell[2] + 12), { dur: 2.4, attack: 0.02, gain: 0.008, vibrato: 2, delay: this.until(at + step * 8), out: lush });
    };

    // The plan, bar by bar: hold home, shift briefly, repeat; two plain rounds, then two with a little more.
    type Bar = { shift?: { root: number; swell: number[] }; more: boolean };
    const plan: Bar[] = [];
    for (let round = 0; round < 4; round++) {
      const more = round >= 2;
      for (let b = 0; b < HOLD_BARS; b++) plan.push({ more });
      for (const sh of SHIFTS[more ? 1 : 0]) plan.push({ shift: sh, more });
    }

    let next = start;
    let index = 0;
    const tick = () => {
      if (this.playing !== 'battle') return;
      while (next < ctx.currentTime + 0.5) {
        const bar = plan[index];
        if (bar.shift) shift(next, bar.shift, bar.more);
        else pulse(next, HOME, bar.more);
        next += barLen;
        index = (index + 1) % plan.length;
      }
    };
    tick();
    this.musicTimers.push(window.setInterval(tick, 100));
  }

  /** Fade the score out (or cut it at once, when the app is being hidden). */
  stopMusic(immediate = false) {
    if (!this.playing || !this.ctx || !this.musicBus || !this.battleBus || !this.battleLush) return;
    const buses = this.playing === 'battle' ? [this.battleBus, this.battleLush] : [this.musicBus];
    this.playing = null;
    // Ids from setTimeout and setInterval share one pool, so clearTimeout ends either.
    this.musicTimers.forEach((t) => window.clearTimeout(t));
    this.musicTimers = [];
    const now = this.ctx.currentTime;
    for (const bus of buses) {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), now);
      if (immediate) bus.gain.setValueAtTime(0.0001, now);
      else bus.gain.exponentialRampToValueAtTime(0.0001, now + 2);
    }
    const nodes = this.musicNodes;
    this.musicNodes = [];
    window.setTimeout(() => {
      for (const n of nodes) {
        if (n instanceof AudioScheduledSourceNode) n.stop();
        n.disconnect();
      }
    }, 2200);
  }
}

export const sound = new SoundBoard();
