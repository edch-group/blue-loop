/**
 * Synthesised sound effects (Web Audio, no asset files). Placeholders until
 * recorded audio arrives: each effect is one method, so swapping in samples
 * later only touches this file.
 */

const PREFS_KEY = 'blue-loop:sound';

type Wave = OscillatorType;

class SoundBoard {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastHover = 0;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(PREFS_KEY) === 'muted';
    } catch {
      // Storage unavailable: default to sound on.
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(PREFS_KEY, this.muted ? 'muted' : 'on');
    } catch {
      // ignore
    }
  }

  /** Browsers only allow audio after a user gesture; call from input handlers. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ready(): AudioContext | null {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private tone(freq: number, dur: number, opts: { type?: Wave; gain?: number; to?: number; delay?: number; attack?: number } = {}) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, opts: { freq: number; to?: number; q?: number; gain?: number; type?: BiquadFilterType; delay?: number; attack?: number }) {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuf) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.Q.value = opts.q ?? 1;
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  hover() {
    const now = performance.now();
    if (now - this.lastHover < 60) return;
    this.lastHover = now;
    this.tone(2100, 0.05, { gain: 0.025 });
  }
  draw(delay = 0) {
    this.noise(0.14, { freq: 2500, to: 6000, q: 0.8, gain: 0.12, delay });
    this.tone(880, 0.06, { gain: 0.02, delay: delay + 0.04 });
  }
  shuffle() {
    for (let i = 0; i < 7; i++) this.noise(0.07, { freq: 1800 + Math.random() * 2000, q: 1.2, gain: 0.1, delay: i * 0.055 });
  }
  play() {
    this.noise(0.22, { freq: 900, to: 3200, q: 0.7, gain: 0.12 });
    this.tone(520, 0.18, { gain: 0.06, to: 780, delay: 0.03 });
  }
  buy() {
    this.tone(660, 0.25, { gain: 0.08 });
    this.tone(990, 0.35, { gain: 0.07, delay: 0.08 });
    this.tone(1320, 0.4, { gain: 0.04, delay: 0.16 });
  }
  flare() {
    this.noise(0.55, { freq: 300, to: 2400, type: 'lowpass', q: 4, gain: 0.25, attack: 0.05 });
    this.tone(90, 0.5, { type: 'sawtooth', gain: 0.05, to: 240 });
  }
  thermo() {
    this.noise(0.6, { freq: 7000, to: 1500, type: 'highpass', q: 0.8, gain: 0.12, attack: 0.04 });
    [1760, 1320, 990].forEach((f, i) => this.tone(f, 0.3, { gain: 0.035, delay: i * 0.08 }));
  }
  impact(hot: boolean) {
    this.tone(hot ? 140 : 300, 0.3, { type: 'triangle', gain: 0.14, to: hot ? 55 : 180 });
    this.noise(0.18, { freq: hot ? 500 : 3000, q: 1, gain: 0.08 });
  }
  shield() {
    this.tone(1200, 0.3, { type: 'triangle', gain: 0.05, to: 1500 });
  }
  upgrade() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, { gain: 0.06, delay: i * 0.07 }));
  }
  objective() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.4, { gain: 0.05, delay: i * 0.09 }));
  }
  turn() {
    this.tone(523, 0.5, { gain: 0.06, attack: 0.03 });
    this.tone(784, 0.7, { gain: 0.05, delay: 0.12, attack: 0.03 });
  }
  endTurn() {
    this.noise(0.3, { freq: 3000, to: 600, q: 0.7, gain: 0.1 });
  }
  supernova() {
    this.noise(1.8, { freq: 2000, to: 80, type: 'lowpass', q: 1, gain: 0.35, attack: 0.02 });
    this.tone(60, 1.6, { type: 'sine', gain: 0.3, to: 30 });
  }
  error() {
    this.tone(180, 0.18, { type: 'square', gain: 0.04, to: 140 });
  }
}

export const sound = new SoundBoard();
