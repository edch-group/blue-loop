/**
 * The campaign's story: who speaks, and what they say, at each moment worth a scene.
 *
 * The universe is dying. Its stars gutter one by one, and the eight races fight over the last warm worlds.
 * All of them are making for the Heart, the vast star at the centre of everything, because of a legend: in
 * its light grows the Infinite Stellari, a flower whose bloom gives energy without end. Lesser blooms, the
 * Finite Stellari, are scattered on the way: rich, but they wilt.
 *
 * The guide is Oriel the Wanderer, who has walked between the stars since before they began to fade, and
 * speaks to every race alike. Generals are the races' heroes (the Hero cards).
 *
 * The Aureline were the flower's first keepers. They tended it in the Heart's light for an age and called
 * it Vitalia ("life-giver"); then they lost it, and the war that followed nearly wiped them out. The flower
 * itself is the white flower that turns on the game's landing page.
 */

import { RACE_NAMES } from '../races';

/** Who speaks a line: the guide, or a hero (by Hero card id) of a faction. */
export type Speaker = { kind: 'oracle' } | { kind: 'general'; card: string; faction: string };

export interface StoryLine {
  speaker: Speaker;
  text: string;
}

export interface StoryScene {
  /** What happened (each moment plays once per campaign). */
  id: string;
  title: string;
  lines: StoryLine[];
}

export const ORACLE_NAME = 'Oriel the Wanderer';
/** The star at the centre of the universe, and what is said to grow there. */
export const HEART_NAME = 'The Heart';
export const STELLARIA_NAME = 'Infinite Stellari';
/** What the Aureline, its first keepers, call it: roughly, "life-giver". */
export const VITALIA = 'Vitalia';

/** Each race's generals (Hero cards), in the order they join: the first leads the opening army. */
export const GENERALS: string[][] = [
  ['command_directive', 'ignition_protocol', 'empress_solenne'],
  ['war_council', 'coolant_protocol', 'the_shardmind'],
  ['tide_regent', 'the_admiralty', 'leviathan_thoross'],
  ['logistics_command', 'chamber_protocol', 'the_worldroot'],
  ['nyx_hero_vesh', 'nyx_hero_kael', 'nyx_hero_nyxara'],
  ['kor_hero_durga', 'kor_hero_brannoc', 'kor_hero_anvil_king'],
  ['ser_hero_ilyath', 'ser_hero_maren', 'ser_hero_aster'],
  ['pyr_hero_ignis', 'pyr_hero_ashka', 'pyr_hero_pyrrhus'],
];

/** Why each race marches on the Heart. */
const MOTIVE: string[] = [
  "The Aureline were the flower's first keepers. They tended it in the Heart's light for an age and named it Vitalia, the life-giver. Then they lost it, and the war that followed nearly wiped them out. What is left of them is coming home.",
  "The Xel'Naru keep every memory of their people in living crystal. The crystal needs light. In the dark, they forget, and then they are gone.",
  "The Vorthane's oceans are freezing from the surface down. The tide fleets have nowhere left to sail but out, and in, towards the Heart.",
  'The Ixquor hive is starving. Its spore-worlds rot under a cooling sun, and the hive does what hives do: it spreads, and it hungers.',
  "The Nyxari were born in the spaces between the stars, and the dark was always theirs. But the dark is growing, and it is hungry, and even the void-stalkers have learned to fear a night with nothing left in it to hunt.",
  'The Korrath forges have burned for ten thousand years, and now the coals are cooling. A smith without fire is only a mourner. They march to the Heart for a flame that will never need feeding again.',
  'The Seren read the future in the stars, and the stars are going out. Every night their charts have fewer lights to read. In the last of them, every reading says the same thing: the Heart, the flower, or nothing.',
  "The Pyrr are living flame, and their sun is the only thing that has ever kept them burning. It is guttering now, and so are they. They would rather burn out in the Heart's light than fade in the dark.",
];

/** What a general says on taking command (and on first meeting a rival). */
const GENERAL_LINES: Record<string, { join: string; taunt: string }> = {
  command_directive: { join: 'Solarch Veyra stands with you. We lost Vitalia once. We will not lose her again.', taunt: 'Vitalia was ours before your star was lit. Turn back.' },
  ignition_protocol: { join: 'Sol-Marshal Aurex. Point me at something, and watch it burn.', taunt: 'Every star can be made to blaze. Yours will be first.' },
  empress_solenne: { join: 'I am Solenne, last of the line that kept Vitalia. I have waited long enough. Kneel, and follow.', taunt: 'You stand between the Empress and the flower my mothers tended. Move.' },
  war_council: { join: 'Archon Seris. Nothing we lose is truly lost. The shards remember.', taunt: 'We have remembered a thousand like you. We will remember you, too.' },
  coolant_protocol: { join: 'Hierarch Vael. Patience is a blade of ice. I will lend you mine.', taunt: 'Be still. Be cold. Be certain. You are none of these.' },
  the_shardmind: { join: 'We are many voices in one crystal. The Shardmind wakes for you.', taunt: 'All that you are will be stored, and forgotten.' },
  tide_regent: { join: 'Tide-Regent Osshara. The tide rises with you, commander.', taunt: 'Let them break upon us, as every wave does.' },
  the_admiralty: { join: 'The Admiralty has the fleet. Give the word, and we sail.', taunt: 'We have weathered worse than you. We will weather you.' },
  leviathan_thoross: { join: 'Thoross rises from the deep. The sea follows where I go.', taunt: 'Nothing passes the Leviathan. Nothing.' },
  logistics_command: { join: 'Zyth hears. Zyth obeys. Zyth spreads.', taunt: 'Many voices. One will. Yours is not among them.' },
  chamber_protocol: { join: "Ul'Kha wakes, and the brood with her. Every root, a promise.", taunt: 'Grow, my children. There is so much here to eat.' },
  the_worldroot: { join: 'The Worldroot stirs beneath you. Every world is soil.', taunt: 'From one root, a thousand. From you, nothing.' },
  nyx_hero_vesh: { join: 'Shade-Queen Vesh. You will not see my people, commander. Neither will they, until it is too late.', taunt: 'Look closer. No: closer. There. You see? You were never alone.' },
  nyx_hero_kael: { join: 'Unmaker Kael. Whatever they build, I will take apart. It is what I am for.', taunt: 'Everything you have made can be unmade. I will show you how.' },
  nyx_hero_nyxara: { join: 'I am Nyxara, the Unlit. I was old when the first star woke. I will see the last one through.', taunt: 'Your light is small, and it is going out. I can wait.' },
  kor_hero_durga: { join: 'Forgemother Durga. Bring me the broken, and I will make them whole, and harder than before.', taunt: 'I have hammered stronger metal than you flat.' },
  kor_hero_brannoc: { join: 'Warden Brannoc. Stand behind me. Nothing gets past the wall.', taunt: 'Strike, then. The wall has been waiting.' },
  kor_hero_anvil_king: { join: 'The Anvil-King wakes, and the forges with him. Light the fires. We march.', taunt: 'Every world is ore. Yours will make a fine blade.' },
  ser_hero_ilyath: { join: 'Star-Reader Ilyath. I have read this war to its end, commander. Shall I tell you how to win it?', taunt: 'I have read your stars. They are very short.' },
  ser_hero_maren: { join: 'Tidecaster Maren. The worlds turn where I ask them. Tell me where you want them.', taunt: 'Your worlds are turning against you. I made sure of it.' },
  ser_hero_aster: { join: 'I am Aster, the Last Constellation. Every star that ever shone shines on in me. Follow the light.', taunt: 'You are not in any of my stars.' },
  pyr_hero_ignis: { join: 'Flame-Herald Ignis. Give me a target, and I will give it everything I have. All at once.', taunt: 'Burn bright, or do not burn at all. You chose the second.' },
  pyr_hero_ashka: { join: 'Cinder-Queen Ashka. Our sun runs hot, and so do we. Stoke it. We will thrive.', taunt: 'Feel that? That is only the warmth of my coming.' },
  pyr_hero_pyrrhus: { join: 'Pyrrhus, the Undying Flare. I have burned out a hundred times. I always rise again.', taunt: 'I will burn, and you will burn, and only one of us will rise.' },
};

const oracle = (text: string): StoryLine => ({ speaker: { kind: 'oracle' }, text });
const general = (card: string, faction: string, text: string): StoryLine => ({ speaker: { kind: 'general', card, faction }, text });

/** The opening: the dying universe, the legend, the player's race and its first general. */
export function introScene(race: number, faction: string): StoryScene {
  const first = GENERALS[race][0];
  return {
    id: 'intro',
    title: 'A dying universe',
    lines: [
      oracle(`I am ${ORACLE_NAME}. I have walked between the stars since before they began to go out. Now I walk among the ashes.`),
      oracle('The universe is dying. Star by star, the light is failing, and every race left alive is fighting over the last warm worlds.'),
      oracle(`But there is a legend. At the centre of all things burns ${HEART_NAME}, the oldest star, and in its light grows the ${STELLARIA_NAME}: a white flower whose bloom gives energy without end.`),
      oracle(
        race === 0
          ? `Your people know it is more than a legend. The Aureline kept it once, and called it ${VITALIA}, the life-giver. You remember what losing it cost.`
          : `It is more than a legend. It was kept, once, by the Aureline, who called it ${VITALIA}, the life-giver. They lost it, and very nearly everything else.`,
      ),
      oracle(MOTIVE[race]),
      general(first, faction, GENERAL_LINES[first].join),
      oracle(`Your armies march one route a turn. Take systems for their credits and materials, and press on towards ${HEART_NAME}. Recruit more generals as you grow: each leads an army with a deck of its own.`),
    ],
  };
}

/** A new general takes command of an army. */
export function recruitScene(card: string, faction: string): StoryScene {
  return { id: `recruit:${card}`, title: 'A new general', lines: [general(card, faction, GENERAL_LINES[card]?.join ?? 'I am ready.')] };
}

/** The player's first conquest. */
export function firstConquestScene(): StoryScene {
  return {
    id: 'first-conquest',
    title: 'The first world',
    lines: [
      oracle('Your first world. A settled world feeds your armies every turn; an absorbed one pays once, and is spent.'),
      oracle('And a burned one bars your rivals for a turn. A terrible thing to do to a star, when so few are left. Choose as well with the next.'),
    ],
  };
}

/** A rival faction, met for the first time: its general speaks, the player's answers. */
export function contactScene(rivalRace: number, rivalGeneral: string, rivalFaction: string, myGeneral: string, myFaction: string): StoryScene {
  return {
    id: `contact:${rivalFaction}`,
    title: `The ${RACE_NAMES[rivalRace]}`,
    lines: [
      oracle(`The ${RACE_NAMES[rivalRace]}. ${MOTIVE[rivalRace]}`),
      general(rivalGeneral, rivalFaction, GENERAL_LINES[rivalGeneral]?.taunt ?? 'Turn back.'),
      general(myGeneral, myFaction, GENERAL_LINES[myGeneral]?.join.split('.')[0] + '. We do not turn back.'),
    ],
  };
}

export function stellariaSightedScene(): StoryScene {
  return {
    id: 'stellaria-sighted',
    title: 'A Stellari bloom',
    lines: [
      oracle('Look there: a Stellari bloom. A finite one, a cutting from the legend, blown out across the dark.'),
      oracle('Hold the system, and the bloom will pour credits and materials into your hands every turn. But it is not the real thing. It wilts.'),
    ],
  };
}

export function stellariaClaimedScene(): StoryScene {
  return {
    id: 'stellaria-claimed',
    title: 'The bloom is yours',
    lines: [oracle('The bloom is yours. Feel how it warms everything near it? Imagine one that never wilts. That is what waits at the centre.')],
  };
}

export function stellariaWiltedScene(): StoryScene {
  return {
    id: 'stellaria-wilted',
    title: 'A bloom wilts',
    lines: [oracle('The bloom has wilted. They all do, out here. Only one flower is infinite, and it does not grow this far from the Heart.')],
  };
}

export function dimmingScene(system: string): StoryScene {
  return {
    id: 'dimming',
    title: 'A star gutters',
    lines: [
      oracle(`Did you see? The star of ${system} has guttered. Its worlds will yield less now, and less again, until they yield nothing.`),
      oracle('It will keep happening. The longer this war lasts, the less there will be left to win.'),
    ],
  };
}

export function instabilityScene(): StoryScene {
  return {
    id: 'instability',
    title: 'Regional stability',
    lines: [
      oracle('Do you feel it? The space between the stars is thinning. Regional stability is failing.'),
      oracle('Soon whole systems will start to fall into the dark: the farthest first, then on, and in. Do not be standing in one when it goes.'),
    ],
  };
}

export function collapseScene(): StoryScene {
  return {
    id: 'collapse',
    title: 'The collapse',
    lines: [
      oracle('It has begun. The systems marked on your map will be gone next turn, and more will follow, every turn, from the rim inwards.'),
      oracle('You cannot stay. Keep moving towards the Heart. If a world is worth it, you can spend materials to hold it together a little longer: once, and only once.'),
    ],
  };
}

export function heartSightedScene(): StoryScene {
  return {
    id: 'heart-sighted',
    title: HEART_NAME,
    lines: [
      oracle(`There it is. ${HEART_NAME}. Even dying, it outshines everything.`),
      oracle('It is guarded. The Heart Wardens have kept it since the first light, and they will not stand aside for anyone. Come strong, and come rested.'),
    ],
  };
}

export function armyLostScene(): StoryScene {
  return {
    id: 'army-lost',
    title: 'An army falls',
    lines: [oracle('An army is broken, and its general driven from the field. Generals can be recruited again, but the war will not wait for them.')],
  };
}

export function rivalFallsScene(rivalRace: number, rivalFaction: string): StoryScene {
  return {
    id: `falls:${rivalFaction}`,
    title: `The ${RACE_NAMES[rivalRace]} fall`,
    lines: [oracle(`The ${RACE_NAMES[rivalRace]} are finished. Their worlds are yours to take, or to leave in the dark. One fewer people to share the light with.`)],
  };
}

export function victoryHeartScene(hero: string, faction: string, race: number): StoryScene {
  return {
    id: 'victory',
    title: race === 0 ? VITALIA : STELLARIA_NAME,
    lines: [
      oracle(`You have reached ${HEART_NAME}, and the Wardens are scattered. And there, in the white fire at its centre: the ${STELLARIA_NAME}, in bloom.`),
      general(hero, faction, race === 0 ? `${VITALIA}. She is still here. After everything, we have brought her home.` : 'It is real. After everything, it is real.'),
      oracle('Carry it home. Light your star again. And remember, when the others come to you in the dark, how much light there is now to share.'),
    ],
  };
}

export function victoryDominationScene(): StoryScene {
  return {
    id: 'victory',
    title: 'Dominion',
    lines: [oracle('Half the universe answers to you now. The Heart can wait: with so much under your banner, no one is left to reach it first.')],
  };
}

export function defeatScene(winnerRace: number, heart: boolean): StoryScene {
  return {
    id: 'defeat',
    title: 'The light goes out',
    lines: [
      oracle(
        heart
          ? `The ${RACE_NAMES[winnerRace]} have reached ${HEART_NAME}, and the ${STELLARIA_NAME} is theirs. Your star will go dark without it.`
          : `It is over. The ${RACE_NAMES[winnerRace]} hold the universe now, and your people's star goes quietly out.`,
      ),
      oracle('I will remember you. Someone should.'),
    ],
  };
}

/**
 * The armoury's keepers. The quartermaster sells; the recycler breaks cards down for what they're made of.
 * Both have watched the universe run down, and say so (the dying stars stand, quietly, for our own world's
 * spent resources and warming).
 */
export const QUARTERMASTER = { name: 'Quartermaster Hesk', role: 'the armoury' };
export const RECYCLER = { name: 'Mother Tallow', role: 'the recycler' };

export const QUARTERMASTER_LINES: string[] = [
  'Prices are up. Everything is up, except the light.',
  "The supply chain's fine. It's the supply that's gone.",
  'Mined that from a moon that isn\'t there any more. Don\'t ask which.',
  'Buy it now. The world that made it may not be there next turn.',
  'We were told there would always be more. There was always more, right up until there wasn\'t.',
  'Everyone wants growth. Nobody asks what it grows out of.',
  'Half my stock came from stars we burned too hot, too fast. Cheap at the time.',
  'Quarterly yields were excellent, right up until the last quarter.',
];

export const RECYCLER_LINES: string[] = [
  'Everything you throw away goes somewhere. Out here, it comes back round and orbits you.',
  "My mother had a banner: reduce, reuse, recycle. We kept the banner. We didn't keep the habit.",
  'Every card is made of something that was once a world. Mind how you waste it.',
  "Single-use starships. Who thought that was a good idea? Everybody, that's who.",
  'They said the dimming was a natural cycle. Some of it was. Most of it was us.',
  'Every degree we added to the suns, we said we would fix later. It is later.',
  'The seas on the tide worlds rose a hand a year. They built higher docks, and never asked why.',
  "Nothing is ever really thrown away. It's only put where you can't see it, for a while.",
  'Bring me what you will not use. Half of something is better than all of nothing.',
];

/**
 * The Lost Races: the last of peoples whose stars went dark in the dimming. Their homes are gone; a few
 * ships wander still, taking what they can. Some carry relics of the worlds they lost.
 */
export const LOST_RACES = ['Vessan', 'Orrim', 'Quiet Choir', 'Embrin', 'Thalassi', 'Sorrowkin', 'Ashen Fold', 'Mirelight', 'Hollow Kings', 'Glasswrights'];

export function lostSightedScene(name: string): StoryScene {
  return {
    id: 'lost-sighted',
    title: 'The Lost Races',
    lines: [
      oracle(`Do you see that fleet? The last of the ${name}. Their star went dark in the dimming, and took their worlds with it.`),
      oracle('There are others like them: the Lost Races, the last of peoples the dark has already taken. They have no home to defend, and nothing left to lose. They wander, and they take what they can.'),
      oracle('Some still carry relics of the worlds they lost. Bring one of them down, and the relics are yours. Leave them be, and they may come for your worlds instead.'),
    ],
  };
}

export function lostRaidScene(name: string, system: string): StoryScene {
  return {
    id: 'lost-raid',
    title: 'A raid',
    lines: [oracle(`The ${name} have stripped ${system}. They do not keep what they take. They only need it for a little longer than you do.`)],
  };
}
