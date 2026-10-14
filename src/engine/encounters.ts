/**
 * Story encounters [direction: story nodes, where players are offered narrative choices, to break up the game being
 * battle, battle, battle; the scenes show the ship and crew, other ships or entities flying up alongside to speak
 * with them]. The Captain's runs only. Each waits unseen on a system (as finds do) and plays as the flagship arrives:
 * who comes alongside, what they say, what the Captain may choose, and what comes of it. campaign.ts places and
 * resolves them; this file is what they are and what is said.
 *
 * - A travelling merchant offers a mysterious device: bought, it is good 2 times in 5 (a powerful ship part, just shy
 *   of the best), bad otherwise (it blows up aboard: a card slot wrecked until the next space station).
 * - Pirates demand a hefty toll: pay it, or fight them for it.
 * - Aureline bounty hunters come for Kaelen, a deserter [direction: Kaelen's "traitor to his people" arc]: three times,
 *   each harder, across runs. Pay them off and they come again; beat all three and they never come for him again.
 */
import type { CompanionId } from './companions';

/** (`exile` and `stillness`: the Lost Races' companions, found only in their rifts.) */
export type EncounterKind = 'merchant' | 'pirates' | 'hunters' | 'exile' | 'stillness';

/** What came of an encounter, once chosen (its closing lines follow from it). */
export type EncounterOutcome = 'good' | 'bad' | 'declined' | 'paid' | 'won' | 'lost' | 'fled' | 'joined';

/** Who comes alongside, for the scene to show: a ship (of a race, or the merchant's or pirates' own), or a light. */
export type VisitorLook = { ship: 'merchant' | 'pirate' | 'hunter' | 'nyxari' | 'seren' };

/** Who speaks a line: the visitor, the Captain, or one of the crew. */
export type EncounterSpeaker = 'visitor' | 'captain' | CompanionId;
export interface EncounterLine {
  who: EncounterSpeaker;
  text: string;
}

/** The odds a merchant's device works [direction: a set 40% chance to be good, 60% bad, randomised on purchase]. */
export const CURIO_GOOD = 0.4;
/** Stages of Kaelen's hunters before they give up for good. */
export const HUNTER_STAGES = 3;
/** Story encounters on each galaxy's strip (the Captain's runs; none in a rift). */
export const ENCOUNTERS_PER_GALAXY = 2;

/** What each costs, by galaxy: the merchant's price, the pirates' toll, the hunters' bribe. */
export function encounterPrice(kind: EncounterKind, universe: number, stage = 0): number {
  if (kind === 'merchant') return 6 + 2 * universe;
  if (kind === 'pirates') return 12 + 4 * universe;
  if (kind === 'exile' || kind === 'stillness') return 0;
  return 10 + 4 * universe + 4 * stage;
}

/** What the hunters' leader is called at each stage, and who they bring. */
export const HUNTERS = [
  { name: 'Aureline Trackers', leader: 'the trackers' },
  { name: 'Ilvane the Bounty Hunter', leader: 'Ilvane' },
  { name: "The Solarch's Executioner", leader: 'the Executioner' },
];

/** The visitor's name, for the scene's title. */
export function visitorName(kind: EncounterKind, stage = 0): string {
  if (kind === 'merchant') return 'A Travelling Merchant';
  if (kind === 'pirates') return 'Void Pirates';
  if (kind === 'exile') return 'A Nyxari Exile';
  if (kind === 'stillness') return 'A Stopped Hour';
  return HUNTERS[Math.min(stage, HUNTERS.length - 1)].name;
}

export const visitorLook = (kind: EncounterKind): VisitorLook => ({ ship: kind === 'merchant' ? 'merchant' : kind === 'pirates' ? 'pirate' : kind === 'exile' ? 'nyxari' : kind === 'stillness' ? 'seren' : 'hunter' });

/** What is said as the visitor comes alongside (`crew`: who is aboard to speak). */
export function openingLines(kind: EncounterKind, price: number, stage: number, crew: CompanionId[]): EncounterLine[] {
  const mara = crew.includes('engineer');
  if (kind === 'merchant')
    return [
      { who: 'visitor', text: `Captain! A moment of your time. I have here a device from beyond the Heart. What does it do? Ah. That is the thrill of it. ${price} materials, and it is yours.` },
      mara ? { who: 'engineer', text: "It's humming, Captain. Things that hum like that either save your ship or take a hole out of it." } : { who: 'captain', text: 'It is humming. Things that hum like that rarely stay quiet.' },
    ];
  if (kind === 'exile')
    return [
      { who: 'visitor', text: 'Human ship! Open your hold to me. They are a jump behind, and they do not take prisoners. Not of their own.' },
      { who: 'captain', text: 'Who is "they"?' },
      { who: 'visitor', text: 'My kin. I would not feed the dark what it asked for, so now it asks for me. Stand with me, and I am yours.' },
    ];
  if (kind === 'stillness')
    return [
      { who: 'visitor', text: 'You can see me. Then the reading was true: a human, a battered ship, the hour that will not move.' },
      { who: 'visitor', text: 'I stepped out of time to wait for you, Captain. Every chart I read ends the same. Take me aboard, and let us change one.' },
    ];
  if (kind === 'pirates')
    return [
      { who: 'visitor', text: `Nice ship. Be a shame if something happened to it. ${price} materials, and we were never here.` },
      { who: 'captain', text: 'And if we say no?' },
      { who: 'visitor', text: 'Then we take it the hard way, and the ship too.' },
    ];
  if (stage === 0)
    return [
      { who: 'visitor', text: 'By order of the Solarch: Kaelen of the Lancer Guard, you are charged with desertion. Surrender him, Captain, and you may fly on.' },
      { who: 'lancer', text: 'I left because they ordered me to burn a world that had already surrendered. I would leave again.' },
      { who: 'visitor', text: `Or pay the bounty yourself. ${price} materials buys him a little more time.` },
    ];
  if (stage === 1)
    return [
      { who: 'visitor', text: "Ilvane. You will have heard of me. The trackers came back empty-handed, Kaelen. I won't." },
      { who: 'lancer', text: 'Ilvane trained half the Guard, Captain. If we fight, we fight carefully.' },
      { who: 'visitor', text: `${price} materials and I report I lost the trail. Or we do this properly.` },
    ];
  return [
    { who: 'visitor', text: 'The Solarch sends her last word, deserter. It is me.' },
    { who: 'lancer', text: 'This is the last of them, Captain. Win this, and they will never come for me again.' },
  ];
}

/** The choices on offer: an id, and its label (the price shown). */
export function encounterChoices(kind: EncounterKind, price: number, stage: number): { id: string; label: string }[] {
  if (kind === 'merchant') return [{ id: 'buy', label: `buy it · ${price}` }, { id: 'leave', label: 'no thanks' }];
  if (kind === 'pirates') return [{ id: 'fight', label: 'fight' }, { id: 'pay', label: `pay · ${price}` }];
  if (kind === 'exile') return [{ id: 'fight', label: 'stand with her' }, { id: 'leave', label: 'leave her to them' }];
  if (kind === 'stillness') return [{ id: 'free', label: 'take her aboard' }, { id: 'leave', label: 'leave her waiting' }];
  return stage >= HUNTER_STAGES - 1 ? [{ id: 'fight', label: 'stand with Kaelen' }] : [{ id: 'fight', label: 'stand with Kaelen' }, { id: 'pay', label: `pay the bounty · ${price}` }];
}

/** What is said once it is decided. */
export function closingLines(kind: EncounterKind, outcome: EncounterOutcome, stage: number, crew: CompanionId[]): EncounterLine[] {
  const mara = crew.includes('engineer');
  if (kind === 'merchant') {
    if (outcome === 'good') return [{ who: 'visitor', text: 'A fine choice. A fine, fine choice.' }, mara ? { who: 'engineer', text: "Captain... it works. It actually works. I'm fitting it now." } : { who: 'captain', text: 'It works. It actually works.' }];
    if (outcome === 'bad') return [{ who: 'visitor', text: 'No refunds!' }, mara ? { who: 'engineer', text: "It blew, Captain! A slot's wrecked. I can't fix it out here; I need a space station." } : { who: 'captain', text: 'It blew. A slot is wrecked until a space station can mend it.' }];
    return [{ who: 'visitor', text: 'Your loss, Captain. Your loss.' }];
  }
  if (kind === 'exile') {
    if (outcome === 'won') return [{ who: 'visitor', text: 'They are gone. For now. I am Nyss, Captain, and my blade is yours.' }];
    if (outcome === 'lost') return [{ who: 'visitor', text: 'They have me... go, Captain. Go!' }];
    return [{ who: 'visitor', text: 'Then fly fast, human. They will not stop at me.' }];
  }
  if (kind === 'stillness') {
    if (outcome === 'joined') return [{ who: 'visitor', text: 'The hour moves again. I am Ilyra. Let us read a different ending.' }];
    return [{ who: 'visitor', text: 'Then I will wait. Time is the one thing I have.' }];
  }
  if (kind === 'pirates') {
    if (outcome === 'paid') return [{ who: 'visitor', text: 'Pleasure doing business.' }];
    if (outcome === 'won') return [{ who: 'captain', text: 'Whatever they had in the hold is ours now.' }];
    return [{ who: 'visitor', text: "We'll take what we came for, then." }];
  }
  if (outcome === 'paid') return [{ who: 'lancer', text: 'They will be back, Captain. They always come back.' }];
  if (outcome === 'won') return stage >= HUNTER_STAGES - 1 ? [{ who: 'lancer', text: "It's over. I am free, Captain. Truly free. My lance is yours for as long as you'll have it." }] : [{ who: 'lancer', text: 'Thank you, Captain. They will send someone worse.' }];
  return [{ who: 'lancer', text: "I'm still here, Captain. They didn't take me. Not today." }];
}
