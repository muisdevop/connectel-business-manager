// Demo dataset for the application database, mirroring the source workbook's shape.
// DML lives here (never in migration SQL). Seeding is idempotent: deterministic ids derived
// from natural keys + insertIfAbsent, so re-running never duplicates rows.
//
// Column mapping notes (the sheet's headers and data differ in places):
//   Income: B = customer name, C = customer ref/ID. We map B->customer_name, C->receipt_ref.
//   Expenses: category column is blank in the sheet -> kept empty (not invented).
//   Cashbook: the second sheet row has no date (incomplete sample) -> not imported.
//   Daily/Monthly P&L: billed/other/opex rows are illustrative manual samples NOT backed by
//     registers -> not imported. P&L is computed from registers. The daily salary accrual
//     (column E, "enter daily accrual") IS a genuine manual input -> imported.
//   Daily Reconciliation: stored as the manual cashbook snapshot exactly as entered.
import { rows } from './http.mjs';
import { sha256Hex } from './sessions.mjs';
import { hashPassword } from './passwords.mjs';
import { RESOURCES, validateFields, serializeFields } from './domain.mjs';
import { isRole } from './rbac.mjs';

// Deterministic UUID-shaped id from a stable natural key (Postgres uuid accepts any 32 hex).
export async function detId(key) {
  const h = await sha256Hex(key);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const D = { nov1: '2026-11-01', nov2: '2026-11-02', nov4: '2026-11-04', nov5: '2026-11-05', nov6: '2026-11-06', nov7: '2026-11-07', nov11: '2026-11-11' };

// ---- Demo rows (synthetic; amounts mirror the source workbook's shape) ----
export const SHEET_DATA = {
  customers: [
    { code: '1001_alpha', name: 'Alpha Traders' },
    { code: '1002_beta', name: 'Beta Electronics' },
    { code: 'gamma-store', name: 'Gamma Store' },
    { code: 'delta-collection', name: 'Delta Collection' },
    { code: 'epsilon-textiles', name: 'Epsilon Textiles' },
    { code: 'zeta-enterprises', name: 'Zeta Enterprises' },
    { code: 'eta-mart', name: 'Eta Mart' },
    { code: 'theta-co', name: 'Theta Co' },
    { code: 'iota-mills', name: 'Iota Mills' },
  ],
  items: [{ code: 'cable-6mm', name: 'Cable 6mm', unit: '', reorder_level: 0 }],
  employees: [{ code: 'staff-001', name: 'Demo Employee' }],
  income: [
    { date: D.nov2, receipt_ref: '1001_alpha', customer_name: 'Alpha Traders', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 1500, other_amount: 0, notes: '' },
    { date: D.nov2, receipt_ref: '1002_beta', customer_name: 'Beta Electronics', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 1800, other_amount: 0, notes: '' },
    { date: D.nov2, receipt_ref: '', customer_name: 'Gamma Store', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 1800, other_amount: 0, notes: '' },
    { date: D.nov2, receipt_ref: '', customer_name: 'Delta Collection', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 2000, other_amount: 0, notes: '' },
    { date: D.nov2, receipt_ref: '', customer_name: 'Epsilon Textiles', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 2500, other_amount: 0, notes: '' },
    { date: D.nov2, receipt_ref: '', customer_name: 'Zeta Enterprises', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 3000, other_amount: 0, notes: 'Oct - Nov Bill Received' },
    { date: D.nov4, receipt_ref: '', customer_name: 'Eta Mart', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 1500, other_amount: 5500, notes: 'New Connection' },
    { date: D.nov5, receipt_ref: '', customer_name: 'Theta Co', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 1500, other_amount: 0, notes: '' },
    { date: D.nov5, receipt_ref: '', customer_name: 'Iota Mills', income_type: 'Monthly Bill', payment_method: 'Cash', service_amount: 2000, other_amount: 0, notes: '' },
  ],
  expenses: [
    { date: D.nov4, voucher_ref: '', category: '', description: 'Demo Employee Bike', amount: 300, payment_method: 'Cash', notes: '' },
    { date: D.nov4, voucher_ref: '', category: '', description: 'Match Box', amount: 150, payment_method: 'Cash', notes: '' },
    { date: D.nov4, voucher_ref: '', category: '', description: 'Milk', amount: 360, payment_method: 'Cash', notes: '' },
    { date: D.nov4, voucher_ref: '', category: '', description: 'Lunch', amount: 340, payment_method: 'Cash', notes: '' },
    { date: D.nov4, voucher_ref: '', category: '', description: 'CD Bike', amount: 300, payment_method: 'Cash', notes: '' },
  ],
  salaries: [
    { payment_date: D.nov4, employee_name: 'Demo Employee', period: D.nov11, amount_paid: 5000, kind: 'Monthly Salary', payment_method: 'Cash', paid_by: 'Owner', notes: '' },
  ],
  stock: [
    { date: D.nov4, item_code: 'Cable 6mm', txn_type: 'Purchase', item_name: 'Cable 6mm', qty_in: 2000, qty_out: 0, unit_cost: 0, total_purchase: 48000, supplier_issued_to: '', ref_notes: '' },
  ],
  cashbook: [
    { date: D.nov2, opening_balance: 0, cash_received: 7100, cash_paid: 500, bank_received: 0, bank_paid: 0, checked_by: '', notes: '' },
  ],
  salary_liabilities: [
    { month: D.nov1, employee_name: 'Demo Employee', agreed_salary: 30000, advance_paid: 6000, salary_paid: 32000, adjustment: 0, notes: '' },
  ],
  daily_salary_accrual: [
    { date: D.nov5, salary_expense: 5000, notes: '' },
    { date: D.nov6, salary_expense: 2000, notes: '' },
    { date: D.nov7, salary_expense: 10000, notes: '' },
  ],
  daily_reconciliation: [
    { date: D.nov2, opening_cash: 2500, cash_received: 12600, cash_paid: 500, actual_closing_cash: 14600, opening_bank: 120000, bank_received: 1500, bank_paid: 48000, actual_closing_bank: 73500, checked_by: 'Owner', notes: '' },
  ],
};

const DEFAULT_ACCOUNTS = [
  { username: 'admin', role: 'admin', display_name: 'Owner / Admin' },
  { username: 'accountant', role: 'accountant', display_name: 'Accountant' },
  { username: 'cashier', role: 'cashier', display_name: 'Cashier / Entry' },
  { username: 'viewer', role: 'viewer', display_name: 'Viewer' },
];

async function insertBusinessRow(db, resource, raw, actorId, idKey, now) {
  const spec = RESOURCES[resource];
  const cleaned = validateFields(resource, raw, { partial: false });
  const id = await detId(idKey);
  const fingerprint = await sha256Hex(JSON.stringify(cleaned));
  const row = {
    id, ...serializeFields(resource, cleaned),
    created_by: actorId, updated_by: actorId, created_at: now, updated_at: now,
    version: 1, voided: false, voided_by: null, voided_at: null, fingerprint,
  };
  if (spec.byField) row[spec.byField] = typeof raw[spec.byField] === 'string' ? raw[spec.byField].trim().slice(0, 160) : '';
  const conflictCol = spec.uniqueField ?? 'id';
  const inserted = rows(await db.from(spec.table).insertIfAbsent(row, { onConflict: conflictCol }).select('id'));
  return inserted.length === 1;
}

// Seeds masters + registers. Returns per-table created counts (skipped = already present).
export async function seedBusinessData(db, actorId, now = new Date().toISOString()) {
  const counts = {};
  const add = async (resource, raw, idKey) => {
    counts[resource] = (counts[resource] ?? 0) + (await insertBusinessRow(db, resource, raw, actorId, idKey, now) ? 1 : 0);
  };

  for (const c of SHEET_DATA.customers) await add('customers', { ...c, followup_status: 'Pending', notes: '' }, `customer:${c.code}`);
  for (const it of SHEET_DATA.items) await add('items', { ...it, notes: '' }, `item:${it.code}`);
  for (const e of SHEET_DATA.employees) await add('employees', { ...e, notes: '' }, `employee:${e.code}`);

  const customerId = {};
  for (const c of SHEET_DATA.customers) customerId[c.name] = await detId(`customer:${c.code}`);
  const itemId = await detId(`item:${SHEET_DATA.items[0].code}`);
  const employeeId = await detId(`employee:${SHEET_DATA.employees[0].code}`);

  for (const [i, r] of SHEET_DATA.income.entries()) {
    await add('income', { ...r, customer_id: customerId[r.customer_name] ?? null, received_by: 'Office' }, `income:${i}`);
  }
  for (const [i, r] of SHEET_DATA.expenses.entries()) await add('expenses', { ...r, approved_by: 'Office' }, `expense:${i}`);
  for (const [i, r] of SHEET_DATA.salaries.entries()) await add('salaries', { ...r, employee_id: employeeId }, `salary:${i}`);
  for (const [i, r] of SHEET_DATA.stock.entries()) await add('stock', { ...r, item_id: itemId }, `stock:${i}`);
  for (const [i, r] of SHEET_DATA.cashbook.entries()) await add('cashbook', r, `cashbook:${i}`);
  for (const [i, r] of SHEET_DATA.salary_liabilities.entries()) await add('salary_liabilities', { ...r, employee_id: employeeId }, `liability:${i}`);
  for (const r of SHEET_DATA.daily_salary_accrual) await add('daily_salary_accrual', r, `accrual:${r.date}`);
  for (const r of SHEET_DATA.daily_reconciliation) await add('daily_reconciliation', r, `reconciliation:${r.date}`);
  return counts;
}

async function createUser(db, account, password, now) {
  const derived = await hashPassword(password);
  const id = await detId(`user:${account.username}`);
  const row = {
    id, username: account.username, display_name: account.display_name, role: account.role,
    password_salt: derived.salt, password_hash: derived.hash, password_iterations: derived.iterations,
    is_active: true, created_at: now, updated_at: now, version: 1,
  };
  const inserted = rows(await db.from('users').insertIfAbsent(row, { onConflict: 'username' }).select('id,username'));
  return inserted.length === 1 ? { id, username: account.username } : null;
}

// Bootstrap on an empty database (creates the four role accounts), otherwise requires an
// admin actor and only (re)seeds business data. Plaintext passwords are returned once,
// only on first bootstrap, for handoff to the owner; they are never stored or logged.
export async function seedAll(db, { accounts, actorId } = {}) {
  const now = new Date().toISOString();
  const existing = rows(await db.from('users').select('id').limit(1));
  let credentials = null;
  let adminId = actorId;

  if (existing.length === 0) {
    const list = (accounts && accounts.length ? accounts : DEFAULT_ACCOUNTS).map((a) => ({
      username: String(a.username).trim().toLowerCase(),
      role: a.role, display_name: a.display_name ?? a.username,
      password: a.password ?? `CT-${crypto.randomUUID()}`,
    }));
    for (const a of list) {
      if (!isRole(a.role)) throw new Error(`invalid_role:${a.role}`);
      const created = await createUser(db, a, a.password, now);
      if (created && a.role === 'admin') adminId = created.id;
    }
    credentials = list.map((a) => ({ username: a.username, password: a.password, role: a.role }));
    if (!adminId) adminId = await detId('user:admin');
  }

  const counts = await seedBusinessData(db, adminId, now);
  return { bootstrapped: credentials !== null, credentials, counts };
}