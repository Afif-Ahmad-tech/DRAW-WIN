<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&amp;color=0:20231f,100:85bd3b&amp;height=180&amp;section=header&amp;text=Draw%20Win&amp;fontSize=64&amp;fontColor=ffffff&amp;animation=fadeIn&amp;fontAlignY=36&amp;desc=draw%20it.%20guess%20it.&amp;descAlignY=56&amp;descSize=18" alt="Draw Win — draw it, guess it" />

<a href="https://draw-win.onrender.com"><img src="https://readme-typing-svg.demolab.com?font=Fira+Code&amp;weight=600&amp;size=22&amp;pause=900&amp;color=85BD3B&amp;center=true&amp;vCenter=true&amp;width=720&amp;lines=Draw+it.+Guess+it.;2-10+players%2C+one+shared+canvas;easy+to+difficult+word+banks;60-second+turns.+Fast+fingers+win." alt="Animated tagline: draw it, guess it — 2 to 10 players, easy to difficult word banks, 60-second turns" /></a>

<br><br>

<a href="https://draw-win.onrender.com"><img src="https://img.shields.io/badge/PLAY%20NOW-draw--win.onrender.com-b8fa6b?style=for-the-badge&amp;labelColor=20231f&amp;logo=render&amp;logoColor=white" alt="Play Draw Win now" /></a>
<img src="https://img.shields.io/badge/PLAYERS-2--10-20231f?style=for-the-badge&amp;labelColor=b8fa6b" alt="2 to 10 players" />
<img src="https://img.shields.io/badge/NODE-20.4%2B-3c873a?style=for-the-badge&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 20.4 or newer" />
<img src="https://img.shields.io/badge/BANKS-4-20231f?style=for-the-badge&amp;labelColor=b8fa6b" alt="4 difficulty word banks" />

<br><br>

<p><strong>A tiny draw-and-guess party game.</strong> One player sketches a secret word on a shared canvas; everyone else races to type it before the clock runs out.</p>

<p><sub>No accounts · no database · one room code and a lot of bad art 🎨</sub></p>

</div>

---

## ✨ Why it's fun

- 🎨 **One shared canvas** — every stroke streams to all players over WebSockets.
- ⏱️ **60-second turns** — letters reveal themselves as the clock runs down (30s, 15s and 5s left).
- 🏆 **Live scoring** — a correct guess starts at 80 points, drops 1 per second after 10s, and 1 per wrong guess, with a floor of 15. Drawers also score: 40 when at least 30% of the other players guess correctly, 80 when everyone does, 0 otherwise.
- 🔁 **Everyone draws** — 2–5 rounds, 2–5 word choices per turn, 2–10 players.
- 🎚️ **Host-picked difficulty** — Easy, Medium, Hard or Difficult word banks, each dealt without repeats until it runs out.
- 🔎 **"Close!" hints** — near-miss spellings get a private nudge, but only the exact word scores.
- 🔗 **Invite by link** — share the URL or the 4-digit room code, on any device hitting the same server.
- 🧹 **Nothing to sign up for** — rooms live in memory and vanish when the server restarts.

<details>
<summary><strong>🎮 How to play</strong> — click to unfold</summary>

1. **Create a room** — pick a name, then share the 4-digit code or the invite link.
2. **Everyone joins** — up to 10 players. The host sets rounds (2–5), word choices per turn (2–5) and difficulty (Easy / Medium / Hard / Difficult).
3. **Start** — the host can start once at least 2 players are in.
4. **Draw** — the drawer picks one of the offered words and sketches it for 60 seconds.
5. **Guess** — everyone else types guesses; correct guesses score instantly, and the turn ends early once every guesser has it.
6. **Next turn** — a 5-second leaderboard runs, the drawer banks their bonus, then the next player draws. After the final round the leaderboard stays put.
7. **Dropped?** — reconnect with the same invite link within 60 seconds and you keep your seat.

</details>

<details>
<summary><strong>🧮 Scoring, exactly</strong> — click to unfold</summary>

```text
points = max(15, 80 − max(0, seconds − 10) − wrong_guesses)
```

- ⏳ **First 10 seconds** — a correct guess is worth the full 80.
- 📉 **After that** — 1 point lost per second.
- ❌ **Wrong guesses** — 1 point lost each, for the rest of that turn.
- 🛟 **Floor** — a correct guess never drops below 15.
- 🫥 **Missed it** — no correct guess before the buzzer means 0 for that turn.

Drawers are scored separately at the end of the turn:

```text
guessed correctly: 0 → 0 points, >= 30% → 40 points, all → 80 points
```

The 30% check counts every player except the drawer: with 9 guessers, 3 or more (33%) earns the 40-point bonus, while 2 (22%) does not. 80 is reserved for the case where every guesser gets it.

</details>

<details>
<summary><strong>🧠 Words & close guesses</strong> — click to unfold</summary>

Gameplay deals from four host-selected banks — **Easy**, **Medium**, **Hard** and **Difficult** — defined in `difficulty-words.mjs`. Each room keeps its own pool for the chosen bank, so a word is not offered twice until that difficulty runs out.

A guess counts as *close* when it is one substitution, insertion or deletion away, or has two adjacent letters swapped. Close guesses get a private “Close! Check your spelling.” hint and still score nothing; only the exact word pays.

Word sources and licensing for the original 3,000-word list are documented in [WORD-SOURCES.md](WORD-SOURCES.md); that data is CC BY-SA 4.0.

</details>

<details>
<summary><strong>🛠️ Run it locally</strong> — click to unfold</summary>

Requires **Node.js 20.4+** (the tests use the built-in `node:test` mock timers).

```sh
git clone https://github.com/Afif-Ahmad-tech/DRAW-WIN.git
cd DRAW-WIN
npm install
npm start
```

Open <http://127.0.0.1:3000>, create a room, then open the invite link in another tab — or another device on the same network if you point it at your machine. `PORT` overrides the default port.

Run the test suite:

```sh
node --test
```

Seven tests cover join/reconnect/draw/guess flow, timed turns and leaderboards, drawer point thresholds, the word pool, difficulty banks, and close-guess matching.

</details>

<details>
<summary><strong>📁 Project map</strong> — click to unfold</summary>

| Path | What it does |
| --- | --- |
| `index.html` | Home, lobby, canvas, guess dock, results |
| `app.js` | WebSocket client, canvas drawing, rendering |
| `style.css` | The hand-drawn look |
| `server.mjs` | Tiny static file server with WebSockets attached |
| `multiplayer.mjs` | Rooms, turns, timers, scoring |
| `word-bank.mjs` | Word dealing and close-guess check |
| `difficulty-words.mjs` | The four host-selectable word banks |
| `words.txt` | Original 3,000-word library, kept as reference |
| `room.test.cjs`, `word-bank.test.cjs` | `node:test` suites |

</details>

## 🚀 Hosting

Runs anywhere that keeps a Node process alive — Render, Railway, Fly.io, or a VPS. There is no build step; start it with `npm start`.

Vercel and other serverless hosts are not a fit: rooms are in-memory and every game holds a long-lived WebSocket, so it needs one always-on instance.

## 🐛 Found a bug?

Open an issue at <https://github.com/Afif-Ahmad-tech/DRAW-WIN/issues>. Include the room code and what you expected to happen — bad art optional. 🖍️

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&amp;color=0:85bd3b,100:20231f&amp;height=120&amp;section=footer" alt="" />

<p><sub>Made for people who can't draw but can guess. 🖍️</sub></p>

</div>
