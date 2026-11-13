// Domain definitions: enums, per-resource field specs, and server-side validation.
// Editable fields are whitelisted here; audit/ownership/version fields are server-set only.
import { AppError } from './http.mjs';
import { round2 } from './calc.mjs';

export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Other'];
export const INCOME_TYPES = ['Monthly Bill', 'New Connection', 'Reconnection', 'Installation', 'Other'];
export const EXPENSE_CATEGORIES = ['Fuel', 'Food', 'Utilities', 'Rent', 'Maintenance', 'Supplies', 'Transport', 'Other'];
export const STOCK_TX_TYPES = ['Purchase', 'Issued', 'Returned'];
export const LEDGER_ENTRY_TYPES = ['Invoice', 'Payment'];
export const SALARY_KINDS = ['Monthly Salary', 'Advance'];
export const FOLLOWUP_STATUSES = ['Pending', 'Contacted', 'Promised', 'Cleared'];

const isUuid = (v) => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

function fail(field) {
  const err = new AppError('invalid_input', 400);
  err.field = field;
  throw err;
}

function cleanValue(name, spec, raw) {
  const present = raw !== undefined && raw !== null && raw !== '';
  switch (spec.type) {
    case 'date':
      if (!present) { if (spec.required) fail(name); return null; }
      if (!isDate(raw)) fail(name);
      return raw;
    case 'money':
    case 'qty': {
      if (!present) { if (spec.required) fail(name); return 0; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) fail(name);
      return round2(n);
    }
    case 'signed': {
      if (!present) return 0;
      const n = Number(raw);
      if (!Number.isFinite(n)) fail(name);
      return round2(n);
    }
    case 'money?': {
      if (!present) return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) fail(name);
      return round2(n);
    }
    case 'text': {
      if (!present) { if (spec.required) fail(name); return ''; }
      if (typeof raw !== 'string') fail(name);
      const t = raw.trim();
      if (spec.required && !t) fail(name);
      if ([...t].length > (spec.max ?? 300)) fail(name);
      return t;
    }
    case 'enum': {
      if (!present) { if (spec.required) fail(name); return spec.values[0]; }
      if (!spec.values.includes(raw)) fail(name);
      return raw;
    }
    case 'ref': {
      if (!present) { if (spec.required) fail(name); return null; }
      if (!isUuid(raw)) fail(name);
      return raw;
    }
    default:
      fail(name);
  }
}

// validateFields returns only whitelisted, cleaned editable fields.
// partial=true (edit) skips untouched fields; partial=false (create) applies defaults/required.
export function validateFields(resource, body, { partial = false } = {}) {
  const spec = RESOURCES[resource];
  if (!spec) throw new AppError('not_found', 404);
  if (typeof body !== 'object' || body === null) throw new AppError('invalid_input', 400);
  const out = {};
  for (const [name, fieldSpec] of Object.entries(spec.fields)) {
    if (partial && !(name in body)) continue;
    out[name] = cleanValue(name, fieldSpec, body[name]);
  }
  return out;
}

const T = (max) => ({ type: 'text', max });
export const RESOURCES = {
  income: {
    table: 'income', module: 'income', byField: 'received_by',
    fields: {
      date: { type: 'date', required: true }, receipt_ref: T(120), customer_id: { type: 'ref' },
      customer_name: T(160), income_type: { type: 'enum', values: INCOME_TYPES, required: true },
      payment_method: { type: 'enum', values: PAYMENT_METHODS, required: true },
      service_amount: { type: 'money', required: true }, other_amount: { type: 'money' }, notes: T(500),
    },
  },
  expenses: {
    table: 'expenses', module: 'expenses', byField: 'approved_by',
    fields: {
      date: { type: 'date', required: true }, voucher_ref: T(120), category: T(80),
      description: { ...T(200), required: true }, amount: { type: 'money', required: true },
      payment_method: { type: 'enum', values: PAYMENT_METHODS, required: true }, notes: T(500),
    },
  },
  cashbook: {
    table: 'cashbook', module: 'cashbook', byField: 'checked_by',
    fields: {
      date: { type: 'date', required: true }, opening_balance: { type: 'money' },
      cash_received: { type: 'money' }, cash_paid: { type: 'money' },
      bank_received: { type: 'money' }, bank_paid: { type: 'money' }, notes: T(500),
    },
  },
  ledger: {
    table: 'customer_ledger', module: 'ledger', byField: null,
    fields: {
      date: { type: 'date', required: true }, customer_id: { type: 'ref', required: true },
      entry_type: { type: 'enum', values: LEDGER_ENTRY_TYPES, required: true }, invoice_ref: T(120),
      due_date: { type: 'date' }, bill_amount: { type: 'money' }, payment_amount: { type: 'money' }, notes: T(500),
    },
  },
  salaries: {
    table: 'salary_payments', module: 'salaries', byField: 'paid_by',
    fields: {
      payment_date: { type: 'date', required: true }, employee_id: { type: 'ref' }, employee_name: T(160),
      period: { type: 'date' }, amount_paid: { type: 'money', required: true },
      kind: { type: 'enum', values: SALARY_KINDS, required: true },
      payment_method: { type: 'enum', values: PAYMENT_METHODS, required: true }, notes: T(500),
    },
  },
  stock: {
    table: 'stock_transactions', module: 'stock', byField: null,
    fields: {
      date: { type: 'date', required: true }, item_id: { type: 'ref' }, item_code: T(80),
      txn_type: { type: 'enum', values: STOCK_TX_TYPES, required: true }, item_name: T(200),
      qty_in: { type: 'qty' }, qty_out: { type: 'qty' }, unit_cost: { type: 'money' },
      total_purchase: { type: 'money' }, supplier_issued_to: T(160), ref_notes: T(500),
    },
  },
  customers: {
    table: 'customers', module: 'customers', byField: null, uniqueField: 'code',
    fields: {
      code: { ...T(80), required: true }, name: { ...T(160), required: true },
      due_date: { type: 'date' }, followup_status: { type: 'enum', values: FOLLOWUP_STATUSES }, notes: T(500),
    },
  },
  items: {
    table: 'items', module: 'items', byField: null, uniqueField: 'code',
    fields: {
      code: { ...T(80), required: true }, name: { ...T(200), required: true },
      unit: T(40), reorder_level: { type: 'qty' }, notes: T(500),
    },
  },
  employees: {
    table: 'employees', module: 'employees', byField: null, uniqueField: 'code',
    fields: { code: T(80), name: { ...T(160), required: true }, notes: T(500) },
  },
  salary_liabilities: {
    table: 'salary_liabilities', module: 'salary_liabilities', byField: null,
    fields: {
      month: { type: 'date', required: true }, employee_id: { type: 'ref', required: true },
      agreed_salary: { type: 'money' }, advance_paid: { type: 'money' },
      salary_paid: { type: 'money' }, adjustment: { type: 'signed' }, notes: T(500),
    },
  },
  daily_salary_accrual: {
    table: 'daily_salary_accrual', module: 'pnl', byField: null, uniqueField: 'date',
    fields: { date: { type: 'date', required: true }, salary_expense: { type: 'money' }, notes: T(500) },
  },
  daily_reconciliation: {
    table: 'daily_reconciliation', module: 'reconciliation', byField: 'checked_by', uniqueField: 'date',
    fields: {
      date: { type: 'date', required: true }, opening_cash: { type: 'money' },
      cash_received: { type: 'money' }, cash_paid: { type: 'money' },
      actual_closing_cash: { type: 'money?' }, opening_bank: { type: 'money' },
      bank_received: { type: 'money' }, bank_paid: { type: 'money' },
      actual_closing_bank: { type: 'money?' }, notes: T(500),
    },
  },
};

export const RESOURCE_NAMES = Object.keys(RESOURCES);

// DB-ready row: money/qty are stored as text (numeric is unsupported by the platform).
// The Function validates + rounds numbers; calc.mjs parses them back with Number().
export function serializeFields(resource, cleaned) {
  const spec = RESOURCES[resource];
  const out = {};
  for (const [name, value] of Object.entries(cleaned)) {
    const type = spec.fields[name]?.type;
    const numeric = type === 'money' || type === 'qty' || type === 'signed' || type === 'money?';
    out[name] = numeric ? (value == null ? null : String(value)) : value;
  }
  return out;
}

// Inverse of serializeFields: editable fields with money/qty parsed back to numbers.
// Used to merge a partial edit into the current row for a stable content fingerprint.
export function deserializeFields(resource, row) {
  const spec = RESOURCES[resource];
  const out = {};
  for (const name of Object.keys(spec.fields)) {
    const type = spec.fields[name].type;
    const numeric = type === 'money' || type === 'qty' || type === 'signed' || type === 'money?';
    const value = row?.[name];
    out[name] = numeric ? (value == null || value === '' ? (type === 'money?' ? null : 0) : Number(value)) : (value ?? '');
  }
  return out;
}

export function meta() {
  return {
    payment_methods: PAYMENT_METHODS, income_types: INCOME_TYPES, expense_categories: EXPENSE_CATEGORIES,
    stock_tx_types: STOCK_TX_TYPES, ledger_entry_types: LEDGER_ENTRY_TYPES, salary_kinds: SALARY_KINDS,
    followup_statuses: FOLLOWUP_STATUSES,
  };
}