// Test-only static host: lets the browser discover a real service-worker revision.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
let revision = 0;
const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__test/update') { revision++; res.end(String(revision)); return; }
  if (url.pathname.startsWith('/api/')) {
    try { const proxy = await fetch(`http://127.0.0.1:3198${req.url}`, { method: req.method, headers: { 'content-type': 'application/json' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise(resolve => { let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => resolve(body)); }) }); res.writeHead(proxy.status, { 'Content-Type': 'application/json' }); res.end(await proxy.text()); } catch { res.writeHead(503); res.end('{}'); } return;
  }
  let filename = path.join(process.cwd(), 'dist', url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filename.startsWith(path.join(process.cwd(), 'dist'))) { res.writeHead(403); res.end(); return; }
  try { let body; try { body = await readFile(filename); } catch { filename = path.join(process.cwd(), 'dist/index.html'); body = await readFile(filename); }
    if (url.pathname === '/sw.js') body = Buffer.concat([body, Buffer.from(`\n/* Test deployment ${revision} */`)]);
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
  } catch { res.writeHead(500); res.end(); }
}).listen(5175, '127.0.0.1');
