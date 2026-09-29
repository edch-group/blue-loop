import { petalBackdrop } from './art';
import { reducedMotion } from './fx';

/**
 * The petal mandala behind everything. Mounted once (outside the
 * re-rendered game root, so it never restarts), rotated frame by frame:
 * a slow constant drift, plus a burst of speed each time a move is made.
 * A glow at its centre turns red as the viewer's own sun overheats and
 * blue as it cools below 0.
 */
class Backdrop {
  private el: HTMLElement | null = null;
  private outer: SVGGElement | null = null;
  private inner: SVGGElement | null = null;
  private angle = 0;
  /** Extra degrees still to be spun off by the current burst(s). */
  private burst = 0;
  private tint = 0;
  private tintTarget = 0;
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
    this.burst = Math.min(this.burst + 28, 90);
  }

  /** -1 = as cold as a sun can be (blue), 0 = neutral (white), 1 = on the edge of supernova (red). */
  setHeat(t: number) {
    this.tintTarget = Math.max(-1, Math.min(1, t));
  }

  private frame(now: number) {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    // Base drift: one turn every 3 minutes. Bursts decay smoothly.
    const drift = 2 * dt;
    const spent = this.burst * Math.min(1, dt * 2.2);
    this.burst -= spent;
    this.angle = (this.angle + drift + spent) % 360;
    this.outer?.setAttribute('transform', `rotate(${this.angle.toFixed(3)} 500 170)`);
    this.inner?.setAttribute('transform', `rotate(${(-this.angle * 0.6).toFixed(3)} 500 170)`);
    if (Math.abs(this.tint - this.tintTarget) > 0.002) {
      this.tint += (this.tintTarget - this.tint) * Math.min(1, dt * 1.5);
      this.applyTint();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  private applyTint() {
    if (!this.el) return;
    const t = Math.abs(this.tint);
    // Deep red when hot, icy blue when cold.
    const [r, g, b] = this.tint >= 0 ? [226, 84, 66] : [74, 142, 226];
    const mix = (from: number, to: number, k: number) => Math.round(from + (to - from) * k);
    // The petals only take a light wash of the colour, so the page stays easy to read;
    // the strong colour sits in a glow at the centre of the mandala.
    const k = t * 0.35;
    const stroke = `rgba(${mix(255, r, k)}, ${mix(255, g, k)}, ${mix(255, b, k)}, 0.95)`;
    const fill = `rgba(${mix(255, r, k)}, ${mix(255, g, k)}, ${mix(255, b, k)}, 0.26)`;
    this.el.style.setProperty('--petal-stroke', stroke);
    this.el.style.setProperty('--petal-fill', fill);
    this.el.style.setProperty('--heat-colour', `rgb(${r}, ${g}, ${b})`);
    this.el.style.setProperty('--heat-glow', (t * 0.8).toFixed(3));
  }
}

export const backdrop = new Backdrop();
