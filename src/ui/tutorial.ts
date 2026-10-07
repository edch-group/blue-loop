/**
 * The campaign's tutorial: the oracle's tours, of the campaign map (as a first campaign begins) and of the
 * battle board (in its first battle), which teaches the card game itself. Shown by tour.ts.
 *
 * He speaks in a line or two, one thing at a time, and never of the game as a game.
 */
import type { TourStep } from './tour';

/** The campaign map, as a first run begins: `home` is where the flagship arrives, `hole` the wormhole past the far end. */
export function mapTour(home: string, hole: string | null): TourStep[] {
  const node = (id: string) => `[data-act="cmp-select"][data-arg="${id}"]`;
  const purse = (n: number) => `.cmp-purse > span:nth-child(${n})`;
  return [
    { title: 'a dying universe', text: 'This universe is coming apart behind you. Come, let me show you how to outrun it.' },
    { title: 'your flagship', text: 'Your flagship. Select it, then a neighbouring star, to move or attack. Any way you like.', shapes: [{ sel: '.cmp-ship-hull', circle: { r: 0.85 } }] },
    { title: 'the way', text: 'Lanes of stars run the length of this reach, crossing as they go. The far end is where you must be.', shapes: [{ sel: node(home), circle: { r: 0.62 } }] },
    ...(hole ? [{ title: 'the wormhole', text: 'A Stellari bloom, and a wormhole torn open beside it. Its guardian will not stand aside.', shapes: [{ sel: node(hole), circle: { r: 0.62 } }] }] : []),
    { title: 'credits', text: 'Credits. Every world you take pays once. They repair and arm your ship.', shapes: [{ sel: purse(1), round: 'pill' as const }] },
    { title: 'materials', text: 'Materials. Trade them for cards at space stations.', shapes: [{ sel: purse(2), round: 'pill' as const }] },
    { title: 'research', text: 'Research. It grows each turn, and buys the secrets of research stations.', shapes: [{ sel: purse(3), round: 'pill' as const }] },
    { title: 'your conquests', text: 'Worlds conquered here. The more you take, the more petals you grab at the wormhole.', shapes: [{ sel: purse(4), round: 'pill' as const }] },
    { title: 'petals', text: 'Stellari petals. They outlast everything, even you.', shapes: [{ sel: purse(5), round: 'pill' as const }] },
    { title: 'stability', text: 'When this runs dry, the reach collapses from the end you came in by, a column at a time. Keep ahead of it.', shapes: [{ sel: '.cmp-stability' }] },
    { title: 'your base', text: 'Your base: your deck, your hero, your ship.', shapes: [{ sel: '.cmp-base-btn' }] },
    { title: 'end the turn', text: 'When you are done, end the turn. The raiders will move.', shapes: [{ sel: '[data-act="cmp-end-turn"]' }] },
    { title: 'go', text: 'Now, go. I will meet you in battle.' },
  ];
}

/** The battle board, in a first campaign battle: the card game, piece by piece. */
export function battleTour(): TourStep[] {
  const mine = '.tableau-mine';
  const rival = '.tableau-rival';
  return [
    { title: 'the battle', text: 'Your side is near; theirs is far.', shapes: [{ sel: '.board-plane', pad: 0 }] },
    { title: 'your sun', text: 'Your sun: its heat, over what it can bear. Let it reach that, and you burn.', shapes: [{ sel: `${mine} .vit`, circle: { r: 0.42 } }] },
    { title: 'their sun', text: 'Theirs. Burn it out, and the day is yours.', shapes: [{ sel: `${rival} .vit`, circle: { r: 0.42 } }] },
    { title: 'the planets', text: 'Your planets turn, each facing you three days with its own gift.', shapes: [{ sel: `${mine} .vit`, circle: { r: 0.6 } }] },
    { title: 'this planet', text: 'The one facing you now, and the days it stays.', shapes: [{ sel: `${mine} .vit-planet-tag` }] },
    { title: 'shields', text: 'Shields catch heat before it reaches your sun. They fade at dawn.', shapes: [{ sel: '.board-shields-mine', circle: { r: 0.6 } }] },
    { title: 'your slots', text: 'Your cards stand here. The middle guards them best.', shapes: [{ sel: `${mine} .tableau-row [data-slot]`, all: true, pad: 3 }] },
    { title: 'your hero', text: 'Play your hero here, and they lead.', shapes: [{ sel: `${mine} .cmd-slot`, pad: 4 }] },
    { title: 'lightspeed', text: "A hidden trap. It springs on your rival's day.", shapes: [{ sel: `${mine} .ls-slot`, pad: 4 }] },
    { title: 'your hand', text: 'Drag a card onto a slot to play it.', shapes: [{ sel: '.table-view > .dock:not(.dock-space) .hand > .card', all: true, pad: 3 }] },
    { title: 'energy', text: 'Energy pays for cards. Spent, end your day.', shapes: [{ sel: '.turn-controls' }] },
    { title: 'the stellari', text: 'The Stellari keeps time: dawn, day, dusk.', shapes: [{ sel: '.board-star-slot', circle: { r: 0.5 } }] },
    { title: 'deck and discard', text: 'Your deck, and the cards that have left play.', shapes: [{ sel: `${mine} .tableau-piles`, pad: 4 }] },
    { title: 'their side', text: 'Strike their cards, or strike their sun.', shapes: [{ sel: `${rival} .tableau-row`, pad: 6 }] },
    { title: 'your move', text: 'Your move.' },
  ];
}
