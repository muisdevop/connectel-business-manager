// Temporary smoke probe against the local dev server.
const BASE = 'http://127.0.0.1:8000/functions/v1/app';
let cookie = '';
async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  if (body !== undefined) h['content-type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const show = (label, r) => console.log(label, r.status, JSON.stringify(r.data)?.slice(0, 400));

show('health', await call('/api/health'));
show('login bad', await call('/api/login', { method: 'POST', body: { username: 'admin', password: 'wrong-password-x' } }));
show('login admin', await call('/api/login', { method: 'POST', body: { username: 'admin', password: 'admin-local-123' } }));
show('me', await call('/api/me'));
show('meta', await call('/api/meta'));
show('dashboard', await call('/api/dashboard?month=2026-11'));
show('pnl', await call('/api/pnl?from=2026-11-01&to=2026-11-30&group=day'));
show('outstanding', await call('/api/outstanding'));
show('stock-summary', await call('/api/stock-summary'));
show('salary-liabilities', await call('/api/salary-liabilities'));
show('reconciliation', await call('/api/reconciliation?from=2026-11-01&to=2026-11-30'));
show('income list', await call('/api/income'));
show('users', await call('/api/users'));
show('audit', await call('/api/audit?limit=5'));