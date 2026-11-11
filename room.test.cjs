const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const WebSocket = require('ws');
const { once } = require('node:events');

test('clients can join, reconnect, draw, guess and continue after the drawer leaves', async (t) => {
  const { attachMultiplayer } = await import('./multiplayer.mjs');
  const server = createServer();
  const wss = attachMultiplayer(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(() => { for (const socket of sockets) socket.terminate(); wss.close(); server.close(); });
  async function client() {
    const socket = new WebSocket(url), queue = [], waiters = [];
    sockets.push(socket);
    socket.on('message', (data) => {
      const message = JSON.parse(data);
      const index = waiters.findIndex((entry) => entry.predicate(message));
      if (index >= 0) waiters.splice(index, 1)[0].resolve(message);
      else queue.push(message);
    });
    await once(socket, 'open');
    return {
      close: () => socket.close(),
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
  assert.deepEqual(created.state.settings, { rounds: 2, choices: 2 });
  a.send({ type: 'ping' });
  await a.next((m) => m.type === 'pong');
  for (const [client, id, name] of [[b, ids[1], 'B'], [c, ids[2], 'C']]) {
    client.send({ type: 'join', code: created.state.code, id, name });
    await client.next((m) => m.type === 'joined');
  }
  await a.next((m) => m.type === 'state' && m.state.players.length === 3);
  b.send({ type: 'settings', rounds: 3, choices: 3 });
  a.send({ type: 'settings', rounds: 5, choices: 5 });
  await b.next((m) => m.type === 'state' && m.state.settings.rounds === 5);
  a.send({ type: 'settings', rounds: 6, choices: 1 });
  a.send({ type: 'start' });
  const playing = await b.next((m) => m.type === 'state' && m.state.status === 'playing');
  assert.equal(playing.state.drawer, ids[0]);
  assert.equal(playing.state.word, '');
  assert.deepEqual(playing.state.choices, []);
  assert.deepEqual(playing.state.settings, { rounds: 5, choices: 5 });
  const options = (await a.next((m) => m.type === 'state' && m.state.choosing)).state.choices;
  assert.equal(options.length, 5);
  assert.equal(new Set(options).size, 5);
  a.send({ type: 'choose', word: options[0] });
  const ready = await b.next((m) => m.type === 'state' && m.state.mask.length > 0);
  assert.equal(ready.state.mask, '_'.repeat(options[0].length));
  assert.equal(ready.state.word, '');
  a.close();
  a = await client();
  a.send({ type: 'join', code: created.state.code, id: ids[0], name: 'A' });
  const rejoined = await a.next((m) => m.type === 'joined');
  assert.equal(rejoined.state.status, 'playing');
  assert.equal(rejoined.state.players.length, 3);
  a.send({ type: 'stroke', stroke: { a: { x: 0.1, y: 0.2 }, b: { x: 0.3, y: 0.4 }, colour: '#1e88e5' } });
  const stroke = await b.next((m) => m.type === 'stroke');
  assert.equal(stroke.sender, ids[0]);
  assert.equal(stroke.stroke.colour, '#1e88e5');
  b.send({ type: 'guess', text: options[0] });
  assert.equal((await c.next((m) => m.type === 'state' && m.state.guessed)).state.players[1].score, 1);
  a.send({ type: 'leave' });
  const next = await b.next((m) => m.type === 'state' && m.state.drawer === ids[1]);
  assert.equal(next.state.round, 1);
  for (let round = 1; round <= 5; round++) {
    for (const drawer of round === 1 ? [ids[2]] : [ids[1], ids[2]]) {
      b.send({ type: 'next' });
      const turn = await b.next((m) => m.type === 'state' && m.state.round === round && m.state.drawer === drawer);
      assert.equal(turn.state.round, round);
    }
  }
  b.send({ type: 'next' });
  await b.next((m) => m.type === 'state' && m.state.status === 'finished');
});

test('turns reveal three letters on schedule and advance automatically', { timeout: 12000 }, async (t) => {
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
  const second = await guest.next((m) => m.type === 'state' && m.state.turn === 2);
  assert.equal(second.state.drawer, guestId);
  guest.send({ type: 'choose', word: second.state.choices[0] });
  await host.next((m) => m.type === 'state' && m.state.turn === 2 && !m.state.choosing);
  host.send({ type: 'guess', text: second.state.choices[0] });
  await guest.next((m) => m.type === 'state' && m.state.guessed);
  t.mock.timers.tick(3000);
  await host.next((m) => m.type === 'state' && m.state.turn === 3);
});
