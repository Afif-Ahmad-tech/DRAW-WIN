import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachMultiplayer } from './multiplayer.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };

const server = createServer(async (req, res) => {
  try {
    const file = files[new URL(req.url, 'http://localhost').pathname];
    if (!file) throw new Error('Not found');
    const body = await readFile(join(root, file[0]));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
attachMultiplayer(server);
server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('Draw Win is running'));
