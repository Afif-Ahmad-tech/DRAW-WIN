const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function setup(player) {
  const elements = {};
  const board = { clearRect() {}, scale() {} };
  const document = { getElementById(id) { return elements[id] ||= { value: '', classList: { add() {}, remove() {}, toggle() {} }, style: {}, replaceChildren() {}, getContext: () => board }; } };
  const data = new Map();
  const localStorage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  const context = vm.createContext({ document, localStorage, sessionStorage: { playerId: player }, BroadcastChannel: class { postMessage() {} close() {} }, window: { addEventListener() {} }, ResizeObserver: class { observe() {} }, crypto: {}, devicePixelRatio: 1 });
  vm.runInContext(readFileSync('app.js', 'utf8'), context);
  vm.runInContext('render = () => {}', context);
  return { context, data, elements };
}

test('existing player can rejoin an active full room', () => {
  const { context, data, elements } = setup('a');
  data.set('drawwin:ROOM', JSON.stringify({ status: 'playing', players: Array.from({ length: 10 }, (_, i) => ({ id: i ? String(i) : 'a' })) }));
  elements['room-code'].value = 'ROOM';
  vm.runInContext('joinRoom()', context);
  assert.equal(vm.runInContext('!!channel', context), true);
});

test('next player draws when the current drawer leaves', () => {
  const { context, data } = setup('a');
  vm.runInContext("room = 'ROOM'; channel = new BroadcastChannel(); state = { status: 'playing', host: 'a', drawer: 'a', round: 1, players: [{id:'a'}, {id:'b'}, {id:'c'}], strokes: [] }; leaveRoom()", context);
  const saved = JSON.parse(data.get('drawwin:ROOM'));
  assert.equal(saved.drawer, 'b');
  assert.equal(saved.round, 1);
});
