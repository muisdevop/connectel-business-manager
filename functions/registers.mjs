// Generic resource CRUD over the proven DB subset:
//   select/eq/limit/order, insertIfAbsent(onConflict), update().eq()
// No delete (soft-void via update), no transactions. Date filtering/sorting in JS.
// RBAC is enforced here on every operation; ownership/version are write predicates.
import { AppError, errorJson, json, readJson, rows } from './http.mjs';
import { RESOURCES, validateFields, serializeFields, deserializeFields } from './domain.mjs';
import { can, canEditRow } from './rbac.mjs';
import { inRange } from './calc.mjs';
import { sha256Hex } from './sessions.mjs';

const FETCH_LIMIT = 5000;
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function dateFieldOf(spec) {
  if (spec.fields.date) return 'date';
  if (spec.fields.payment_date) return 'payment_date';
  if (spec.fields.month) return 'month';
  return null;
}

// Public shape: everything except the internal idempotency fingerprint.
function present(row) {
  const { fingerprint, ...rest } = row;
  return rest;
}

async function fetchAll(db, table) {
  return rows(await db.from(table).select('*').limit(FETCH_LIMIT));
}

async function loadRow(db, table, id) {
  const found = rows(await db.from(table).select('*').eq('id', id).limit(1));
  return found.length === 1 ? found[0] : null;
}

function requireAction(user, spec, action) {
  if (!can(user.role, spec.module, action)) throw new AppError('forbidden', 403);
}

async function list(ctx, resource) {
  const { db, user, url } = ctx;
  const spec = RESOURCES[resource];
  requireAction(user, spec, 'view');
  const all = await fetchAll(db, spec.table);
  const includeVoided = url.searchParams.get('include_voided') === 'true' && can(user.role, spec.module, 'delete');
  let out = all.filter((r) => (includeVoided ? true : !r.voided));
  const df = dateFieldOf(spec);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from !== null && !isDate(from)) throw new AppError('invalid_input', 400);
  if (to !== null && !isDate(to)) throw new AppError('invalid_input', 400);
  if (df && from && to) out = out.filter((r) => inRange(r[df], from, to));
  if (df) out.sort((a, b) => String(b[df] ?? '').localeCompare(String(a[df] ?? '')) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  else out.sort((a, b) => String(a.code ?? a.name ?? '').localeCompare(String(b.code ?? b.name ?? '')));
  return json(out.map(present));
}

async function getOne(ctx, resource, id) {
  const { db, user } = ctx;
  const spec = RESOURCES[resource];
  requireAction(user, spec, 'view');
  if (!isUuid(id)) throw new AppError('not_found', 404);
  const row = await loadRow(db, spec.table, id);
  if (!row) throw new AppError('not_found', 404);
  return json(present(row));
}

async function create(ctx, resource) {
  const { db, user, request } = ctx;
  const spec = RESOURCES[resource];
  requireAction(user, spec, 'create');
  const body = await readJson(request);
  const cleaned = validateFields(resource, body, { partial: false });
  const fingerprint = await sha256Hex(JSON.stringify(cleaned));
  const now = new Date().toISOString();

  let id;
  let conflictCol;
  if (spec.uniqueField) {
    id = crypto.randomUUID();
    conflictCol = spec.uniqueField;
  } else {
    id = request.headers.get('idempotency-key');
    if (!isUuid(id)) throw new AppError('invalid_input', 400);
    conflictCol = 'id';
  }

  const row = {
    id, ...serializeFields(resource, cleaned),
    created_by: user.id, updated_by: user.id, created_at: now, updated_at: now,
    version: 1, voided: false, voided_by: null, voided_at: null, fingerprint,
  };
  if (spec.byField) row[spec.byField] = user.display_name || user.username;

  const inserted = rows(await db.from(spec.table).insertIfAbsent(row, { onConflict: conflictCol }).select('*'));
  if (inserted.length === 1) return json(present(inserted[0]), 201);

  const existing = rows(await db.from(spec.table).select('*').eq(conflictCol, row[conflictCol]).limit(1));
  if (existing.length !== 1) return errorJson('create_unconfirmed', 503);
  if (spec.uniqueField) return errorJson(spec.uniqueField === 'code' ? 'code_taken' : 'date_exists', 409);
  if (existing[0].fingerprint !== fingerprint) return errorJson('idempotency_conflict', 409);
  return json(present(existing[0]), 200);
}

async function update(ctx, resource, id) {
  const { db, user, request } = ctx;
  const spec = RESOURCES[resource];
  requireAction(user, spec, 'edit');
  if (!isUuid(id)) throw new AppError('not_found', 404);
  const current = await loadRow(db, spec.table, id);
  if (!current || current.voided) throw new AppError('not_found', 404);
  if (!canEditRow(user, current)) throw new AppError('forbidden', 403);

  const body = await readJson(request);
  const version = body?.version;
  if (!Number.isInteger(version) || version < 1 || version >= 2147483647) throw new AppError('invalid_input', 400);
  const cleaned = validateFields(resource, body, { partial: true });

  const merged = { ...deserializeFields(resource, current), ...cleaned };
  const fingerprint = await sha256Hex(JSON.stringify(merged));
  const now = new Date().toISOString();
  const updated = rows(await db.from(spec.table)
    .update({ ...serializeFields(resource, cleaned), version: version + 1, updated_by: user.id, updated_at: now, fingerprint })
    .eq('id', id).eq('version', version).select('*'));
  if (updated.length !== 1) return errorJson('write_conflict', 409);
  return json(present(updated[0]));
}

async function voidRow(ctx, resource, id) {
  const { db, user } = ctx;
  const spec = RESOURCES[resource];
  requireAction(user, spec, 'delete');
  if (!isUuid(id)) throw new AppError('not_found', 404);
  const current = await loadRow(db, spec.table, id);
  if (!current) throw new AppError('not_found', 404);
  if (current.voided) return json(present(current));
  const now = new Date().toISOString();
  const updated = rows(await db.from(spec.table)
    .update({ voided: true, voided_by: user.id, voided_at: now, version: current.version + 1, updated_by: user.id, updated_at: now })
    .eq('id', id).eq('version', current.version).select('*'));
  if (updated.length !== 1) return errorJson('write_conflict', 409);
  return json(present(updated[0]));
}

// Dispatch a matched resource path. id is null for the collection route.
export async function resourceRoute(ctx, resource, id) {
  const method = ctx.request.method;
  if (id === null) {
    if (method === 'GET') return list(ctx, resource);
    if (method === 'POST') return create(ctx, resource);
    throw new AppError('method_not_allowed', 405);
  }
  if (method === 'GET') return getOne(ctx, resource, id);
  if (method === 'PATCH') return update(ctx, resource, id);
  if (method === 'DELETE') return voidRow(ctx, resource, id);
  throw new AppError('method_not_allowed', 405);
}