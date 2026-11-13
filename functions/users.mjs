// Admin-only user management. Password fields are never returned. Accounts are
// soft-deactivated (is_active=false) to preserve audit references; no hard delete.
import { AppError, errorJson, json, readJson, rows } from './http.mjs';
import { can, isRole, ROLES } from './rbac.mjs';
import { hashPassword } from './passwords.mjs';
import { consume } from './limiter.mjs';

const encoder = new TextEncoder();
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

function canonicalUsername(raw) {
  if (typeof raw !== 'string') throw new AppError('invalid_username', 400);
  const name = raw.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(name)) throw new AppError('invalid_username', 400);
  return name;
}

function boundedPassword(raw) {
  if (typeof raw !== 'string' || raw.length < 12 || encoder.encode(raw).length > 256) throw new AppError('invalid_password', 400);
  return raw;
}

function displayName(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw !== 'string' || [...raw.trim()].length > 120) throw new AppError('invalid_input', 400);
  return raw.trim();
}

function publicUser(row) {
  return {
    id: row.id, username: row.username, display_name: row.display_name, role: row.role,
    is_active: row.is_active, created_at: row.created_at, version: row.version,
  };
}

function gate(user, action) {
  if (!can(user.role, 'users', action)) throw new AppError('forbidden', 403);
}

async function loadUserRow(db, id) {
  const found = rows(await db.from('users').select('*').eq('id', id).limit(1));
  return found.length === 1 ? found[0] : null;
}

export async function listUsers(ctx) {
  const { db, user } = ctx;
  gate(user, 'view');
  const all = rows(await db.from('users').select('*').limit(1000));
  all.sort((a, b) => String(a.username).localeCompare(String(b.username)));
  return json({ users: all.map(publicUser), roles: ROLES });
}

export async function createUser(ctx) {
  const { db, user, request } = ctx;
  gate(user, 'create');
  const body = await readJson(request);
  const username = canonicalUsername(body?.username);
  const password = boundedPassword(body?.password);
  if (!isRole(body?.role)) throw new AppError('invalid_role', 400);
  const display = displayName(body?.display_name, username);

  const limit = await consume(db, 'register', username);
  if (!limit.allowed) return errorJson('rate_limited', 429, { 'retry-after': String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) });

  const existing = rows(await db.from('users').select('id').eq('username', username).limit(1));
  if (existing.length > 0) return errorJson('username_taken', 409);

  const derived = await hashPassword(password);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const created = rows(await db.from('users').insertIfAbsent({
    id, username, display_name: display, role: body.role,
    password_salt: derived.salt, password_hash: derived.hash, password_iterations: derived.iterations,
    is_active: true, created_at: now, updated_at: now, version: 1,
  }, { onConflict: 'username' }).select('*'));
  if (created.length !== 1) {
    const winner = rows(await db.from('users').select('id').eq('username', username).limit(1));
    if (winner.length === 1) return errorJson('username_taken', 409);
    return errorJson('create_unconfirmed', 503);
  }
  return json({ user: publicUser(created[0]) }, 201);
}

export async function updateUser(ctx, id) {
  const { db, user, request } = ctx;
  gate(user, 'edit');
  if (!isUuid(id)) throw new AppError('not_found', 404);
  const target = await loadUserRow(db, id);
  if (!target) throw new AppError('not_found', 404);
  const body = await readJson(request);
  const version = body?.version;
  if (!Number.isInteger(version) || version < 1) throw new AppError('invalid_input', 400);

  const patch = { updated_at: new Date().toISOString(), version: version + 1 };
  if (body.role !== undefined) {
    if (!isRole(body.role)) throw new AppError('invalid_role', 400);
    if (id === user.id && body.role !== target.role) throw new AppError('cannot_modify_self', 403);
    patch.role = body.role;
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') throw new AppError('invalid_input', 400);
    if (id === user.id && body.is_active === false) throw new AppError('cannot_modify_self', 403);
    patch.is_active = body.is_active;
  }
  if (body.display_name !== undefined) patch.display_name = displayName(body.display_name, target.username);
  if (body.password !== undefined && body.password !== '') {
    const derived = await hashPassword(boundedPassword(body.password));
    patch.password_salt = derived.salt; patch.password_hash = derived.hash; patch.password_iterations = derived.iterations;
  }

  const updated = rows(await db.from('users').update(patch).eq('id', id).eq('version', version).select('*'));
  if (updated.length !== 1) return errorJson('write_conflict', 409);
  return json({ user: publicUser(updated[0]) });
}

export async function deactivateUser(ctx, id) {
  const { db, user } = ctx;
  gate(user, 'delete');
  if (!isUuid(id)) throw new AppError('not_found', 404);
  if (id === user.id) throw new AppError('cannot_modify_self', 403);
  const target = await loadUserRow(db, id);
  if (!target) throw new AppError('not_found', 404);
  if (!target.is_active) return json({ user: publicUser(target) });
  const updated = rows(await db.from('users')
    .update({ is_active: false, updated_at: new Date().toISOString(), version: target.version + 1 })
    .eq('id', id).eq('version', target.version).select('*'));
  if (updated.length !== 1) return errorJson('write_conflict', 409);
  return json({ user: publicUser(updated[0]) });
}