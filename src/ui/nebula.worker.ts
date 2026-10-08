/** Works out a campaign nebula off the page's thread (see nebula-geometry.ts) and hands its buffers back. */
import { buildNebula, type Strip } from './nebula-geometry';

self.onmessage = (e: MessageEvent<{ seed: number; strip: Strip }>) => {
  const g = buildNebula(e.data.seed, e.data.strip);
  (self as unknown as Worker).postMessage(g, [g.dots.buffer, g.haze.buffer]);
};
