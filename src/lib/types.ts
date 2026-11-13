// Shared frontend types. Permissions come from the server (/api/me); the UI never
// re-derives them. Register rows store money/qty as text, so row values are loose.

export type Role = "admin" | "accountant" | "cashier" | "viewer";
export type Action = "view" | "create" | "edit" | "delete";
export type Module =
  | "dashboard" | "income" | "expenses" | "cashbook" | "ledger" | "customers"
  | "salaries" | "stock" | "items" | "employees" | "salary_liabilities"
  | "pnl" | "reconciliation" | "users" | "audit";

export type Permissions = Record<Module, Action[]>;

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: Role;
}

export interface PublicUser extends User {
  is_active: boolean;
  created_at: string;
  version: number;
}

export interface Meta {
  payment_methods: string[];
  income_types: string[];
  expense_categories: string[];
  stock_tx_types: string[];
  ledger_entry_types: string[];
  salary_kinds: string[];
  followup_statuses: string[];
}

// A register/master row as returned by the API (fingerprint stripped server-side).
export interface Row {
  id: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  version: number;
  voided: boolean;
  voided_by?: string | null;
  voided_at?: string | null;
  [key: string]: unknown;
}

export interface Dashboard {
  month: string;
  service_income: number;
  other_income: number;
  operating_expenses: number;
  salaries_paid: number;
  monthly_pnl: number;
  customer_outstanding: number;
  stock_below_reorder: number;
  salary_outstanding: number;
}

export interface PnlTotals {
  billed: number;
  other: number;
  opex: number;
  salary: number;
  profit: number;
}

export interface PnlRow extends PnlTotals {
  period: string;
  date?: string;
}

export interface PnlReport {
  from: string;
  to: string;
  group: "day" | "month" | "year";
  rows: PnlRow[];
  totals: PnlTotals;
}

export interface OutstandingRow {
  customer_id: string;
  code: string;
  name: string;
  bills: number;
  payments: number;
  outstanding: number;
  due_date: string | null;
  followup_status: string;
}

export interface OutstandingReport {
  rows: OutstandingRow[];
  total: number;
}

export interface StockRow {
  item_id: string;
  code: string;
  name: string;
  unit: string;
  total_in: number;
  total_out: number;
  remaining: number;
  reorder_level: number;
  alert: "OK" | "REORDER" | "NEGATIVE STOCK";
}

export interface StockReport {
  rows: StockRow[];
}

export interface SalaryLiabilityRow {
  id: string;
  month: string;
  employee_id: string;
  employee_name: string;
  agreed_salary: number;
  advance_paid: number;
  salary_paid: number;
  adjustment: number;
  notes: string;
  version: number;
  total_paid: number;
  outstanding: number;
  status: "Cleared" | "Pending";
}

export interface SalaryLiabilitiesReport {
  rows: SalaryLiabilityRow[];
  total: number;
}

export interface ReconciliationRow {
  date: string;
  opening_cash: number;
  cash_received: number;
  cash_paid: number;
  expected_cash: number;
  actual_closing_cash: number | null;
  cash_difference: number | null;
  opening_bank: number;
  bank_received: number;
  bank_paid: number;
  expected_bank: number;
  actual_closing_bank: number | null;
  bank_difference: number | null;
  register_cash_received: number;
  register_cash_paid: number;
  register_bank_received: number;
  register_bank_paid: number;
  checked_by: string;
  has_record: boolean;
}

export interface ReconciliationReport {
  from: string;
  to: string;
  rows: ReconciliationRow[];
}

export interface AuditEvent {
  resource: string;
  id: string;
  action: "created" | "updated" | "voided";
  actor: string;
  at: string;
  label: string;
}

export interface AuditReport {
  rows: AuditEvent[];
}