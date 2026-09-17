// Zero-dependency static server with no-store caching, so edited modules always reload.
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const port = Number(process.env.PORT || 8082);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
};

// Dev-only: `PUT /__screenshot/<name>` stores a PNG body under docs/screenshots/ so the game
// can save its own high-res captures (window.__dro.shot(name) in the browser console).
async function saveScreenshot(req, res, name) {
  if (!/^[a-z0-9-]{1,40}$/.test(name)) { res.writeHead(400); return res.end('bad name'); }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const dir = join(root, 'docs', 'screenshots');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.png`), Buffer.concat(chunks));
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`saved docs/screenshots/${name}.png (${Buffer.concat(chunks).length} bytes)`);
}

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (req.method === 'PUT' && path.startsWith('/__screenshot/')) return saveScreenshot(req, res, path.slice('/__screenshot/'.length));
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
    const info = await stat(file);
    if (!info.isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' });
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
    res.end(err.code === 'ENOENT' ? 'Not found' : 'Error');
  }
}).listen(port, () => console.log(`dungion-ro dev server: http://localhost:${port}`));
