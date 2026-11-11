# Draw Win

A draw-and-guess game for 2–10 players.

## Run locally

```sh
npm start
```

Open <http://127.0.0.1:3000> in two or more tabs. Create a room and share the invite link or code. The host starts the game after at least two players have joined.

Online players must use the same hosted server. Rooms are kept in memory and are lost when the server restarts.

Each room draws its choices from a 3,000-word library without repeating shown options until the library is exhausted. Close spelling guesses (one insertion, deletion, substitution or adjacent letter swap) receive a private hint but do not score until the exact word is entered.

Turns advance automatically. A five-second leaderboard shows total scores and points earned after every turn, before the next drawer starts. The final leaderboard stays visible when the game ends.

Word-list sources and licensing are documented in [WORD-SOURCES.md](WORD-SOURCES.md).
