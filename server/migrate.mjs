// One-shot, idempotent DB setup run at container start before the server:
//   1. create the `app` schema + tables from schema.sql (skipped if already present)
//   2. seed accounts + demo data only when the database has no users yet
// On first bootstrap it prints the account credentials once so the operator can
// record them; they are never stored in plaintext and are not shown again.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPool, createPostgresDb } from './db-postgres.mjs';
import { seedAll } from '../functions/seed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(here, '..', 'schema.sql');

function accountsFromEnv() {
  const pick = (name, fallbackRole, display) => ({
    username: name,
    role: fallbackRole,
    display_name: display,
    password: process.env[`${name.toUpperCase()}_PASSWORD`] || undefined,
  });
  return [
    pick('admin', 'admin', 'Owner / Admin'),
    pick('accountant', 'accountant', 'Accountant'),
    pick('cashier', 'cashier', 'Cashier / Entry'),
    pick('viewer', 'viewer', 'Viewer'),
  ];
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const pool = createPool(connectionString, { max: 1 });
  try {
    const present = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'app' AND table_name = 'users' LIMIT 1`,
    );
    if (present.rowCount === 0) {
      const sql = await readFile(SCHEMA_PATH, 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('CREATE SCHEMA IF NOT EXISTS app');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('[migrate] app schema and tables created');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } else {
      console.log('[migrate] app schema already present');
    }

    const db = createPostgresDb(pool);
    let actorId;
    const anyUser = await pool.query(`SELECT id FROM app.users ORDER BY (role = 'admin') DESC, created_at ASC LIMIT 1`);
    if (anyUser.rowCount > 0) actorId = anyUser.rows[0].id;

    const result = await seedAll(db, { accounts: accountsFromEnv(), actorId });
    if (result.bootstrapped) {
      console.log('[migrate] bootstrapped accounts (record these now; not shown again):');
      for (const cred of result.credentials) console.log(`  ${cred.username}  ${cred.password}  (${cred.role})`);
    } else {
      console.log('[migrate] database already seeded; no new accounts created');
    }
    console.log('[migrate] business rows inserted:', JSON.stringify(result.counts));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[migrate] failed:', error?.message || error);
  process.exit(1);
});