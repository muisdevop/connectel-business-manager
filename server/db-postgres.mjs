// Postgres adapter for the application's small query subset, over `pg`.
//
// It implements exactly the builder surface the app code (and dev/fake-db.mjs) use:
//   from(table).select(cols).eq(k,v).limit(n).order(col)   -> read
//   from(table).insertIfAbsent(row, { onConflict }).select(cols) -> upsert-ignore
//   from(table).update(patch).eq(k,v).select(cols)          -> conditional update
// Every call resolves to { data, error } like the platform client; on any driver
// error we return { data: null, error } and never retry (fail-closed, no replay).
//
// Timestamps (timestamptz) are read back as canonical ISO strings so the app's
// Date.parse()/typeof 'string' checks and lexicographic sorting behave identically.
import pg from 'pg';

const { Pool, types } = pg;

// 1184 = timestamptz, 1114 = timestamp (no tz). Return ISO strings, not Date objects.
types.setTypeParser(1184, (value) => new Date(value).toISOString());
types.setTypeParser(1114, (value) => new Date(`${value.replace(' ', 'T')}Z`).toISOString());

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (name) => {
  if (typeof name !== 'string' || !IDENT.test(name)) throw new Error(`invalid_identifier:${name}`);
  return `"${name}"`;
};
const columnList = (columns) => (columns === '*' || columns == null
  ? '*'
  : columns.split(',').map((c) => ident(c.trim())).join(', '));
const bind = (value) => (value === undefined ? null : value);

export function createPool(connectionString, { max = Number(process.env.PG_POOL_MAX || 10) } = {}) {
  return new Pool({ connectionString, max, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
}

export function createPostgresDb(pool, { schema = 'app' } = {}) {
  const table = (name) => `${ident(schema)}.${ident(name)}`;

  function builder(name, op, payload) {
    const filters = [];
    let columns = '*';
    let maxRows = null;
    let orderBy = null;
    let executed;

    const run = async () => {
      try {
        if (op === 'update' && filters.length === 0) throw new Error('update_requires_filter');
        const whereText = filters.length
          ? ' WHERE ' + filters.map(([col], i) => `${ident(col)} = $${i + 1}`).join(' AND ')
          : '';
        const whereParams = filters.map(([, value]) => bind(value));
        const returning = columnList(columns);

        if (op === 'read') {
          const text = `SELECT ${columnList(columns)} FROM ${table(name)}${whereText}`
            + (orderBy ? ` ORDER BY ${ident(orderBy)} ASC` : '')
            + (maxRows != null ? ` LIMIT ${Math.max(0, Math.trunc(Number(maxRows)))}` : '');
          const res = await pool.query(text, whereParams);
          return { data: res.rows, error: null };
        }

        if (op === 'insert') {
          const row = payload.row ?? {};
          const keys = Object.keys(row);
          if (keys.length === 0) return { data: [], error: null };
          const colList = keys.map(ident).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const conflict = (payload.onConflict ?? '')
            .split(',').map((c) => c.trim()).filter(Boolean).map(ident);
          const conflictClause = conflict.length ? ` ON CONFLICT (${conflict.join(', ')}) DO NOTHING` : '';
          const text = `INSERT INTO ${table(name)} (${colList}) VALUES (${placeholders})${conflictClause} RETURNING ${returning}`;
          const res = await pool.query(text, keys.map((key) => bind(row[key])));
          return { data: res.rows, error: null };
        }

        // update
        const patch = payload.row ?? {};
        const keys = Object.keys(patch);
        if (keys.length === 0) return { data: [], error: null };
        const sets = keys.map((key, i) => `${ident(key)} = $${i + 1}`).join(', ');
        const offset = keys.length;
        const whereWithOffset = filters.length
          ? ' WHERE ' + filters.map(([col], i) => `${ident(col)} = $${offset + i + 1}`).join(' AND ')
          : '';
        const text = `UPDATE ${table(name)} SET ${sets}${whereWithOffset} RETURNING ${returning}`;
        const res = await pool.query(text, [...keys.map((key) => bind(patch[key])), ...whereParams]);
        return { data: res.rows, error: null };
      } catch {
        return { data: null, error: { code: 'database_unavailable', status: 503 } };
      }
    };

    const chain = {
      eq(col, value) { filters.push([col, value]); return chain; },
      limit(count) { maxRows = count; return chain; },
      order(col) { orderBy = String(col); return chain; },
      select(names) { if (typeof names === 'string') columns = names; return chain; },
      then(resolve, reject) { executed ??= run(); return executed.then(resolve, reject); },
    };
    return chain;
  }

  return {
    from(name) {
      return {
        select: (columns) => builder(name, 'read', null).select(columns),
        insertIfAbsent: (row, options) => builder(name, 'insert', { row, onConflict: options?.onConflict }),
        update: (row) => builder(name, 'update', { row }),
      };
    },
  };
}