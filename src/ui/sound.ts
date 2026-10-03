import { markDirty } from './account';
/**
 * Atmospheric audio, synthesised with Web Audio (no asset files yet).
 *
 * Every effect uses soft waveforms, slow attacks and a long shared "space"
 * reverb, so actions swell and bloom rather than click. A generative ambient
 * score (drone, slowly shifting pad chords and distant chimes; just synths,
 * no noise) plays underneath the menus; matches get a gliding, wobbling synth
 * score, opened by the sound of a ship powering down. Each effect is one method, so recorded audio can replace
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
// Built from the power-down's voices (gliding, detuned triangles and rushing
// filtered air) and generated as it plays, so it never loops the same way: a
// gliding bass whose resonant filter wobbles in time, its pattern changing bar
// to bar; a mid-range synth pulsing on the chord most of the time; and, from
// the second bar on, a varied stream of low gestures (dives, rises, swoops,
// wobbles, gated stutters, bends, slides, air) panned around the field.

const BATTLE_BPM = 96;
const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midi = (name: string) => {
  const m = /^([A-G]#?)(-?\d)$/.exec(name)!;
  return (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
};
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

type Chord = { root: number; third: number };
const minor = (n: string): Chord => ({ root: midi(n), third: 3 });
const major = (n: string): Chord => ({ root: midi(n), third: 4 });
/** Eight-bar phrases, alternating: home on B minor for four bars (10s), then a turn. */
const PHRASES: Chord[][] = [
  [minor('B1'), minor('B1'), minor('B1'), minor('B1'), major('G1'), major('G1'), major('A1'), major('A1')],
  [minor('B1'), minor('B1'), minor('B1'), minor('B1'), minor('E1'), minor('E1'), major('G1'), major('F#1')],
];

/** Bass patterns over a bar's sixteenths: [step, pitch (root, octave, fifth, third), length, accent, glide]. */
type BassNote = [number, 'r' | 'o' | 'f' | 't', number, number, boolean?];
const BASS: Record<'drive' | 'octave' | 'sync' | 'slide' | 'breathe' | 'pickup', BassNote[]> = {
  drive: [[0, 'r', 2, 1], [2, 'r', 2, 0.5], [4, 'r', 2, 0.7], [6, 'r', 2, 0.5], [8, 'r', 2, 0.85], [10, 'r', 2, 0.5], [12, 'r', 2, 0.7], [14, 'r', 2, 0.55]],
  octave: [[0, 'r', 2, 1], [2, 'r', 2, 0.5], [4, 'r', 2, 0.7], [6, 'o', 2, 0.6, true], [8, 'r', 2, 0.85, true], [10, 'r', 2, 0.5], [12, 'r', 2, 0.7], [14, 'o', 2, 0.6, true]],
  sync: [[0, 'r', 3, 1], [3, 'r', 3, 0.7], [6, 'r', 2, 0.6], [8, 'r', 3, 0.9], [11, 'r', 3, 0.7], [14, 'f', 2, 0.6, true]],
  slide: [[0, 'r', 2, 1], [2, 'r', 2, 0.5], [4, 'o', 2, 0.7, true], [6, 'r', 2, 0.5, true], [8, 'r', 2, 0.85], [10, 't', 2, 0.55, true], [12, 'f', 2, 0.7, true], [14, 'r', 2, 0.6, true]],
  breathe: [[0, 'r', 4, 1], [6, 'r', 2, 0.6], [8, 'r', 4, 0.9], [14, 'f', 2, 0.6, true]],
  pickup: [[0, 'r', 2, 1], [2, 'r', 2, 0.5], [4, 'r', 2, 0.7], [6, 'r', 2, 0.5], [8, 'r', 2, 0.85], [10, 'r', 2, 0.5], [12, 'r', 1, 0.6], [13, 'f', 1, 0.55, true], [14, 'o', 1, 0.6, true], [15, 'f', 1, 0.6, true]],
};
type Gesture = 'dive' | 'rise' | 'swoop' | 'wobble' | 'gate' | 'bend' | 'slides' | 'air';
const GESTURES: Gesture[] = ['dive', 'rise', 'swoop', 'wobble', 'gate', 'bend', 'slides', 'air'];

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
      this.scene === 'battle' ? [[this.battleBus, 0.48, 0.05], [this.battleLush, 0.45, 0.05]] : [[this.musicBus, 0.5, 6]];
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
   * The battle theme: the ship powers down, then the bass, the mid synth and the gestures come in within a few
   * bars, all generated bar by bar just ahead of the audio clock.
   */
  private battleScore(ctx: AudioContext, bus: GainNode, lush: GainNode) {
    const step = 60 / BATTLE_BPM / 4;
    const barLen = step * 16;
    const t0 = ctx.currentTime + 0.05;
    const start = t0 + 3.4; // after the power-down
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
    const nodes: AudioNode[] = [];
    const osc = (type: OscillatorType, freq: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      o.start(t0);
      nodes.push(o);
      return o;
    };
    const lfo = (rate: number, depth: number, target: AudioParam) => {
      const o = osc('sine', rate);
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(target);
      nodes.push(g);
      return o;
    };

    // ---- The bass: one gliding voice (a detuned triangle pair and a sine an octave down) gated note by note,
    // through a resonant lowpass that wobbles in time.
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.Q.value = 5;
    bassFilter.frequency.value = 260;
    const bassWob = lfo(BATTLE_BPM / 30, 140, bassFilter.frequency);
    const bassGate = ctx.createGain();
    bassGate.gain.value = 0;
    const subGate = ctx.createGain();
    subGate.gain.value = 0;
    const bassHall = ctx.createGain();
    bassHall.gain.value = 0.3;
    const bassOscs = [osc('triangle', 60, -8), osc('triangle', 60, 8)];
    const sub = osc('sine', 30);
    bassOscs.forEach((o) => o.connect(bassFilter));
    bassFilter.connect(bassGate).connect(bus);
    bassGate.connect(bassHall).connect(lush);
    sub.connect(subGate).connect(bus);
    nodes.push(bassFilter, bassGate, subGate, bassHall);
    const bassNote = (at: number, n: number, len: number, accent: number, glide: boolean) => {
      const f = hz(n);
      for (const o of bassOscs) glide ? o.frequency.setTargetAtTime(f, at, 0.035) : o.frequency.setValueAtTime(f, at);
      glide ? sub.frequency.setTargetAtTime(f / 2, at, 0.035) : sub.frequency.setValueAtTime(f / 2, at);
      const peak = 0.13 * accent;
      bassGate.gain.setTargetAtTime(peak, at, 0.006);
      bassGate.gain.setTargetAtTime(peak * 0.4, at + 0.03, len * 0.35);
      bassGate.gain.setTargetAtTime(0, at + len * 0.92, 0.025);
      subGate.gain.setTargetAtTime(0.07 * accent, at, 0.01);
      subGate.gain.setTargetAtTime(0, at + len * 0.9, 0.04);
    };

    // ---- The mid synth: the chord's third and fifth around middle C, two detuned triangles and a faint saw
    // each, gliding between chords, through a slowly sweeping filter and a tremolo whose rate changes by phrase.
    const midFilter = ctx.createBiquadFilter();
    midFilter.type = 'lowpass';
    midFilter.Q.value = 2;
    midFilter.frequency.value = 900;
    lfo(0.09, 350, midFilter.frequency);
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    const tremLfo = lfo(BATTLE_BPM / 15, 0.4, trem.gain);
    const midGate = ctx.createGain();
    midGate.gain.value = 0;
    midFilter.connect(trem).connect(midGate).connect(lush);
    nodes.push(midFilter, trem, midGate);
    const midVoices = [0, 1].map(() => {
      const os = [osc('triangle', 220, -9), osc('triangle', 220, 9), osc('sawtooth', 220, 3)];
      os.forEach((o, k) => {
        const g = ctx.createGain();
        g.gain.value = k < 2 ? 0.022 : 0.006;
        o.connect(g).connect(midFilter);
        nodes.push(g);
      });
      return os;
    });
    /** A chord tone placed in the mid range (A3 to A4). */
    const mid = (c: Chord, interval: number) => {
      let n = c.root + interval;
      while (n < midi('A3')) n += 12;
      return n;
    };
    const midChord = (at: number, c: Chord) =>
      [mid(c, c.third), mid(c, 7)].forEach((n, i) => midVoices[i].forEach((o) => o.frequency.setTargetAtTime(hz(n), at, 0.12)));

    // ---- Gestures: each through its own panner, somewhere in the field.
    const panned = () => {
      const p = ctx.createStereoPanner();
      p.pan.value = (Math.random() * 2 - 1) * 0.6;
      p.connect(lush);
      return p;
    };
    /** A detuned triangle pair whose pitch follows a path of [seconds, Hz] points, optionally wobbling. */
    const glider = (at: number, path: [number, number][], o: { gain: number; cutoff?: number; wob?: [number, number]; attack?: number; release?: number; out: AudioNode }) => {
      const end = at + path[path.length - 1][0];
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.cutoff ?? 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(o.gain, at + (o.attack ?? 0.05));
      g.gain.setValueAtTime(o.gain, Math.max(at + (o.attack ?? 0.05), end - (o.release ?? 0.4)));
      g.gain.linearRampToValueAtTime(0, end);
      f.connect(g).connect(o.out);
      let wob: OscillatorNode | null = null;
      let wobDepth: GainNode | null = null;
      if (o.wob) {
        wob = ctx.createOscillator();
        wob.frequency.setValueAtTime(o.wob[0], at);
        wob.frequency.linearRampToValueAtTime(o.wob[1], end);
        wobDepth = ctx.createGain();
        wobDepth.gain.value = path[0][1] * 0.025;
        wob.connect(wobDepth);
        wob.start(at);
        wob.stop(end + 0.05);
      }
      [-9, 9].forEach((detune) => {
        const v = ctx.createOscillator();
        v.type = 'triangle';
        v.detune.value = detune;
        v.frequency.setValueAtTime(path[0][1], at);
        for (const [t, hzv] of path.slice(1)) v.frequency.exponentialRampToValueAtTime(hzv, at + t);
        if (wobDepth) wobDepth.connect(v.frequency);
        v.connect(f);
        v.start(at);
        v.stop(end + 0.05);
      });
    };
    const air = (at: number, from: number, to: number, dur: number, gain: number, rising: boolean, out: AudioNode) =>
      this.breath({ dur, freq: from, to, type: rising ? 'bandpass' : 'lowpass', q: rising ? 1.4 : 1.2, gain, attack: rising ? dur * 0.9 : 0.05, delay: this.until(at), out });
    /** A chord tone in a given octave band (MIDI low..low+12). */
    const tone = (c: Chord, low: number) => {
      let n = c.root + pick([0, c.third, 7]);
      while (n < low) n += 12;
      return hz(n);
    };

    const gesture = (g: Gesture, at: number, c: Chord) => {
      const out = panned();
      switch (g) {
        case 'dive': {
          const f = tone(c, midi('E5')) * (Math.random() < 0.5 ? 1 : 0.75);
          const d = 1.2 + Math.random() * 1.2;
          glider(at, [[0, f], [d, f / 10]], { gain: 0.04, cutoff: 2400, release: d * 0.6, out });
          air(at, 2400, 110, d + 1, 0.07, false, out);
          break;
        }
        case 'rise': {
          const f = tone(c, midi('E2'));
          const d = barLen * (0.5 + Math.random() * 0.5);
          glider(at, [[0, f], [d, f * 4]], { gain: 0.034, cutoff: 1600, attack: d * 0.6, release: 0.15, wob: [2, 7], out });
          air(at, 140, 1500, d, 0.055, true, out);
          break;
        }
        case 'swoop': {
          const f = tone(c, midi('E3'));
          glider(at, [[0, f], [0.5, f * 2.5], [1.6, f * 0.7]], { gain: 0.035, cutoff: 2000, attack: 0.3, release: 0.6, out });
          break;
        }
        case 'wobble': {
          const f = tone(c, midi('B2'));
          const d = barLen * (0.75 + Math.random() * 0.75);
          const [a, b] = Math.random() < 0.5 ? [1.5, 8] : [8, 1.5];
          glider(at, [[0, f], [d, f]], { gain: 0.04, cutoff: 900, attack: d * 0.3, release: d * 0.3, wob: [a, b], out });
          break;
        }
        case 'gate': {
          // A stutter: sixteenths on one tone, swelling then fading, the filter opening as it goes.
          const f = tone(c, midi('E3'));
          const n = 8 + Math.floor(Math.random() * 3) * 4;
          for (let i = 0; i < n; i++) {
            const env = Math.sin((Math.PI * (i + 0.5)) / n);
            this.note(at + i * step, f, step * 0.55, { gain: 0.032 * env, cutoff: 500 + 2200 * (i / n), attack: 0.005, release: 0.05, out });
          }
          break;
        }
        case 'bend': {
          // Slides up a fourth into a chord tone and hangs there, wobbling, then sags away.
          const f = tone(c, midi('B2'));
          glider(at, [[0, f * 0.75], [0.25, f], [1.8, f], [2.6, f * 0.84]], { gain: 0.036, cutoff: 1500, attack: 0.08, release: 0.8, wob: [5, 3], out });
          break;
        }
        case 'slides': {
          // Glides back and forth between two chord tones in eighths.
          const a = hz(c.root + 24), b = hz(c.root + 24 + 7);
          const path: [number, number][] = [[0, a]];
          for (let i = 1; i <= 6; i++) path.push([i * step * 2, i % 2 ? b : a]);
          glider(at, path, { gain: 0.03, cutoff: 1400, attack: 0.1, release: 0.3, out });
          break;
        }
        case 'air':
          air(at, 3000, 120, 2.6, 0.075, false, out);
          if (Math.random() < 0.5) air(at + 1.2, 160, 1800, 1.8, 0.04, true, out);
          break;
      }
    };

    // ---- The plan, generated as it plays.
    this.powerDown(t0, lush);
    this.musicNodes = nodes;
    let bar = 0;
    let next = start;
    let lastGestures: Gesture[] = [];
    let midOn = false;
    const playBar = (at: number) => {
      const phrase = PHRASES[Math.floor(bar / 8) % PHRASES.length];
      const inPhrase = bar % 8;
      const c = phrase[inPhrase];
      const turn = inPhrase >= 4;

      // Bass: plain to begin with, then varied; it breathes before a turn now and then, with a pickup into it.
      const pattern = bar === 0 ? 'drive' : inPhrase === 3 ? pick(['breathe', 'pickup', 'sync'] as const) : turn ? pick(['octave', 'slide', 'sync', 'pickup'] as const) : pick(['drive', 'octave', 'sync', 'slide'] as const);
      const at16 = (s: number) => at + s * step;
      for (const [s, p, len, accent, glide] of BASS[pattern]) {
        const n = c.root + 12 + (p === 'o' ? 12 : p === 'f' ? 7 : p === 't' ? c.third : 0);
        bassNote(at16(s), n, len * step, accent, !!glide);
      }
      // The bass filter's wobble: in eighths, quarters, dotted eighths or (in a turn) sixteenths, every two bars.
      if (bar % 2 === 0) bassWob.frequency.setValueAtTime((BATTLE_BPM / 60) * pick(turn ? [2, 4, 4 / 3] : [1, 2, 4 / 3]), at);
      bassFilter.frequency.setTargetAtTime(turn ? 340 : 250, at, barLen * 0.5);

      // Mid synth: in from the second bar, out for the odd bar so it breathes; its tremolo changes by phrase.
      midChord(at, c);
      const want = bar >= 1 && !(inPhrase === 3 && Math.random() < 0.35) && !(inPhrase === 0 && bar > 0 && Math.random() < 0.25);
      if (want !== midOn) {
        midGate.gain.setTargetAtTime(want ? 1 : 0, at, want ? 0.6 : 0.4);
        midOn = want;
      }
      if (inPhrase === 0) tremLfo.frequency.setValueAtTime((BATTLE_BPM / 60) * pick([4, 3, 2, 4 / 3]), at);

      // Gestures: from the second bar, one most bars and two in a turn, never the same one twice running.
      const count = bar < 2 ? (bar === 1 ? 1 : 0) : turn ? 1 + (Math.random() < 0.6 ? 1 : 0) : Math.random() < 0.8 ? 1 : 0;
      for (let k = 0; k < count; k++) {
        const g = pick(GESTURES.filter((x) => !lastGestures.includes(x)));
        lastGestures = [...lastGestures, g].slice(-2);
        gesture(g, at16(k === 0 ? pick([0, 4, 8]) : pick([8, 10, 12])), c);
      }
      bar++;
    };
    const tick = () => {
      if (this.playing !== 'battle') return;
      while (next < ctx.currentTime + 0.5) {
        playBar(next);
        next += barLen;
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
