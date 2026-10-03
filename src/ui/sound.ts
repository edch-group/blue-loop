import { markDirty } from './account';
/**
 * Atmospheric audio, synthesised with Web Audio (no asset files yet).
 *
 * Every effect uses soft waveforms, slow attacks and a long shared "space"
 * reverb, so actions swell and bloom rather than click. A generative ambient
 * score (drone, slowly shifting pad chords and distant chimes; just synths,
 * no noise) plays underneath the menus; matches get a driving battle theme with
 * an entrance fanfare. Each effect is one method, so recorded audio can replace
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
// A handheld-era trainer battle reimagined in space: B minor at a racing tempo,
// a pulse-wave lead with a dotted echo, octave-bouncing bass, a 16th-note arp
// and a tight kit. Lines are written one bar (16 sixteenths) per string:
// a note name starts a note, "-" holds it, "." rests.

const BATTLE_BPM = 168;
const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midi = (name: string) => {
  const m = /^([A-G]#?)(-?\d)$/.exec(name)!;
  return (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
};
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** One bar of a line, as notes: step (0-15), MIDI note, length in steps. */
function bar(line: string): { step: number; note: number; len: number }[] {
  const out: { step: number; note: number; len: number }[] = [];
  line.trim().split(/\s+/).forEach((tok, step) => {
    if (tok === '-') {
      if (out.length) out[out.length - 1].len++;
    } else if (tok !== '.') out.push({ step, note: midi(tok), len: 1 });
  });
  return out;
}

/** Chord per bar: bass root, and the tones the arp climbs through. */
const BATTLE_BARS: { root: string; arp: string[]; lead: string }[] = [
  // A: the chase.
  { root: 'B1', arp: ['B3', 'D4', 'F#4', 'B4'], lead: 'B4 - . B4 D5 - F#5 - E5 - D5 - C#5 - D5 E5' },
  { root: 'B1', arp: ['B3', 'D4', 'F#4', 'B4'], lead: 'F#5 - - - - - E5 D5 E5 - - - . . . .' },
  { root: 'G1', arp: ['G3', 'B3', 'D4', 'G4'], lead: 'G5 - - F#5 - - E5 - D5 - E5 - F#5 - G5 -' },
  { root: 'A1', arp: ['A3', 'C#4', 'E4', 'A4'], lead: 'A5 - - - E5 - - - C#5 - E5 - A5 - G5 F#5' },
  { root: 'B1', arp: ['B3', 'D4', 'F#4', 'B4'], lead: 'F#5 - - D5 - - B4 - D5 - F#5 - B5 - A5 -' },
  { root: 'B1', arp: ['B3', 'D4', 'F#4', 'B4'], lead: 'F#5 - - - - - . . D5 E5 F#5 - E5 - D5 -' },
  { root: 'G1', arp: ['G3', 'B3', 'D4', 'G4'], lead: 'E5 - - D5 - - B4 - G5 - - F#5 - - E5 -' },
  { root: 'F#1', arp: ['F#3', 'A#3', 'C#4', 'E4'], lead: 'F#5 - - - - - - - A#4 - C#5 - E5 - F#5 -' },
  // B: the climb.
  { root: 'G1', arp: ['G3', 'B3', 'D4', 'G4'], lead: 'D6 - - - B5 - - - G5 - - - B5 - D6 -' },
  { root: 'A1', arp: ['A3', 'C#4', 'E4', 'A4'], lead: 'C#6 - - - A5 - - - E5 - - - A5 - C#6 -' },
  { root: 'F#1', arp: ['F#3', 'A3', 'C#4', 'F#4'], lead: 'C#6 - B5 - A5 - - - F#5 - A5 - C#6 - - -' },
  { root: 'B1', arp: ['B3', 'D4', 'F#4', 'B4'], lead: 'B5 - - - - - - - . . F#5 - B5 - D6 -' },
  { root: 'G1', arp: ['G3', 'B3', 'D4', 'G4'], lead: 'E6 - D6 - B5 - - - G5 - B5 - D6 - E6 -' },
  { root: 'A1', arp: ['A3', 'C#4', 'E4', 'A4'], lead: 'F#6 - E6 - C#6 - - - A5 - C#6 - E6 - - -' },
  { root: 'E1', arp: ['E3', 'G3', 'B3', 'E4'], lead: 'G6 - F#6 - E6 - D6 - E6 - D6 - B5 - G5 -' },
  { root: 'F#1', arp: ['F#3', 'A#3', 'C#4', 'E4'], lead: 'F#5 - - - A#5 - - - C#6 - - - E6 - F#6 -' },
];
const BATTLE_LEAD = BATTLE_BARS.map((b) => bar(b.lead));
/** Up-and-over arp shape through the four chord tones. */
const ARP_SHAPE = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 2, 1];

class SoundBoard {
  private ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private battleBus: GainNode | null = null;
  private pulse: PeriodicWave | null = null;
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

      // The battle theme is busy, so it gets a lighter reverb send (its lead has its own echo).
      this.battleBus = ctx.createGain();
      this.battleBus.gain.value = 0.0001;
      this.battleBus.connect(master);
      const battleSend = ctx.createGain();
      battleSend.gain.value = 0.3;
      this.battleBus.connect(battleSend).connect(this.reverb);

      // A 25% pulse, the classic handheld lead.
      const real = new Float32Array(32), imag = new Float32Array(32);
      for (let n = 1; n < 32; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
      this.pulse = ctx.createPeriodicWave(real, imag);

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
    if (!ctx || this.playing || !this.musicBus || !this.battleBus) return;
    this.playing = this.scene;
    const battle = this.scene === 'battle';
    const bus = battle ? this.battleBus : this.musicBus;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(battle ? 0.6 : 0.5, ctx.currentTime + (battle ? 0.05 : 6));
    if (battle) this.battleScore(ctx, bus);
    else this.ambientScore(ctx, bus);
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

  /** A held synth note at an exact time: quick attack, a sustain that sags a little, short release, late vibrato. */
  private note(
    at: number,
    freq: number,
    len: number,
    opts: { gain: number; type?: OscillatorType | 'pulse'; cutoff?: number; detune?: number; vibrato?: boolean; out: AudioNode },
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    if (opts.type === 'pulse' && this.pulse) osc.setPeriodicWave(this.pulse);
    else osc.type = (opts.type as OscillatorType) ?? 'square';
    osc.frequency.setValueAtTime(freq, at);
    if (opts.detune) osc.detune.value = opts.detune;
    const rel = 0.06;
    if (opts.vibrato && len > 0.35) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.6;
      depth.gain.setValueAtTime(0, at);
      depth.gain.setValueAtTime(0, at + 0.22);
      depth.gain.linearRampToValueAtTime(freq * 0.008, at + len);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + len + rel + 0.05);
    }
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = opts.cutoff ?? 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(opts.gain, at + 0.006);
    g.gain.linearRampToValueAtTime(opts.gain * 0.7, at + len);
    g.gain.linearRampToValueAtTime(0, at + len + rel);
    osc.connect(f).connect(g).connect(opts.out);
    osc.start(at);
    osc.stop(at + len + rel + 0.05);
  }

  /** The lead voice: a pulse with a quiet detuned saw riding on it, for a synthier edge. */
  private lead(at: number, n: number, len: number, out: AudioNode, gain = 0.03) {
    this.note(at, hz(n), len, { gain, type: 'pulse', cutoff: 3400, vibrato: true, out });
    this.note(at, hz(n), len, { gain: gain * 0.35, type: 'sawtooth', cutoff: 2200, detune: 9, vibrato: true, out });
  }

  /** The kit, as short noise and a falling sine. */
  private kick(at: number, bus: GainNode) {
    const ctx = this.ctx!;
    this.voice(120, { dur: 0.28, attack: 0.003, gain: 0.16, to: 38, cutoff: 600, delay: Math.max(0, at - ctx.currentTime), out: bus });
  }
  private snare(at: number, bus: GainNode, gain = 0.045) {
    this.breath({ dur: 0.2, freq: 1900, type: 'bandpass', q: 0.6, gain, attack: 0.003, delay: Math.max(0, at - this.ctx!.currentTime), out: bus });
  }
  private hat(at: number, bus: GainNode, gain = 0.014) {
    this.breath({ dur: 0.06, freq: 7500, type: 'highpass', q: 0.7, gain, attack: 0.002, delay: Math.max(0, at - this.ctx!.currentTime), out: bus });
  }

  /**
   * The battle theme: an entrance fanfare (a chromatic plunge, then stabs that climb into the key), one bar of
   * the band vamping, then a looping 16-bar chase. Bars are scheduled just ahead of the audio clock.
   */
  private battleScore(ctx: AudioContext, bus: GainNode) {
    const step = 60 / BATTLE_BPM / 4;
    const barLen = step * 16;

    // The lead's dotted-eighth echo, darker on each repeat: the "space" around the chiptune.
    const leadBus = ctx.createGain();
    const echo = ctx.createDelay(1);
    echo.delayTime.value = step * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.33;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    leadBus.connect(bus);
    leadBus.connect(echo).connect(tone).connect(feedback).connect(echo);
    tone.connect(wet).connect(bus);
    this.musicNodes = [leadBus, echo, feedback, tone, wet];

    // ---- Entrance --------------------------------------------------------
    const t0 = ctx.currentTime + 0.08;
    // Bar 1: a two-octave chromatic plunge in thirty-seconds, doubled an octave down, under a rising rush.
    for (let i = 0; i < 24; i++) {
      const at = t0 + i * (step / 2);
      this.note(at, hz(90 - i), step / 2, { gain: 0.03, type: 'pulse', cutoff: 4000, out: leadBus });
      this.note(at, hz(78 - i), step / 2, { gain: 0.016, type: 'sawtooth', cutoff: 1800, out: bus });
    }
    this.breath({ dur: barLen * 0.45, freq: 300, to: 5000, type: 'bandpass', q: 1.4, gain: 0.05, attack: barLen * 0.42, delay: t0 + step * 9 - ctx.currentTime, out: bus });
    // Bar 2: Bm hits, then C and F#/C# pushing back home.
    const t1 = t0 + barLen;
    const stab = (step0: number, len: number, notes: string[], bass: string) => {
      const at = t1 + step0 * step;
      notes.forEach((n, i) => {
        this.note(at, hz(midi(n)), len * step, { gain: 0.022, type: 'sawtooth', cutoff: 2600, detune: i % 2 ? 8 : -8, out: bus });
        this.note(at, hz(midi(n)), len * step, { gain: 0.012, type: 'pulse', cutoff: 3000, out: leadBus });
      });
      this.note(at, hz(midi(bass)), len * step, { gain: 0.07, type: 'triangle', cutoff: 900, out: bus });
      this.note(at, hz(midi(bass) + 12), len * step, { gain: 0.03, type: 'sawtooth', cutoff: 600, out: bus });
      this.kick(at, bus);
    };
    const bm = ['B3', 'D4', 'F#4', 'B4'];
    stab(0, 2, bm, 'B1');
    stab(3, 2, bm, 'B1');
    stab(6, 3, bm, 'B1');
    stab(10, 2, ['C4', 'E4', 'G4', 'C5'], 'C2');
    stab(12, 4, ['C#4', 'F#4', 'A#4', 'C#5'], 'C#2');
    this.voice(55, { dur: 1.8, attack: 0.01, gain: 0.18, to: 32, type: 'triangle', cutoff: 320, delay: t1 - ctx.currentTime, out: bus });
    this.breath({ dur: 1.4, freq: 6000, to: 900, type: 'highpass', q: 0.6, gain: 0.04, attack: 0.005, delay: t1 - ctx.currentTime, out: bus });
    [12, 13, 14, 15].forEach((s) => this.snare(t1 + s * step, bus, 0.03 + (s - 12) * 0.008));

    // ---- The chase -------------------------------------------------------
    const playBar = (index: number, at: number, withLead: boolean) => {
      const b = BATTLE_BARS[index];
      const root = midi(b.root);
      const second = index >= 8;
      // Bass: octave-bouncing eighths, the last one of the bar walking up to the next root.
      for (let e = 0; e < 8; e++) {
        const n = e % 2 ? root + 12 : root;
        const s = at + e * 2 * step;
        this.note(s, hz(n + 12), step * 1.7, { gain: 0.07, type: 'triangle', cutoff: 1200, out: bus });
        this.note(s, hz(n + 12), step * 1.4, { gain: 0.022, type: 'sawtooth', cutoff: 700, out: bus });
      }
      // Arp: sixteenths through the chord, quiet and narrow, the second half an octave up.
      ARP_SHAPE.forEach((k, s) => {
        const n = midi(b.arp[k]) + (second ? 12 : 0);
        this.note(at + s * step, hz(n), step * 0.8, { gain: 0.009, type: 'square', cutoff: 2200, out: bus });
      });
      // Kit: kick on the beat (more often in the climb), snare on two and four, offbeat hats.
      [0, 8, ...(second ? [6, 10, 14] : [10])].forEach((s) => this.kick(at + s * step, bus));
      [4, 12].forEach((s) => this.snare(at + s * step, bus));
      for (let s = 2; s < 16; s += 4) this.hat(at + s * step, bus);
      if (second) for (let s = 1; s < 16; s += 2) this.hat(at + s * step, bus, 0.006);
      // A section opens on a slow pad swell; the climb adds a far-off chime for the stars.
      if (index % 8 === 0) {
        b.arp.forEach((n, i) =>
          this.voice(hz(midi(n) + 12), { dur: barLen * 2, attack: barLen * 0.6, gain: 0.012, type: 'sawtooth', cutoff: 900, detune: i % 2 ? 9 : -9, delay: at - ctx.currentTime, out: bus }),
        );
      }
      if (second && index % 2 === 0) this.voice(hz(midi(b.arp[3]) + 24), { dur: 2.4, attack: 0.01, gain: 0.012, vibrato: 3, delay: at + step * 8 - ctx.currentTime, out: leadBus });
      if (withLead) for (const n of BATTLE_LEAD[index]) this.lead(at + n.step * step, n.note, n.len * step * 0.92, leadBus);
    };

    let next = t1 + barLen;
    let index = -1; // the vamp bar before the tune comes in
    const tick = () => {
      if (this.playing !== 'battle') return;
      while (next < ctx.currentTime + 0.4) {
        playBar(Math.max(0, index), next, index >= 0);
        next += barLen;
        index = (index + 1) % BATTLE_BARS.length;
      }
    };
    tick();
    this.musicTimers.push(window.setInterval(tick, 100));
  }

  /** Fade the score out (or cut it at once, when the app is being hidden). */
  stopMusic(immediate = false) {
    if (!this.playing || !this.ctx || !this.musicBus || !this.battleBus) return;
    const bus = this.playing === 'battle' ? this.battleBus : this.musicBus;
    this.playing = null;
    // Ids from setTimeout and setInterval share one pool, so clearTimeout ends either.
    this.musicTimers.forEach((t) => window.clearTimeout(t));
    this.musicTimers = [];
    const now = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), now);
    if (immediate) bus.gain.setValueAtTime(0.0001, now);
    else bus.gain.exponentialRampToValueAtTime(0.0001, now + 2);
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
