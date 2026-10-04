/**
 * Strictly-worse cards: lists every card that another card beats outright, meaning it costs no more,
 * has every effect at least as strong (and one stronger, or costs less), no extra drawback, and can go in
 * the same decks (neutral cards fit every deck, a race's cards only that race's). RACE=1 also lists a race
 * card that beats a neutral one. Usage: npm run dominated
 */
import { dominatedPairs } from './dominance';

const found = dominatedPairs(!!process.env.RACE);
console.log(found.length ? found.join('\n') : 'No strictly worse cards.');
console.log(`${found.length} pairs`);
