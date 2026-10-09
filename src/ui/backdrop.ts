import { petalBackdrop } from './art';
import { reducedMotion } from './fx';

/**
 * The petal mandala behind everything. Mounted once (outside the
 * re-rendered game root, so it never restarts), rotated frame by frame:
 * a slow constant drift, plus a burst of speed each time a move is made.
 * A glow at its centre turns red as the viewer's own sun overheats and
 * blue as it cools below 0.
 */
/** How far, and over how long, a move spins the star. */
const BURST_DEG = 30;
const BURST_MS = 1800;
/** Gentle at both ends (a sine ease: no sudden start or stop). */
const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;
/** A heat wave: how far the star whirls, how fast it flushes red, and how slowly it cools again. */
const WAVE_SPIN_DEG = 120;
export const RAGE_IN_MS = 200;
const RAGE_OUT_MS = 600;

class Backdrop {
  private el: HTMLElement | null = null;
  private outer: SVGGElement | null = null;
  private inner: SVGGElement | null = null;
  private angle = 0;
  /**
   * Bursts of spin from moves: each turns the star a set amount over a set time, easing in and out,
   * timed by the clock (so a frame that a re-render holds up does not jolt it). Overlapping bursts add up.
   */
  private bursts: { start: number; deg: number }[] = [];
  private tint = 0;
  private tintTarget = 0;
  /** A heat wave gathering: the star whirls and flushes red (0 to 1), then lets it go. */
  private rages: { start: number; hold: number }[] = [];
  private rage = 0;
  private last = 0;

  mount() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.className = 'backdrop';
    this.el.innerHTML = petalBackdrop();
    document.body.prepend(this.el);
    this.outer = this.el.querySelector('.petal-outer');
    this.inner = this.el.querySelector('.petal-inner');
    this.applyTint();
    requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * Lay the star in a slot on the battle board (under the display cards), or
   * return it to fill the screen when there is no slot. The element is moved,
   * not recreated, so its rotation carries on smoothly.
   */
  attach(slot: HTMLElement | null) {
    if (!this.el) return;
    const svg = this.el.querySelector('svg');
    if (slot) {
      if (this.el.parentElement !== slot) slot.appendChild(this.el);
      this.el.classList.add('backdrop-board');
      // Frame the whole mandala, centred, rather than the screen-filling crop.
      svg?.setAttribute('viewBox', '110 -220 780 780');
      svg?.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    } else {
      if (this.el.parentElement !== document.body) document.body.prepend(this.el);
      this.el.classList.remove('backdrop-board');
      svg?.setAttribute('viewBox', '0 -300 1000 900');
      svg?.setAttribute('preserveAspectRatio', 'xMidYMin slice');
    }
  }

  /** A move was made: spin faster for a moment. */
  spin() {
    if (reducedMotion()) return;
    // At most a few at once, so a flurry of moves does not whirl it.
    if (this.bursts.length >= 3) return;
    this.bursts.push({ start: performance.now(), deg: BURST_DEG });
  }

  /**
   * The Stellari looses a heat wave: it whirls round and turns red (eased in over RAGE_IN_MS), holds red while
   * the wave goes out (`holdMs`), then cools back to its colour.
   */
  heatWave(holdMs: number) {
    if (reducedMotion()) return;
    const now = performance.now();
    this.rages.push({ start: now, hold: holdMs });
    this.bursts.push({ start: now, deg: WAVE_SPIN_DEG });
  }

  /** -1 = as cold as a sun can be (blue), 0 = neutral (white), 1 = on the edge of supernova (red). */
  setHeat(t: number) {
    this.tintTarget = Math.max(-1, Math.min(1, t));
  }

  private frame(now: number) {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    // Base drift: one turn every 3 minutes. Finished bursts fold into the angle; running ones ease along.
    // (The angle wraps at 1800°, five outer turns and three inner ones (at 0.6×), so neither ring ever
    // jumps: wrapping at 360° snapped the inner ring back by 216° once a turn.)
    this.angle = (this.angle + 2 * dt) % 1800;
    let extra = 0;
    this.bursts = this.bursts.filter((b) => {
      const t = (now - b.start) / BURST_MS;
      if (t >= 1) {
        this.angle = (this.angle + b.deg) % 1800;
        return false;
      }
      extra += b.deg * easeInOut(Math.max(0, t));
      return true;
    });
    const a = this.angle + extra;
    this.outer?.setAttribute('transform', `rotate(${a.toFixed(3)} 500 170)`);
    this.inner?.setAttribute('transform', `rotate(${(-a * 0.6).toFixed(3)} 500 170)`);
    let tinted = false;
    if (Math.abs(this.tint - this.tintTarget) > 0.002) {
      this.tint += (this.tintTarget - this.tint) * Math.min(1, dt * 1.5);
      tinted = true;
    }
    // A heat wave's flush of red: in over RAGE_IN_MS, held, then out over RAGE_OUT_MS.
    let rage = 0;
    this.rages = this.rages.filter((r) => {
      const t = now - r.start;
      if (t > RAGE_IN_MS + r.hold + RAGE_OUT_MS) return false;
      const k = t < RAGE_IN_MS ? easeInOut(t / RAGE_IN_MS) : t < RAGE_IN_MS + r.hold ? 1 : 1 - easeInOut((t - RAGE_IN_MS - r.hold) / RAGE_OUT_MS);
      rage = Math.max(rage, k);
      return true;
    });
    if (rage !== this.rage) {
      this.rage = rage;
      tinted = true;
    }
    if (tinted) this.applyTint();
    requestAnimationFrame((t) => this.frame(t));
  }

  private applyTint() {
    if (!this.el) return;
    const mix = (from: number, to: number, k: number) => Math.round(from + (to - from) * k);
    // Deep red when hot, icy blue when cold; and red, strongly, while it looses a heat wave.
    const base = this.tint >= 0 ? [226, 84, 66] : [74, 142, 226];
    const RED = [222, 52, 38];
    const [r, g, b] = base.map((v, i) => mix(v, RED[i], this.rage));
    const t = Math.max(Math.abs(this.tint), this.rage);
    // The petals only take a light wash of the colour, so the page stays easy to read;
    // the strong colour sits in a glow at the centre of the mandala (a heat wave floods the petals too).
    const k = Math.max(Math.abs(this.tint) * 0.35, this.rage * 0.9);
    const stroke = `rgba(${mix(255, r, k)}, ${mix(255, g, k)}, ${mix(255, b, k)}, 0.95)`;
    const fill = `rgba(${mix(255, r, k)}, ${mix(255, g, k)}, ${mix(255, b, k)}, 0.26)`;
    this.el.style.setProperty('--petal-stroke', stroke);
    this.el.style.setProperty('--petal-fill', fill);
    this.el.style.setProperty('--heat-colour', `rgb(${r}, ${g}, ${b})`);
    this.el.style.setProperty('--heat-glow', (t * 0.8).toFixed(3));
  }
}

export const backdrop = new Backdrop();
