/**
 * The campaign's tutorial: the oracle's tours, of the campaign map (as a first campaign begins) and of the
 * battle board (in its first battle), which teaches the card game itself. Shown by tour.ts.
 */
import type { TourStep } from './tour';

/** The campaign map, as a first campaign begins: `home` and `gate` are the player's home system and its one route out. */
export function mapTour(home: string, gate: string | null): TourStep[] {
  const node = (id: string) => `[data-act="cmp-select"][data-arg="${id}"]`;
  return [
    {
      title: 'a dying universe',
      text: "I am Oriel. The stars are going out, and four peoples fight over the last warm worlds. Let me show you how to survive it. You can turn this tutorial off, or back on, in the campaign's settings.",
    },
    {
      title: 'your home',
      text: 'This is your home system. Every system you hold pays you credits and materials each turn. Lose your home, and you lose its riches.',
      shapes: [{ sel: node(home), circle: { r: 0.62 } }],
    },
    {
      title: 'your flagship',
      text: 'Your flagship, led by your hero. Select it, then a system next door: into one of yours it simply moves; into anyone else’s it attacks, and a battle is fought.',
      shapes: [{ sel: '.cmp-ship-hull', circle: { r: 0.85 } }],
    },
    ...(gate
      ? [
          {
            title: 'your first target',
            text: "One route leads out of your home, to a system cut off and failing: its sentinels' sun starts hot. Take it first.",
            shapes: [{ sel: node(gate), circle: { r: 0.62 } }],
          },
        ]
      : []),
    {
      title: 'what you hold',
      text: 'Credits run your ship and your systems; materials buy cards at space stations; wisdom buys research. Then the systems you hold, and your flagship.',
      shapes: [{ sel: '.cmp-purse', pad: 8 }],
    },
    {
      title: 'turns and stability',
      text: 'The turn count, and the region’s stability. As the universe dims, stars collapse; hold most of the map, or claim the Heart at its centre, to win.',
      shapes: [{ sel: '.cmp-top-left', pad: 6 }],
    },
    {
      title: 'your base',
      text: "Your base: your flagship's deck (ten cards at most, your hero among them), your hero's skills, your ship's upgrades and your missions.",
      shapes: [{ sel: '.cmp-base-btn', pad: 6 }],
    },
    {
      title: 'end the turn',
      text: 'When you have moved and spent what you want, end the turn: the other factions move, your systems pay out, and a new turn begins.',
      shapes: [{ sel: '[data-act="cmp-end-turn"]', pad: 6 }],
    },
    {
      title: 'settings',
      text: 'The settings: the tutorial and my counsel can be turned on or off here, and the rules are always here to read.',
      shapes: [{ sel: '[data-act="cmp-menu"]', pad: 6 }],
    },
    {
      title: 'go',
      text: 'Select your flagship, then the system next door, and attack. When the battle begins, I will show you how to fight it.',
    },
  ];
}

/** The battle board, in a first campaign battle: the card game, piece by piece. */
export function battleTour(): TourStep[] {
  const mine = '.tableau-mine';
  const rival = '.tableau-rival';
  return [
    {
      title: 'the battle',
      text: 'Every battle is fought on this board: your side nearest you, your rival across from you. Each of you has a sun. Overheat theirs before they overheat yours.',
      shapes: [{ sel: '.board-plane', pad: 0 }],
    },
    {
      title: 'your sun',
      text: "Your sun. The big number is its heat; beneath it, its max health. If its heat reaches its max health, it goes supernova, and you lose. Nearer the Heart, suns hold more.",
      shapes: [{ sel: `${mine} .vit`, circle: { r: 0.42 } }],
    },
    {
      title: "your rival's sun",
      text: 'Theirs. Heat it to its max health and you win. Your cards heat it each dawn, and your attacks strike it.',
      shapes: [{ sel: `${rival} .vit`, circle: { r: 0.42 } }],
    },
    {
      title: 'the planets',
      text: 'Three planets circle your sun, each facing it for three days in turn. The dead one gives nothing; the abundant one, a card more each day; the industrial one, an energy more. The tag names the one facing you, and its days left.',
      shapes: [{ sel: `${mine} .vit`, circle: { r: 0.6 } }, { sel: `${mine} .vit-planet-tag`, pad: 4 }],
    },
    {
      title: 'shields',
      text: "Your shields. Each one soaks up one heat from your rival before it reaches your sun. They fade at your dawn, so raise them again each day (your ship's own shields hold through the first).",
      shapes: [{ sel: '.board-shields-mine', circle: { r: 0.6 } }],
    },
    {
      title: 'your slots',
      text: 'Five slots for your cards. A played card stands in one, and fires its dawn effect every day. The middle slots are the safest: the shield on each is the defence it gives the card in it.',
      shapes: [{ sel: `${mine} .tableau-row [data-slot]`, all: true, pad: 3 }],
    },
    {
      title: 'your hero',
      text: 'Your hero leads from their own slot, from the first day. Beaten, they are wounded for a day, then return.',
      shapes: [{ sel: `${mine} .cmd-slot`, pad: 4 }],
    },
    {
      title: 'lightspeed',
      text: "The lightspeed slot. A lightspeed card is set here face down, and springs during your rival's day, when what it waits for happens.",
      shapes: [{ sel: `${mine} .ls-slot`, pad: 4 }],
    },
    {
      title: 'your hand',
      text: 'Your hand. Drag a card onto a slot to play it. The dots on a card are its energy cost; its text says what it does when played and at each dawn or dusk.',
      shapes: [{ sel: '.table-view > .dock:not(.dock-space) .hand > .card', all: true, pad: 3 }],
    },
    {
      title: 'energy and your day',
      text: 'Your energy: one on your first day, two on your second, then more. Spend it on cards, attack with cards that can, then end your day. In a campaign, cards stay until destroyed, and a destroyed one is gone for the battle.',
      shapes: [{ sel: '.turn-controls', pad: 6 }],
    },
    {
      title: 'dawn, day and dusk',
      text: 'The Stellari counts the rounds. Each day runs dawn (your cards fire), day (you play), dusk (cooling). Whose day it is shows on its left; the phase, on its right.',
      shapes: [{ sel: '.board-star-slot', circle: { r: 0.5 } }, { sel: '.phase-track', pad: 6 }, { sel: '.turn-who', pad: 6 }],
    },
    {
      title: 'deck and discard',
      text: 'Your deck and discard pile, and the cards in your hand. In a campaign there is no shuffling back: plan with what you have.',
      shapes: [{ sel: `${mine} .tableau-piles`, pad: 4 }],
    },
    {
      title: 'their side',
      text: "Their cards. A card of yours with attack can strike one of theirs (which hits back) or their sun, once a day. Wear their defences down, then strike where it hurts.",
      shapes: [{ sel: `${rival} .tableau-row`, pad: 6 }],
    },
    {
      title: 'your move',
      text: 'That is all you need. Play a card, attack if you can, and end your day. Win, and you may salvage one of their cards.',
    },
  ];
}
