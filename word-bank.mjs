import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';

export const words = readFileSync(new URL('./words.txt', import.meta.url), 'utf8').trim().split(/\r?\n/);

export function drawWords(pool, count, source = words) {
  const chosen = [];
  while (chosen.length < count) {
    if (!pool.length) pool.push(...source.filter((word) => !chosen.includes(word)));
    chosen.push(pool.splice(randomInt(pool.length), 1)[0]);
  }
  return chosen;
}

export function isCloseGuess(guess, word) {
  guess = guess.trim().toLowerCase(); word = word.toLowerCase();
  if (guess === word || guess.length < 3 || Math.abs(guess.length - word.length) > 1) return false;
  let index = 0;
  while (index < Math.min(guess.length, word.length) && guess[index] === word[index]) index++;
  if (guess.length === word.length) {
    return guess.slice(index + 1) === word.slice(index + 1) ||
      (guess[index] === word[index + 1] && guess[index + 1] === word[index] && guess.slice(index + 2) === word.slice(index + 2));
  }
  const longer = guess.length > word.length ? guess : word, shorter = guess.length > word.length ? word : guess;
  return longer.slice(0, index) + longer.slice(index + 1) === shorter;
}
