import { markDirty } from './account';
import heatFire from '../assets/sfx/heat-fire.mp3?inline';
import sunHit from '../assets/sfx/sun-hit.mp3?inline';
import cardHit from '../assets/sfx/card-hit.mp3?inline';
/**
 * Atmospheric audio, synthesised with Web Audio (no asset files yet).
 *
 * Every effect uses soft waveforms, slow attacks and a long shared "space"
 * reverb, so actions swell and bloom rather than click. Three scores play
 * underneath: on the menus, the voyage, a slow journey through a dying
 * universe (a lament over a breathing drone, with a sparse, high, bell-like
 * melody); on the campaign map, a generative ambient score (drone, slowly
 * shifting pad chords and distant chimes); and in matches, a tenser sibling
 * of it (the same pads and hall, with a slow, steady arpeggio and a deep
 * bass). Each effect is one method, so recorded audio can replace any of
 * them later without touching the rest of the game.
 */

const PREFS_KEY = 'blue-loop:sound';

/**
 * Recorded effects (made from sfx-raw/ by `npm run sfx`), built into the code as data (so they load in the desktop
 * app too, where the game runs from file:// and can't fetch files), decoded as soon as audio starts so none plays
 * late.
 */
const SFX = { heatFire, sunHit, cardHit };

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
/** Where the score had got to when the app was hidden (or the page left), kept for the tab's session. */
/** Where the score was left (no longer kept: cleared on loading). */
const MUSIC_AT_KEY = 'blue-loop:music-at';

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

/** The scores: the ambient drone (the campaign map), the battle theme (matches), and the voyage (the menus). */
export type MusicScene = 'ambient' | 'battle' | 'voyage';

// ---- Battle theme -----------------------------------------------------------
// The menu score's sibling, in the same key and voices, made tense: a soft,
// plucked arpeggio ticks steadily in eighths through a filter that opens and
// closes over the better part of a minute, over the same long pads and a deep
// held bass. Four chords, twelve seconds each, the last leaning hard on E
// major so it always wants to come back round.

const BATTLE_BPM = 80;
const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
/** A note name as a MIDI number, and a MIDI number as a frequency. */
const midiOf = (name: string) => {
  const m = /^([A-G]#?)(-?\d)$/.exec(name)!;
  return (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
};
const hzOf = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const hz = (name: string) => hzOf(midiOf(name));

/** Per chord (four bars each): the held bass, the pad, and the arpeggio's eight eighths per bar (two halves for the turn). */
const BATTLE_CHORDS: { bass: string; pad: string[]; arp: string[][] }[] = [
  { bass: 'A1', pad: ['A3', 'E4', 'B4', 'C5'], arp: [['A3', 'E4', 'A4', 'B4', 'C5', 'B4', 'A4', 'E4']] }, // Am(add9)
  { bass: 'F1', pad: ['F3', 'C4', 'E4', 'A4'], arp: [['F3', 'C4', 'E4', 'A4', 'C5', 'A4', 'E4', 'C4']] }, // Fmaj7
  { bass: 'D2', pad: ['D3', 'A3', 'E4', 'F4'], arp: [['D3', 'A3', 'C4', 'E4', 'F4', 'E4', 'C4', 'A3']] }, // Dm9
  {
    bass: 'E1',
    pad: ['E3', 'B3', 'D4', 'A4'],
    arp: [
      ['E3', 'B3', 'D4', 'A4', 'B4', 'A4', 'D4', 'B3'], // Esus4...
      ['E3', 'B3', 'D4', 'G#4', 'B4', 'G#4', 'D4', 'B3'], // ...resolving to E7
    ],
  },
];

// ---- The voyage (the menus) -------------------------------------------------
// A voyage through a dying universe, in the same key and hall as the ambient
// and battle scores. The ambient score's breathing drone holds A while a lament
// falls over it (Am, G6, Fmaj7, Em7, ten seconds each, round and round). High
// above, a sparse melody of bell-like plucks layered with a sustained, slightly distorted
// synth (a dotted-quarter echo filling the gaps) sings short phrases, rolling a
// quick chord into its height once a time round and breaking into long,
// climbing runs of eighths over swelling synths; one set of phrases answered by
// another the next time round. Once the haze is in, a beacon sounds at the top
// of every chord: one high, heavily wavering note washed in delay and reverb.
// Beneath, a soft low-high rock on each chord's root and fifth; the pads stay
// low.

/** An eighth note of the six-eight bar, in seconds (a dotted quarter at about 48 bpm). */
const CAMPAIGN_EIGHTH = 0.42;
/** The haze's level (the distorted synth that holds long chords in the second half of the form). */
const CAMPAIGN_HAZE = 0.004;
/** The level of the melody's synth (sustained, slightly distorted saws). */
const CAMPAIGN_LEAD = 0.012;
/** The level of the beacon, the wavering high note at the top of every chord. */
const CAMPAIGN_BEACON = 0.02;
/** The gap between the notes of a rolled chord at the melody's height, in seconds. */
const CAMPAIGN_ROLL = 0.045;
/**
 * Per chord (four bars of six eighths): the falling bass, the pad, the two notes it rocks between, the haze's
 * chord (kept off the rock's notes, so the rock is never covered), the crescendo's swelling chord (likewise), and
 * the beacon's note.
 */
const CAMPAIGN_CHORDS: { bass: string; pad: string[]; rock: [string, string]; haze: string[]; swell: string[]; beacon: string }[] = [
  { bass: 'A2', pad: ['A3', 'C4', 'E4', 'B4'], rock: ['A3', 'E4'], haze: ['C4', 'A4', 'B4'], swell: [], beacon: 'E6' }, // Am(add9)
  { bass: 'G2', pad: ['G3', 'B3', 'D4', 'E4'], rock: ['G3', 'D4'], haze: ['B3', 'E4', 'G4'], swell: [], beacon: 'D6' }, // G6
  { bass: 'F2', pad: ['F3', 'A3', 'C4', 'E4'], rock: ['F3', 'C4'], haze: ['A3', 'E4', 'F4'], swell: ['A3', 'E4', 'A4', 'C5'], beacon: 'C6' }, // Fmaj7
  { bass: 'E2', pad: ['E3', 'G3', 'B3', 'D4'], rock: ['E3', 'B3'], haze: ['G3', 'D4', 'E4'], swell: ['G3', 'D4', 'G4', 'B4'], beacon: 'B5' }, // Em7
];
/**
 * The melody's phrases, per chord, as [eighth (0-23 across the chord's four bars), note]: a call, and the answer
 * played the next time round.
 */
const CAMPAIGN_PHRASES: [number, string][][][] = [
  [
    [[0, 'E6'], [3, 'D6'], [6, 'C6'], [21, 'B5']],
    [[6, 'D6'], [9, 'B5'], [18, 'A5']],
    [[0, 'C6'], [3, 'E6'], [6, 'A6'], [15, 'G6']],
    [[0, 'G6'], [9, 'F#6'], [12, 'E6'], [18, 'B5']],
  ],
  [
    [[0, 'C6'], [6, 'E6'], [9, 'D6'], [12, 'C6']],
    [[6, 'B5'], [12, 'D6'], [18, 'G6']],
    [[0, 'A6'], [3, 'G6'], [6, 'E6'], [12, 'C6']],
    [[0, 'B5'], [6, 'G6'], [12, 'F#6'], [18, 'E6']],
  ],
];

class SoundBoard {
  private ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  /** Sounds kept out of the reverb: paper on paper is close and dry (in the hall, a sweep across the hand swelled into a roar). */
  private sfxDry: GainNode | null = null;
  private lastHandLift = -Infinity;
  private musicBus: GainNode | null = null;
  /** The battle theme's two faders: one lightly reverbed (bass, kick), one drenched like the ambient score. */
  private battleBus: GainNode | null = null;
  private battleLush: GainNode | null = null;
  /** The campaign map's fader (its own, so a crossfade from a battle never cuts the battle's tails short). */
  private campaignBus: GainNode | null = null;
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
    // (The score's place was once kept between pages; it starts from the top now, and an old note of it goes.)
    try {
      sessionStorage.removeItem(MUSIC_AT_KEY);
    } catch {
      // ignore
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
      this.sfxDry = ctx.createGain();
      this.sfxDry.gain.value = 0.9;
      this.sfxDry.connect(master);

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
      this.campaignBus = ctx.createGain();
      this.campaignBus.gain.value = 0.0001;
      this.campaignBus.connect(master);
      this.campaignBus.connect(this.reverb);

      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    for (const url of Object.values(SFX)) this.load(url);
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
  /**
   * An encounter: the flagship lands at a guarded star. A dive-bombing synth in the battle theme's own voice: its
   * soft triangle-and-saw pluck, through the arpeggio's resonant filter and dotted-eighth echo, diving down
   * from A4 to A1 as the filter closes, with low air rushing past. (The battle screen itself opens in silence.)
   */
  encounter() {
    const ctx = this.ready();
    if (!ctx || !this.sfx) return;
    const t = ctx.currentTime;
    const eighth = 60 / BATTLE_BPM / 2;
    const fall = 0.9;
    // The battle arpeggio's filter (resonant, lowpass), closing as the synth falls, and its echo into the hall.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 5;
    filter.frequency.setValueAtTime(2200, t);
    filter.frequency.exponentialRampToValueAtTime(260, t + fall);
    // (Opening again to the arpeggio's own as it lands.)
    filter.frequency.exponentialRampToValueAtTime(1400, t + fall + 0.15);
    const echo = ctx.createDelay(2);
    echo.delayTime.value = eighth * 1.5;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 1800;
    filter.connect(this.sfx);
    filter.connect(echo).connect(echoTone).connect(feedback).connect(echo);
    echoTone.connect(this.reverb ?? this.sfx);
    // (Let go once the echo has died away.)
    window.setTimeout(() => { feedback.gain.value = 0; filter.disconnect(); echoTone.disconnect(); }, 6000);
    // The dive: the pluck's triangle and saw, a detuned pair of each, from A4 down to A1, with a slight warble.
    for (const d of [-8, 8]) {
      this.voice(hz('A4'), { dur: fall + 0.1, attack: 0.02, gain: 0.07, to: hz('A1'), type: 'triangle', cutoff: 3000, detune: d, vibrato: 4, out: filter });
      this.voice(hz('A4'), { dur: fall + 0.1, attack: 0.02, gain: 0.022, to: hz('A1'), type: 'sawtooth', cutoff: 3000, detune: d * 1.5, vibrato: 4, out: filter });
    }
    // Air rushing past, low.
    this.breath({ dur: fall, freq: 900, to: 160, type: 'bandpass', q: 1.1, gain: 0.05, attack: 0.3 });
  }
  /**
   * A heat wave from the Stellari: a rising roar as it flushes red, then a deep whump as the ring goes out and
   * a long rushing wash as it crosses the board.
   */
  heatWave() {
    this.breath({ dur: 0.35, freq: 300, to: 1600, type: 'bandpass', q: 1.2, gain: 0.07, attack: 0.25 });
    this.voice(73.42, { dur: 1.4, attack: 0.02, gain: 0.16, to: 41.2, type: 'triangle', cutoff: 380, delay: 0.2 });
    this.breath({ dur: 1.3, freq: 2400, to: 260, type: 'bandpass', q: 0.9, gain: 0.12, attack: 0.12, delay: 0.2 });
    this.breath({ dur: 1.0, freq: 140, to: 70, type: 'lowpass', q: 1, gain: 0.14, attack: 0.05, delay: 0.2 });
  }
  /**
   * The universe giving way a column further: an earthquake. A deep rumble swelling and rolling in waves (low noise
   * and a sub-bass that wanders), rock grinding and cracking through it, and a last heavy thud as the ground falls.
   */
  earthquake() {
    const dur = 3.2;
    this.breath({ dur, freq: 110, to: 55, type: 'lowpass', q: 0.9, gain: 0.32, attack: 0.5 });
    this.voice(38, { dur, attack: 0.4, gain: 0.26, to: 31, type: 'sine', vibrato: 8 });
    this.voice(52, { dur: dur - 0.4, attack: 0.6, gain: 0.12, to: 41, type: 'triangle', cutoff: 160, detune: 12 });
    // Rolling waves through the rumble.
    for (const [d, g] of [[0.2, 0.18], [0.9, 0.24], [1.6, 0.2], [2.2, 0.14]] as const) this.breath({ dur: 0.9, freq: 160, to: 70, type: 'lowpass', q: 1.2, gain: g, attack: 0.25, delay: d });
    // Grinding rock and cracks.
    for (let i = 0; i < 7; i++) {
      const d = 0.3 + Math.random() * 2.2;
      this.breath({ dur: 0.18 + Math.random() * 0.25, freq: 500 + Math.random() * 900, type: 'bandpass', q: 2.5, gain: 0.05 + Math.random() * 0.05, attack: 0.01, delay: d });
    }
    // The fall.
    this.voice(70, { dur: 1.4, attack: 0.004, gain: 0.3, to: 28, type: 'sine', delay: 1.9 });
    this.breath({ dur: 0.8, freq: 700, to: 60, type: 'lowpass', q: 0.8, gain: 0.25, attack: 0.004, delay: 1.9 });
  }
  /** A star under the pointer: a soft glassy chime, each star its own note of a pentatonic scale. */
  starHover(seed: number) {
    const now = performance.now();
    if (now - this.lastHover < 60) return;
    this.lastHover = now;
    const scale = [0, 2, 4, 7, 9, 12, 14];
    const f = 659.25 * 2 ** (scale[Math.floor(Math.abs(seed) * 997) % scale.length] / 12);
    this.voice(f, { dur: 0.9, attack: 0.006, gain: 0.03, cutoff: 5000 });
    this.voice(f * 2, { dur: 0.5, attack: 0.004, gain: 0.012, cutoff: 7000, detune: 6 });
    this.voice(f * 1.5, { dur: 1.2, attack: 0.06, gain: 0.008, cutoff: 3000, delay: 0.04 });
  }
  /** A card or deck under the pointer: the dry rustle of paper (a few tiny bright crackles over a soft brush). */
  rustle() {
    const now = performance.now();
    if (now - this.lastRustle < 70) return;
    this.lastRustle = now;
    this.breath({ dur: 0.16, freq: 2400, to: 3600, q: 0.7, gain: 0.022, attack: 0.03, type: 'bandpass', out: this.sfxDry ?? undefined });
    for (let i = 0; i < 3; i++)
      this.breath({ dur: 0.035 + Math.random() * 0.03, freq: 4200 + Math.random() * 2600, q: 1.6, gain: 0.014 + Math.random() * 0.01, attack: 0.004, delay: 0.015 + i * 0.03 + Math.random() * 0.02, type: 'bandpass', out: this.sfxDry ?? undefined });
  }
  /** The hand lifted to be read: a fan of cards sliding against each other (a longer brush, a spill of crackles). */
  handLift() {
    // (The hand can lift twice in a breath, as the pointer grazes its edge or a card is dragged straight out: once.)
    if (performance.now() - this.lastHandLift < 900) return;
    this.lastHandLift = performance.now();
    this.lastRustle = performance.now();
    this.breath({ dur: 0.34, freq: 1800, to: 3800, q: 0.6, gain: 0.03, attack: 0.06, type: 'bandpass', out: this.sfxDry ?? undefined });
    for (let i = 0; i < 7; i++)
      this.breath({ dur: 0.03 + Math.random() * 0.04, freq: 3600 + Math.random() * 3200, q: 1.5, gain: 0.012 + Math.random() * 0.012, attack: 0.004, delay: 0.02 + i * 0.035 + Math.random() * 0.02, type: 'bandpass', out: this.sfxDry ?? undefined });
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
  /**
   * A card coming in (put into play, or arriving on the stage): a short, bell-like chord, the dawn banner's
   * (root, fifth and octave on soft sines) a fifth higher, struck rather than swelled, ringing out over a second
   * or so; a quiet octave above each note gives it its ring.
   */
  play() {
    [329.63, 493.88, 659.25].forEach((f, i) => {
      this.voice(f, { dur: 1.3, attack: 0.015, gain: 0.036 - i * 0.004, cutoff: 2400, delay: i * 0.025 });
      this.voice(f * 2, { dur: 0.6, attack: 0.01, gain: 0.004, delay: i * 0.025 });
    });
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
  /** Heat fired at a rival or a card: the recorded laser, slowed a little (the strike, as it lands, is the blow). */
  launch() {
    this.clip(SFX.heatFire, 0.55);
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
  /** Heat landing on a sun from no rival (its own, or a blow it shrugged off): the flame, a touch softer. Cold: a chime. */
  impact(hot: boolean) {
    if (hot) this.sunHit(1, 0.4);
    else {
      this.bell(1174.66, 0, 0.03);
    }
  }
  /**
   * A sun hit by heat: the recorded flame swoosh. Bigger hits land louder, and a little slower and deeper (as
   * set by the heat that landed, never by chance).
   */
  private sunHit(amount: number, level: number) {
    const a = Math.max(1, amount);
    this.clip(SFX.sunHit, level * Math.min(1.5, 0.85 + 0.12 * (a - 1)), 1 - Math.min(0.14, 0.035 * (a - 1)));
  }
  /** Your sun takes enemy heat. */
  hurt(amount = 1) {
    this.sunHit(amount, 0.55);
  }
  /** You land heat on a rival's sun. */
  strike(amount = 1) {
    this.sunHit(amount, 0.5);
  }
  /** Shields take a hit: a glassy clang. */
  block() {
    this.voice(880, { dur: 0.7, attack: 0.003, gain: 0.05, type: 'triangle', cutoff: 5000 });
    this.voice(1244.5, { dur: 0.9, attack: 0.003, gain: 0.03, cutoff: 5000, detune: 7 });
    this.breath({ dur: 0.25, freq: 4200, to: 2500, type: 'bandpass', q: 2, gain: 0.06, attack: 0.003 });
  }
  /** A card lunging to attack: a quick rising swoosh as it leaves the table. */
  swing() {
    this.breath({ dur: 0.32, freq: 700, to: 3400, type: 'bandpass', q: 1.4, gain: 0.11, attack: 0.2, out: this.sfxDry ?? undefined });
    this.breath({ dur: 0.26, freq: 2400, to: 6000, type: 'highpass', q: 0.7, gain: 0.035, attack: 0.18, delay: 0.04, out: this.sfxDry ?? undefined });
  }
  /**
   * A blow landing on a card: a crash. A deep falling thump and a low burst of crunching noise, a scatter of debris,
   * and the recorded whip crack, slowed right down, riding on top. Bigger blows land louder and a little deeper (as
   * set by what the blow took, never by chance).
   */
  clash(amount = 1) {
    const a = Math.max(1, amount);
    const g = Math.min(1.5, 0.85 + 0.12 * (a - 1));
    const deeper = 1 - Math.min(0.14, 0.035 * (a - 1));
    this.voice(92 * deeper, { dur: 0.7, attack: 0.004, gain: 0.16 * g, to: 38, type: 'triangle', cutoff: 420 });
    this.breath({ dur: 0.55, freq: 1300, to: 180, type: 'lowpass', q: 0.9, gain: 0.16 * g, attack: 0.004 });
    this.breath({ dur: 0.3, freq: 700, to: 300, type: 'bandpass', q: 1.2, gain: 0.08 * g, attack: 0.003 });
    [0.03, 0.07, 0.12, 0.19].forEach((d, i) =>
      this.breath({ dur: 0.05, freq: [1900, 1400, 2300, 1100][i], q: 2.2, gain: 0.035 * g, attack: 0.002, delay: d, type: 'bandpass' }),
    );
    this.clip(SFX.cardHit, 0.32 * g, 0.75 * deeper);
  }
  /** A card's defence cracking: a brittle snap with splintering ticks after it. */
  crack() {
    this.breath({ dur: 0.07, freq: 3200, type: 'highpass', q: 0.8, gain: 0.16, attack: 0.002, out: this.sfxDry ?? undefined });
    this.voice(1480, { dur: 0.12, attack: 0.002, gain: 0.04, to: 620, type: 'square', cutoff: 3600 });
    for (let i = 0; i < 4; i++)
      this.breath({ dur: 0.03 + Math.random() * 0.03, freq: 2600 + Math.random() * 3000, q: 2, gain: 0.05 + Math.random() * 0.03, attack: 0.002, delay: 0.05 + i * 0.04 + Math.random() * 0.02, type: 'bandpass', out: this.sfxDry ?? undefined });
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
  /**
   * A point placed on a skill: something powering up, a single note in the scores' own voices (a soft triangle with
   * a faint detuned saw over it, a sine an octave up), swelling in and lifting a touch as it settles. Each point
   * already in the skill takes it a step up A minor pentatonic (the scores' key), from A2.
   */
  charge(step: number) {
    const steps = [0, 3, 5, 7, 10, 12, 15];
    const f = 110 * 2 ** (steps[Math.min(step, steps.length - 1)] / 12);
    this.voice(f, { dur: 1.1, attack: 0.22, gain: 0.07, type: 'triangle', to: f * 1.012, cutoff: 1600 });
    this.voice(f, { dur: 1.0, attack: 0.26, gain: 0.012, type: 'sawtooth', to: f * 1.012, cutoff: 1400, detune: 7 });
    this.voice(f * 2, { dur: 0.9, attack: 0.3, gain: 0.02, type: 'sine', to: f * 2.024 });
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
  /** A card that can't be played: two short, low, muffled knocks (a door that won't open). */
  blocked() {
    this.voice(155.56, { dur: 0.16, attack: 0.004, gain: 0.09, to: 120, type: 'triangle', cutoff: 700 });
    this.voice(130.81, { dur: 0.2, attack: 0.004, gain: 0.08, to: 98, type: 'triangle', cutoff: 600, delay: 0.11 });
    this.breath({ dur: 0.08, freq: 420, q: 1.4, gain: 0.03, attack: 0.003, type: 'bandpass' });
  }
  error() {
    this.voice(146.83, { dur: 0.6, attack: 0.04, gain: 0.05, to: 130, cutoff: 500 });
  }

  /** Decoded recordings, by URL (each is fetched once). */
  private clips = new Map<string, Promise<AudioBuffer | null>>();

  /** Decode a recording once (kept for every later play). A data URL is decoded in place; anything else fetched. */
  private load(url: string): Promise<AudioBuffer | null> {
    let buf = this.clips.get(url);
    if (!buf) {
      const ctx = this.ctx!;
      const bytes = url.startsWith('data:')
        ? Promise.resolve(Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer)
        : fetch(url).then((r) => r.arrayBuffer());
      buf = bytes.then((data) => ctx.decodeAudioData(data)).catch(() => null);
      this.clips.set(url, buf);
    }
    return buf;
  }

  /** Play a recording (a voice line, a recorded effect) through the effects mix, so it sits in the same hall. */
  clip(url: string, gain = 0.85, rate = 1) {
    const ctx = this.ready();
    if (!ctx) return;
    void this.load(url).then((b) => {
      if (!b || !this.ready()) return;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.sfx!);
      src.start();
    });
  }

  // ---- Score ---------------------------------------------------------------

  /** The screen asks for a score: crossfade to it if music is playing. */
  setScene(scene: MusicScene) {
    if (scene === this.scene) return;
    this.scene = scene;
    if (this.playing) {
      this.stopMusic();
      this.startMusic();
    }
  }

  /** Each score's faders, with the level and fade-in time it plays at. */
  private faders(scene: MusicScene): [GainNode, number, number][] {
    if (scene === 'battle') return [[this.battleBus!, 1.2, 3], [this.battleLush!, 1.2, 3]];
    if (scene === 'voyage') return [[this.campaignBus!, 0.6, 0.05]];
    return [[this.musicBus!, 0.5, 6]];
  }

  startMusic() {
    const ctx = this.ready();
    if (!ctx || this.playing || !this.musicBus) return;
    this.playing = this.scene;
    const now = ctx.currentTime;
    for (const [bus, level, fade] of this.faders(this.scene)) {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), now);
      bus.gain.exponentialRampToValueAtTime(level, now + fade);
    }
    if (this.scene === 'battle') this.battleScore(ctx, this.battleBus!, this.battleLush!);
    else if (this.scene === 'voyage') this.campaignScore(ctx, this.campaignBus!);
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
   * The battle theme. Pads and bass for two bars and a beat, so a match settles in; then the arpeggio joins and
   * the four chords cycle, the arpeggio resting for a chord every third time round. Chords are scheduled just
   * ahead of the audio clock.
   */
  private battleScore(ctx: AudioContext, bus: GainNode, lush: GainNode) {
    const eighth = 60 / BATTLE_BPM / 2;
    const barLen = eighth * 8;
    const chordLen = barLen * 4;

    // The arpeggio's filter breathes over about 45 seconds; its dotted-eighth echo goes into the hall.
    const arpFilter = ctx.createBiquadFilter();
    arpFilter.type = 'lowpass';
    arpFilter.Q.value = 2.5;
    arpFilter.frequency.value = 1100;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 1 / 45;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 650;
    sweep.connect(sweepDepth).connect(arpFilter.frequency);
    const echo = ctx.createDelay(2);
    echo.delayTime.value = eighth * 1.5;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 1800;
    const echoWet = ctx.createGain();
    echoWet.gain.value = 0.35;
    arpFilter.connect(bus);
    arpFilter.connect(echo).connect(echoTone).connect(feedback).connect(echo);
    echoTone.connect(echoWet).connect(lush);
    sweep.start();
    this.musicNodes = [arpFilter, sweep, sweepDepth, echo, feedback, echoTone, echoWet];

    const playChord = (at: number, index: number, round: number) => {
      const c = BATTLE_CHORDS[index];
      const delay = this.until(at);
      // Pads, exactly as the menu score voices them: slow detuned triangle pairs, overlapping the next chord.
      c.pad.forEach((n, i) => {
        const opts = { dur: chordLen + 4, attack: 3 + i * 0.5, gain: 0.02, type: 'triangle' as OscillatorType, cutoff: 900, delay, out: lush };
        this.voice(hz(n), opts);
        this.voice(hz(n), { ...opts, detune: 9, gain: 0.013 });
      });
      // The bass: a deep held note, a triangle and a sine an octave apart.
      this.note(at, hz(c.bass), chordLen - 0.5, { gain: 0.05, type: 'triangle', attack: 1.2, release: 1.5, cutoff: 260, out: bus });
      this.note(at, hz(c.bass) * 2, chordLen - 0.5, { gain: 0.018, type: 'sine', attack: 2, release: 1.5, out: bus });
      // The arpeggio: soft plucks, a triangle with a quiet saw for edge, accented on the beat.
      // It rests for the first chord every third time round; at the very start it joins on the second beat of the
      // third bar, a bar or so after the opening swell has arrived (picking the pattern up in place).
      if (round % 3 === 2 && index === 0) return;
      const opening = round === 0 && index === 0;
      for (let b = opening ? 2 : 0; b < 4; b++) {
        const notes = c.arp[c.arp.length > 1 && b >= 2 ? 1 : 0];
        notes.forEach((n, e) => {
          if (opening && b === 2 && e < 2) return;
          const d = this.until(at + b * barLen + e * eighth);
          const accent = e % 2 === 0 ? 1 : 0.7;
          this.voice(hz(n), { dur: eighth * 2.4, attack: 0.012, gain: 0.04 * accent, type: 'triangle', cutoff: 5000, delay: d, out: arpFilter });
          this.voice(hz(n), { dur: eighth * 1.6, attack: 0.012, gain: 0.008 * accent, type: 'sawtooth', cutoff: 5000, detune: 6, delay: d, out: arpFilter });
        });
      }
    };

    let next = ctx.currentTime + 0.1;
    let chord = 0, round = 0;
    const tick = () => {
      if (this.playing !== 'battle') return;
      while (next < ctx.currentTime + 0.5) {
        playChord(next, chord, round);
        next += chordLen;
        chord = (chord + 1) % BATTLE_CHORDS.length;
        if (chord === 0) round++;
      }
    };
    tick();
    this.musicTimers.push(window.setInterval(tick, 200));
  }

  /**
   * Part of the campaign score's crescendo, which runs six bars from the start of the Fmaj7 to halfway through the
   * Em7 (`from` is the bar of those six this part starts on, `bars` how many it covers). The melody runs in steady
   * eighths, three to each note of the rock, slowly climbing the chord and growing louder, over a chord of detuned
   * saws whose filter opens as it swells into the peak (and, given `hold`, holds there to the climax).
   */
  private crescendo(
    at: number,
    barLen: number,
    tones: Set<number>,
    chord: string[],
    from: number,
    bars: number,
    bus: GainNode,
    bell: (t: number, f: number, gain: number, dur?: number) => void,
    hold = 0,
    turning = false,
    follow?: (t: number, f: number) => void,
  ) {
    const ctx = this.ctx!;
    const total = 6;
    const end = at + bars * barLen;
    const ladder: number[] = [];
    for (let n = midiOf('E5'); n <= midiOf('E7'); n++) if (tones.has(n % 12)) ladder.push(n);
    // Start where the climb has got to: the ladder's position by bar, in either chord.
    const startAt = midiOf('E5') + from * 2.5;
    const base = Math.max(0, ladder.findIndex((n) => n >= startAt));
    for (let b = 0; b < bars; b++) {
      const bar = from + b;
      const gap = CAMPAIGN_EIGHTH;
      // Five notes of the chord, climbing as the bars go by. Every bar runs up them (1 2 3 4 5 4); when `turning`
      // (the second crescendo of the form), every bar after the first turns back first (3 2 1 4 5 4).
      const lo = Math.min(ladder.length - 5, base + Math.floor(b * 0.75));
      const five = ladder.slice(lo, lo + 5);
      const order = turning && bar > 0 ? [2, 1, 0, 3, 4, 3] : [0, 1, 2, 3, 4, 3];
      order.forEach((k, e) => {
        const t = at + b * barLen + e * gap;
        const progress = (bar + e / 6) / total;
        bell(t, hzOf(five[k]), 0.016 + 0.022 * progress, CAMPAIGN_EIGHTH * 0.95);
        follow?.(t, hzOf(five[k] - 24));
      });
    }
    // The supporting chord: detuned saws through a lowpass that opens, swelling across the whole crescendo.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.5;
    const level = (bar: number) => 0.15 + 0.85 * (bar / total);
    const cutoff = (bar: number) => 400 * Math.pow(7, bar / total);
    filter.frequency.setValueAtTime(cutoff(from), at);
    filter.frequency.exponentialRampToValueAtTime(cutoff(from + bars), end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level(from), at + (from === 0 ? barLen : 0.4));
    g.gain.linearRampToValueAtTime(level(from + bars), end);
    // At the peak it holds (for `hold` seconds, through the arpeggio's tail) until the climax, then lets go.
    g.gain.setValueAtTime(level(from + bars), end + hold);
    g.gain.linearRampToValueAtTime(0, end + hold + (from + bars === total ? 1.6 : 0.4));
    filter.connect(g).connect(bus);
    for (const n of chord)
      for (const detune of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n);
        o.detune.value = detune;
        const lv = ctx.createGain();
        lv.gain.value = 0.008;
        o.connect(lv).connect(filter);
        o.start(at);
        o.stop(end + hold + 2);
      }
  }

  /** After the crescendo's peak, the arpeggio carries on for two more bars in eighths, drifting down and easing off. */
  private afterglow(
    at: number,
    barLen: number,
    tones: Set<number>,
    bell: (t: number, f: number, gain: number, dur?: number) => void,
    follow?: (t: number, f: number) => void,
  ) {
    const ladder: number[] = [];
    for (let n = midiOf('E5'); n <= midiOf('E7'); n++) if (tones.has(n % 12)) ladder.push(n);
    const len = barLen * 2;
    for (let b = 0; b < 2; b++) {
      const lo = Math.max(0, ladder.length - 5 - b);
      const window = [...ladder.slice(lo, lo + 5), ...ladder.slice(lo + 1, lo + 4).reverse()];
      let k = 0;
      for (let t = at + b * barLen; t < at + (b + 1) * barLen - 0.01; t += CAMPAIGN_EIGHTH, k++) {
        bell(t, hzOf(window[k % window.length]), 0.038 - 0.02 * ((t - at) / len), CAMPAIGN_EIGHTH * 0.95);
        follow?.(t, hzOf(window[k % window.length] - 24));
      }
    }
  }

  /**
   * One chord of the campaign score's haze: per note, a pair of saws barely detuned, driven hard into its
   * own distortion (so the grit is clear without the chord turning to mush), then a brighter lowpass, swelling in,
   * holding for the whole chord, and fading over the next (more slowly when it first enters).
   */
  private haze(at: number, len: number, chord: string[], curve: Float32Array<ArrayBuffer>, entering: boolean, bus: GainNode) {
    const ctx = this.ctx!;
    const end = at + len;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 140;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.frequency.value = 1400;
    const g = ctx.createGain();
    const attack = entering ? 4 : 1.5;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(CAMPAIGN_HAZE, at + attack);
    g.gain.setValueAtTime(CAMPAIGN_HAZE, end);
    g.gain.linearRampToValueAtTime(0, end + 2.5);
    highpass.connect(filter).connect(g).connect(bus);
    for (const n of chord) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = curve;
      shaper.oversample = '4x';
      shaper.connect(highpass);
      for (const detune of [-1.5, 1.5]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n);
        o.detune.value = detune;
        const lv = ctx.createGain();
        lv.gain.value = 0.3;
        o.connect(lv).connect(shaper);
        o.start(at);
        o.stop(end + 2.6);
      }
    }
  }

  /**
   * The campaign map's score, in a form four times round the chords long (see playChord below). Scheduled a chord
   * at a time, just ahead of the audio clock.
   */
  private campaignScore(ctx: AudioContext, bus: GainNode) {
    const eighth = CAMPAIGN_EIGHTH;
    const barLen = eighth * 6;
    const chordLen = barLen * 4;
    // A breath before the first note, so the rock's opening note lands whole.
    const t0 = ctx.currentTime + 0.3;
    // Everything but the rock goes through this, which dips gently on every rock note and recovers: a sidechain,
    // so the whole score seems to breathe with the bass.
    const mix = ctx.createGain();
    mix.connect(bus);

    // The drone, as in the menus: detuned triangles on A through a slowly breathing lowpass, held under every chord.
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 240;
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.03;
    lfoDepth.gain.value = 110;
    lfo.connect(lfoDepth).connect(droneFilter.frequency);
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0, t0);
    droneGain.gain.linearRampToValueAtTime(0.06, t0 + 4);
    droneFilter.connect(droneGain).connect(mix);
    const drones = [55, 82.41, 110].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = [-6, 5, 2][i];
      o.connect(droneFilter);
      o.start(t0);
      return o;
    });
    lfo.start(t0);

    // The melody's filter stays bright (it breathes a little over a minute); its echo lands a dotted quarter
    // later, darker.
    const orbit = ctx.createBiquadFilter();
    orbit.type = 'lowpass';
    orbit.Q.value = 1.5;
    orbit.frequency.value = 1900;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 1 / 60;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 450;
    sweep.connect(sweepDepth).connect(orbit.frequency);
    const echo = ctx.createDelay(2);
    echo.delayTime.value = eighth * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 1500;
    const echoWet = ctx.createGain();
    echoWet.gain.value = 0.35;
    // A gentle lowpass ahead of it all, taking a little more of the melody's top end off.
    const melody = ctx.createBiquadFilter();
    melody.type = 'lowpass';
    melody.Q.value = 0.5;
    melody.frequency.value = 4000;
    melody.connect(orbit);
    orbit.connect(mix);
    orbit.connect(echo).connect(echoTone).connect(feedback).connect(echo);
    echoTone.connect(echoWet).connect(mix);
    sweep.start(t0);
    this.musicNodes = [mix, droneFilter, lfo, lfoDepth, droneGain, ...drones, melody, orbit, sweep, sweepDepth, echo, feedback, echoTone, echoWet];

    // The haze's distortion: a hard-driven tanh curve, clearly audible.
    const curve = new Float32Array(new ArrayBuffer(1024 * 4));
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(9 * ((i / (curve.length - 1)) * 2 - 1)) / Math.tanh(9);
    // And a milder one for the melody's synth.
    const mild = new Float32Array(new ArrayBuffer(1024 * 4));
    for (let i = 0; i < mild.length; i++) mild[i] = Math.tanh(3 * ((i / (mild.length - 1)) * 2 - 1)) / Math.tanh(3);
    /**
     * The melody's voice: the bell-like pluck, layered with a held, slightly distorted pair of saws, both into the
     * melody's filter and echo. `gain` is relative (0.03 is a full note), `len` how long the saws hold.
     */
    // Before the haze comes in the melody's synth only holds briefly (it stays plucky, with a quiet sine an octave
    // down for a little more body); with the haze, in full.
    let held = false;
    const lead = (t: number, f: number, gain: number, len = eighth * 5) => {
      if (!held) {
        len = Math.min(len, eighth * 1.6);
        this.note(t, f / 2, len, { gain: gain * 0.22, type: 'sine', attack: 0.01, release: 0.5, out: melody });
      }
      // The original voice underneath: a bell-like pluck (a triangle with a little saw), ringing into the echo.
      const d = this.until(t);
      const pluck = Math.max(eighth * 2.4, Math.min(len, eighth * 5));
      this.voice(f, { dur: pluck, attack: 0.01, gain, type: 'triangle', cutoff: 7000, delay: d, out: melody });
      this.voice(f, { dur: pluck / 2, attack: 0.01, gain: gain / 6, type: 'sawtooth', cutoff: 7000, detune: 6, delay: d, out: melody });
      const level = CAMPAIGN_LEAD * (gain / 0.03);
      const release = Math.min(0.6, len * 0.6);
      const shaper = ctx.createWaveShaper();
      shaper.curve = mild;
      shaper.oversample = '2x';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      // In the opening it strikes with the pluck and the sine (all reach full in 10 ms, so they land as one note,
      // not a flam); with the haze it swells in a little.
      g.gain.linearRampToValueAtTime(level, t + (held ? Math.min(0.08, len / 3) : 0.01));
      g.gain.linearRampToValueAtTime(level * 0.75, t + len);
      g.gain.linearRampToValueAtTime(0, t + len + release);
      shaper.connect(lp).connect(g).connect(melody);
      for (const detune of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = detune;
        const lv = ctx.createGain();
        lv.gain.value = 0.25;
        o.connect(lv).connect(shaper);
        o.start(t);
        o.stop(t + len + release + 0.05);
      }
    };

    // The beacon's space: a little dry, and a dense wash of delays at irregular times (so the echoes blur into
    // one long tail rather than repeating in time with the rock), spread across the sides, darkening, into the hall.
    const beacon = ctx.createGain();
    const beaconDry = ctx.createGain();
    beaconDry.gain.value = 0.35;
    const beaconTone = ctx.createBiquadFilter();
    beaconTone.type = 'lowpass';
    beaconTone.frequency.value = 2600;
    const beaconWet = ctx.createGain();
    beaconWet.gain.value = 0.5;
    beacon.connect(beaconDry).connect(mix);
    beacon.connect(beaconTone);
    beaconWet.connect(mix);
    this.musicNodes.push(beacon, beaconDry, beaconTone, beaconWet);
    [0.137, 0.211, 0.293, 0.389, 0.463].forEach((time, i) => {
      const d = ctx.createDelay(1);
      d.delayTime.value = time;
      const fb = ctx.createGain();
      fb.gain.value = 0.62;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2200;
      const pan = ctx.createStereoPanner();
      pan.pan.value = [-0.8, 0.6, -0.4, 0.9, -0.1][i];
      beaconTone.connect(d);
      d.connect(damp).connect(fb).connect(d);
      d.connect(pan).connect(beaconWet);
      this.musicNodes.push(d, fb, damp, pan);
    });
    /** The beacon: one high note, a sine and a triangle wavering heavily in pitch and level, ringing off slowly. */
    const ring = (t: number, f: number) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(CAMPAIGN_BEACON, t + 0.04);
      g.gain.setValueAtTime(CAMPAIGN_BEACON, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      const trem = ctx.createGain();
      trem.gain.value = 0.55;
      const tremLfo = ctx.createOscillator();
      tremLfo.frequency.value = 3.4;
      const tremDepth = ctx.createGain();
      tremDepth.gain.value = 0.45;
      tremLfo.connect(tremDepth).connect(trem.gain);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.5;
      const vibDepth = ctx.createGain();
      vibDepth.gain.value = f * 0.025;
      vib.connect(vibDepth);
      trem.connect(g).connect(beacon);
      for (const [type, level] of [['sine', 1], ['triangle', 0.4]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        vibDepth.connect(o.frequency);
        const lv = ctx.createGain();
        lv.gain.value = level;
        o.connect(lv).connect(trem);
        o.start(t);
        o.stop(t + 3.7);
      }
      for (const o of [tremLfo, vib]) {
        o.start(t);
        o.stop(t + 3.7);
      }
    };

    /** In the second crescendo, a synth in the rock's voice follows the runs two octaves down (unducked, like the rock). */
    const follow = (t: number, f: number) => {
      const d = this.until(t);
      this.voice(f, { dur: eighth * 1.6, attack: 0.02, gain: 0.026, delay: d, out: bus });
      this.voice(f, { dur: eighth * 1.2, attack: 0.02, gain: 0.008, type: 'triangle', cutoff: 1400, delay: d, out: bus });
    };

    /**
     * The form, four times round the chords and then over again: a minimal opening (the melody joining on the
     * fourth chord); the melody, then a crescendo; the haze (a slightly distorted synth holding long chords) under
     * the melody for a whole time round; and the haze still there under a second crescendo, after which it all
     * falls back to the minimal opening.
     */
    const playChord = (at: number, index: number, round: number) => {
      const c = CAMPAIGN_CHORDS[index];
      const delay = this.until(at);
      const part = round % 4;
      const rising = part === 1 || part === 3; // a crescendo through the Fmaj7 and the Em7 this time round
      const hazy = part >= 2;
      held = hazy;
      // Pads, as the menu score voices them, but kept low (they swell in, from the first chord on, under the rock).
      c.pad.forEach((n, i) => {
        const opts = { dur: chordLen + 4, attack: 3.5 + i * 0.5, gain: 0.011, type: 'triangle' as OscillatorType, cutoff: 900, delay, out: mix };
        this.voice(hz(n), opts);
        this.voice(hz(n), { ...opts, detune: 9, gain: 0.007 });
      });
      // The falling bass: a held triangle and a soft sine an octave up.
      this.note(at, hz(c.bass), chordLen - 0.4, { gain: 0.04, type: 'triangle', attack: 1.4, release: 1.6, cutoff: 320, out: mix });
      this.note(at, hz(c.bass) * 2, chordLen - 0.4, { gain: 0.012, type: 'sine', attack: 2, release: 1.6, out: mix });
      // The rock: root then fifth, a dotted quarter apart, round and soft (a sine with a little triangle).
      for (let b = 0; b < 4; b++)
        c.rock.forEach((n, k) => {
          const t = at + b * barLen + k * eighth * 3;
          const d = this.until(t);
          // The sidechain: everything else dips about 2 dB as the note lands, then breathes back up.
          mix.gain.setTargetAtTime(0.8, t, 0.012);
          mix.gain.setTargetAtTime(1, t + 0.06, 0.28);
          this.voice(hz(n), { dur: eighth * 4.5, attack: 0.03, gain: k === 0 ? 0.03 : 0.022, delay: d, out: bus });
          this.voice(hz(n), { dur: eighth * 3, attack: 0.03, gain: 0.008, type: 'triangle', cutoff: 1400, delay: d, out: bus });
        });
      // The haze: long, drawn-out chords on saws, hard-distorted and filtered, overlapping (off the rock's notes).
      if (hazy) this.haze(at, chordLen, c.haze, curve, part === 2 && index === 0, mix);
      // The beacon comes in with the haze, at the top of every chord.
      if (hazy) ring(at, hz(c.beacon));
      // The melody waits, in the opening, for the fourth chord.
      if (part === 0 && index < 3) return;
      const tones = new Set(c.pad.map((n) => midiOf(n) % 12));
      if (rising && index === 2) {
        // Open the melody's filter for the climb (it peaks halfway through the Em7), hold it to the end of the
        // Em7, then settle it back.
        orbit.frequency.setValueAtTime(1900, at);
        orbit.frequency.linearRampToValueAtTime(4000, at + chordLen + barLen * 2);
        orbit.frequency.setValueAtTime(4000, at + chordLen * 2);
        orbit.frequency.linearRampToValueAtTime(1900, at + chordLen * 2 + 3);
        return this.crescendo(at, barLen, tones, c.swell, 0, 4, mix, lead, 0, part === 3, part === 3 ? follow : undefined);
      }
      if (rising && index === 3) {
        // The peak, then the arpeggio carries on through the rest of the Em7, easing down.
        this.crescendo(at, barLen, tones, c.swell, 4, 2, mix, lead, barLen * 2, part === 3, part === 3 ? follow : undefined);
        return this.afterglow(at + barLen * 2, barLen, tones, lead, part === 3 ? follow : undefined);
      }
      const phrase = CAMPAIGN_PHRASES[part % 2][index];
      const pitches = phrase.map(([, n]) => midiOf(n));
      const top = pitches.indexOf(Math.max(...pitches));
      phrase.forEach(([e, n], i) => {
        const t = at + e * eighth;
        // At the melody's height on the Fmaj7, the note arrives as a near-instant rolled chord.
        if (index === 2 && i === top) {
          const roll: number[] = [];
          for (let k = pitches[i] - 1; roll.length < 3; k--) if (tones.has(k % 12)) roll.push(k);
          roll.reverse().forEach((r, j) => lead(t - (3 - j) * CAMPAIGN_ROLL, hzOf(r), 0.018, 0.15));
        }
        // Each note holds until the next (at most two bars).
        lead(t, hz(n), 0.03 * (e % 6 === 0 ? 1 : 0.8), Math.min((phrase[i + 1]?.[0] ?? 24) - e, 12) * eighth - 0.1);
      });
    };

    let next = t0;
    let chord = 0, round = 0;
    const tick = () => {
      if (this.playing !== 'voyage') return;
      while (next < ctx.currentTime + 0.5) {
        playChord(next, chord, round);
        next += chordLen;
        chord = (chord + 1) % CAMPAIGN_CHORDS.length;
        if (chord === 0) round++;
      }
    };
    tick();
    this.musicTimers.push(window.setInterval(tick, 200));
  }

  /** Fade the score out (or cut it at once, when the app is being hidden). */
  stopMusic(immediate = false) {
    if (!this.playing || !this.ctx || !this.musicBus) return;
    const buses = this.faders(this.playing).map(([bus]) => bus);
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
