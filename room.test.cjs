const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const WebSocket = require('ws');
const { once } = require('node:events');

test('separate clients can join, draw, guess and continue after the drawer leaves', async (t) => {
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
      send: (message) => socket.send(JSON.stringify(message)),
      next: (predicate) => {
        const index = queue.findIndex(predicate);
        return index < 0 ? new Promise((resolve) => waiters.push({ predicate, resolve })) : Promise.resolve(queue.splice(index, 1)[0]);
      }
    };
  }
  const a = await client(), b = await client(), c = await client();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  a.send({ type: 'create', id: ids[0], name: 'A' });
  const created = await a.next((m) => m.type === 'joined');
  for (const [client, id, name] of [[b, ids[1], 'B'], [c, ids[2], 'C']]) {
    client.send({ type: 'join', code: created.state.code, id, name });
    await client.next((m) => m.type === 'joined');
  }
  await a.next((m) => m.type === 'state' && m.state.players.length === 3);
  a.send({ type: 'start' });
  const playing = await b.next((m) => m.type === 'state' && m.state.status === 'playing');
  assert.equal(playing.state.drawer, ids[0]);
  a.send({ type: 'stroke', stroke: { a: { x: 0.1, y: 0.2 }, b: { x: 0.3, y: 0.4 } } });
  assert.equal((await b.next((m) => m.type === 'stroke')).sender, ids[0]);
  b.send({ type: 'guess', text: playing.state.word });
  assert.equal((await c.next((m) => m.type === 'state' && m.state.guessed)).state.players[1].score, 1);
  a.send({ type: 'leave' });
  const next = await b.next((m) => m.type === 'state' && m.state.drawer === ids[1]);
  assert.equal(next.state.round, 1);
});
