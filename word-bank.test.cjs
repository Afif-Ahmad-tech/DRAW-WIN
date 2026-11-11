const { test } = require('node:test');
const assert = require('node:assert/strict');

test('library contains 3000 unique words and options do not repeat before exhaustion', async () => {
  const { words, drawWords } = await import('./word-bank.mjs');
  assert.equal(words.length, 3000);
  assert.equal(new Set(words).size, 3000);
  assert.ok(words.every((word) => /^[a-z]{4,14}$/.test(word)));
  const pool = [], seen = new Set();
  for (let turn = 0; turn < 600; turn++) {
    for (const word of drawWords(pool, 5)) {
      assert.equal(seen.has(word), false, word);
      seen.add(word);
    }
  }
  assert.equal(pool.length, 0);
  const next = drawWords(pool, 5);
  assert.equal(next.length, 5);
  assert.equal(new Set(next).size, 5);
});

test('close guesses cover small spelling errors without accepting unrelated guesses', async () => {
  const { isCloseGuess } = await import('./word-bank.mjs');
  for (const guess of ['castl', 'castlee', 'casxle', 'catsle', ' CastleX ']) assert.equal(isCloseGuess(guess, 'castle'), true, guess);
  for (const guess of ['castle', 'CASTLE', 'car', 'banana', '', 'c', 'castlers']) assert.equal(isCloseGuess(guess, 'castle'), false, guess);
});
