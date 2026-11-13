// Local development backend (Node, no Deno required). Runs the REAL application router
// against an in-memory fake database seeded with the workbook data. Loopback only.
// This fixture is local-only: it lives in dev/, outside both publication directories.
//   node dev/server.mjs
import { createServer } from 'node:http';
import { createFakeDb } from './fake-db.mjs';
import { createApplication } from '../functions/router.mjs';
import { seedAll } from '../functions/seed.mjs';

const PORT = Number(process.env.PORT || 8000);
const HOST = '127.0.0.1';

// Local-only fixture passwords (in-memory; never deployed). Printed for local sign-in.
const LOCAL_ACCOUNTS = [
  { username: 'admin', role: 'admin', display_name: 'Owner / Admin', password: 'admin-local-123' },
  { username: 'accountant', role: 'accountant', display_name: 'Accountant', password: 'acct-local-123' },
  { username: 'cashier', role: 'cashier', display_name: 'Cashier / Entry', password: 'cash-local-123' },
  { username: 'viewer', role: 'viewer', display_name: 'Viewer', password: 'view-local-123' },
];

const db = createFakeDb({ mode: 'ok', dropTable: null, rejectTable: null, writes: [] });
const seeded = await seedAll(db, { accounts: LOCAL_ACCOUNTS });
const handle = createApplication({ db, origin: `http://${HOST}:5173`, enforceOrigin: false });

const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://${incoming.headers.host}`);
    if (![HOST, 'localhost'].includes(url.hostname)) {
      outgoing.writeHead(403, { 'content-type': 'application/json' });
      outgoing.end(JSON.stringify({ error: 'invalid_host' }));
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 8192) { outgoing.writeHead(413, { 'content-type': 'application/json' }); outgoing.end(JSON.stringify({ error: 'payload_too_large' })); return; }
      chunks.push(chunk);
    }
    const hasBody = !['GET', 'HEAD'].includes(incoming.method);
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
      ...(hasBody ? { body: Buffer.concat(chunks) } : {}),
    });
    const response = await handle({ request, requestId: 'local-dev' });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    outgoing.end(JSON.stringify({ error: 'service_unavailable' }));
  }
});

await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, HOST, resolve); });
console.log(`ConnecTEL local API on http://${HOST}:${PORT} (in-memory fixture; resets on restart).`);
console.log(`Seeded business rows: ${JSON.stringify(seeded.counts)}`);
console.log('Local sign-in accounts (fixture only):');
for (const a of LOCAL_ACCOUNTS) console.log(`  ${a.username} / ${a.password}  (${a.role})`);
const stop = () => { server.close(() => process.exit(0)); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);