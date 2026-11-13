// Report endpoints. All aggregation is pure (calc.mjs); this layer only loads rows
// and gates access by module. Money/qty arrive as text and calc parses with Number().
import { AppError, json, rows } from './http.mjs';
import { can } from './rbac.mjs';
import {
  dashboard, pnlForRange, groupedPnl, customerBalances, totalOutstanding,
  stockBalances, salaryLiabilityComputed, totalSalaryOutstanding, reconciliationRange, monthEnd,
} from './calc.mjs';

const FETCH_LIMIT = 5000;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonth = (v) => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);
const currentMonth = () => new Date().toISOString().slice(0, 7);

async function table(db, name) {
  return rows(await db.from(name).select('*').limit(FETCH_LIMIT));
}

// The full data shape calc.mjs expects.
export async function loadData(db) {
  const [ledger, income, expenses, accruals, salaries, stock, items, customers, liabilities, reconciliation] = await Promise.all([
    table(db, 'customer_ledger'), table(db, 'income'), table(db, 'expenses'), table(db, 'daily_salary_accrual'),
    table(db, 'salary_payments'), table(db, 'stock_transactions'), table(db, 'items'), table(db, 'customers'),
    table(db, 'salary_liabilities'), table(db, 'daily_reconciliation'),
  ]);
  return { ledger, income, expenses, accruals, salaries, stock, items, customers, liabilities, reconciliation };
}

function gate(user, module) {
  if (!can(user.role, module, 'view')) throw new AppError('forbidden', 403);
}

function rangeParams(url, fallbackFrom, fallbackTo) {
  const from = url.searchParams.get('from') ?? fallbackFrom;
  const to = url.searchParams.get('to') ?? fallbackTo;
  if (!isDate(from) || !isDate(to) || from > to) throw new AppError('invalid_input', 400);
  return { from, to };
}

export async function dashboardReport(ctx) {
  const { db, user, url } = ctx;
  gate(user, 'dashboard');
  const month = url.searchParams.get('month') ?? currentMonth();
  if (!isMonth(month)) throw new AppError('invalid_input', 400);
  const data = await loadData(db);
  return json(dashboard(data, month));
}

export async function pnlReport(ctx) {
  const { db, user, url } = ctx;
  gate(user, 'pnl');
  const month = currentMonth();
  const { from, to } = rangeParams(url, `${month}-01`, monthEnd(month));
  const group = url.searchParams.get('group') ?? 'day';
  if (!['day', 'month', 'year'].includes(group)) throw new AppError('invalid_input', 400);
  const data = await loadData(db);
  return json({ from, to, group, rows: groupedPnl(data, from, to, group), totals: pnlForRange(data, from, to) });
}

export async function outstandingReport(ctx) {
  const { db, user } = ctx;
  gate(user, 'customers');
  const data = await loadData(db);
  return json({ rows: customerBalances(data.ledger, data.customers), total: totalOutstanding(data.ledger, data.customers) });
}

export async function stockReport(ctx) {
  const { db, user } = ctx;
  gate(user, 'stock');
  const data = await loadData(db);
  return json({ rows: stockBalances(data.stock, data.items) });
}

export async function salaryLiabilitiesReport(ctx) {
  const { db, user } = ctx;
  gate(user, 'salary_liabilities');
  const [liabilities, employees] = await Promise.all([table(db, 'salary_liabilities'), table(db, 'employees')]);
  const nameOf = new Map(employees.map((e) => [e.id, e.name]));
  const rowsOut = liabilities.filter((r) => !r.voided)
    .sort((a, b) => String(b.month).localeCompare(String(a.month)))
    .map((r) => ({
      id: r.id, month: r.month, employee_id: r.employee_id, employee_name: nameOf.get(r.employee_id) ?? '',
      agreed_salary: Number(r.agreed_salary), advance_paid: Number(r.advance_paid), salary_paid: Number(r.salary_paid),
      adjustment: Number(r.adjustment), notes: r.notes, version: r.version, ...salaryLiabilityComputed(r),
    }));
  return json({ rows: rowsOut, total: totalSalaryOutstanding(liabilities) });
}

export async function reconciliationReport(ctx) {
  const { db, user, url } = ctx;
  gate(user, 'reconciliation');
  const month = currentMonth();
  const { from, to } = rangeParams(url, `${month}-01`, monthEnd(month));
  const data = await loadData(db);
  return json({ from, to, rows: reconciliationRange(data, from, to) });
}

// Recent activity across registers (derived from audit columns; no separate log table).
const AUDIT_TABLES = [
  ['income', 'income'], ['expenses', 'expenses'], ['cashbook', 'cashbook'], ['customer_ledger', 'ledger'],
  ['salary_payments', 'salaries'], ['stock_transactions', 'stock'], ['customers', 'customers'], ['items', 'items'],
  ['employees', 'employees'], ['salary_liabilities', 'salary_liabilities'], ['daily_salary_accrual', 'pnl'],
  ['daily_reconciliation', 'reconciliation'],
];

export async function auditReport(ctx) {
  const { db, user, url } = ctx;
  gate(user, 'audit');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));
  const users = await table(db, 'users');
  const nameOf = new Map(users.map((u) => [u.id, u.display_name || u.username]));
  const events = [];
  for (const [tableName, resource] of AUDIT_TABLES) {
    for (const r of await table(db, tableName)) {
      const label = r.description || r.customer_name || r.employee_name || r.item_code || r.code || r.date || r.month || r.id;
      if (r.voided) events.push({ resource, id: r.id, action: 'voided', actor: nameOf.get(r.voided_by) ?? '', at: r.voided_at, label });
      else if (r.updated_at && r.created_at && r.updated_at !== r.created_at) events.push({ resource, id: r.id, action: 'updated', actor: nameOf.get(r.updated_by) ?? '', at: r.updated_at, label });
      else events.push({ resource, id: r.id, action: 'created', actor: nameOf.get(r.created_by) ?? '', at: r.created_at, label });
    }
  }
  events.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  return json({ rows: events.slice(0, limit) });
}