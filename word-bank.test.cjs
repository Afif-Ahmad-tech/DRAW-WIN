const { test } = require('node:test');
const assert = require('node:assert/strict');

test('library contains 3000 distinct object names and options do not repeat before exhaustion', async () => {
  const { words, drawWords } = await import('./word-bank.mjs');
  assert.equal(words.length, 3000);
  assert.equal(new Set(words).size, 3000);
  assert.ok(words.every((word) => /^[a-z]{3,14}$/.test(word)));
  for (const word of ['car', 'cup', 'book', 'pizza', 'watermelon', 'guitar', 'castle']) assert.ok(words.includes(word), word);
  for (const word of ['affinity', 'gravity', 'weather', 'voltage', 'architecture', 'website', 'octopus', 'butterfly', 'volcano', 'room', 'road', 'zoo']) assert.ok(!words.includes(word), word);
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

test('difficulty banks are trimmed, duplicate-free and keep their curated spelling', async () => {
  const { difficultyWords } = await import('./difficulty-words.mjs');
  assert.deepEqual(Object.keys(difficultyWords), ['easy', 'medium', 'hard', 'difficult']);
  for (const [name, bank] of Object.entries(difficultyWords)) {
    assert.ok(bank.length >= 50, name);
    assert.equal(new Set(bank.map((word) => word.toLowerCase())).size, bank.length, name);
    assert.ok(bank.every((word) => word === word.trim() && word.length > 0), name);
  }
  assert.ok(difficultyWords.hard.includes('Chick-fil-A'));
  assert.ok(difficultyWords.difficult.includes("s'mores"));
});

test('drawWords deals only from the requested difficulty bank', async () => {
  const { difficultyWords } = await import('./difficulty-words.mjs');
  const { drawWords } = await import('./word-bank.mjs');
  const pool = [];
  const drawn = drawWords(pool, 5, difficultyWords.difficult);
  assert.equal(new Set(drawn).size, 5);
  for (const word of drawn) assert.ok(difficultyWords.difficult.includes(word), word);
});
