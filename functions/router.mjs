// Application router: application-owned auth + server-enforced RBAC + dispatch.
// Identity comes only from this app's session validation (DB session digest) — never
// ctx.user, platform identity, Host headers, or a browser-supplied owner/role.
import { AppError, applicationPath, errorJson, json, readJson, requireTrustedOrigin, rows } from './http.mjs';
import { hashPassword, verifyPassword, verifyPasswordAgainstDummy } from './passwords.mjs';
import { SESSION_TTL_MS, clearSessionCookie, createSession, revokeSession, sessionCookie, validateSession } from './sessions.mjs';
import { consume } from './limiter.mjs';
import { permissionsFor, can } from './rbac.mjs';
import { RESOURCE_NAMES, meta } from './domain.mjs';
import { resourceRoute } from './registers.mjs';
import { dashboardReport, pnlReport, outstandingReport, stockReport, salaryLiabilitiesReport, reconciliationReport, auditReport } from './reports.mjs';
import { listUsers, createUser, updateUser, deactivateUser } from './users.mjs';
import { seedAll } from './seed.mjs';

const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
const encoder = new TextEncoder();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class SessionRequired extends Error {
  constructor(state) { super('login_required'); this.state = state; }
}

const retryAfter = (result) => ({ 'retry-after': String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))) });

function unauthorized(state) {
  return state === 'invalid'
    ? errorJson('login_required', 401, { 'set-cookie': clearSessionCookie() })
    : errorJson('login_required', 401);
}

function appErrorResponse(error) {
  const body = { error: error.code };
  if (error.field) body.field = error.field;
  return json(body, error.status);
}

async function requireSession(db, request) {
  const result = await validateSession(db, request);
  if (result.state !== 'valid') throw new SessionRequired(result.state);
  return result.session;
}

// Load the application user; a deactivated account fails closed (forces re-login).
async function loadUser(db, userId) {
  const found = rows(await db.from('users').select('id,username,display_name,role,is_active').eq('id', userId).limit(1));
  const row = found[0];
  if (found.length !== 1 || typeof row?.username !== 'string' || row.is_active !== true) throw new SessionRequired('invalid');
  return { id: row.id, username: row.username, display_name: row.display_name, role: row.role };
}

function canonicalUsername(raw) {
  if (typeof raw !== 'string') throw new AppError('invalid_input', 400);
  const name = raw.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(name)) throw new AppError('invalid_input', 400);
  return name;
}

function boundedPassword(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || encoder.encode(raw).length > 256) throw new AppError('invalid_input', 400);
  return raw;
}

async function login(db, request) {
  const body = await readJson(request);
  const username = canonicalUsername(body?.username);
  const limit = await consume(db, 'login', username);
  if (!limit.allowed) return errorJson('rate_limited', 429, retryAfter(limit));
  const password = boundedPassword(body?.password);
  const found = rows(await db.from('users').select('id,username,display_name,role,is_active,password_salt,password_hash,password_iterations').eq('username', username).limit(1));
  if (found.length !== 1) {
    await verifyPasswordAgainstDummy(password);
    return errorJson('invalid_credentials', 401);
  }
  const user = found[0];
  const ok = await verifyPassword(password, { salt: user.password_salt, hash: user.password_hash, iterations: user.password_iterations });
  if (!ok || user.is_active !== true) return errorJson('invalid_credentials', 401);
  const { token } = await createSession(db, user.id);
  return json({ user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role } }, 200, { 'set-cookie': sessionCookie(token, SESSION_TTL_SECONDS) });
}

async function logout(db, request) {
  const result = await validateSession(db, request);
  if (result.state === 'valid' && result.session) {
    try { await revokeSession(db, result.session.digest); }
    catch { return errorJson('logout_unconfirmed', 503); }
  }
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

async function seedRoute(db, request) {
  const existing = rows(await db.from('users').select('id').limit(1));
  let actorId = null;
  if (existing.length > 0) {
    const session = await requireSession(db, request);
    const user = await loadUser(db, session.userId);
    if (!can(user.role, 'users', 'create')) throw new AppError('forbidden', 403);
    actorId = user.id;
  }
  const body = request.headers.get('content-type')?.split(';')[0].trim() === 'application/json' ? await readJson(request) : {};
  const result = await seedAll(db, { accounts: body?.accounts, actorId });
  return json(result, result.bootstrapped ? 201 : 200);
}

const REPORTS = {
  '/api/dashboard': dashboardReport,
  '/api/pnl': pnlReport,
  '/api/outstanding': outstandingReport,
  '/api/stock-summary': stockReport,
  '/api/salary-liabilities': salaryLiabilitiesReport,
  '/api/reconciliation': reconciliationReport,
  '/api/audit': auditReport,
};

async function route(db, request, origin, enforceOrigin) {
  if (enforceOrigin) requireTrustedOrigin(request, origin);
  const path = applicationPath(request);
  const method = request.method;
  const url = new URL(request.url);

  if (path === '/api/health') {
    if (method === 'GET') return json({ ok: true });
    throw new AppError('method_not_allowed', 405);
  }
  if (path === '/api/login') {
    if (method === 'POST') return login(db, request);
    throw new AppError('method_not_allowed', 405);
  }
  if (path === '/api/logout') {
    if (method === 'POST') return logout(db, request);
    throw new AppError('method_not_allowed', 405);
  }
  if (path === '/api/admin/seed') {
    if (method === 'POST') return seedRoute(db, request);
    throw new AppError('method_not_allowed', 405);
  }

  // Everything below requires a valid application session.
  const session = await requireSession(db, request);
  const user = await loadUser(db, session.userId);
  const ctx = { db, user, request, url, path };

  if (path === '/api/me') {
    if (method === 'GET') return json({ user, permissions: permissionsFor(user.role) });
    throw new AppError('method_not_allowed', 405);
  }
  if (path === '/api/meta') {
    if (method === 'GET') return json(meta());
    throw new AppError('method_not_allowed', 405);
  }

  if (path in REPORTS) {
    if (method === 'GET') return REPORTS[path](ctx);
    throw new AppError('method_not_allowed', 405);
  }

  if (path === '/api/users') {
    if (method === 'GET') return listUsers(ctx);
    if (method === 'POST') return createUser(ctx);
    throw new AppError('method_not_allowed', 405);
  }
  const userItem = path.match(/^\/api\/users\/([0-9a-f-]{36})$/);
  if (userItem && UUID_RE.test(userItem[1])) {
    if (method === 'PATCH') return updateUser(ctx, userItem[1]);
    if (method === 'DELETE') return deactivateUser(ctx, userItem[1]);
    throw new AppError('method_not_allowed', 405);
  }

  const collection = path.match(/^\/api\/([a-z_]+)$/);
  if (collection && RESOURCE_NAMES.includes(collection[1])) return resourceRoute(ctx, collection[1], null);
  const item = path.match(/^\/api\/([a-z_]+)\/([0-9a-f-]{36})$/);
  if (item && RESOURCE_NAMES.includes(item[1]) && UUID_RE.test(item[2])) return resourceRoute(ctx, item[1], item[2]);

  throw new AppError('not_found', 404);
}

// Dependency injection is for local tests; ctx is used only for its request.
// enforceOrigin=false is for loopback HTTP dev only; tests and production enforce it.
export function createApplication({ db, origin, enforceOrigin = true }) {
  return async function handle(ctx) {
    try {
      return await route(db, ctx.request, typeof origin === 'function' ? origin() : origin, enforceOrigin);
    } catch (error) {
      if (error instanceof SessionRequired) return unauthorized(error.state);
      if (error instanceof AppError) return appErrorResponse(error);
      return errorJson('service_unavailable', 503);
    }
  };
}