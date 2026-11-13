-- ConnecTEL Business Management — application schema (function_backend, private).
-- Supported subset only: CREATE TABLE app.<t>, CREATE INDEX. No functions/triggers/DML.
-- Column types limited to boolean/integer/bigint/text/uuid/timestamptz/jsonb.
--   * Calendar dates are text 'YYYY-MM-DD' (validated in the Function).
--   * Money / quantity are text holding a rounded decimal string (numeric is unsupported);
--     the Function validates and rounds, calc.mjs parses with Number().
-- Access policies are platform-generated private for function_backend (accessPolicies: []).

-- ---- Application-owned identity ----
CREATE TABLE app.users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  password_iterations integer NOT NULL,
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL
);

CREATE TABLE app.sessions (
  token_digest text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app.users (id),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE app.auth_limiter (
  key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL
);

-- ---- Masters ----
CREATE TABLE app.customers (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  due_date text,
  followup_status text NOT NULL,
  notes text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);

CREATE TABLE app.items (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  unit text NOT NULL,
  reorder_level text NOT NULL,
  notes text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);

CREATE TABLE app.employees (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  notes text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);

-- ---- Registers ----
CREATE TABLE app.income (
  id uuid PRIMARY KEY,
  date text NOT NULL,
  receipt_ref text NOT NULL,
  customer_id uuid,
  customer_name text NOT NULL,
  income_type text NOT NULL,
  payment_method text NOT NULL,
  service_amount text NOT NULL,
  other_amount text NOT NULL,
  notes text NOT NULL,
  received_by text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);
CREATE INDEX income_date_idx ON app.income (date);

CREATE TABLE app.expenses (
  id uuid PRIMARY KEY,
  date text NOT NULL,
  voucher_ref text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount text NOT NULL,
  payment_method text NOT NULL,
  notes text NOT NULL,
  approved_by text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);
CREATE INDEX expenses_date_idx ON app.expenses (date);

CREATE TABLE app.cashbook (
  id uuid PRIMARY KEY,
  date text NOT NULL,
  opening_balance text NOT NULL,
  cash_received text NOT NULL,
  cash_paid text NOT NULL,
  bank_received text NOT NULL,
  bank_paid text NOT NULL,
  notes text NOT NULL,
  checked_by text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);
CREATE INDEX cashbook_date_idx ON app.cashbook (date);

CREATE TABLE app.customer_ledger (
  id uuid PRIMARY KEY,
  date text NOT NULL,
  customer_id uuid NOT NULL,
  entry_type text NOT NULL,
  invoice_ref text NOT NULL,
  due_date text,
  bill_amount text NOT NULL,
  payment_amount text NOT NULL,
  notes text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);
CREATE INDEX customer_ledger_customer_idx ON app.customer_ledger (customer_id);
CREATE INDEX customer_ledger_date_idx ON app.customer_ledger (date);

CREATE TABLE app.salary_payments (
  id uuid PRIMARY KEY,
  payment_date text NOT NULL,
  employee_id uuid,
  employee_name text NOT NULL,
  period text,
  amount_paid text NOT NULL,
  kind text NOT NULL,
  payment_method text NOT NULL,
  notes text NOT NULL,
  paid_by text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);
CREATE INDEX salary_payments_date_idx ON app.salary_payments (payment_date);

CREATE TABLE app.stock_transactions (
  id uuid PRIMARY KEY,
  date text NOT NULL,
  item_id uuid,
  item_code text NOT NULL,
  txn_type text NOT NULL,
  item_name text NOT NULL,
  qty_in text NOT NULL,
  qty_out text NOT NULL,
  unit_cost text NOT NULL,
  total_purchase text NOT NULL,
  supplier_issued_to text NOT NULL,
  ref_notes text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);
CREATE INDEX stock_transactions_item_idx ON app.stock_transactions (item_id);
CREATE INDEX stock_transactions_date_idx ON app.stock_transactions (date);

CREATE TABLE app.salary_liabilities (
  id uuid PRIMARY KEY,
  month text NOT NULL,
  employee_id uuid NOT NULL,
  agreed_salary text NOT NULL,
  advance_paid text NOT NULL,
  salary_paid text NOT NULL,
  adjustment text NOT NULL,
  notes text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);
CREATE INDEX salary_liabilities_employee_idx ON app.salary_liabilities (employee_id);

-- ---- Daily manual inputs (single row per date) ----
CREATE TABLE app.daily_salary_accrual (
  id uuid PRIMARY KEY,
  date text NOT NULL UNIQUE,
  salary_expense text NOT NULL,
  notes text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);

CREATE TABLE app.daily_reconciliation (
  id uuid PRIMARY KEY,
  date text NOT NULL UNIQUE,
  opening_cash text NOT NULL,
  cash_received text NOT NULL,
  cash_paid text NOT NULL,
  actual_closing_cash text,
  opening_bank text NOT NULL,
  bank_received text NOT NULL,
  bank_paid text NOT NULL,
  actual_closing_bank text,
  checked_by text NOT NULL,
  notes text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL,
  voided boolean NOT NULL,
  voided_by uuid,
  voided_at timestamptz,
  fingerprint text NOT NULL
);