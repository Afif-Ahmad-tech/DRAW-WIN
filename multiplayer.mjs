import { WebSocketServer, WebSocket } from 'ws';
import { randomInt } from 'node:crypto';

const words = ['pancake', 'octopus', 'spaceship', 'watermelon', 'guitar', 'volcano', 'butterfly', 'castle'];
const rooms = new Map();
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function attachMultiplayer(server) {
  const wss = new WebSocketServer({ server, maxPayload: 32768 });
  const send = (socket, message) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const broadcast = (room, message) => {
    for (const socket of room.clients.values()) send(socket, message);
  };
  const sync = (room) => broadcast(room, { type: 'state', state: room.state });
  function nextTurn(room) {
    const state = room.state;
    state.round++;
    if (state.round > state.players.length) {
      state.status = 'finished'; state.drawer = null; state.word = '';
    } else {
      state.drawer = state.players[state.round - 1].id;
      state.word = words[randomInt(words.length)];
      state.guessed = false; state.strokes = [];
    }
    sync(room);
  }
  function removePlayer(room, id) {
    const state = room.state;
    const index = state.players.findIndex((p) => p.id === id);
    if (index < 0) return;
    if (state.status === 'playing' && index < state.round) state.round--;
    state.players.splice(index, 1);
    room.clients.delete(id);
    if (!state.players.length) { rooms.delete(state.code); return; }
    if (state.host === id) state.host = state.players[0].id;
    if (state.status === 'playing' && state.drawer === id) nextTurn(room);
    else sync(room);
  }
  wss.on('connection', (socket) => {
    let room, id;
    socket.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      if (!message || typeof message !== 'object') return;
      if (!room && (message.type === 'create' || message.type === 'join')) {
        if (typeof message.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(message.id)) return;
        id = message.id;
        const name = typeof message.name === 'string' ? message.name.trim().slice(0, 18) || 'Player' : 'Player';
        if (message.type === 'create') {
          if (rooms.size >= 500) return send(socket, { type: 'error', text: 'Server is full. Try again later.' });
          let code;
          do { code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
          room = { state: { code, host: id, status: 'lobby', players: [{ id, name, score: 0 }], round: 0, strokes: [] }, clients: new Map(), timers: new Map() };
          rooms.set(code, room);
        } else {
          room = typeof message.code === 'string' && /^[A-Z0-9]{5}$/.test(message.code) ? rooms.get(message.code) : null;
          if (!room) return send(socket, { type: 'error', text: 'That room code was not found.' });
          const player = room.state.players.find((p) => p.id === id);
          if (!player && room.state.status !== 'lobby') { room = null; return send(socket, { type: 'error', text: 'This game has already started.' }); }
          if (!player && room.state.players.length >= 10) { room = null; return send(socket, { type: 'error', text: 'This room is full (10 players max).' }); }
          if (!player) room.state.players.push({ id, name, score: 0 });
        }
        clearTimeout(room.timers.get(id)); room.timers.delete(id);
        const previous = room.clients.get(id);
        room.clients.set(id, socket);
        if (previous && previous !== socket) previous.close();
        send(socket, { type: 'joined', state: room.state });
        sync(room);
        return;
      }
      if (!room || room.clients.get(id) !== socket) return;
      const state = room.state;
      if (message.type === 'leave') { removePlayer(room, id); room = null; return; }
      if (message.type === 'start' && id === state.host && state.status === 'lobby' && state.players.length >= 2) {
        state.status = 'playing'; state.round = 0; nextTurn(room);
      } else if (message.type === 'next' && id === state.host && state.status === 'playing') nextTurn(room);
      else if (message.type === 'clear' && id === state.drawer && state.status === 'playing' && !state.guessed) { state.strokes = []; sync(room); }
      else if (message.type === 'stroke' && id === state.drawer && state.status === 'playing' && !state.guessed && state.strokes.length < 10000) {
        const stroke = message.stroke;
        if (!stroke || ![stroke.a?.x, stroke.a?.y, stroke.b?.x, stroke.b?.y].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 2)) return;
        state.strokes.push(stroke);
        broadcast(room, { type: 'stroke', stroke, sender: id });
      } else if (message.type === 'guess' && id !== state.drawer && state.status === 'playing' && !state.guessed && typeof message.text === 'string') {
        const text = message.text.trim().slice(0, 80), player = state.players.find((p) => p.id === id);
        if (!text || !player) return;
        if (text.toLowerCase() === state.word.toLowerCase()) {
          state.guessed = true; player.score++;
          broadcast(room, { type: 'message', name: player.name, text: 'guessed the word!', correct: true });
          sync(room);
        } else broadcast(room, { type: 'message', name: player.name, text });
      }
    });
    socket.on('close', () => {
      if (!room || room.clients.get(id) !== socket) return;
      room.clients.delete(id);
      const savedRoom = room, savedId = id;
      const timer = setTimeout(() => removePlayer(savedRoom, savedId), 60000);
      timer.unref();
      room.timers.set(id, timer);
    });
    socket.on('error', () => {});
  });
  return wss;
}
