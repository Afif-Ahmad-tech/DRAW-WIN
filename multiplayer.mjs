import { WebSocketServer, WebSocket } from 'ws';
import { randomInt } from 'node:crypto';
import { drawWords, isCloseGuess, words } from './word-bank.mjs';
import { difficultyWords } from './difficulty-words.mjs';
const colours = ['#283026', '#e53935', '#f28c28', '#f5c518', '#43a047', '#1e88e5', '#8e44ad', '#8d6e63', '#ffffff'];

export function attachMultiplayer(server) {
  // shortcut: rooms disappear on restart; use shared storage when persistence is needed.
  const rooms = new Map();
  const wss = new WebSocketServer({ server, maxPayload: 32768 });
  const send = (socket, message) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const broadcast = (room, message) => {
    for (const socket of room.clients.values()) send(socket, message);
  };
  const view = (room, id) => ({
    ...room.state,
    guessed: room.correct.has(id),
    word: id === room.state.drawer || room.correct.has(id) || room.state.status === 'leaderboard' ? room.state.word : '',
    mask: [...(room.state.word || '')].map((letter, index) => room.revealed.has(index) ? letter : /[a-z]/i.test(letter) ? '_' : letter).join(''),
    choices: id === room.state.drawer ? room.state.choices : []
  });
  const sync = (room) => {
    for (const [id, socket] of room.clients) send(socket, { type: 'state', state: view(room, id) });
  };
  function tick(room) {
    if (!['playing', 'leaderboard'].includes(room.state.status)) return;
    const remaining = room.state.endsAt - Date.now();
    if (remaining <= 0) return room.state.status === 'leaderboard' ? nextTurn(room) : endTurn(room);
    if (room.state.status === 'playing' && room.state.word) {
      const count = remaining <= 5000 ? 3 : remaining <= 15000 ? 2 : remaining <= 30000 ? 1 : 0;
      const letterIndexes = [...room.state.word].map((letter, index) => /[a-z]/i.test(letter) ? index : -1).filter((index) => index >= 0);
      let changed = false;
      while (room.revealed.size < Math.min(count, letterIndexes.length)) {
        const available = letterIndexes.filter((index) => !room.revealed.has(index));
        room.revealed.add(available[randomInt(available.length)]); changed = true;
      }
      if (changed) sync(room);
    }
    room.clock = setTimeout(() => tick(room), Math.min(1000, remaining));
    room.clock.unref();
  }
  function endTurn(room) {
    clearTimeout(room.clock);
    const state = room.state;
    state.status = 'leaderboard'; state.choosing = false; state.choices = [];
    state.endsAt = Date.now() + 5000;
    state.leaderboard = [...state.players].sort((a, b) => b.score - a.score).map((p) => ({ ...p, gained: p.score - (room.scoresAtStart?.[p.id] || 0) }));
    sync(room); tick(room);
  }
  function nextTurn(room) {
    clearTimeout(room.clock);
    room.revealed.clear();
    room.correct.clear(); room.wrongGuesses.clear();
    const state = room.state;
    const next = room.turns.shift();
    state.turn++;
    state.strokes = []; state.word = '';
    if (!next) {
      state.endsAt = null;
      state.status = 'finished'; state.drawer = null; state.choices = []; state.choosing = false;
    } else {
      state.status = 'playing';
      room.scoresAtStart = Object.fromEntries(state.players.map((p) => [p.id, p.score]));
      state.leaderboard = [];
      state.endsAt = Date.now() + 60000;
      state.round = next.round; state.drawer = next.id;
      state.choices = drawWords(room.wordPool, state.settings.choices, difficultyWords[state.settings.difficulty] || words);
      state.choosing = true;
    }
    sync(room);
    if (next) tick(room);
  }
  function removePlayer(room, id) {
    const state = room.state;
    const index = state.players.findIndex((p) => p.id === id);
    if (index < 0) return;
    room.turns = room.turns.filter((turn) => turn.id !== id);
    state.players.splice(index, 1);
    room.clients.delete(id);
    if (!state.players.length) { clearTimeout(room.clock); rooms.delete(state.code); return; }
    if (state.host === id) state.host = state.players[0].id;
    room.correct.delete(id); room.wrongGuesses.delete(id);
    if (state.status === 'playing' && (state.drawer === id || state.players.every((p) => p.id === state.drawer || room.correct.has(p.id)))) endTurn(room);
    else sync(room);
  }
  wss.on('connection', (socket) => {
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    let room, id;
    socket.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      if (!message || typeof message !== 'object') return;
      if (message.type === 'ping') { send(socket, { type: 'pong' }); return; }
      if (!room && (message.type === 'create' || message.type === 'join')) {
        if (typeof message.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(message.id)) return;
        id = message.id;
        const name = typeof message.name === 'string' ? message.name.trim().slice(0, 18) || 'Player' : 'Player';
        if (message.type === 'create') {
          if (rooms.size >= 500) return send(socket, { type: 'error', text: 'Server is full. Try again later.' });
          let code;
          do { code = String(randomInt(10000)).padStart(4, '0'); } while (rooms.has(code));
          room = { state: { code, host: id, status: 'lobby', players: [{ id, name, score: 0 }], settings: { rounds: 2, choices: 2, difficulty: 'easy' }, round: 0, turn: 0, word: '', choices: [], strokes: [] }, turns: [], wordPool: [], revealed: new Set(), correct: new Set(), wrongGuesses: new Map(), clients: new Map(), timers: new Map() };
          rooms.set(code, room);
        } else {
          room = typeof message.code === 'string' && /^[0-9]{4}$/.test(message.code) ? rooms.get(message.code) : null;
          if (!room) return send(socket, { type: 'error', text: 'That room code was not found.' });
          const player = room.state.players.find((p) => p.id === id);
          if (!player && room.state.status !== 'lobby') { room = null; return send(socket, { type: 'error', text: 'This game has already started.' }); }
          if (!player && room.state.players.length >= 10) { room = null; return send(socket, { type: 'error', text: 'This room is full (10 players max).' }); }
          if (!player) room.state.players.push({ id, name, score: 0 });
          else player.name = name;
        }
        clearTimeout(room.timers.get(id)); room.timers.delete(id);
        const previous = room.clients.get(id);
        room.clients.set(id, socket);
        if (previous && previous !== socket) previous.close();
        send(socket, { type: 'joined', state: view(room, id) });
        sync(room);
        return;
      }
      if (!room || room.clients.get(id) !== socket) return;
      const state = room.state;
      if (message.type === 'leave') { removePlayer(room, id); room = null; return; }
      if (message.type === 'rename') {
        const name = typeof message.name === 'string' ? message.name.trim().slice(0, 18) : '';
        if (!name) return;
        state.players.find((p) => p.id === id).name = name;
        const standing = state.leaderboard?.find((p) => p.id === id);
        if (standing) standing.name = name;
        sync(room); return;
      }
      if (['playing', 'leaderboard'].includes(state.status) && Date.now() >= state.endsAt) {
        if (state.status === 'leaderboard') nextTurn(room); else endTurn(room);
        return;
      }
      if (message.type === 'settings' && id === state.host && state.status === 'lobby') {
        if (!Number.isInteger(message.rounds) || message.rounds < 2 || message.rounds > 5 || !Number.isInteger(message.choices) || message.choices < 2 || message.choices > 5) return;
        const difficulty = message.difficulty === undefined ? state.settings.difficulty : message.difficulty;
        if (!Object.hasOwn(difficultyWords, difficulty)) return;
        if (difficulty !== state.settings.difficulty) room.wordPool = [];
        state.settings = { rounds: message.rounds, choices: message.choices, difficulty }; sync(room);
      } else if (message.type === 'start' && id === state.host && state.status === 'lobby' && state.players.length >= 2) {
        room.turns = Array.from({ length: state.settings.rounds }, (_, round) => state.players.map((p) => ({ id: p.id, round: round + 1 }))).flat();
        room.wordPool = [];
        state.status = 'playing'; state.round = 0; state.turn = 0; nextTurn(room);
      } else if (message.type === 'choose' && id === state.drawer && state.status === 'playing' && state.choosing && state.choices.includes(message.word)) {
        state.word = message.word; state.choices = []; state.choosing = false; sync(room);
      }
      else if (message.type === 'clear' && id === state.drawer && state.status === 'playing') { state.strokes = []; sync(room); }
      else if (message.type === 'stroke' && id === state.drawer && state.status === 'playing' && !state.choosing && state.strokes.length < 10000) {
        const stroke = message.stroke;
        if (!stroke || ![stroke.a?.x, stroke.a?.y, stroke.b?.x, stroke.b?.y].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 2)) return;
        if (!colours.includes(stroke.colour)) return;
        const clean = { a: { x: stroke.a.x, y: stroke.a.y }, b: { x: stroke.b.x, y: stroke.b.y }, colour: stroke.colour };
        state.strokes.push(clean);
        broadcast(room, { type: 'stroke', stroke: clean, sender: id });
      } else if (message.type === 'guess' && id !== state.drawer && state.status === 'playing' && !state.choosing && !room.correct.has(id) && typeof message.text === 'string') {
        if (message.turn !== undefined && message.turn !== state.turn) return;
        const text = message.text.trim().slice(0, 80), player = state.players.find((p) => p.id === id);
        if (!text || !player) return;
        if (text.toLowerCase() === state.word.toLowerCase()) {
          const elapsed = Math.floor((Date.now() - (state.endsAt - 60000)) / 1000);
          const points = Math.max(15, 80 - Math.max(0, elapsed - 10) - (room.wrongGuesses.get(id) || 0));
          room.correct.add(id); player.score += points;
          send(socket, { type: 'guess-result', turn: state.turn, correct: true, guess: text, points });
          broadcast(room, { type: 'message', name: player.name, text: 'guessed the word!', correct: true });
          if (state.players.every((p) => p.id === state.drawer || room.correct.has(p.id))) endTurn(room);
          else sync(room);
        } else {
          room.wrongGuesses.set(id, (room.wrongGuesses.get(id) || 0) + 1);
          send(socket, { type: 'guess-result', turn: state.turn, correct: false, close: isCloseGuess(text, state.word), guess: text });
          broadcast(room, { type: 'message', name: player.name, text });
        }
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
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.alive) socket.terminate();
      else { socket.alive = false; socket.ping(); }
    }
  }, 30000);
  heartbeat.unref();
  wss.on('close', () => {
    clearInterval(heartbeat);
    for (const room of rooms.values()) { clearTimeout(room.clock); for (const timer of room.timers.values()) clearTimeout(timer); }
  });
  return wss;
}
