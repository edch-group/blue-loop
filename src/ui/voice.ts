import { pageRect } from './viewport';
import { sound } from './sound';

/**
 * Command cards are heroes: each says a line as it takes the field, shown as a
 * caption beside the card, and spoken when that line has been recorded.
 */

/**
 * Recorded lines, found by file name: src/assets/voice/<card id>-<line>.mp3, where <line> counts from 0 in that
 * hero's lines below. Made from raw takes in voice-raw/ by `npm run voice`.
 */
const RECORDED: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../assets/voice/*.mp3', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [
    path.replace(/^.*\/|\.mp3$/g, ''),
    url,
  ]),
);

interface Hero {
  lines: string[];
}

const HEROES: Record<string, Hero> = {
  // Aureline: the sun-priests.
  command_directive: { lines: ['The light holds. Take your places.', 'By the white flame, we stand.', 'Solarch Veyra, at your side.'] },
  ignition_protocol: { lines: ['Light them up!', 'Sol-Marshal Aurex. Let them burn.', 'Every star can be made to blaze.'] },
  // Xel'Naru: the crystal ascetics.
  war_council: { lines: ['Nothing is lost. Everything returns.', 'The shards remember.', 'Archon Seris. The council is with you.'] },
  coolant_protocol: { lines: ['Be still. Be cold. Be certain.', 'Hierarch Vael. Let the fire fade.', 'Patience is a blade of ice.'] },
  // Vorthane: the tide fleets.
  tide_regent: { lines: ['The tide rises with us.', 'Tide-Regent Osshara. Hold the line.', 'Let them break upon us.'] },
  the_admiralty: { lines: ['The Admiralty has the fleet.', 'All hands. Shields to full.', 'We have weathered worse than you.'] },
  // Ixquor: the hive.
  chamber_protocol: { lines: ['Grow, my children. Grow.', "Ul'Kha wakes. The brood follows.", 'Every root, a promise.'] },
  logistics_command: { lines: ['The hive speaks through me.', 'Zyth hears. Zyth obeys. Zyth spreads.', 'Many voices. One will.'] },
  // The greatest of each race: a big price, a bigger entrance.
  empress_solenne: { lines: ['Kneel before the dawn.', 'Empress Solenne. Burn.', 'I am the light that ends you.'] },
  the_shardmind: { lines: ['We are many. We are one. We are cold.', 'The Shardmind wakes.', 'All that was lost, returns.'] },
  leviathan_thoross: { lines: ['The deep has come for you.', 'Thoross rises. The sea follows.', 'Nothing passes the Leviathan.'] },
  the_worldroot: { lines: ['Every world is soil.', 'The Worldroot stirs. Grow.', 'From one root, a thousand.'] },
};

class HeroLines {
  private last: Record<string, number> = {};
  private caption: HTMLElement | null = null;
  private captionTimer = 0;

  /** A hero takes the field: show one of their lines (not the one they said last) beside their card. */
  speak(defId: string, card: Element | null) {
    const hero = HEROES[defId];
    if (!hero) return;
    const n = hero.lines.length;
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === this.last[defId]) i = (i + 1) % n;
    this.last[defId] = i;
    this.showCaption(hero.lines[i], card);
    const recording = RECORDED[`${defId}-${i}`];
    if (recording) sound.clip(recording);
  }

  private showCaption(text: string, card: Element | null) {
    this.caption?.remove();
    window.clearTimeout(this.captionTimer);
    const el = document.createElement('div');
    el.className = 'hero-line';
    el.textContent = `“${text}”`;
    document.body.appendChild(el);
    if (card) {
      const r = pageRect(card);
      el.style.left = `${r.left + r.width / 2}px`;
      // Above the card, or below it when it sits at the top of the board (the rival's side).
      const below = r.top < 70;
      el.style.top = `${below ? r.bottom : r.top}px`;
      el.classList.toggle('hero-line-below', below);
    } else el.classList.add('hero-line-free');
    this.caption = el;
    this.captionTimer = window.setTimeout(() => {
      el.classList.add('hero-line-out');
      window.setTimeout(() => el.remove(), 400);
    }, 2600 + text.length * 30);
  }
}

export const voices = new HeroLines();
