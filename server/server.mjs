// Standalone Node server for Coolify: serves the built frontend (dist/) and mounts
// the real application router at /functions/v1/app/* against Postgres.
//
// Env:
//   PORT            listen port (default 3000)
//   HOST            bind host (default 0.0.0.0)
//   DATABASE_URL    postgres connection string (required)
//   APP_ORIGIN      fixed public https origin, e.g. https://app.example.com
//   ENFORCE_ORIGIN  optional override; defaults to true when APP_ORIGIN is https
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApplication } from '../functions/router.mjs';
import { createPool, createPostgresDb } from './db-postgres.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, '..', 'dist');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const APP_ORIGIN = (process.env.APP_ORIGIN || '').trim();
const ENFORCE_ORIGIN = process.env.ENFORCE_ORIGIN != null
  ? process.env.ENFORCE_ORIGIN === 'true'
  : /^https:\/\//.test(APP_ORIGIN);

if (!process.env.DATABASE_URL) {
  console.error('[server] DATABASE_URL is required');
  process.exit(1);
}

const API_PREFIX = '/functions/v1/app';
const BODY_LIMIT = 16 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

const pool = createPool(process.env.DATABASE_URL);
const db = createPostgresDb(pool);
const handle = createApplication({ db, origin: APP_ORIGIN, enforceOrigin: ENFORCE_ORIGIN });

function pathnameOf(req) {
  try { return new URL(req.url, 'http://localhost').pathname; } catch { return '/'; }
}

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain' }); res.end('Method Not Allowed'); return;
  }
  let rel;
  try { rel = decodeURIComponent(pathnameOf(req)); } catch { rel = '/'; }
  const relPath = rel === '/' ? 'index.html' : rel.replace(/^\/+/, '');
  const candidate = path.resolve(DIST, relPath);
  const withinDist = candidate === DIST || candidate.startsWith(DIST + path.sep);

  if (withinDist) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) {
        const ext = path.extname(candidate).toLowerCase();
        const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'x-content-type-options': 'nosniff' };
        headers['cache-control'] = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
        if (req.method === 'HEAD') { res.writeHead(200, headers); res.end(); return; }
        res.writeHead(200, headers); res.end(await readFile(candidate)); return;
      }
    } catch { /* fall through */ }
  }

  if (rel.startsWith('/assets/')) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not Found'); return; }

  const index = await readFile(path.join(DIST, 'index.html')).catch(() => null);
  if (!index) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not Found'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  res.end(index);
}

async function serveApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      res.writeHead(413, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'payload_too_large' }));
      return;
    }
    chunks.push(chunk);
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    ...(hasBody ? { body: Buffer.concat(chunks) } : {}),
  });
  const response = await handle({ request, requestId: 'node' });

  const out = {};
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() !== 'set-cookie') out[key] = value;
  }
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length) out['set-cookie'] = cookies;
  res.writeHead(response.status, out);
  if (req.method === 'HEAD') { res.end(); return; }
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer(async (req, res) => {
  try {
    const p = pathnameOf(req);
    if (p === API_PREFIX || p.startsWith(`${API_PREFIX}/`)) await serveApi(req, res);
    else await serveStatic(req, res);
  } catch (error) {
    console.error('[server] request error:', error?.message || error);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'server_error' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT} (origin=${APP_ORIGIN || 'unset'}, enforceOrigin=${ENFORCE_ORIGIN})`);
});

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  server.close();
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);