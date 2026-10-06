import { describe, expect, it } from 'vitest';
import { isProfane } from '../src/engine/profanity';

describe('the profanity filter', () => {
  it('catches profanity, however it is dressed up', () => {
    for (const t of ['fuck', 'Fuuuuck off', 'F u c k', 'sh1t deck', 'xXshitXx', 'b!tch', 'a$$hole', 'Dickhead', 'wankers', 'c u n t', 'fuckwit', 'Hitler Youth', 'n1gger', 'tits out']) expect(isProfane(t), t).toBe(true);
  });

  it('leaves innocent names and notes alone', () => {
    for (const t of ['Scunthorpe', 'class act', 'Dickens', 'Cocktail Hour', 'Assassin', 'Grass Roots', 'Bass Drum', 'Therapist', 'Sussex', 'Shitake', 'Peacock', 'Pissarro', 'Hancock', 'Essex', 'Arsenal', 'Analyst', 'Torpedo', 'Snigger', 'Bo', 'Commander', 'Night Court', 'Ramp, then dump it all into Solar Torrent.', 'Cheap Darkspeed attackers wear their cards down']) expect(isProfane(t), t).toBe(false);
  });
});
