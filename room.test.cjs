const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const WebSocket = require('ws');
const { once } = require('node:events');

test('clients can join, reconnect, draw, guess and continue after the drawer leaves', async (t) => {
  const { attachMultiplayer } = await import('./multiplayer.mjs');
  const { difficultyWords } = await import('./difficulty-words.mjs');
  const server = createServer();
  const wss = attachMultiplayer(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(() => { for (const socket of sockets) socket.terminate(); wss.close(); server.close(); });
  async function client() {
    const socket = new WebSocket(url), queue = [], waiters = [];
    let latestState;
    sockets.push(socket);
    socket.on('message', (data) => {
      const message = JSON.parse(data);
      if (message.state) latestState = message.state;
      const index = waiters.findIndex((entry) => entry.predicate(message));
      if (index >= 0) waiters.splice(index, 1)[0].resolve(message);
      else queue.push(message);
    });
    await once(socket, 'open');
    return {
      close: () => socket.close(),
      state: () => latestState,
      send: (message) => socket.send(JSON.stringify(message)),
      next: (predicate) => {
        const index = queue.findIndex(predicate);
        return index < 0 ? new Promise((resolve) => waiters.push({ predicate, resolve })) : Promise.resolve(queue.splice(index, 1)[0]);
      }
    };
  }
  let a = await client();
  const b = await client(), c = await client();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  a.send({ type: 'create', id: ids[0], name: 'A' });
  const created = await a.next((m) => m.type === 'joined');
  assert.match(created.state.code, /^[0-9]{4}$/);
  assert.deepEqual(created.state.settings, { rounds: 2, choices: 2, difficulty: 'easy' });
  const invalid = await client();
  for (const code of ['AB12', '12345']) {
    invalid.send({ type: 'join', code, id: randomUUID(), name: 'Invalid' });
    assert.equal((await invalid.next((m) => m.type === 'error')).text, 'That room code was not found.');
  }
  a.send({ type: 'ping' });
  await a.next((m) => m.type === 'pong');
  for (const [client, id, name] of [[b, ids[1], 'B'], [c, ids[2], 'C']]) {
    client.send({ type: 'join', code: created.state.code, id, name });
    await client.next((m) => m.type === 'joined');
  }
  await a.next((m) => m.type === 'state' && m.state.players.length === 3);
  b.send({ type: 'rename', name: '  Bee  ' });
  const renamed = await a.next((m) => m.type === 'state' && m.state.players[1]?.name === 'Bee');
  assert.equal(renamed.state.players[1].name, 'Bee');
  await b.next((m) => m.type === 'state' && m.state.players[1]?.name === 'Bee');
  b.send({ type: 'rename', name: '   ' });
  b.send({ type: 'ping' });
  await b.next((m) => m.type === 'pong');
  assert.equal(b.state().players[1].name, 'Bee');
  b.send({ type: 'settings', rounds: 3, choices: 3 });
  a.send({ type: 'settings', rounds: 5, choices: 5, difficulty: 'hard' });
  await b.next((m) => m.type === 'state' && m.state.settings.rounds === 5);
  a.send({ type: 'settings', rounds: 6, choices: 1, difficulty: 'nightmare' });
  a.send({ type: 'ping' });
  await a.next((m) => m.type === 'pong');
  assert.deepEqual(a.state().settings, { rounds: 5, choices: 5, difficulty: 'hard' });
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  a.send({ type: 'start' });
  const playing = await b.next((m) => m.type === 'state' && m.state.status === 'playing');
  assert.equal(playing.state.drawer, ids[0]);
  assert.equal(playing.state.word, '');
  assert.deepEqual(playing.state.choices, []);
  assert.deepEqual(playing.state.settings, { rounds: 5, choices: 5, difficulty: 'hard' });
  const options = (await a.next((m) => m.type === 'state' && m.state.choosing)).state.choices;
  assert.equal(options.length, 5);
  assert.equal(new Set(options).size, 5);
  for (const word of options) assert.ok(difficultyWords.hard.includes(word), word);
  const choice = options.find((word) => word.length >= 4);
  a.send({ type: 'choose', word: choice });
  const ready = await b.next((m) => m.type === 'state' && m.state.mask.length > 0);
  assert.equal(ready.state.mask, choice.replace(/[a-z]/gi, '_'));
  assert.equal(ready.state.word, '');
  a.close();
  a = await client();
  a.send({ type: 'join', code: created.state.code, id: ids[0], name: 'A-new' });
  const rejoined = await a.next((m) => m.type === 'joined');
  assert.equal(rejoined.state.status, 'playing');
  assert.equal(rejoined.state.players.length, 3);
  assert.equal(rejoined.state.players[0].name, 'A-new');
  a.send({ type: 'stroke', stroke: { a: { x: 0.1, y: 0.2 }, b: { x: 0.3, y: 0.4 }, colour: '#1e88e5' } });
  const stroke = await b.next((m) => m.type === 'stroke');
  assert.equal(stroke.sender, ids[0]);
  assert.equal(stroke.stroke.colour, '#1e88e5');
  for (const colour of ['#8d6e63', '#ffffff']) {
    a.send({ type: 'stroke', stroke: { a: { x: 0.2, y: 0.3 }, b: { x: 0.4, y: 0.5 }, colour } });
    assert.equal((await b.next((m) => m.type === 'stroke' && m.stroke.colour === colour)).stroke.colour, colour);
  }
  b.send({ type: 'guess', text: 'definitelywrong', turn: 1 });
  const wrong = await b.next((m) => m.type === 'guess-result');
  assert.equal(wrong.correct, false);
  assert.equal(wrong.guess, 'definitelywrong');
  assert.equal(wrong.turn, 1);
  assert.equal(wrong.close, false);
  b.send({ type: 'guess', text: choice.slice(0, -1), turn: 1 });
  const close = await b.next((m) => m.type === 'guess-result');
  assert.equal(close.correct, false);
  assert.equal(close.close, true);
  c.send({ type: 'guess', text: choice });
  const firstCorrect = await c.next((m) => m.type === 'guess-result' && m.correct);
  assert.equal(firstCorrect.points, 80);
  const stillPlaying = await b.next((m) => m.type === 'state' && m.state.players[2]?.score === 80);
  assert.equal(stillPlaying.state.status, 'playing');
  assert.equal(stillPlaying.state.word, '', 'other guessers must not see the answer');
  assert.equal(stillPlaying.state.guessed, false);
  const solvedView = await c.next((m) => m.type === 'state' && m.state.guessed);
  assert.equal(solvedView.state.word, choice);
  c.send({ type: 'guess', text: choice });
  c.send({ type: 'ping' });
  await c.next((m) => m.type === 'pong');
  assert.equal(c.state().players[2].score, 80, 'a correct guess scores once per turn');
  t.mock.timers.tick(45000);
  for (let i = 0; i < 20; i++) {
    b.send({ type: 'guess', text: 'wrongguess' + i });
    await b.next((m) => m.type === 'guess-result' && m.guess === 'wrongguess' + i);
  }
  t.mock.timers.tick(14000);
  b.send({ type: 'guess', text: choice });
  const lateCorrect = await b.next((m) => m.type === 'guess-result' && m.correct);
  assert.equal(lateCorrect.points, 15);
  const results = await c.next((m) => m.type === 'state' && m.state.status === 'leaderboard');
  assert.equal(results.state.players[0].score, 60, 'drawer earns 60 when everyone guesses');
  assert.equal(results.state.players[1].score, 15);
  assert.equal(results.state.players[2].score, 80);
  assert.deepEqual(results.state.leaderboard.map((p) => p.gained).sort((x, y) => x - y), [15, 60, 80]);
  assert.equal(results.state.endsAt, Date.now() + 5000);
  b.send({ type: 'rename', name: 'Winner' });
  const updatedResults = await c.next((m) => m.type === 'state' && m.state.leaderboard?.find((p) => p.id === ids[1])?.name === 'Winner');
  assert.equal(updatedResults.state.players[1].name, 'Winner');
  a.send({ type: 'leave' });
  await b.next((m) => m.type === 'state' && m.state.status === 'leaderboard' && m.state.players.length === 2);
  t.mock.timers.tick(5000);
  const next = await b.next((m) => m.type === 'state' && m.state.drawer === ids[1]);
  assert.equal(next.state.round, 1);
  const shown = new Set(options);
  for (const word of next.state.choices) { assert.equal(shown.has(word), false); shown.add(word); }
  b.send({ type: 'next' });
  b.send({ type: 'ping' });
  await b.next((m) => m.type === 'pong');
  assert.equal(b.state().turn, 2, 'manual next commands are ignored');
});

test('timed turns show a five-second leaderboard before automatic handoff and final results', { timeout: 20000 }, async (t) => {
  const { attachMultiplayer } = await import('./multiplayer.mjs');
  const server = createServer(), wss = attachMultiplayer(server), sockets = [];
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { for (const socket of sockets) socket.terminate(); wss.close(); server.close(); });
  async function connect() {
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}`), queue = [], pending = [];
    sockets.push(socket);
    socket.on('message', (raw) => {
      const message = JSON.parse(raw), index = pending.findIndex((p) => p.match(message));
      if (index < 0) queue.push(message); else pending.splice(index, 1)[0].resolve(message);
    });
    await once(socket, 'open');
    return {
      send: (message) => socket.send(JSON.stringify(message)),
      next: (match) => {
        const index = queue.findIndex(match);
        return index >= 0 ? Promise.resolve(queue.splice(index, 1)[0]) : new Promise((resolve) => pending.push({ match, resolve }));
      }
    };
  }
  const host = await connect(), guest = await connect(), hostId = randomUUID(), guestId = randomUUID();
  host.send({ type: 'create', id: hostId, name: 'Host' });
  const created = await host.next((m) => m.type === 'joined');
  guest.send({ type: 'join', code: created.state.code, id: guestId, name: 'Guest' });
  await guest.next((m) => m.type === 'joined');
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  host.send({ type: 'start' });
  const choosing = await host.next((m) => m.type === 'state' && m.state.choosing);
  assert.equal(choosing.state.endsAt, 160000);
  host.send({ type: 'choose', word: choosing.state.choices[0] });
  await guest.next((m) => m.type === 'state' && m.state.mask.length > 0);
  for (const [advance, letters] of [[30000, 1], [15000, 2], [10000, 3]]) {
    t.mock.timers.tick(advance);
    const clue = await guest.next((m) => m.type === 'state' && (m.state.mask.match(/[a-z]/gi) || []).length === letters);
    assert.equal(clue.state.word, '');
    assert.equal(clue.state.turn, 1);
  }
  t.mock.timers.tick(5000);
  const timeoutResults = await guest.next((m) => m.type === 'state' && m.state.status === 'leaderboard');
  assert.equal(timeoutResults.state.endsAt, 165000);
  assert.equal(timeoutResults.state.word, choosing.state.choices[0]);
  assert.equal(timeoutResults.state.players[1].score, 0, 'no correct guess earns zero');
  const reconnect = await connect();
  reconnect.send({ type: 'join', code: created.state.code, id: guestId, name: 'Guest' });
  const restored = await reconnect.next((m) => m.type === 'joined');
  assert.equal(restored.state.status, 'leaderboard');
  assert.equal(restored.state.endsAt, 165000);
  t.mock.timers.tick(5000);
  const second = await reconnect.next((m) => m.type === 'state' && m.state.turn === 2);
  assert.equal(second.state.drawer, guestId);
  reconnect.send({ type: 'choose', word: second.state.choices[0] });
  await host.next((m) => m.type === 'state' && m.state.turn === 2 && !m.state.choosing);
  t.mock.timers.tick(10000);
  host.send({ type: 'guess', text: 'wrongguess' });
  await host.next((m) => m.type === 'guess-result' && !m.correct);
  t.mock.timers.tick(1000);
  host.send({ type: 'guess', text: second.state.choices[0] });
  assert.equal((await host.next((m) => m.type === 'guess-result' && m.correct)).points, 78);
  const correctResults = await reconnect.next((m) => m.type === 'state' && m.state.turn === 2 && m.state.status === 'leaderboard');
  assert.equal(correctResults.state.endsAt, Date.now() + 5000);
  assert.equal(correctResults.state.leaderboard.find((p) => p.id === guestId).gained, 60, 'drawer earns 60 when everyone guesses');
  t.mock.timers.tick(5000);
  const third = await host.next((m) => m.type === 'state' && m.state.turn === 3);
  host.send({ type: 'choose', word: third.state.choices[0] });
  await reconnect.next((m) => m.type === 'state' && m.state.turn === 3 && !m.state.choosing);
  t.mock.timers.tick(10000);
  reconnect.send({ type: 'guess', text: third.state.choices[0] });
  assert.equal((await reconnect.next((m) => m.type === 'guess-result' && m.correct)).points, 80);
  await host.next((m) => m.type === 'state' && m.state.turn === 3 && m.state.status === 'leaderboard');
  t.mock.timers.tick(5000);
  const fourth = await reconnect.next((m) => m.type === 'state' && m.state.turn === 4);
  reconnect.send({ type: 'choose', word: fourth.state.choices[0] });
  await host.next((m) => m.type === 'state' && m.state.turn === 4 && !m.state.choosing);
  host.send({ type: 'guess', text: fourth.state.choices[0] });
  assert.equal((await host.next((m) => m.type === 'guess-result' && m.correct)).points, 80);
  const finalTurn = await host.next((m) => m.type === 'state' && m.state.turn === 4 && m.state.status === 'leaderboard');
  assert.equal(finalTurn.state.leaderboard[0].score, 218);
  assert.equal(finalTurn.state.leaderboard[1].score, 200);
  t.mock.timers.tick(5000);
  const finished = await host.next((m) => m.type === 'state' && m.state.status === 'finished');
  assert.equal(finished.state.leaderboard[0].id, hostId);
});

test('drawer points: 0 with no correct guesses, 40 at 30%, 60 max when everyone guesses', async () => {
  const { drawerPoints } = await import('./multiplayer.mjs');
  assert.equal(drawerPoints(0, 9), 0);
  assert.equal(drawerPoints(2, 9), 0, '22% is below the threshold');
  assert.equal(drawerPoints(3, 10), 40, 'exactly 30% qualifies');
  assert.equal(drawerPoints(3, 9), 40);
  assert.equal(drawerPoints(4, 5), 40);
  assert.equal(drawerPoints(5, 5), 60);
  assert.equal(drawerPoints(1, 1), 60);
  assert.equal(drawerPoints(0, 0), 0);
});
