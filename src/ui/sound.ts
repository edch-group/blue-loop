import { markDirty } from './account';
import heatFire from '../assets/sfx/heat-fire.mp3?inline';
import sunHit from '../assets/sfx/sun-hit.mp3?inline';
import cardHit from '../assets/sfx/card-hit.mp3?inline';
import battleSiren from '../assets/sfx/battle-siren.mp3?inline';
import riftTick from '../assets/sfx/rift-tick.mp3?inline';
import phaseTick from '../assets/sfx/phase-tick.mp3?inline';
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
const SFX = { heatFire, sunHit, cardHit, battleSiren, riftTick, phaseTick };
/** The encounter siren's level. */
const ENCOUNTER_LEVEL = 0.4;

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
export type MusicScene = 'ambient' | 'battle' | 'boss' | 'voyage';

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

// ---- Boss battles --------------------------------------------------------------
// For a match against an Overlord (or a challenge), in the voices of the other
// scores: a plucked arpeggio like the battle theme's, a little faster and
// hammering on each chord's root, over a deep held bass and a low pulse on
// every beat that the whole score breathes with; the chords turn darker (Am,
// B-flat, Dm, then E, wrenching back round). Then the voyage's voices join one
// by one: its gritty haze and a slow, menacing melody (chorused and driven
// harder); a second arpeggio an octave up, a sixteenth behind the first; and a
// long climb in eighths, swelling to the top of the E before cutting back to
// the arpeggio alone.

const BOSS_BPM = 88;
/** The form, in bars (two times round the chords): see bossScore. */
const BOSS_FORM_BARS = 32;
/**
 * Per chord (four bars each): the held bass, the arpeggio's eight eighths per bar (two halves for the turn), the
 * haze, and the climb's swelling chord. Plain triads throughout (only the E adds its seventh, for the pull home),
 * so nothing stacked over the arpeggio rubs against it. The arpeggio hammers on the chord's root an octave up
 * between every other note.
 */
const BOSS_CHORDS: { bass: string; arp: string[][]; haze: string[]; swell: string[] }[] = [
  { bass: 'A1', arp: [['A3', 'A4', 'E4', 'A4', 'C5', 'A4', 'E4', 'A4']], haze: ['C4', 'E4', 'A4'], swell: [] }, // Am
  { bass: 'A#1', arp: [['A#3', 'A#4', 'F4', 'A#4', 'D5', 'A#4', 'F4', 'A#4']], haze: ['D4', 'F4', 'A#4'], swell: [] }, // B-flat
  { bass: 'D2', arp: [['D3', 'D4', 'A3', 'D4', 'F4', 'D4', 'A3', 'D4']], haze: ['F3', 'A3', 'D4'], swell: ['A3', 'D4', 'F4', 'A4'] }, // Dm
  {
    bass: 'E1',
    arp: [
      ['E3', 'E4', 'B3', 'E4', 'G#4', 'E4', 'B3', 'E4'], // E...
      ['E3', 'E4', 'B3', 'E4', 'G#4', 'B4', 'D5', 'B4'], // ...climbing to its seventh, pulling back round
    ],
    haze: ['G#3', 'B3', 'E4'],
    swell: ['G#3', 'B3', 'E4', 'B4'],
  },
];
/** The melody, per chord from the ninth bar of the form, as [eighth (0-31 across the chord's four bars), note]: chord tones only. */
const BOSS_PHRASES: [number, string][][] = [
  [[0, 'A5'], [12, 'F5'], [16, 'D6'], [24, 'A5']], // Dm
  [[0, 'G#5'], [8, 'B5'], [16, 'E6'], [24, 'B5']], // E
  [[0, 'E6'], [8, 'C6'], [16, 'A5'], [24, 'E6']], // Am
  [[0, 'D6'], [8, 'F6'], [16, 'D6'], [24, 'A#5']], // B-flat
];

/**
 * A reversed score's loop, in seconds: one whole pass of its form (the battle theme's three times round, where the
 * arpeggio rests once; the voyage's four; the boss track's thirty-two bars); the ambient score has none, so two minutes.
 */
const REVERSE_LOOP: Record<MusicScene, number> = {
  ambient: 120,
  battle: 3 * 4 * 4 * 8 * (60 / BATTLE_BPM / 2),
  voyage: 4 * 4 * 4 * 6 * CAMPAIGN_EIGHTH,
  boss: BOSS_FORM_BARS * 8 * (60 / BOSS_BPM / 2),
};
/** The rate reversed scores are rendered at (plenty for the scores, and half the memory of a full-rate loop). */
const REVERSE_RATE = 32000;

/**
 * The first `length` frames of a render, back to front. Given `trim`, the silence it ends on is dropped first, so
 * the reversed sound starts at once (from the last of its tail).
 */
function reverseBuffer(ctx: AudioContext, src: AudioBuffer, length: number, trim = false): AudioBuffer | null {
  const channels = [0, 1].map((c) => src.getChannelData(c));
  if (trim) {
    let end = 0;
    for (const d of channels) for (let i = length - 1; i > end; i--) if (Math.abs(d[i]) > 1e-4) { end = i; break; }
    length = end + 1;
  }
  if (length < 2) return null;
  const out = ctx.createBuffer(2, length, src.sampleRate);
  channels.forEach((d, c) => {
    const o = out.getChannelData(c);
    for (let i = 0; i < length; i++) o[i] = d[length - 1 - i];
  });
  return out;
}

class SoundBoard {
  private ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  /** Sounds kept out of the reverb: paper on paper is close and dry (in the hall, a sweep across the hand swelled into a roar). */
  private sfxDry: GainNode | null = null;
  /** Sounds in a smaller room: half the hall's send (the blows and the heat, which the full hall washed out). */
  private sfxRoom: GainNode | null = null;
  private lastHandLift = -Infinity;
  private musicBus: GainNode | null = null;
  /** The battle theme's two faders: one lightly reverbed (bass, kick), one drenched like the ambient score. */
  private battleBus: GainNode | null = null;
  private battleLush: GainNode | null = null;
  /** The boss track's faders: one lightly reverbed (drums, timpani, bass, stabs), one drenched (the pads). */
  private bossBus: GainNode | null = null;
  private bossLush: GainNode | null = null;
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

  /** A board rendering offline (into an OfflineAudioContext) to be reversed, rather than the one playing. */
  private offline = false;

  constructor(offline = false) {
    if (offline) {
      this.offline = true;
      return;
    }
    // (In reversed time only the score runs backwards: every effect plays as it is [direction: all audio but the
    // background music back to playing normally in the Seren rift].)
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

  /**
   * The mixing desk: master (and, live, the limiter), the hall, the effects and every score's faders. Offline
   * (`from` the live board) it shares the live board's hall and noise, so a reversed sound is the very same sound.
   */
  private build(ctx: AudioContext, from?: SoundBoard) {
    const master = ctx.createGain();
    // (Offline, the render goes out raw: it is played back through the live board's master and limiter.)
    master.gain.value = from ? 1 : 0.8;
    if (from) master.connect(ctx.destination);
    else {
      // Gentle limiter so swells never clip.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      master.connect(comp).connect(ctx.destination);
      this.reverseBus = ctx.createGain();
      this.reverseBus.gain.value = 0.0001;
      this.reverseBus.connect(master);
    }

    this.reverb = ctx.createConvolver();
    // (A hall is only shared at the same rate: a convolver will not take another's.)
    const hall = from?.reverb?.buffer;
    this.reverb.buffer = hall && hall.sampleRate === ctx.sampleRate ? hall : this.impulse(4.5, 2.6);
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
    this.sfxRoom = ctx.createGain();
    this.sfxRoom.gain.value = 0.9;
    this.sfxRoom.connect(master);
    const roomSend = ctx.createGain();
    roomSend.gain.value = 0.5;
    this.sfxRoom.connect(roomSend).connect(this.reverb);

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
    this.bossBus = ctx.createGain();
    this.bossBus.gain.value = 0.0001;
    this.bossBus.connect(master);
    const bossSend = ctx.createGain();
    bossSend.gain.value = 0.3;
    this.bossBus.connect(bossSend).connect(this.reverb);
    this.bossLush = ctx.createGain();
    this.bossLush.gain.value = 0.0001;
    this.bossLush.connect(master);
    this.bossLush.connect(this.reverb);
    this.campaignBus = ctx.createGain();
    this.campaignBus.gain.value = 0.0001;
    this.campaignBus.connect(master);
    this.campaignBus.connect(this.reverb);

    if (from?.noiseBuf) this.noiseBuf = from.noiseBuf;
    else {
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
  }

  /** Browsers only allow audio after a user gesture; call from input handlers. */
  unlock() {
    if (document.visibilityState === 'hidden') return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.build((this.ctx = new Ctx()));
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
    if (this.offline) return this.ctx;
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
   * Time Dense Space turning, once a second [direction: a booming tick every time the galaxy turns, deep and boomy,
   * from a recorded clock]: the clock's tick slowed right down over a falling sub thump, and a lower clunk of its
   * mechanism just after, in the smaller room. (It keeps time with the turning, so it never plays backwards.)
   */
  boomTick() {
    this.clip(SFX.riftTick, 0.35, 1, true);
  }

  /**
   * Time Dense Space's routes [direction: before turning, the routes about to break retract, with a sound; turned, the
   * new ones extend out with a noise, then another confirming they are linked]. All low and soft: a route drawn back
   * in is a falling, closing hiss over a low slide down; one reaching out, a rising hiss over a slide up; linked, a
   * low two-note chime.
   */
  linkRetract() {
    this.breath({ dur: 0.42, freq: 1400, to: 260, type: 'bandpass', q: 1.4, gain: 0.05, attack: 0.03 });
    this.voice(196, { dur: 0.42, attack: 0.02, gain: 0.028, to: 98, type: 'triangle', cutoff: 900 });
  }
  linkExtend() {
    this.breath({ dur: 0.5, freq: 240, to: 1300, type: 'bandpass', q: 1.4, gain: 0.045, attack: 0.3 });
    this.voice(110, { dur: 0.5, attack: 0.25, gain: 0.026, to: 196, type: 'triangle', cutoff: 900 });
  }
  linkConfirm() {
    this.voice(196, { dur: 0.9, attack: 0.008, gain: 0.03, cutoff: 1600 });
    this.voice(293.66, { dur: 0.8, attack: 0.008, gain: 0.022, cutoff: 1800, delay: 0.07 });
  }


  /**
   * Time running backwards (Time Dense Space) [direction: music plays in reverse, the exact track reversed, not
   * chopped up; every other sound plays normally]: the score is rendered offline a whole loop at a time and that loop
   * played backwards.
   */
  /** Where reversed sound plays in (straight to the master: the renders carry their own hall). */
  private reverseBus: GainNode | null = null;
  private reversed = false;
  /** The reversed scores rendered so far (each kept to loop again). */
  private reversedLoops = new Map<MusicScene, Promise<AudioBuffer | null>>();
  /** Bumped whenever the score starts or stops, so a reversed render that finishes late is not played. */
  private musicRun = 0;

  setReverse(on: boolean) {
    if (on === this.reversed) return;
    const playing = !!this.playing;
    if (playing) this.stopMusic();
    this.reversed = on;
    if (!on) {
      this.reversedLoops.clear();
    }
    if (playing) this.startMusic();
  }

  /**
   * One whole loop of a score, rendered offline and reversed: scheduled just as it is live (the scheduler's ticks
   * run as the render reaches them), stopped short of the next pass, and with the tails ringing past the loop's end
   * folded back onto its start so it loops seamlessly.
   */
  private async renderReversed(scene: MusicScene): Promise<AudioBuffer | null> {
    const live = this.ctx!;
    const loop = REVERSE_LOOP[scene];
    const tail = 6;
    const offline = new OfflineAudioContext(2, Math.ceil(REVERSE_RATE * (loop + tail)), REVERSE_RATE);
    const r = new SoundBoard(true);
    r.ctx = offline as unknown as AudioContext;
    r.decoded = this.decoded;
    r.build(r.ctx, this);
    r.scene = scene;
    r.playing = scene;
    r.timers = [];
    for (const [bus, level] of r.faders(scene)) bus.gain.value = level;
    r.score(r.ctx, scene);
    const step = 0.25;
    for (let t = step; t < loop + tail; t += step)
      void offline.suspend(t).then(() => {
        // Nothing of the next pass: the scheduler looks half a second ahead, so stop it a little sooner.
        if (t + 0.6 >= loop) r.playing = null;
        const now = offline.currentTime;
        const due = r.timers!.filter((x) => x.at <= now);
        r.timers = r.timers!.filter((x) => x.at > now);
        for (const x of due) x.fn();
        void offline.resume();
      });
    const rendered = await offline.startRendering();
    const length = Math.round(REVERSE_RATE * loop);
    for (let c = 0; c < 2; c++) {
      const d = rendered.getChannelData(c);
      for (let i = length; i < d.length; i++) d[i - length] += d[i];
    }
    return reverseBuffer(live, rendered, length);
  }

  /** A reversed score's loop: rendered once, then kept. */
  private reversedLoop(scene: MusicScene) {
    let loop = this.reversedLoops.get(scene);
    if (!loop) this.reversedLoops.set(scene, (loop = this.renderReversed(scene).catch(() => null)));
    return loop;
  }

  /**
   * Start the reversed score: render its loop (or reuse it), then loop it backwards. On the map, the battle theme's
   * is rendered next, ready for the first battle (it takes a few seconds).
   */
  private playReversed(scene: MusicScene) {
    const ctx = this.ctx!;
    const loop = this.reversedLoop(scene);
    if (scene === 'ambient') void loop.then(() => {
      if (this.reversed) void this.reversedLoop('battle');
    });
    const run = this.musicRun;
    void loop.then((buffer) => {
      if (!buffer || run !== this.musicRun || this.playing !== scene || !this.reversed) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.reverseBus!);
      src.start();
      this.musicNodes.push(src);
    });
  }

  /**
   * A clock's hand moving on: day or dusk coming in (they have no banner) [direction: like a really big clock's
   * mechanism, deep and boomy]: the rift's deep tick, then the escapement's lower, heavier clunk.
   */
  clockTick() {
    this.clip(SFX.phaseTick, 0.45, 1, true);
  }


  /** The boosters' running sound while a ship is under way (built when it starts, let go once it has faded out). */
  private thrustNodes: { gain: GainNode; stop: () => void } | null = null;
  private thrustOff = 0;

  /**
   * A ship's boosters, for as long as it is under way [direction: the ship's boosters make sound when it moves, constant
   * while it flies in under the close-up camera as a campaign starts]: a low engine roar (noise through a lowpass that
   * wanders a little), a deep detuned hum beneath it, and a slow flutter, nothing high. On: it swells in; off: it dies away.
   */
  thrust(on: boolean) {
    const ctx = this.ctx;
    if (!on) {
      const n = this.thrustNodes;
      if (!n || !ctx) return;
      const t = ctx.currentTime;
      n.gain.gain.cancelScheduledValues(t);
      n.gain.gain.setValueAtTime(Math.max(n.gain.gain.value, 0.0001), t);
      n.gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      window.clearTimeout(this.thrustOff);
      this.thrustOff = window.setTimeout(() => {
        if (this.thrustNodes !== n) return;
        n.stop();
        this.thrustNodes = null;
      }, 1300);
      return;
    }
    const c = this.ready();
    if (!c || !this.sfx || !this.noiseBuf) return;
    window.clearTimeout(this.thrustOff);
    let n = this.thrustNodes;
    if (!n) {
      const master = c.createGain();
      master.gain.value = 0.0001;
      master.connect(this.sfx);
      // The roar: noise, low, its lowpass wandering slowly.
      const noise = c.createBufferSource();
      noise.buffer = this.noiseBuf;
      noise.loop = true;
      const roar = c.createBiquadFilter();
      roar.type = 'lowpass';
      roar.frequency.value = 300;
      roar.Q.value = 0.8;
      const wander = c.createOscillator();
      const wanderDepth = c.createGain();
      wander.frequency.value = 0.35;
      wanderDepth.gain.value = 70;
      wander.connect(wanderDepth).connect(roar.frequency);
      const roarGain = c.createGain();
      roarGain.gain.value = 1.4;
      // A slow flutter through it, as the boosters burn.
      const flutter = c.createOscillator();
      const flutterDepth = c.createGain();
      flutter.frequency.value = 6.5;
      flutterDepth.gain.value = 0.25;
      flutter.connect(flutterDepth).connect(roarGain.gain);
      noise.connect(roar).connect(roarGain).connect(master);
      // The hum: two low saws, a little apart, darkened.
      const humFilter = c.createBiquadFilter();
      humFilter.type = 'lowpass';
      humFilter.frequency.value = 170;
      const humGain = c.createGain();
      humGain.gain.value = 0.22;
      humFilter.connect(humGain).connect(master);
      const hums = [43.65, 44.2].map((f) => {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(humFilter);
        return o;
      });
      const sources = [noise, wander, flutter, ...hums];
      for (const src of sources) src.start();
      n = {
        gain: master,
        stop: () => {
          for (const src of sources) {
            try {
              src.stop();
            } catch {
              // (Already stopped.)
            }
          }
          master.disconnect();
        },
      };
      this.thrustNodes = n;
    }
    const t = c.currentTime;
    n.gain.gain.cancelScheduledValues(t);
    n.gain.gain.setValueAtTime(Math.max(n.gain.gain.value, 0.0001), t);
    n.gain.gain.exponentialRampToValueAtTime(0.13, t + 0.7);
  }

  /**
   * An encounter: the flagship lands at a guarded star. A recorded air-raid siren [direction: cut before it
   * descends, three times, cut naturally]: three rises, each fading out at its height as the next begins, into the
   * hall. (The battle screen itself opens in silence.)
   */
  encounter() {
    this.clip(SFX.battleSiren, ENCOUNTER_LEVEL);
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
  /**
   * A loot cache bursting open: a heavy low thud as its seal gives, a short rush of air, and a warm swell of low
   * bells (A major, from A3) as the light pours out. (Nothing shrill.)
   */
  cacheOpen() {
    this.voice(82, { dur: 0.9, attack: 0.004, gain: 0.32, to: 41, type: 'sine' });
    this.breath({ dur: 0.5, freq: 900, to: 140, type: 'lowpass', q: 0.8, gain: 0.2, attack: 0.004 });
    this.breath({ dur: 1.1, freq: 600, to: 1500, type: 'bandpass', q: 0.7, gain: 0.04, attack: 0.3, delay: 0.08 });
    ['A3', 'C#4', 'E4', 'A4'].forEach((n, i) => this.bell(hz(n), 0.1 + i * 0.07, 0.04));
  }
  /** A reward coming out of a burst cache: a soft bell, each a step higher up the scale (A major pentatonic, from A4). */
  lootChime(i: number) {
    const scale = ['A4', 'B4', 'C#5', 'E5', 'F#5', 'A5'];
    this.bell(hz(scale[Math.min(i, scale.length - 1)]), 0, 0.03);
  }
  /**
   * An experience bar filling: a soft tone gliding up as it fills (A3 to E5), with a quick patter of little ticks
   * climbing with it, for `dur` seconds.
   */
  xpFill(dur: number) {
    this.voice(hz('A3'), { dur, attack: 0.05, gain: 0.035, to: hz('E5'), type: 'triangle', cutoff: 1800 });
    const ticks = Math.max(6, Math.round(dur / 0.07));
    for (let i = 0; i < ticks; i++) {
      const k = i / ticks;
      this.voice(hz('A4') * Math.pow(2, k * 1.2), { dur: 0.05, attack: 0.003, gain: 0.018, type: 'sine', delay: k * dur * (1 - 0.35 * k) });
    }
  }
  /** A level gained: a warm chord of bells (A major) over a low swell. */
  levelUp() {
    this.voice(hz('A2'), { dur: 1.2, attack: 0.02, gain: 0.12, type: 'sine' });
    ['A4', 'C#5', 'E5'].forEach((n, i) => this.bell(hz(n), i * 0.06, 0.045));
  }
  /** A star under the pointer: a soft glassy chime, each star its own note of a pentatonic scale. */
  /**
   * The chord the score is sounding (its pitch classes), as it changes [direction: every note played hovering a skill
   * is in tune with the music]: set when each chord actually sounds, not when it is scheduled.
   */
  private tones: number[] = [9, 0, 2, 4, 7];
  private hearChord(midis: number[], delay: number) {
    const set = () => (this.tones = [...new Set(midis.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b));
    if (delay <= 0.02) set();
    else window.setTimeout(() => this.playing && set(), delay * 1000);
  }

  starHover(seed: number) {
    const now = performance.now();
    if (now - this.lastHover < 60) return;
    this.lastHover = now;
    // A tone of the chord sounding now (A minor's pentatonic with no music on), from E5 up two octaves.
    const tones = this.playing ? this.tones : [9, 0, 2, 4, 7];
    const ladder: number[] = [];
    for (let n = 76; n <= 100; n++) if (tones.includes(n % 12)) ladder.push(n);
    const at = Math.floor(Math.abs(seed) * 997) % ladder.length;
    const f = hzOf(ladder[at]);
    // (Its shimmer: the chord's next tone up, never a note outside it.)
    const up = hzOf(ladder[at + 2] ?? ladder[at] + 12);
    this.voice(f, { dur: 0.9, attack: 0.006, gain: 0.03, cutoff: 5000 });
    this.voice(f * 2, { dur: 0.5, attack: 0.004, gain: 0.012, cutoff: 7000, detune: 6 });
    this.voice(up, { dur: 1.2, attack: 0.06, gain: 0.008, cutoff: 3000, delay: 0.04 });
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
  /**
   * A warp from star to star [direction: the ship's travel a lightspeed warp, with a new sound]: the drive charging
   * (a low hum and a hiss climbing together), the jump (a hard rush of air falling away over a deep thud), and the
   * arrival (a soft, low ring). Timed to the map's warp (nebula-objects.ts WARP_SECONDS: charge, jump, arrive).
   */
  warp() {
    // Charging.
    this.breath({ dur: 0.5, freq: 140, to: 1100, type: 'bandpass', q: 2.2, gain: 0.07, attack: 0.42 });
    this.voice(46, { dur: 0.55, attack: 0.4, gain: 0.09, to: 92, type: 'triangle', cutoff: 500 });
    this.voice(92, { dur: 0.5, attack: 0.38, gain: 0.025, to: 184, type: 'sawtooth', cutoff: 700 });
    // The jump.
    this.breath({ dur: 0.42, freq: 2400, to: 160, type: 'bandpass', q: 1.1, gain: 0.13, attack: 0.012, delay: 0.47 });
    this.voice(78, { dur: 0.5, attack: 0.006, gain: 0.14, to: 32, type: 'sine', cutoff: 300, delay: 0.47 });
    // Arrived.
    this.voice(146.83, { dur: 1.1, attack: 0.02, gain: 0.022, cutoff: 1400, delay: 0.66 });
    this.voice(220, { dur: 0.9, attack: 0.02, gain: 0.014, cutoff: 1600, delay: 0.7 });
  }
  flare() {
    // A solar-wind roar that swells, with a deep rising undertone.
    this.breath({ dur: 1.8, freq: 180, to: 1400, type: 'lowpass', q: 2, gain: 0.16, attack: 0.55 });
    this.voice(55, { dur: 1.8, attack: 0.5, gain: 0.12, to: 110, type: 'triangle', cutoff: 400 });
  }
  /** Heat fired at a rival or a card: the recorded laser, slowed a little (the strike, as it lands, is the blow). */
  launch() {
    this.clip(SFX.heatFire, 0.55, 1, true);
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
    this.clip(SFX.sunHit, level * Math.min(1.5, 0.85 + 0.12 * (a - 1)), 1 - Math.min(0.14, 0.035 * (a - 1)), true);
  }
  /** Your sun takes enemy heat. */
  hurt(amount = 1) {
    this.sunHit(amount, 0.55);
  }
  /** You land heat on a rival's sun. */
  strike(amount = 1) {
    this.sunHit(amount, 0.5);
  }
  /** Shields take a hit: a hammer on metal. */
  block() {
    const room = this.sfxRoom ?? undefined;
    // [direction: hitting shields makes a deeper "tink", like a hammer hitting metal] A struck plate: a low ring and
    // its inharmonic overtones (as a bar's are, a little apart), each dying sooner than the last; the hammer's hard
    // strike on top; a dull thud of the blow beneath.
    this.voice(262, { dur: 0.75, attack: 0.002, gain: 0.07, type: 'triangle', cutoff: 2600, out: room });
    this.voice(723, { dur: 0.42, attack: 0.002, gain: 0.035, cutoff: 3000, detune: 4, out: room });
    this.voice(1415, { dur: 0.2, attack: 0.002, gain: 0.016, cutoff: 3200, out: room });
    this.breath({ dur: 0.035, freq: 1900, type: 'bandpass', q: 2.2, gain: 0.12, attack: 0.002, out: room });
    this.voice(120, { dur: 0.14, attack: 0.002, gain: 0.09, to: 78, type: 'triangle', cutoff: 500, out: room });
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
    const room = this.sfxRoom ?? undefined;
    this.voice(92 * deeper, { dur: 0.7, attack: 0.004, gain: 0.16 * g, to: 38, type: 'triangle', cutoff: 420, out: room });
    this.breath({ dur: 0.55, freq: 1300, to: 180, type: 'lowpass', q: 0.9, gain: 0.16 * g, attack: 0.004, out: room });
    this.breath({ dur: 0.3, freq: 700, to: 300, type: 'bandpass', q: 1.2, gain: 0.08 * g, attack: 0.003, out: room });
    [0.03, 0.07, 0.12, 0.19].forEach((d, i) =>
      this.breath({ dur: 0.05, freq: [1900, 1400, 2300, 1100][i], q: 2.2, gain: 0.035 * g, attack: 0.002, delay: d, type: 'bandpass', out: room }),
    );
    this.clip(SFX.cardHit, 0.32 * g, 0.75 * deeper, true);
  }
  /** A card's defence cracking: a brittle snap with splintering ticks after it. */
  crack() {
    this.breath({ dur: 0.07, freq: 3200, type: 'highpass', q: 0.8, gain: 0.16, attack: 0.002, out: this.sfxDry ?? undefined });
    this.voice(1480, { dur: 0.12, attack: 0.002, gain: 0.04, to: 620, type: 'square', cutoff: 3600 });
    for (let i = 0; i < 4; i++)
      this.breath({ dur: 0.03 + Math.random() * 0.03, freq: 2600 + Math.random() * 3000, q: 2, gain: 0.05 + Math.random() * 0.03, attack: 0.002, delay: 0.05 + i * 0.04 + Math.random() * 0.02, type: 'bandpass', out: this.sfxDry ?? undefined });
  }
  /**
   * Shields raised on a sun: something charging up [direction: like something charging, not a bongo drum]. A whine
   * of detuned triangles and a quiet saw gliding up two octaves (A3 to A5) through a lowpass that opens, pulsing
   * faster and faster as it swells, then settling into a soft ring at the top (A5 and E6) with a rising shimmer of air.
   */
  shield() {
    const ctx = this.ready();
    if (!ctx || !this.sfx) return;
    const t = ctx.currentTime;
    const rise = 0.75;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(4200, t + rise);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + rise);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rise + 0.35);
    // The pulsing, quickening as it charges.
    const pulse = ctx.createGain();
    pulse.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(7, t);
    lfo.frequency.exponentialRampToValueAtTime(28, t + rise);
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(pulse.gain);
    filter.connect(pulse).connect(g).connect(this.sfx);
    for (const [type, detune, level] of [['triangle', -7, 0.5], ['triangle', 7, 0.5], ['sawtooth', 0, 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      o.frequency.setValueAtTime(hz('A3'), t);
      o.frequency.exponentialRampToValueAtTime(hz('A5'), t + rise);
      const lv = ctx.createGain();
      lv.gain.value = level;
      o.connect(lv).connect(filter);
      o.start(t);
      o.stop(t + rise + 0.4);
    }
    lfo.start(t);
    lfo.stop(t + rise + 0.4);
    this.breath({ dur: rise + 0.2, freq: 600, to: 5000, type: 'bandpass', q: 1.4, gain: 0.025, attack: rise });
    // Charged: a soft ring at the top.
    this.voice(hz('A5'), { dur: 1.4, attack: 0.03, gain: 0.03, cutoff: 5000, delay: rise - 0.03 });
    this.voice(hz('E6'), { dur: 1.1, attack: 0.03, gain: 0.014, cutoff: 6000, vibrato: 5, delay: rise });
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

  /** Decoded recordings, by URL (each is fetched once), and those already decoded (shared with the offline boards). */
  private clips = new Map<string, Promise<AudioBuffer | null>>();
  private decoded = new Map<string, AudioBuffer>();

  /** Decode a recording once (kept for every later play). A data URL is decoded in place; anything else fetched. */
  private load(url: string): Promise<AudioBuffer | null> {
    let buf = this.clips.get(url);
    if (!buf) {
      const ctx = this.ctx!;
      const bytes = url.startsWith('data:')
        ? Promise.resolve(Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer)
        : fetch(url).then((r) => r.arrayBuffer());
      buf = bytes
        .then((data) => ctx.decodeAudioData(data))
        .then((b) => (this.decoded.set(url, b), b))
        .catch(() => null);
      this.clips.set(url, buf);
    }
    return buf;
  }

  /**
   * Play a recording (a voice line, a recorded effect) through the effects mix, so it sits in the same hall (or,
   * given `room`, the smaller one).
   */
  clip(url: string, gain = 0.85, rate = 1, room = false) {
    const ctx = this.ready();
    if (!ctx) return;
    // (Already decoded, it plays at once: an offline board schedules everything as the effect is called.)
    const known = this.decoded.get(url);
    const play = (b: AudioBuffer | null) => {
      if (!b || !this.ready()) return;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect((room && this.sfxRoom) || this.sfx!);
      src.start();
    };
    if (known) play(known);
    else void this.load(url).then(play);
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
    if (this.reversed && !this.offline) return [[this.reverseBus!, 1, 0.05]];
    if (scene === 'battle') return [[this.battleBus!, 1.2, 3], [this.battleLush!, 1.2, 3]];
    if (scene === 'boss') return [[this.bossBus!, 1.4, 0.05], [this.bossLush!, 1.4, 0.05]];
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
    this.musicRun++;
    if (this.reversed) this.playReversed(this.scene);
    else this.score(ctx, this.scene);
  }

  /** Start a score playing (scheduled as it goes: see every and after). */
  private score(ctx: AudioContext, scene: MusicScene) {
    if (scene === 'battle') this.battleScore(ctx, this.battleBus!, this.battleLush!);
    else if (scene === 'boss') this.bossScore(ctx, this.bossBus!, this.bossLush!);
    else if (scene === 'voyage') this.campaignScore(ctx, this.campaignBus!);
    else this.ambientScore(ctx, this.musicBus!);
  }

  /** Offline, the score's timers: run as the render reaches them, not by the window's clock. */
  private timers: { at: number; fn: () => void; every?: number }[] | null = null;
  /** Run `fn` every `ms` while the score plays (the scheduler's tick). */
  private every(fn: () => void, ms: number) {
    if (this.timers) {
      const loop = () => (fn(), this.timers!.push({ at: this.ctx!.currentTime + ms / 1000, fn: loop }));
      this.timers.push({ at: this.ctx!.currentTime + ms / 1000, fn: loop });
    } else this.musicTimers.push(window.setInterval(fn, ms));
  }
  /** Run `fn` once, `ms` from now. */
  private after(fn: () => void, ms: number) {
    if (this.timers) this.timers.push({ at: this.ctx!.currentTime + ms / 1000, fn });
    else this.musicTimers.push(window.setTimeout(fn, ms));
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
      this.hearChord(notes.map((f) => Math.round(69 + 12 * Math.log2(f / 440))), 0);
      chord += 1 + Math.floor(Math.random() * 2);
      notes.forEach((f, i) => {
        const opts = { dur: 14, attack: 4 + i * 0.6, gain: 0.022, type: 'triangle' as OscillatorType, cutoff: 900, out: bus };
        this.voice(f * 2, opts);
        this.voice(f * 2, { ...opts, detune: 9, gain: 0.014 });
      });
      this.after(pad, 10500 + Math.random() * 3000);
    };
    const sparkle = () => {
      if (this.playing !== 'ambient') return;
      const f = CHIMES[Math.floor(Math.random() * CHIMES.length)];
      this.voice(f, { dur: 4, attack: 0.6, gain: 0.008 + Math.random() * 0.006, vibrato: 2, out: bus });
      this.after(sparkle, 2500 + Math.random() * 6000);
    };
    pad();
    this.after(sparkle, 3000);
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
      this.hearChord(c.pad.map(midiOf), delay);
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
    this.every(tick, 200);
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
  private haze(at: number, len: number, chord: string[], curve: Float32Array<ArrayBuffer>, entering: boolean, bus: GainNode, level = CAMPAIGN_HAZE) {
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
    g.gain.linearRampToValueAtTime(level, at + attack);
    g.gain.setValueAtTime(level, end);
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
      this.hearChord(c.pad.map(midiOf), delay);
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
    this.every(tick, 200);
  }

  /**
   * The boss track (see BOSS_* above), in a form two times round the chords long: bars 1-8, the arpeggio over the
   * bass and pulse; 9-16, the haze and the melody join; 17-24, a second arpeggio an octave up; 25-32, the climb.
   * Scheduled a bar at a time, just ahead of the audio clock.
   */
  private bossScore(ctx: AudioContext, bus: GainNode, lush: GainNode) {
    const eighth = 60 / BOSS_BPM / 2;
    const beat = eighth * 2;
    const barLen = eighth * 8;
    const formLen = barLen * BOSS_FORM_BARS;
    const t0 = ctx.currentTime + 0.1;
    // Everything but the pulse goes through this, dipping on every beat and recovering (the voyage's sidechain).
    const mix = ctx.createGain();
    mix.connect(bus);

    // The arpeggio's filter opens across each pass of the form; its dotted-eighth echo goes into the hall.
    const arpFilter = ctx.createBiquadFilter();
    arpFilter.type = 'lowpass';
    arpFilter.Q.value = 2.5;
    arpFilter.frequency.value = 1100;
    const echo = ctx.createDelay(2);
    echo.delayTime.value = eighth * 1.5;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 1800;
    const echoWet = ctx.createGain();
    echoWet.gain.value = 0.35;
    arpFilter.connect(mix);
    arpFilter.connect(echo).connect(echoTone).connect(feedback).connect(echo);
    echoTone.connect(echoWet).connect(lush);
    // The second arpeggio's place, a little to one side (the first leans the other way).
    const arpLeft = ctx.createStereoPanner();
    arpLeft.pan.value = -0.2;
    arpLeft.connect(arpFilter);
    const arpRight = ctx.createStereoPanner();
    arpRight.pan.value = 0.45;
    arpRight.connect(arpFilter);

    // The melody's filter and echo, as in the voyage: a dotted quarter later, darker.
    const melody = ctx.createBiquadFilter();
    melody.type = 'lowpass';
    melody.Q.value = 0.7;
    melody.frequency.value = 3200;
    const melEcho = ctx.createDelay(2);
    melEcho.delayTime.value = eighth * 3;
    const melFeedback = ctx.createGain();
    melFeedback.gain.value = 0.35;
    const melTone = ctx.createBiquadFilter();
    melTone.type = 'lowpass';
    melTone.frequency.value = 1500;
    const melWet = ctx.createGain();
    melWet.gain.value = 0.35;
    melody.connect(mix);
    melody.connect(melEcho).connect(melTone).connect(melFeedback).connect(melEcho);
    melTone.connect(melWet).connect(lush);
    this.musicNodes = [mix, arpFilter, echo, feedback, echoTone, echoWet, arpLeft, arpRight, melody, melEcho, melFeedback, melTone, melWet];
    // A wide chorus on the melody: two short delays, each slowly wavering in time, spread hard left and right.
    [-1, 1].forEach((side, i) => {
      const d = ctx.createDelay(0.1);
      d.delayTime.value = 0.02 + i * 0.006;
      const wobble = ctx.createOscillator();
      wobble.frequency.value = [0.55, 0.8][i];
      const depth = ctx.createGain();
      depth.gain.value = 0.004;
      wobble.connect(depth).connect(d.delayTime);
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * 0.8;
      const wet = ctx.createGain();
      wet.gain.value = 0.7;
      melody.connect(d).connect(pan).connect(wet).connect(mix);
      wobble.start(t0);
      this.musicNodes.push(d, wobble, depth, pan, wet);
    });

    // The haze's hard distortion and the melody synth's milder one, as in the voyage.
    const curveOf = (k: number) => {
      const c = new Float32Array(new ArrayBuffer(1024 * 4));
      for (let i = 0; i < c.length; i++) c[i] = Math.tanh(k * ((i / (c.length - 1)) * 2 - 1)) / Math.tanh(k);
      return c;
    };
    const hard = curveOf(9);
    const drive = curveOf(6);

    /** The voyage's melody voice: a bell-like pluck layered with held, distorted saws. */
    const lead = (t: number, f: number, gain: number, len: number) => {
      const d = this.until(t);
      const pluck = Math.max(eighth * 2.4, Math.min(len, eighth * 5));
      this.voice(f, { dur: pluck, attack: 0.01, gain, type: 'triangle', cutoff: 7000, delay: d, out: melody });
      this.voice(f, { dur: pluck / 2, attack: 0.01, gain: gain / 6, type: 'sawtooth', cutoff: 7000, detune: 6, delay: d, out: melody });
      const level = gain * 0.3;
      const release = Math.min(0.6, len * 0.6);
      const shaper = ctx.createWaveShaper();
      shaper.curve = drive;
      shaper.oversample = '2x';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + Math.min(0.06, len / 3));
      g.gain.linearRampToValueAtTime(level * 0.75, t + len);
      g.gain.linearRampToValueAtTime(0, t + len + release);
      shaper.connect(lp).connect(g).connect(melody);
      // Driven harder than the voyage's, with a third saw and a wider detune for a thicker, chorused sound.
      for (const detune of [-10, 0, 10]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = detune;
        const lv = ctx.createGain();
        lv.gain.value = 0.3;
        o.connect(lv).connect(shaper);
        o.start(t);
        o.stop(t + len + release + 0.05);
      }
    };

    /** One bar of an arpeggio: soft plucks, a triangle with a quiet saw for edge, accented on the beat. */
    const arpBar = (at: number, notes: string[], transpose: number, offset: number, gain: number, out: AudioNode) =>
      notes.forEach((n, e) => {
        const d = this.until(at + offset + e * eighth);
        const f = hz(n) * transpose;
        const accent = e % 2 === 0 ? 1 : 0.7;
        this.voice(f, { dur: eighth * 2.4, attack: 0.012, gain: gain * accent, type: 'triangle', cutoff: 5000, delay: d, out });
        this.voice(f, { dur: eighth * 1.6, attack: 0.012, gain: gain * 0.2 * accent, type: 'sawtooth', cutoff: 5000, detune: 6, delay: d, out });
      });

    /** The climb's supporting chord: detuned saws through a lowpass that opens, swelling over its four bars from `from` (0-1) to `to`. */
    const swell = (at: number, chord: string[], from: number, to: number, cut: boolean) => {
      const len = barLen * 4;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 1.5;
      filter.frequency.setValueAtTime(400 * Math.pow(7, from), at);
      filter.frequency.exponentialRampToValueAtTime(400 * Math.pow(7, to), at + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.15 + 0.85 * from, at + 0.4);
      g.gain.linearRampToValueAtTime(0.15 + 0.85 * to, at + len - (cut ? 0.05 : 0));
      // At the top it cuts dead, back to the arpeggio alone; otherwise it hands over to the next chord's swell.
      g.gain.linearRampToValueAtTime(0, at + len + (cut ? 0 : 0.4));
      filter.connect(g).connect(mix);
      for (const n of chord)
        for (const detune of [-9, 9]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = hz(n);
          o.detune.value = detune;
          const lv = ctx.createGain();
          lv.gain.value = 0.004;
          o.connect(lv).connect(filter);
          o.start(at);
          o.stop(at + len + 0.5);
        }
    };

    const playBar = (at: number, bar: number) => {
      const inForm = bar % BOSS_FORM_BARS;
      const index = Math.floor(inForm / 4) % BOSS_CHORDS.length;
      const inChord = inForm % 4;
      const c = BOSS_CHORDS[index];
      if (inChord === 0) this.hearChord(c.arp.flat().map(midiOf), this.until(at));
      if (inForm === 0) {
        // The arpeggio's filter opens across the form, and closes again as it comes back round.
        arpFilter.frequency.setValueAtTime(1100, at);
        arpFilter.frequency.linearRampToValueAtTime(2600, at + formLen - barLen);
      }
      if (inChord === 0) {
        // The bass: a deep held note, a triangle and a sine an octave apart.
        this.note(at, hz(c.bass), barLen * 4 - 0.4, { gain: 0.05, type: 'triangle', attack: 0.4, release: 1.2, cutoff: 260, out: mix });
        this.note(at, hz(c.bass) * 2, barLen * 4 - 0.4, { gain: 0.018, type: 'sine', attack: 0.8, release: 1.2, out: mix });
        // The haze joins at the ninth bar.
        if (inForm >= 8) this.haze(at, barLen * 4, c.haze, hard, inForm === 8, mix, CAMPAIGN_HAZE * 0.5);
        // The melody, from the ninth bar to the twenty-fourth: each note held until the next.
        if (inForm >= 8 && inForm < 24) {
          const phrase = BOSS_PHRASES[inForm / 4 - 2];
          phrase.forEach(([e, n], i) => lead(at + e * eighth, hz(n), 0.02 * (e % 8 === 0 ? 1 : 0.85), ((phrase[i + 1]?.[0] ?? 32) - e) * eighth - 0.15));
        }
        // The climb's swelling chord, over the last eight bars.
        if (inForm >= 24) swell(at, c.swell, inForm === 24 ? 0 : 0.5, inForm === 24 ? 0.5 : 1, inForm === 28);
      }
      // The pulse, on every beat: the root, a low sine with a little triangle, the second and fourth an octave up.
      // Everything else dips as it lands and breathes back.
      for (let k = 0; k < 4; k++) {
        const t = at + k * beat;
        const d = this.until(t);
        const f = hz(c.bass) * (k % 2 ? 4 : 2);
        mix.gain.setTargetAtTime(0.78, t, 0.01);
        mix.gain.setTargetAtTime(1, t + 0.05, 0.16);
        this.voice(f, { dur: beat * 0.9, attack: 0.02, gain: k % 2 ? 0.018 : 0.026, delay: d, out: bus });
        this.voice(f, { dur: beat * 0.6, attack: 0.02, gain: 0.006, type: 'triangle', cutoff: 1200, delay: d, out: bus });
      }
      // The arpeggio, always; the second, an octave up and a sixteenth behind, from the seventeenth bar.
      const notes = c.arp[c.arp.length > 1 && inChord >= 2 ? 1 : 0];
      arpBar(at, notes, 1, 0, 0.04, arpLeft);
      if (inForm >= 16 && inForm < 24) arpBar(at, notes, 2, eighth / 2, 0.016, arpRight);
      // The climb, over the last eight bars: the melody's voice in steady eighths up the chord, growing louder.
      if (inForm >= 24) {
        const k = inForm - 24;
        const tones = new Set(c.arp.flat().map((n) => midiOf(n) % 12));
        const ladder: number[] = [];
        for (let n = midiOf('D5'); n <= midiOf('E7'); n++) if (tones.has(n % 12)) ladder.push(n);
        const lo = Math.min(ladder.length - 5, Math.floor(k * 1.1));
        const five = ladder.slice(lo, lo + 5);
        [0, 1, 2, 3, 4, 3, 2, 1].forEach((j, e) => {
          const progress = (k + e / 8) / 8;
          lead(at + e * eighth, hzOf(five[j]), 0.012 + 0.016 * progress, eighth * 0.95);
        });
      }
    };

    let next = t0;
    let bar = 0;
    const tick = () => {
      if (this.playing !== 'boss') return;
      while (next < ctx.currentTime + 0.5) {
        playBar(next, bar);
        next += barLen;
        bar++;
      }
    };
    tick();
    this.every(tick, 100);
  }

  /** Fade the score out (or cut it at once, when the app is being hidden). */
  stopMusic(immediate = false) {
    if (!this.playing || !this.ctx || !this.musicBus) return;
    const buses = this.faders(this.playing).map(([bus]) => bus);
    this.playing = null;
    this.musicRun++;
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
