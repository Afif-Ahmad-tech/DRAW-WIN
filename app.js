const $ = (id) => document.getElementById(id);
const me = sessionStorage.playerId || (sessionStorage.playerId = crypto.randomUUID());
// shortcut: room state stays in one browser profile; use a server for cross-device play.
const words = ['pancake', 'octopus', 'spaceship', 'watermelon', 'guitar', 'volcano', 'butterfly', 'castle'];
let room, channel, drawing = false, lastPoint, state;

function showError(message) { $('error').textContent = message; }
function loadRoom(code) {
  try { return JSON.parse(localStorage.getItem(`drawwin:${code}`)); } catch { return null; }
}
function save() {
  localStorage.setItem(`drawwin:${room}`, JSON.stringify(state));
  channel.postMessage({ type: 'state', state });
  render();
}
function createRoom() {
  room = Math.random().toString(36).slice(2, 7).toUpperCase();
  state = { code: room, host: me, status: 'lobby', players: [{ id: me, name: getName(), score: 0 }], round: 0, strokes: [] };
  localStorage.setItem(`drawwin:${room}`, JSON.stringify(state));
  enterRoom();
}
function joinRoom() {
  room = $('room-code').value.trim().toUpperCase();
  state = loadRoom(room);
  if (!state) return showError('That room code was not found.');
  if (state.status !== 'lobby') return showError('This game has already started.');
  if (state.players.length >= 10) return showError('This room is full (10 players max).');
  if (state.players.some((p) => p.id === me)) return enterRoom();
  state.players.push({ id: me, name: getName(), score: 0 });
  enterRoom();
  save();
}
function getName() { return $('name').value.trim() || 'Player'; }
function enterRoom() {
  if (channel) channel.close();
  channel = new BroadcastChannel(`drawwin:${room}`);
  channel.onmessage = ({ data }) => {
    if (data.type === 'state') { state = data.state; localStorage.setItem(`drawwin:${room}`, JSON.stringify(state)); render(); }
    if (data.type === 'stroke') { state.strokes.push(data.stroke); drawStroke(data.stroke, false); }
    if (data.type === 'guess') addMessage(data.name, data.text);
    if (data.type === 'correct') { addMessage(data.name, 'guessed the word!', true); state = data.state; saveLocal(); render(); }
  };
  $('home').classList.add('hidden'); $('room').classList.remove('hidden');
  render();
}
function saveLocal() { localStorage.setItem(`drawwin:${room}`, JSON.stringify(state)); }
function startGame() {
  if (state.players.length < 2 || me !== state.host) return;
  state.status = 'playing'; state.round = 0; nextTurn();
}
function nextTurn() {
  state.round++;
  if (state.round > state.players.length) { state.status = 'finished'; state.drawer = null; state.word = ''; }
  else { state.drawer = state.players[(state.round - 1) % state.players.length].id; state.word = words[Math.floor(Math.random() * words.length)]; state.guessed = false; state.strokes = []; }
  clearBoard(); $('messages').replaceChildren(); save();
}
function leaveRoom() {
  if (state) {
    state.players = state.players.filter((player) => player.id !== me);
    if (state.host === me) state.host = state.players[0]?.id;
    if (!state.players.length) localStorage.removeItem(`drawwin:${room}`);
    else {
      if (state.status === 'playing' && state.drawer === me) nextTurn();
      else { localStorage.setItem(`drawwin:${room}`, JSON.stringify(state)); }
    }
  }
  if (channel) channel.close();
  $('room').classList.add('hidden'); $('home').classList.remove('hidden'); state=null; room=null;
}
function render() {
  if (!state) return;
  $('room-title').innerHTML = `Room <span>${room}</span>`;
  $('code-display').textContent = room;
  $('players').innerHTML = state.players.map((p) => `<div class="player"><span class="avatar">${escapeHtml(p.name[0].toUpperCase())}</span>${escapeHtml(p.name)}${p.id === state.host ? '<span class="host-tag">HOST</span>' : ''}</div>`).join('');
  $('start').disabled = me !== state.host || state.players.length < 2;
  $('start').textContent = me === state.host ? (state.players.length < 2 ? 'Waiting for players…' : 'Start game ↗') : 'Waiting for host…';
  $('lobby-status').textContent = state.players.length < 2 ? 'Waiting for players…' : 'Room is ready';
  $('lobby').classList.toggle('hidden', state.status !== 'lobby'); $('game').classList.toggle('hidden', state.status === 'lobby');
  if (state.status === 'lobby') return;
  $('game-count').textContent = `${state.players.length}/10`;
  $('scoreboard').innerHTML = [...state.players].sort((a,b)=>b.score-a.score).map((p)=>`<div class="score-row"><span class="avatar">${escapeHtml(p.name[0].toUpperCase())}</span>${escapeHtml(p.name)}<span class="score">${p.score}</span></div>`).join('');
  if (state.status === 'finished') {
    $('turn-label').textContent = 'GAME OVER'; $('game-prompt').textContent = `${[...state.players].sort((a,b)=>b.score-a.score)[0].name} wins!`;
    $('word').textContent = ''; $('next').classList.add('hidden'); $('board-hint').textContent = 'Nice game!'; return;
  }
  const drawingTurn = state.drawer === me;
  const drawer = state.players.find((p)=>p.id===state.drawer);
  $('turn-label').textContent = `ROUND ${state.round} / ${state.players.length}`;
  $('game-prompt').textContent = state.guessed ? `${drawer.name} drew ${state.word}` : drawingTurn ? 'Your turn to draw!' : `${drawer.name} is drawing…`;
  $('word').textContent = drawingTurn && !state.guessed ? state.word.toUpperCase() : state.guessed ? '' : '• • • • •';
  $('board-hint').textContent = drawingTurn ? 'Draw a clue for everyone' : '';
  $('board').style.pointerEvents = drawingTurn && !state.guessed ? 'auto' : 'none';
  $('guess').disabled = drawingTurn || state.guessed;
  $('guess').placeholder = drawingTurn ? 'You are drawing…' : state.guessed ? 'Round complete' : 'Type your guess…';
  $('next').classList.toggle('hidden', me !== state.host);
  redraw();
}
function escapeHtml(value) { return value.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function point(event) { const r=$('board').getBoundingClientRect(); return { x:(event.clientX-r.left)/r.width, y:(event.clientY-r.top)/r.height }; }
function drawStroke(stroke, send=true) {
  const ctx=$('board').getContext('2d'), w=$('board').clientWidth, h=$('board').clientHeight;
  ctx.strokeStyle='#283026'; ctx.lineWidth=4; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath(); ctx.moveTo(stroke.a.x*w,stroke.a.y*h); ctx.lineTo(stroke.b.x*w,stroke.b.y*h); ctx.stroke();
  if (send) { state.strokes.push(stroke); channel.postMessage({type:'stroke',stroke}); }
}
function redraw() { clearBoard(); for (const stroke of (state?.strokes || [])) drawStroke(stroke,false); }
function clearBoard() { const c=$('board'); c.getContext('2d').clearRect(0,0,c.width,c.height); }
function addMessage(name, text, correct=false) { const div=document.createElement('div'); div.className=`message${correct?' correct':''}`; div.innerHTML=`<strong>${escapeHtml(name)}</strong> ${escapeHtml(text)}`; $('messages').append(div); $('messages').scrollTop=$('messages').scrollHeight; }

$('create').onclick = () => { showError(''); createRoom(); };
$('join').onclick = () => { showError(''); joinRoom(); };
$('start').onclick = startGame;
$('next').onclick = () => { if (me === state.host && state.status === 'playing') nextTurn(); };
$('leave').onclick = leaveRoom;
$('room-code').oninput = (e) => { e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''); };
$('board').onpointerdown = (e) => { if (!state || state.drawer!==me || state.guessed) return; drawing=true; lastPoint=point(e); $('board').setPointerCapture(e.pointerId); };
$('board').onpointermove = (e) => { if (!drawing) return; const next=point(e); drawStroke({a:lastPoint,b:next}); lastPoint=next; };
$('board').onpointerup = () => { drawing=false; };
$('clear').onclick = () => { if(state?.drawer===me && !state.guessed) { state.strokes=[]; clearBoard(); save(); } };
$('guess-form').onsubmit = (e) => {
  e.preventDefault(); const text=$('guess').value.trim(); if(!text || !state || state.status!=='playing' || state.drawer===me || state.guessed) return;
  if(text.toLowerCase()===state.word.toLowerCase()) { state.guessed=true; const player=state.players.find((p)=>p.id===me); player.score++; save(); channel.postMessage({type:'correct',name:player.name,state}); addMessage(player.name,'guessed the word!',true); }
  else { channel.postMessage({type:'guess',name:getName(),text}); addMessage(getName(),text); }
  $('guess').value='';
};
window.addEventListener('storage', (e) => { if(e.key===`drawwin:${room}` && e.newValue) { state=JSON.parse(e.newValue); render(); } });
window.addEventListener('resize', () => { const c=$('board'); if(!c || !state) return; c.width=c.clientWidth*devicePixelRatio; c.height=c.clientHeight*devicePixelRatio; c.getContext('2d').scale(devicePixelRatio,devicePixelRatio); redraw(); });
new ResizeObserver(() => { const c=$('board'); if(c.clientWidth && c.width!==c.clientWidth*devicePixelRatio) { c.width=c.clientWidth*devicePixelRatio; c.height=c.clientHeight*devicePixelRatio; c.getContext('2d').scale(devicePixelRatio,devicePixelRatio); if(state) redraw(); } }).observe($('board'));
