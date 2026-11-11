const $ = (id) => document.getElementById(id);
const me = sessionStorage.playerId || (sessionStorage.playerId = crypto.randomUUID());
let room, channel, drawing = false, lastPoint, state;
let selectedColour = '#283026';
let retryTimer, retries = 0;
let rejectedGuess = '', guessFlashTimer;
const colours = [['Black', '#283026'], ['Red', '#e53935'], ['Orange', '#f28c28'], ['Yellow', '#f5c518'], ['Green', '#43a047'], ['Blue', '#1e88e5'], ['Purple', '#8e44ad'], ['Brown', '#8d6e63'], ['White', '#ffffff']];

function showError(message) { $('error').textContent = message; }
function getName() { return localStorage.playerName?.trim() || ''; }
function connectionStatus(text) { $('connection-status').textContent = text; }
function send(message) {
  if (channel?.readyState !== WebSocket.OPEN) { connectionStatus('Reconnecting…'); return false; }
  channel.send(JSON.stringify(message)); return true;
}
function connect(type, retry = false) {
  if (!getName()) { $('profile-dialog').showModal(); return; }
  clearTimeout(retryTimer);
  const previous = channel; channel = null; if (previous) previous.close();
  if (!retry) retries = 0;
  const code = retry ? room || sessionStorage.activeRoom || $('room-code').value.trim() : $('room-code').value.trim();
  if (type === 'join' && !/^[0-9]{4}$/.test(code)) return showError('Enter a four-digit room code.');
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const endpoint = `${protocol}//${location.host}`;
  const socket = channel = new WebSocket(endpoint);
  connectionStatus(retry ? 'Reconnecting…' : 'Connecting…');
  $('create').disabled = $('join').disabled = true;
  let rejected = false;
  let lastMessage = Date.now(), heartbeat;
  const timeout = setTimeout(() => { if (channel === socket) socket.close(); }, 40000);
  socket.onopen = () => {
    if (channel !== socket) return;
    socket.send(JSON.stringify({ type, id: me, name: getName(), code }));
    heartbeat = setInterval(() => {
      if (Date.now() - lastMessage > 45000) { socket.close(); return; }
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
    }, 15000);
  };
  socket.onmessage = ({ data }) => {
    if (channel !== socket) return;
    lastMessage = Date.now();
    const message = JSON.parse(data);
    if (message.type === 'error') {
      rejected = true; clearTimeout(timeout); sessionStorage.removeItem('activeRoom');
      state = null; room = null; drawing = false;
      $('room').classList.add('hidden'); $('home').classList.remove('hidden');
      showError(message.text); socket.close(); return;
    }
    if (message.type === 'joined') {
      if (state?.turn !== message.state.turn) resetGuess();
      state = message.state; room = state.code;
      clearTimeout(timeout); retries = 0; connectionStatus('Connected');
      $('create').disabled = $('join').disabled = false;
      sessionStorage.activeRoom = room;
      $('home').classList.add('hidden'); $('room').classList.remove('hidden');
      history.replaceState(null, '', `?room=${room}`);
      render();
    } else if (message.type === 'state') {
      const oldRound = state?.turn, oldStatus = state?.status;
      state = message.state;
      if (oldRound !== state.turn || oldStatus !== state.status) { drawing = false; resetGuess(); }
      if (oldRound !== state.turn) $('flying-guesses').replaceChildren();
      render();
    } else if (message.type === 'stroke' && state && message.sender !== me) {
      state.strokes.push(message.stroke); drawStroke(message.stroke, false);
    } else if (message.type === 'message') showGuess(message.name, message.text, message.correct);
    else if (message.type === 'guess-result' && message.turn === state?.turn) {
      const nextInput = $('guess').value;
      resetGuess();
      if (!message.correct && nextInput) $('guess').value = nextInput;
      $('guess-feedback').textContent = message.correct ? `You guessed right! +${message.points} points` : message.close ? 'Close! Check your spelling.' : 'Not quite. Try again!';
      $('guess-feedback').classList.add(message.correct ? 'correct' : 'incorrect');
      if (!message.correct && !nextInput) {
        rejectedGuess = message.guess.toUpperCase(); $('guess-slots').classList.add('guess-wrong'); previewGuess();
        guessFlashTimer = setTimeout(() => { rejectedGuess = ''; $('guess-slots').classList.remove('guess-wrong'); previewGuess(); }, 650);
      } else previewGuess();
    }
  };
  socket.onclose = () => {
    clearInterval(heartbeat);
    clearTimeout(timeout);
    if (channel !== socket) return;
    channel = null;
    drawing = false;
    $('create').disabled = $('join').disabled = false;
    if (rejected) { connectionStatus(''); return; }
    if (retries++ < 8) {
      connectionStatus('Reconnecting…');
      retryTimer = setTimeout(() => connect(room ? 'join' : type, true), Math.min(1000 * 2 ** retries, 10000));
    } else { connectionStatus('Disconnected'); showError('Could not reconnect. Please try joining again.'); }
  };
  socket.onerror = () => connectionStatus('Reconnecting…');
}
function leaveRoom() {
  resetGuess();
  $('flying-guesses').replaceChildren();
  clearTimeout(retryTimer);
  sessionStorage.removeItem('activeRoom');
  send({ type: 'leave' });
  const socket = channel; channel = null; if (socket) socket.close();
  connectionStatus(''); $('create').disabled = $('join').disabled = false;
  $('room').classList.add('hidden'); $('home').classList.remove('hidden'); state=null; room=null;
  history.replaceState(null, '', location.pathname);
}
function render() {
  if (!state) return;
  $('room-title').innerHTML = `Room <span>${room}</span>`;
  $('code-display').textContent = room;
  const settings = state.settings || { rounds: 2, choices: 2, difficulty: 'easy' };
  $('host-settings').classList.toggle('hidden', me !== state.host);
  $('settings-summary').classList.toggle('hidden', me === state.host);
  $('rounds').value = settings.rounds;
  $('choices-count').value = settings.choices;
  $('difficulty').value = settings.difficulty;
  $('settings-summary').textContent = settings.rounds + ' rounds, ' + settings.choices + ' word choices, ' + settings.difficulty + ' difficulty';
  $('players').innerHTML = state.players.map((p) => `<div class="player"><span class="avatar">${escapeHtml(p.name[0].toUpperCase())}</span>${escapeHtml(p.name)}${p.id === state.host ? '<span class="host-tag">HOST</span>' : ''}</div>`).join('');
  $('start').disabled = me !== state.host || state.players.length < 2;
  $('start').textContent = me === state.host ? (state.players.length < 2 ? 'Waiting for players…' : 'Start game ↗') : 'Waiting for host…';
  $('lobby-status').textContent = state.players.length < 2 ? 'Waiting for players…' : 'Room is ready';
  const results = ['leaderboard', 'finished'].includes(state.status);
  $('lobby').classList.toggle('hidden', state.status !== 'lobby');
  $('game').classList.toggle('hidden', state.status !== 'playing');
  $('turn-results').classList.toggle('hidden', !results);
  if (state.status === 'lobby') return;
  $('game-count').textContent = `${state.players.length}/10`;
  $('scoreboard').innerHTML = [...state.players].sort((a,b)=>b.score-a.score).map((p)=>`<div class="score-row"><span class="avatar">${escapeHtml(p.name[0].toUpperCase())}</span>${escapeHtml(p.name)}<span class="score">${p.score}</span></div>`).join('');
  $('word-choices').classList.add('hidden');
  if (results) {
    const standings = state.leaderboard || [];
    $('results-title').textContent = state.status === 'finished' ? 'Final leaderboard' : 'Turn complete';
    const ownResult = standings.find((p) => p.id === me);
    const winners = standings.filter((p) => p.score === standings[0]?.score).map((p) => p.name);
    const winnerText = winners.length > 1 ? `${winners.join(', ')} tie for first!` : `${winners[0] || 'Player'} wins!`;
    $('results-summary').textContent = state.status === 'finished' ? winnerText : (ownResult?.gained > 0 ? `You earned ${ownResult.gained} points! ` : '') + (state.word ? `The word was ${state.word}.` : 'No word was selected.');
    $('leaderboard').innerHTML = standings.map((p, index) => `<li class="leaderboard-row"><span class="rank">${index + 1}</span><span class="leaderboard-name">${escapeHtml(p.name)}${p.id === me ? ' (you)' : ''}</span><span class="turn-gain">+${p.gained} this turn</span><strong>${p.score} pts</strong></li>`).join('');
    return;
  }
  const drawingTurn = state.drawer === me;
  const drawer = state.players.find((p)=>p.id===state.drawer);
  $('turn-label').textContent = `ROUND ${state.round} / ${settings.rounds}`;
  $('game-prompt').textContent = state.guessed ? `${drawer.name} drew ${state.word}` : drawingTurn ? 'Your turn to draw!' : `${drawer.name} is drawing…`;
  $('word').textContent = drawingTurn && !state.choosing && !state.guessed ? state.word.toUpperCase() : '';
  if (state.choosing) $('game-prompt').textContent = drawingTurn ? 'Choose a word to draw' : `${drawer.name} is choosing a word…`;
  $('word-choices').classList.toggle('hidden', !drawingTurn || !state.choosing);
  $('word-options').replaceChildren();
  for (const word of state.choices || []) {
    const button = document.createElement('button'); button.className = 'secondary'; button.textContent = word;
    button.onclick = () => send({ type: 'choose', word }); $('word-options').append(button);
  }
  $('colours').classList.toggle('hidden', !drawingTurn);
  $('drawing-tools').classList.toggle('hidden', !drawingTurn);
  $('guess-dock').classList.toggle('hidden', drawingTurn);
  $('clear').disabled = !drawingTurn || state.choosing || state.guessed;
  $('board-hint').textContent = drawingTurn && !state.strokes.length ? 'Draw a clue for everyone' : '';
  $('board').style.pointerEvents = drawingTurn && !state.choosing && !state.guessed ? 'auto' : 'none';
  $('guess').disabled = drawingTurn || state.choosing || state.guessed;
  $('guess').maxLength = state.mask?.length || 80;
  $('guess').setAttribute('aria-label', 'Your guess' + (state.mask ? ', ' + state.mask.length + ' letters. Pattern: ' + [...state.mask].map((letter) => letter === '_' ? 'blank' : letter).join(' ') : ''));
  $('guess-slots').textContent = state.choosing ? 'Waiting for a word…' : '';
  previewGuess();
  redraw();
}
function resetGuess() {
  clearTimeout(guessFlashTimer); rejectedGuess = '';
  $('guess').value = ''; $('guess-feedback').textContent = ''; $('guess-feedback').classList.remove('correct', 'incorrect');
  $('guess-slots').classList.remove('guess-wrong'); $('guess-slots').textContent = '';
}
function previewGuess() {
  if (!state || state.status !== 'playing' || state.drawer === me || state.choosing || state.guessed) return;
  const mask = state.mask || state.word.replace(/[a-z]/gi, '_');
  const typed = $('guess').value.trim().toUpperCase();
  $('guess-slots').textContent = rejectedGuess || [...mask].map((letter, index) => typed[index] || letter.toUpperCase()).join('');
}
setInterval(() => {
  $('turn-timer').textContent = state?.status === 'playing' && state.endsAt ? Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000)) + 's' : '';
  $('results-countdown').textContent = state?.status === 'leaderboard' ? 'Continuing in ' + Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000)) + ' seconds…' : '';
}, 250);
function escapeHtml(value) { return value.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function point(event) { const r=$('board').getBoundingClientRect(); return { x:(event.clientX-r.left)/r.width, y:(event.clientY-r.top)/r.height }; }
function drawStroke(stroke, send=true) {
  if (send && channel?.readyState !== WebSocket.OPEN) return;
  const ctx=$('board').getContext('2d'), w=$('board').clientWidth, h=$('board').clientHeight;
  ctx.strokeStyle=stroke.colour || '#283026'; ctx.lineWidth=4; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath(); ctx.moveTo(stroke.a.x*w,stroke.a.y*h); ctx.lineTo(stroke.b.x*w,stroke.b.y*h); ctx.stroke();
  if (send) { state.strokes.push(stroke); $('board-hint').textContent = ''; channel.send(JSON.stringify({type:'stroke',stroke})); }
}
function redraw() { clearBoard(); for (const stroke of (state?.strokes || [])) drawStroke(stroke,false); }
function clearBoard() { const c=$('board'); c.getContext('2d').clearRect(0,0,c.width,c.height); }
function showGuess(name, text, correct=false) {
  const chip = document.createElement('div'); chip.className = 'flying-guess' + (correct ? ' correct' : '');
  chip.textContent = name + ': ' + text;
  chip.style.top = ($('flying-guesses').children.length % 3) * 36 + 'px';
  if ($('flying-guesses').children.length >= 9) $('flying-guesses').firstElementChild.remove();
  $('flying-guesses').append(chip);
  chip.addEventListener('animationend', () => chip.remove(), { once: true });
  setTimeout(() => chip.remove(), 7000);
}

$('create').onclick = () => { showError(''); connect('create'); };
$('join').onclick = () => { showError(''); connect('join'); };
$('profile-button').onclick = () => {
  $('profile-input').value = getName();
  $('profile-cancel').classList.toggle('hidden', !getName());
  $('profile-dialog').showModal();
};
$('profile-cancel').onclick = () => $('profile-dialog').close();
$('profile-dialog').oncancel = (event) => { if (!getName()) event.preventDefault(); };
$('profile-input').oninput = () => $('profile-input').setCustomValidity('');
$('profile-form').onsubmit = (event) => {
  event.preventDefault();
  const name = $('profile-input').value.trim();
  if (!name) { $('profile-input').setCustomValidity('Enter a name.'); $('profile-input').reportValidity(); return; }
  localStorage.playerName = name;
  $('profile-name').textContent = name;
  $('profile-avatar').textContent = name[0].toUpperCase();
  $('profile-dialog').close();
  if (state) send({ type: 'rename', name });
  else if (sessionStorage.activeRoom && sessionStorage.activeRoom === $('room-code').value) connect('join');
};
$('start').onclick = () => send({ type: 'start' });
for (const id of ['rounds', 'choices-count', 'difficulty']) $(id).onchange = () => send({ type: 'settings', rounds: Number($('rounds').value), choices: Number($('choices-count').value), difficulty: $('difficulty').value });
for (const [name, colour] of colours) {
  const button = document.createElement('button'); button.className = 'colour-swatch'; button.style.backgroundColor = colour;
  if (colour === '#ffffff') button.style.borderColor = '#b8bcb1';
  button.setAttribute('aria-label', name); button.setAttribute('aria-pressed', String(colour === selectedColour));
  button.onclick = () => {
    selectedColour = colour;
    for (const swatch of $('colours').children) swatch.setAttribute('aria-pressed', String(swatch === button));
  };
  $('colours').append(button);
}
$('leave').onclick = leaveRoom;
$('room-code').oninput = (e) => { e.target.value=e.target.value.replace(/[^0-9]/g,'').slice(0, 4); };
$('board').onpointerdown = (e) => { if (!state || channel?.readyState !== WebSocket.OPEN || state.status!=='playing' || state.drawer!==me || state.choosing || state.guessed) return; drawing=true; lastPoint=point(e); $('board').setPointerCapture(e.pointerId); };
$('board').onpointermove = (e) => { if (!drawing) return; const next=point(e); drawStroke({a:lastPoint,b:next,colour:selectedColour}); lastPoint=next; };
$('board').onpointerup = () => { drawing=false; };
$('clear').onclick = () => send({ type: 'clear' });
$('guess-form').onsubmit = (e) => {
  e.preventDefault(); const text=$('guess').value.trim(); if(!text || !state || state.status!=='playing' || state.drawer===me || state.guessed) return;
  if (send({ type: 'guess', text, turn: state.turn })) { $('guess').value=''; previewGuess(); }
};
$('guess').oninput = () => {
  clearTimeout(guessFlashTimer); rejectedGuess = '';
  $('guess-slots').classList.remove('guess-wrong'); $('guess-feedback').textContent = '';
  previewGuess();
};
const inviteCode = new URLSearchParams(location.search).get('room') || '';
$('room-code').value = /^[0-9]{4}$/.test(inviteCode) ? inviteCode : '';
if (!getName() && sessionStorage.playerName) localStorage.playerName = sessionStorage.playerName.trim();
if (getName()) {
  $('profile-name').textContent = getName();
  $('profile-avatar').textContent = getName()[0].toUpperCase();
  if (sessionStorage.activeRoom && sessionStorage.activeRoom === $('room-code').value) connect('join');
} else $('profile-button').click();

$('invite').onclick = async () => {
  const link = new URL(location.pathname, location.origin); link.searchParams.set('room', room);
  try { await navigator.clipboard.writeText(link.href); $('invite').textContent = 'Link copied!'; }
  catch { window.prompt('Copy this invite link:', link.href); }
};
window.addEventListener('resize', () => { const c=$('board'); if(!c || !state) return; c.width=c.clientWidth*devicePixelRatio; c.height=c.clientHeight*devicePixelRatio; c.getContext('2d').scale(devicePixelRatio,devicePixelRatio); redraw(); });
new ResizeObserver(() => { const c=$('board'); if(c.clientWidth && (c.width!==Math.round(c.clientWidth*devicePixelRatio) || c.height!==Math.round(c.clientHeight*devicePixelRatio))) { c.width=c.clientWidth*devicePixelRatio; c.height=c.clientHeight*devicePixelRatio; c.getContext('2d').scale(devicePixelRatio,devicePixelRatio); if(state) redraw(); } }).observe($('board'));
