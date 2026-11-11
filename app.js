const $ = (id) => document.getElementById(id);
const me = sessionStorage.playerId || (sessionStorage.playerId = crypto.randomUUID());
let room, channel, drawing = false, lastPoint, state;

function showError(message) { $('error').textContent = message; }
function getName() { return $('name').value.trim() || 'Player'; }
function send(message) { if (channel?.readyState === WebSocket.OPEN) channel.send(JSON.stringify(message)); }
function connect(type) {
  if (channel) channel.close();
  const code = $('room-code').value.trim().toUpperCase();
  if (type === 'join' && !/^[A-Z0-9]{5}$/.test(code)) return showError('Enter a five-character room code.');
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const endpoint = location.hostname.endsWith('.vercel.app') ? 'wss://draw-win.onrender.com' : `${protocol}//${location.host}`;
  const socket = channel = new WebSocket(endpoint);
  socket.onopen = () => send({ type, id: me, name: getName(), code });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'error') { showError(message.text); socket.close(); return; }
    if (message.type === 'joined') {
      state = message.state; room = state.code;
      $('home').classList.add('hidden'); $('room').classList.remove('hidden');
      history.replaceState(null, '', `?room=${room}`);
      render();
    } else if (message.type === 'state') {
      const oldRound = state?.round, oldStatus = state?.status;
      state = message.state;
      if (oldRound !== state.round || oldStatus !== state.status) $('messages').replaceChildren();
      render();
    } else if (message.type === 'stroke' && state && message.sender !== me) {
      state.strokes.push(message.stroke); drawStroke(message.stroke, false);
    } else if (message.type === 'message') addMessage(message.name, message.text, message.correct);
  };
  socket.onclose = () => {
    if (channel !== socket) return;
    channel = null;
    if (state) { state = null; room = null; $('room').classList.add('hidden'); $('home').classList.remove('hidden'); showError('Connection lost. Join again with the room code.'); }
  };
  socket.onerror = () => showError('Could not connect to the game server. Please try again.');
}
function leaveRoom() {
  send({ type: 'leave' });
  const socket = channel; channel = null; if (socket) socket.close();
  $('room').classList.add('hidden'); $('home').classList.remove('hidden'); state=null; room=null;
  history.replaceState(null, '', location.pathname);
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
  if (send) { state.strokes.push(stroke); channel.send(JSON.stringify({type:'stroke',stroke})); }
}
function redraw() { clearBoard(); for (const stroke of (state?.strokes || [])) drawStroke(stroke,false); }
function clearBoard() { const c=$('board'); c.getContext('2d').clearRect(0,0,c.width,c.height); }
function addMessage(name, text, correct=false) { const div=document.createElement('div'); div.className=`message${correct?' correct':''}`; div.innerHTML=`<strong>${escapeHtml(name)}</strong> ${escapeHtml(text)}`; $('messages').append(div); $('messages').scrollTop=$('messages').scrollHeight; }

$('create').onclick = () => { showError(''); connect('create'); };
$('join').onclick = () => { showError(''); connect('join'); };
$('start').onclick = () => send({ type: 'start' });
$('next').onclick = () => send({ type: 'next' });
$('leave').onclick = leaveRoom;
$('room-code').oninput = (e) => { e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''); };
$('board').onpointerdown = (e) => { if (!state || state.drawer!==me || state.guessed) return; drawing=true; lastPoint=point(e); $('board').setPointerCapture(e.pointerId); };
$('board').onpointermove = (e) => { if (!drawing) return; const next=point(e); drawStroke({a:lastPoint,b:next}); lastPoint=next; };
$('board').onpointerup = () => { drawing=false; };
$('clear').onclick = () => send({ type: 'clear' });
$('guess-form').onsubmit = (e) => {
  e.preventDefault(); const text=$('guess').value.trim(); if(!text || !state || state.status!=='playing' || state.drawer===me || state.guessed) return;
  send({ type: 'guess', text });
  $('guess').value='';
};
$('room-code').value = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
$('invite').onclick = async () => {
  const link = new URL(location.pathname, location.origin); link.searchParams.set('room', room);
  try { await navigator.clipboard.writeText(link.href); $('invite').textContent = 'Link copied!'; }
  catch { window.prompt('Copy this invite link:', link.href); }
};
window.addEventListener('resize', () => { const c=$('board'); if(!c || !state) return; c.width=c.clientWidth*devicePixelRatio; c.height=c.clientHeight*devicePixelRatio; c.getContext('2d').scale(devicePixelRatio,devicePixelRatio); redraw(); });
new ResizeObserver(() => { const c=$('board'); if(c.clientWidth && c.width!==c.clientWidth*devicePixelRatio) { c.width=c.clientWidth*devicePixelRatio; c.height=c.clientHeight*devicePixelRatio; c.getContext('2d').scale(devicePixelRatio,devicePixelRatio); if(state) redraw(); } }).observe($('board'));
