import { petalBackdrop } from './art';
import { reducedMotion } from './fx';

/**
 * The petal mandala behind everything. Mounted once (outside the
 * re-rendered game root, so it never restarts), rotated frame by frame:
 * a slow constant drift, plus a burst of speed each time a move is made.
 * It warms from white towards red as the viewer's own sun overheats.
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

  /** A move was made: spin faster for a moment. */
  spin() {
    if (reducedMotion()) return;
    this.burst = Math.min(this.burst + 28, 90);
  }

  /** 0 = cool (white), 1 = on the edge of supernova (red). */
  setHeat(t: number) {
    this.tintTarget = Math.max(0, Math.min(1, t));
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
    const t = this.tint;
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
    // White petals → warm ember → deep red as the sun nears supernova.
    const stroke = `rgba(${mix(255, 232)}, ${mix(255, 98)}, ${mix(255, 80)}, ${0.95})`;
    const fill = `rgba(${mix(255, 240)}, ${mix(255, 120)}, ${mix(255, 100)}, ${(0.26 + t * 0.1).toFixed(3)})`;
    this.el.style.setProperty('--petal-stroke', stroke);
    this.el.style.setProperty('--petal-fill', fill);
    this.el.style.setProperty('--heat-glow', (t * 0.55).toFixed(3));
  }
}

export const backdrop = new Backdrop();
