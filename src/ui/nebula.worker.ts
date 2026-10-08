/** Works out a campaign landscape off the page's thread (see nebula-geometry.ts) and hands its buffers back. */
import { buildNebula, type Strip } from './nebula-geometry';

self.onmessage = (e: MessageEvent<{ seed: number; strip: Strip }>) => {
  const g = buildNebula(e.data.seed, e.data.strip);
  (self as unknown as Worker).postMessage(g, [g.ground.buffer, g.stars.buffer]);
};
