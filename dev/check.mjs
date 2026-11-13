// Local contract checks: call the REAL functions/ modules (router/registers/reports/users/
// seed/rbac/calc/domain) against a credential-free fake database. No real Provider, gateway
// admission, or deployed-environment behavior is proven here.
//   node --test dev/check.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../functions/router.mjs';
import { seedAll, SHEET_DATA } from '../functions/seed.mjs';
import { createFakeDb } from './fake-db.mjs';
import { LIMITS } from '../functions/limiter.mjs';
import { SESSION_COOKIE } from '../functions/sessions.mjs';
import { dashboard, reconciliationForDate, salaryLiabilityComputed } from '../functions/calc.mjs';
import { permissionsFor } from '../functions/rbac.mjs';

const ORIGIN = 'https://connectel.test';
const ACCOUNTS = [
  { username: 'admin', role: 'admin', display_name: 'Owner / Admin', password: 'admin-test-password-1' },
  { username: 'accountant', role: 'accountant', display_name: 'Accountant', password: 'acct-test-password-1' },
  { username: 'cashier', role: 'cashier', display_name: 'Cashier / Entry', password: 'cash-test-password-1' },
  { username: 'viewer', role: 'viewer', display_name: 'Viewer', password: 'view-test-password-1' },
];
const PW = Object.fromEntries(ACCOUNTS.map((a) => [a.username, a.password]));

async function fixture({ enforceOrigin = true } = {}) {
  const control = { mode: 'ok', dropTable: null, rejectTable: null, writes: [] };
  const db = createFakeDb(control);
  const seeded = await seedAll(db, { accounts: ACCOUNTS });
  const handle = createApplication({ db, origin: ORIGIN, enforceOrigin });
  return { control, db, handle, seeded };
}

function ctx(path, { method = 'GET', body, cookie, origin = ORIGIN, headers = {}, logical = false } = {}) {
  const merged = { ...headers };
  if (origin !== null) merged.origin = origin;
  if (cookie) merged.cookie = cookie;
  if (body !== undefined) merged['content-type'] = 'application/json';
  const target = logical ? `${ORIGIN}/functions/v1/app${path}` : `${ORIGIN}/functions/v1/app-d${'a'.repeat(32)}${path}`;
  return { request: new Request(target, { method, headers: merged, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), requestId: 'check' };
}

async function call(handle, context) {
  const response = await handle(context);
  let body = null; try { body = await response.clone().json(); } catch { body = null; }
  return { status: response.status, body, setCookie: response.headers.get('set-cookie'), headers: response.headers };
}
const cookiePair = (r) => (r.setCookie ? r.setCookie.split(';')[0] : null);
const login = async (handle, username, password = PW[username]) => call(handle, ctx('/api/login', { method: 'POST', body: { username, password } }));
async function authed(handle, username) { const r = await login(handle, username); assert.equal(r.status, 200, `login ${username}`); return cookiePair(r); }
const uuid = () => crypto.randomUUID();

// ---------- Seed fidelity ----------
test('seed: business row counts match the workbook', async () => {
  const { db, seeded } = await fixture();
  assert.equal(seeded.bootstrapped, true);
  assert.equal(seeded.credentials.length, 4);
  const expected = { customers: 9, items: 1, employees: 1, income: 9, expenses: 5, salaries: 1, stock: 1, cashbook: 1, salary_liabilities: 1, daily_salary_accrual: 3, daily_reconciliation: 1 };
  for (const [k, v] of Object.entries(expected)) assert.equal(seeded.counts[k], v, `count ${k}`);
  assert.equal(db.dump('income').length, SHEET_DATA.income.length);
  // No plaintext password anywhere in storage.
  const stored = JSON.stringify(db.dump('users'));
  for (const p of Object.values(PW)) assert.ok(!stored.includes(p), 'plaintext password must not be stored');
});

test('seed: re-running is idempotent (no duplicates)', async () => {
  const { db, handle } = await fixture();
  const cookie = await authed(handle, 'admin');
  const again = await call(handle, ctx('/api/admin/seed', { method: 'POST', cookie, body: {} }));
  assert.equal(again.status, 200);
  assert.equal(again.body.bootstrapped, false);
  assert.equal(again.body.credentials, null);
  for (const v of Object.values(again.body.counts)) assert.equal(v, 0, 'no rows recreated');
  assert.equal(db.dump('income').length, 9);
  assert.equal(db.dump('users').length, 4);
});

test('reports: dashboard KPIs reproduce the workbook (Nov 2026)', async () => {
  const { handle } = await fixture();
  const cookie = await authed(handle, 'admin');
  const r = await call(handle, ctx('/api/dashboard?month=2026-11', { cookie }));
  assert.equal(r.status, 200);
  assert.equal(r.body.service_income, 17600);
  assert.equal(r.body.other_income, 5500);
  assert.equal(r.body.operating_expenses, 1450);
  assert.equal(r.body.salaries_paid, 5000);
  assert.equal(r.body.customer_outstanding, 0);
  assert.equal(r.body.stock_below_reorder, 0);
  assert.equal(r.body.salary_outstanding, -8000);
});

test('reports: reconciliation Nov2 matches the sheet (zero differences)', async () => {
  const { db } = await fixture();
  const data = { income: db.dump('income'), expenses: db.dump('expenses'), salaries: db.dump('salary_payments'), reconciliation: db.dump('daily_reconciliation') };
  const rec = reconciliationForDate(data, '2026-11-02');
  assert.equal(rec.opening_cash, 2500);
  assert.equal(rec.cash_received, 12600);
  assert.equal(rec.expected_cash, 14600);
  assert.equal(rec.cash_difference, 0);
  assert.equal(rec.expected_bank, 73500);
  assert.equal(rec.bank_difference, 0);
  assert.equal(rec.register_cash_received, 12600);
});

test('reports: salary liability computed (Demo Employee, Cleared)', async () => {
  const { handle } = await fixture();
  const cookie = await authed(handle, 'accountant');
  const r = await call(handle, ctx('/api/salary-liabilities', { cookie }));
  assert.equal(r.status, 200);
  assert.equal(r.body.total, -8000);
  assert.equal(r.body.rows[0].total_paid, 38000);
  assert.equal(r.body.rows[0].status, 'Cleared');
  assert.equal(r.body.rows[0].employee_name, 'Demo Employee');
});

// ---------- Auth ----------
test('auth: login/me/logout lifecycle', async () => {
  const { handle } = await fixture();
  const bad = await login(handle, 'admin', 'wrong-password-xxx');
  assert.equal(bad.status, 401); assert.equal(bad.body.error, 'invalid_credentials');
  const ghost = await login(handle, 'ghost', 'whatever-password-1');
  assert.equal(ghost.status, 401); assert.equal(ghost.body.error, 'invalid_credentials');

  const ok = await login(handle, 'admin');
  assert.equal(ok.status, 200);
  const cookie = cookiePair(ok);
  assert.ok(cookie.startsWith(`${SESSION_COOKIE}=`));
  assert.match(ok.setCookie, /HttpOnly/); assert.match(ok.setCookie, /Secure/); assert.match(ok.setCookie, /SameSite=Lax/);
  assert.ok(!/Domain=/i.test(ok.setCookie));

  const me = await call(handle, ctx('/api/me', { cookie }));
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'admin');
  assert.deepEqual(me.body.permissions, permissionsFor('admin'));

  const noCookie = await call(handle, ctx('/api/me'));
  assert.equal(noCookie.status, 401); assert.equal(noCookie.body.error, 'login_required');

  const out = await call(handle, ctx('/api/logout', { method: 'POST', cookie }));
  assert.equal(out.status, 200); assert.match(out.setCookie, /Max-Age=0/);
  assert.equal((await call(handle, ctx('/api/me', { cookie }))).status, 401);
});

test('auth: deactivated account cannot log in or use existing session', async () => {
  const { handle } = await fixture();
  const admin = await authed(handle, 'admin');
  const users = await call(handle, ctx('/api/users', { cookie: admin }));
  const viewer = users.body.users.find((u) => u.username === 'viewer');
  const viewerCookie = await authed(handle, 'viewer');
  const deact = await call(handle, ctx(`/api/users/${viewer.id}`, { method: 'DELETE', cookie: admin }));
  assert.equal(deact.status, 200); assert.equal(deact.body.user.is_active, false);
  assert.equal((await call(handle, ctx('/api/me', { cookie: viewerCookie }))).status, 401, 'existing session fails closed');
  assert.equal((await login(handle, 'viewer')).status, 401, 're-login blocked');
});

test('auth: login rate limit caps attempts (incl. unknown accounts)', async () => {
  const { handle } = await fixture();
  const statuses = [];
  for (let i = 0; i < LIMITS.login.maxAttempts; i += 1) statuses.push((await login(handle, 'admin', 'bad-password-xxx')).status);
  assert.deepEqual(statuses, Array(LIMITS.login.maxAttempts).fill(401));
  const blocked = await login(handle, 'admin', PW.admin);
  assert.equal(blocked.status, 429); assert.equal(blocked.body.error, 'rate_limited');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});

// ---------- RBAC (server-enforced) ----------
test('rbac: viewer reads but cannot write or manage users', async () => {
  const { handle } = await fixture();
  const cookie = await authed(handle, 'viewer');
  assert.equal((await call(handle, ctx('/api/income', { cookie }))).status, 200);
  assert.equal((await call(handle, ctx('/api/dashboard?month=2026-11', { cookie }))).status, 200);
  const post = await call(handle, ctx('/api/income', { method: 'POST', cookie, headers: { 'idempotency-key': uuid() }, body: { date: '2026-11-08', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 100 } }));
  assert.equal(post.status, 403);
  assert.equal((await call(handle, ctx('/api/users', { cookie }))).status, 403);
});

test('rbac: cashier enters registers but no dashboard/pnl/stock/users', async () => {
  const { handle } = await fixture();
  const cookie = await authed(handle, 'cashier');
  assert.equal((await call(handle, ctx('/api/income', { cookie }))).status, 200);
  assert.equal((await call(handle, ctx('/api/customers', { cookie }))).status, 200);
  assert.equal((await call(handle, ctx('/api/dashboard?month=2026-11', { cookie }))).status, 403);
  assert.equal((await call(handle, ctx('/api/pnl', { cookie }))).status, 403);
  assert.equal((await call(handle, ctx('/api/stock', { cookie }))).status, 403);
  assert.equal((await call(handle, ctx('/api/users', { cookie }))).status, 403);
  const post = await call(handle, ctx('/api/income', { method: 'POST', cookie, headers: { 'idempotency-key': uuid() }, body: { date: '2026-11-08', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 100 } }));
  assert.equal(post.status, 201);
});

test('rbac: accountant edits registers but cannot delete or manage users', async () => {
  const { handle } = await fixture();
  const cookie = await authed(handle, 'accountant');
  assert.equal((await call(handle, ctx('/api/dashboard?month=2026-11', { cookie }))).status, 200);
  assert.equal((await call(handle, ctx('/api/audit', { cookie }))).status, 200);
  assert.equal((await call(handle, ctx('/api/users', { cookie }))).status, 403);
  const list = await call(handle, ctx('/api/income', { cookie }));
  const del = await call(handle, ctx(`/api/income/${list.body[0].id}`, { method: 'DELETE', cookie }));
  assert.equal(del.status, 403);
});

test('rbac: /api/me permissions equal the server matrix for every role', async () => {
  const { handle } = await fixture();
  for (const role of ['admin', 'accountant', 'cashier', 'viewer']) {
    const cookie = await authed(handle, role);
    const me = await call(handle, ctx('/api/me', { cookie }));
    assert.deepEqual(me.body.permissions, permissionsFor(role), `permissions ${role}`);
  }
});

// ---------- CRUD ----------
test('crud: idempotent create, replay, and conflict', async () => {
  const { handle } = await fixture();
  const cookie = await authed(handle, 'cashier');
  const key = uuid();
  const body = { date: '2026-11-08', customer_name: 'Test Customer', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 1200, other_amount: 0 };
  const post = (b) => call(handle, ctx('/api/income', { method: 'POST', cookie, headers: { 'idempotency-key': key }, body: b }));
  const created = await post(body);
  assert.equal(created.status, 201); assert.equal(created.body.id, key); assert.equal(created.body.version, 1);
  const replay = await post(body);
  assert.equal(replay.status, 200); assert.equal(replay.body.id, key);
  const conflict = await post({ ...body, service_amount: 999 });
  assert.equal(conflict.status, 409); assert.equal(conflict.body.error, 'idempotency_conflict');
  const noKey = await call(handle, ctx('/api/income', { method: 'POST', cookie, body }));
  assert.equal(noKey.status, 400);
});

test('crud: versioned edit and stale-version conflict', async () => {
  const { handle } = await fixture();
  const cookie = await authed(handle, 'accountant');
  const key = uuid();
  const created = await call(handle, ctx('/api/expenses', { method: 'POST', cookie, headers: { 'idempotency-key': key }, body: { date: '2026-11-08', description: 'Fuel', amount: 500, payment_method: 'Cash' } }));
  assert.equal(created.status, 201);
  const edit = await call(handle, ctx(`/api/expenses/${key}`, { method: 'PATCH', cookie, body: { version: 1, amount: 650 } }));
  assert.equal(edit.status, 200); assert.equal(edit.body.version, 2); assert.equal(edit.body.amount, '650');
  const stale = await call(handle, ctx(`/api/expenses/${key}`, { method: 'PATCH', cookie, body: { version: 1, amount: 700 } }));
  assert.equal(stale.status, 409); assert.equal(stale.body.error, 'write_conflict');
});

test('crud: cashier edits only own rows; accountant edits any', async () => {
  const { handle } = await fixture();
  const admin = await authed(handle, 'admin');
  const cashier = await authed(handle, 'cashier');
  const accountant = await authed(handle, 'accountant');
  const adminRow = await call(handle, ctx('/api/income', { method: 'POST', cookie: admin, headers: { 'idempotency-key': uuid() }, body: { date: '2026-11-08', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 100 } }));
  const ownRow = await call(handle, ctx('/api/income', { method: 'POST', cookie: cashier, headers: { 'idempotency-key': uuid() }, body: { date: '2026-11-08', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 200 } }));
  assert.equal((await call(handle, ctx(`/api/income/${adminRow.body.id}`, { method: 'PATCH', cookie: cashier, body: { version: 1, service_amount: 1 } }))).status, 403);
  assert.equal((await call(handle, ctx(`/api/income/${ownRow.body.id}`, { method: 'PATCH', cookie: cashier, body: { version: 1, service_amount: 250 } }))).status, 200);
  assert.equal((await call(handle, ctx(`/api/income/${ownRow.body.id}`, { method: 'PATCH', cookie: accountant, body: { version: 2, service_amount: 300 } }))).status, 200);
});

test('crud: admin soft-void hides rows; idempotent; include_voided reveals', async () => {
  const { handle, db } = await fixture();
  const admin = await authed(handle, 'admin');
  const list = await call(handle, ctx('/api/income', { cookie: admin }));
  const id = list.body[0].id;
  const del = await call(handle, ctx(`/api/income/${id}`, { method: 'DELETE', cookie: admin }));
  assert.equal(del.status, 200); assert.equal(del.body.voided, true);
  assert.equal(db.dump('income').find((r) => r.id === id).voided, true, 'soft-void, not hard delete');
  const after = await call(handle, ctx('/api/income', { cookie: admin }));
  assert.ok(!after.body.some((r) => r.id === id));
  const withVoided = await call(handle, ctx('/api/income?include_voided=true', { cookie: admin }));
  assert.ok(withVoided.body.some((r) => r.id === id));
  assert.equal((await call(handle, ctx(`/api/income/${id}`, { method: 'DELETE', cookie: admin }))).status, 200);
});

test('crud: unique code and unique date conflicts', async () => {
  const { handle } = await fixture();
  const admin = await authed(handle, 'admin');
  const c1 = await call(handle, ctx('/api/customers', { method: 'POST', cookie: admin, body: { code: 'NEWCODE', name: 'New Customer' } }));
  assert.equal(c1.status, 201);
  const c2 = await call(handle, ctx('/api/customers', { method: 'POST', cookie: admin, body: { code: 'NEWCODE', name: 'Duplicate' } }));
  assert.equal(c2.status, 409); assert.equal(c2.body.error, 'code_taken');
  const a1 = await call(handle, ctx('/api/daily_salary_accrual', { method: 'POST', cookie: admin, body: { date: '2026-11-20', salary_expense: 1000 } }));
  assert.equal(a1.status, 201);
  const a2 = await call(handle, ctx('/api/daily_salary_accrual', { method: 'POST', cookie: admin, body: { date: '2026-11-20', salary_expense: 2000 } }));
  assert.equal(a2.status, 409); assert.equal(a2.body.error, 'date_exists');
});

test('crud: validation rejects bad input with a field hint', async () => {
  const { handle } = await fixture();
  const cookie = await authed(handle, 'cashier');
  const post = (body) => call(handle, ctx('/api/income', { method: 'POST', cookie, headers: { 'idempotency-key': uuid() }, body }));
  const noDate = await post({ income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 100 });
  assert.equal(noDate.status, 400); assert.equal(noDate.body.field, 'date');
  const badEnum = await post({ date: '2026-11-08', income_type: 'Bogus', payment_method: 'Cash', service_amount: 100 });
  assert.equal(badEnum.status, 400); assert.equal(badEnum.body.field, 'income_type');
  const negative = await post({ date: '2026-11-08', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: -5 });
  assert.equal(negative.status, 400); assert.equal(negative.body.field, 'service_amount');
});

// ---------- Uncertain writes ----------
test('writes: uncertain outcome is not replayed or reported as success', async () => {
  const { control, db, handle } = await fixture();
  const cookie = await authed(handle, 'cashier');
  const before = db.dump('income').length;
  const writesBefore = control.writes.filter((t) => t === 'income').length;

  control.dropTable = 'income';
  const dropped = await call(handle, ctx('/api/income', { method: 'POST', cookie, headers: { 'idempotency-key': uuid() }, body: { date: '2026-11-08', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 100 } }));
  assert.equal(dropped.status, 503);
  assert.equal(db.dump('income').length, before + 1, 'committed despite lost response');
  assert.equal(control.writes.filter((t) => t === 'income').length - writesBefore, 1, 'no replay');

  const writesNow = control.writes.filter((t) => t === 'income').length;
  control.rejectTable = 'income';
  const rejected = await call(handle, ctx('/api/income', { method: 'POST', cookie, headers: { 'idempotency-key': uuid() }, body: { date: '2026-11-08', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 100 } }));
  assert.equal(rejected.status, 503);
  assert.equal(db.dump('income').length, before + 1, 'rejected write not committed');
  assert.equal(control.writes.filter((t) => t === 'income').length - writesNow, 1, 'no replay on rejection');
});

// ---------- CSRF ----------
test('csrf: unsafe methods require the trusted origin', async () => {
  const { handle } = await fixture();
  const cookie = await authed(handle, 'admin');
  const foreign = await call(handle, ctx('/api/income', { method: 'POST', cookie, origin: 'https://evil.test', headers: { 'idempotency-key': uuid() }, body: { date: '2026-11-08', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 1 } }));
  assert.equal(foreign.status, 403); assert.equal(foreign.body.error, 'origin_forbidden');
  const noOrigin = await call(handle, ctx('/api/logout', { method: 'POST', cookie, origin: null }));
  assert.equal(noOrigin.status, 403);
  assert.equal((await call(handle, ctx('/api/me', { cookie, origin: 'https://evil.test' }))).status, 200, 'safe GET unaffected');
  assert.equal((await call(handle, ctx('/api/me', { cookie }))).status, 200, 'session intact');
});

// ---------- User administration ----------
test('users: admin creates/updates/deactivates; self-guards hold', async () => {
  const { handle } = await fixture();
  const admin = await authed(handle, 'admin');
  const created = await call(handle, ctx('/api/users', { method: 'POST', cookie: admin, body: { username: 'newcashier', password: 'newcashier-password-1', role: 'cashier', display_name: 'New Cashier' } }));
  assert.equal(created.status, 201); assert.equal(created.body.user.role, 'cashier');
  assert.ok(!('password_hash' in created.body.user));
  const dup = await call(handle, ctx('/api/users', { method: 'POST', cookie: admin, body: { username: 'newcashier', password: 'newcashier-password-1', role: 'cashier' } }));
  assert.equal(dup.status, 409); assert.equal(dup.body.error, 'username_taken');
  const badRole = await call(handle, ctx('/api/users', { method: 'POST', cookie: admin, body: { username: 'xuser', password: 'xuser-password-123', role: 'superuser' } }));
  assert.equal(badRole.status, 400);
  const shortPw = await call(handle, ctx('/api/users', { method: 'POST', cookie: admin, body: { username: 'yuser', password: 'short', role: 'viewer' } }));
  assert.equal(shortPw.status, 400);

  const id = created.body.user.id;
  const upd = await call(handle, ctx(`/api/users/${id}`, { method: 'PATCH', cookie: admin, body: { version: 1, role: 'accountant' } }));
  assert.equal(upd.status, 200); assert.equal(upd.body.user.role, 'accountant');

  const me = await call(handle, ctx('/api/me', { cookie: admin }));
  const selfRole = await call(handle, ctx(`/api/users/${me.body.user.id}`, { method: 'PATCH', cookie: admin, body: { version: 1, role: 'viewer' } }));
  assert.equal(selfRole.status, 403); assert.equal(selfRole.body.error, 'cannot_modify_self');
  const selfDeact = await call(handle, ctx(`/api/users/${me.body.user.id}`, { method: 'DELETE', cookie: admin }));
  assert.equal(selfDeact.status, 403);
});

test('routing: logical path, unknown path, wrong method', async () => {
  const { handle } = await fixture();
  const cookie = await authed(handle, 'admin');
  assert.equal((await call(handle, ctx('/api/health', { logical: true }))).status, 200);
  assert.equal((await call(handle, ctx('/api/unknown', { cookie }))).status, 404);
  assert.equal((await call(handle, ctx('/api/income', { method: 'DELETE', cookie }))).status, 405);
  assert.equal((await call(handle, ctx('/api/dashboard', { method: 'POST', cookie, body: {} }))).status, 405);
  assert.equal((await call(handle, ctx('/api/login', { method: 'POST' }))).status, 400);
});