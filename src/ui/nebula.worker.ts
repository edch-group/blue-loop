/** Works out a campaign nebula off the page's thread (see nebula-geometry.ts) and hands its buffers back. */
import { buildNebula } from './nebula-geometry';

self.onmessage = (e: MessageEvent<number>) => {
  const g = buildNebula(e.data);
  (self as unknown as Worker).postMessage({ seed: e.data, ...g }, [g.faces.buffer, g.lines.buffer]);
};
