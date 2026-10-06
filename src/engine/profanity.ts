/**
 * A profanity filter for what players write that others see: their name, and the names and notes of decks they
 * share. Used by the game (to turn a name down as it's chosen) and the server (which has the last word).
 *
 * Text is folded first (lower case, accents off, look-alike digits and symbols read as letters: 0 o, 1 i, 3 e,
 * 4 a, 5 s, 7 t, @ a, $ s, ! i), and runs of one letter are tried squeezed as well (fuuuck). Then:
 * - whole words, or those words with a common ending, from WORDS (so "class", "Scunthorpe" and "Dickens" are fine);
 * - and, run together with everything that isn't a letter dropped, any of SPELLED (so "f u c k" or "xXshitXx"
 *   are caught too). Only words that never turn up inside an innocent word go there.
 */
const WORDS = [
  'ass', 'arse', 'asshole', 'arsehole', 'bastard', 'bollock', 'bollocks', 'boob', 'boobs', 'cock', 'cum', 'cunt', 'dick', 'dickhead', 'dyke',
  'fag', 'fags', 'fanny', 'homo', 'hoe', 'kike', 'nazi', 'nonce', 'paedo', 'pedo', 'penis', 'piss', 'porn', 'prick', 'rape', 'raped', 'raping',
  'sex', 'sexy', 'slag', 'slut', 'spic', 'chink', 'coon', 'gook', 'paki', 'tit', 'tits', 'titties', 'tranny', 'vagina', 'wank', 'wanker', 'whore',
  'retard', 'retarded', 'bitch', 'shit', 'fuck', 'twat', 'pussy', 'jizz', 'dildo', 'nigga', 'nigger', 'faggot', 'rapist', 'hitler', 'motherfucker',
];
const SPELLED = ['fuck', 'shit', 'nigga', 'faggot', 'whore', 'retard', 'hitler', 'bitch', 'pussy', 'twat', 'jizz', 'dildo', 'wanker', 'asshole', 'arsehole', 'motherf'];
/** Innocent words with one of the others inside them: taken out before anything is checked. */
const ALLOWED = ['scunthorpe', 'therapist', 'therapists', 'shitake', 'shiitake', 'snigger', 'sniggers', 'sniggered', 'sniggering', 'cocktail', 'cockpit', 'peacock', 'hancock', 'hitchcock', 'shuttlecock', 'dickens', 'essex', 'sussex', 'middlesex', 'assassin', 'assault', 'classic', 'bassist', 'pissarro', 'arsenal', 'titan', 'titanic', 'title', 'pedometer', 'torpedo', 'spice', 'spicy', 'cumin', 'cumulus', 'document', 'homogenous', 'homage', 'hoes'];
const ALLOWED_RE = new RegExp(`(?<!\\p{L})(?:${ALLOWED.join('|')})(?!\\p{L})`, 'gu');
const ENDINGS = ['', 's', 'es', 'ed', 'er', 'ers', 'ing', 'y', 'ies', 'head', 'face'];

const LOOKALIKE: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };
const WORD_SET = new Set(WORDS);

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$!|+]/g, (c) => LOOKALIKE[c] ?? c);
}

const squeeze = (s: string) => s.replace(/(\p{L})\1+/gu, '$1');

function badWord(word: string): boolean {
  for (const w of [word, squeeze(word)]) {
    for (const end of ENDINGS) if (w.endsWith(end) && WORD_SET.has(w.slice(0, w.length - end.length))) return true;
    // (Words that start with the worst of them: fuckwit, shithouse.)
    if (/^(fuck|shit|cunt|nigg|fagg|wank|bitch|whor|slut|twat)/.test(w)) return true;
  }
  return false;
}

/** Whether a player's text has profanity in it (a name, a deck's name, a note). */
export function isProfane(text: string): boolean {
  const folded = fold(text).replace(ALLOWED_RE, ' ');
  const words = folded.split(/[^\p{L}]+/u).filter(Boolean);
  // (Letters spelled out one by one, "c u n t", read as the word they make.)
  const spelled = folded.match(/(?:^|[^\p{L}])(\p{L}(?:[^\p{L}]+\p{L}(?![\p{L}])){2,})/gu)?.map((m) => m.replace(/[^\p{L}]+/gu, '')) ?? [];
  if ([...words, ...spelled].some(badWord)) return true;
  const letters = folded.replace(/[^\p{L}]+/gu, '');
  return [letters, squeeze(letters)].some((s) => SPELLED.some((w) => s.includes(w)));
}
