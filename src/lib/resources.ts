// Presentation metadata for each register/master: columns, form fields, nav.
// This mirrors the server's editable-field whitelist for UI purposes only —
// permissions are never derived here (they come from /api/me). Money/qty are
// text in transit; the table/form parse them for display and input.

import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight, Banknote, BookOpen, Boxes, Contact, HandCoins, History,
  LayoutDashboard, Package, Scale, Shield, TrendingDown, TrendingUp, Users, Wallet,
} from "lucide-react";
import type { Meta, Module, Permissions } from "./types";

export type FieldType = "date" | "money" | "qty" | "signed" | "money?" | "text" | "enum" | "ref";
export type ColumnType = "text" | "money" | "qty" | "date" | "signed" | "badge" | "ref" | "by";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  options?: keyof Meta;
  suggestions?: keyof Meta;
  refResource?: string;
  fills?: Record<string, string>;
  placeholder?: string;
  help?: string;
  textarea?: boolean;
}

export interface ColumnConfig {
  key: string;
  label: string;
  type: ColumnType;
  refResource?: string;
  align?: "right";
  hideOnMobile?: boolean;
}

export interface ResourceConfig {
  key: string;
  label: string;
  singular: string;
  module: Module;
  kind: "register" | "master" | "daily" | "liability";
  dateField?: "date" | "payment_date" | "month";
  icon: LucideIcon;
  description: string;
  columns: ColumnConfig[];
  fields: FieldConfig[];
  searchKeys: string[];
  byField?: string;
  byLabel?: string;
}

const notes = (max = 500): FieldConfig => ({ name: "notes", label: "Notes", type: "text", max, textarea: true });

export const RESOURCES: Record<string, ResourceConfig> = {
  income: {
    key: "income", label: "Income", singular: "income entry", module: "income", kind: "register",
    dateField: "date", icon: TrendingUp, description: "Service bills and other income received.",
    byField: "received_by", byLabel: "Received by",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "customer_name", label: "Customer", type: "text" },
      { key: "income_type", label: "Type", type: "text" },
      { key: "service_amount", label: "Service (Rs)", type: "money", align: "right" },
      { key: "other_amount", label: "Other (Rs)", type: "money", align: "right" },
      { key: "payment_method", label: "Method", type: "text", hideOnMobile: true },
      { key: "receipt_ref", label: "Receipt", type: "text", hideOnMobile: true },
      { key: "received_by", label: "Received by", type: "by", hideOnMobile: true },
    ],
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "income_type", label: "Income type", type: "enum", required: true, options: "income_types" },
      { name: "customer_id", label: "Customer", type: "ref", refResource: "customers", fills: { customer_name: "name" }, help: "Optional — pick a saved customer or type a name below." },
      { name: "customer_name", label: "Customer name", type: "text", max: 160, placeholder: "e.g. Ali Raza" },
      { name: "service_amount", label: "Service amount (Rs)", type: "money", required: true },
      { name: "other_amount", label: "Other amount (Rs)", type: "money" },
      { name: "payment_method", label: "Payment method", type: "enum", required: true, options: "payment_methods" },
      { name: "receipt_ref", label: "Receipt ref", type: "text", max: 120 },
      notes(),
    ],
    searchKeys: ["customer_name", "receipt_ref", "income_type", "notes"],
  },
  expenses: {
    key: "expenses", label: "Expenses", singular: "expense", module: "expenses", kind: "register",
    dateField: "date", icon: TrendingDown, description: "Operating expenses paid out.",
    byField: "approved_by", byLabel: "Approved by",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "description", label: "Description", type: "text" },
      { key: "category", label: "Category", type: "text", hideOnMobile: true },
      { key: "amount", label: "Amount (Rs)", type: "money", align: "right" },
      { key: "payment_method", label: "Method", type: "text", hideOnMobile: true },
      { key: "voucher_ref", label: "Voucher", type: "text", hideOnMobile: true },
      { key: "approved_by", label: "Approved by", type: "by", hideOnMobile: true },
    ],
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "description", label: "Description", type: "text", max: 200, required: true, placeholder: "e.g. Fuel for generator" },
      { name: "category", label: "Category", type: "text", max: 80, suggestions: "expense_categories" },
      { name: "amount", label: "Amount (Rs)", type: "money", required: true },
      { name: "payment_method", label: "Payment method", type: "enum", required: true, options: "payment_methods" },
      { name: "voucher_ref", label: "Voucher ref", type: "text", max: 120 },
      notes(),
    ],
    searchKeys: ["description", "category", "voucher_ref", "notes"],
  },
  cashbook: {
    key: "cashbook", label: "Cashbook", singular: "cashbook entry", module: "cashbook", kind: "register",
    dateField: "date", icon: Wallet, description: "Daily cash and bank movement snapshot.",
    byField: "checked_by", byLabel: "Checked by",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "opening_balance", label: "Opening (Rs)", type: "money", align: "right" },
      { key: "cash_received", label: "Cash in (Rs)", type: "money", align: "right" },
      { key: "cash_paid", label: "Cash out (Rs)", type: "money", align: "right" },
      { key: "bank_received", label: "Bank in (Rs)", type: "money", align: "right", hideOnMobile: true },
      { key: "bank_paid", label: "Bank out (Rs)", type: "money", align: "right", hideOnMobile: true },
      { key: "checked_by", label: "Checked by", type: "by", hideOnMobile: true },
    ],
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "opening_balance", label: "Opening balance (Rs)", type: "money" },
      { name: "cash_received", label: "Cash received (Rs)", type: "money" },
      { name: "cash_paid", label: "Cash paid (Rs)", type: "money" },
      { name: "bank_received", label: "Bank received (Rs)", type: "money" },
      { name: "bank_paid", label: "Bank paid (Rs)", type: "money" },
      notes(),
    ],
    searchKeys: ["notes"],
  },
  ledger: {
    key: "ledger", label: "Customer Ledger", singular: "ledger entry", module: "ledger", kind: "register",
    dateField: "date", icon: BookOpen, description: "Invoices billed and payments collected per customer.",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "customer_id", label: "Customer", type: "ref", refResource: "customers" },
      { key: "entry_type", label: "Type", type: "badge" },
      { key: "bill_amount", label: "Bill (Rs)", type: "money", align: "right" },
      { key: "payment_amount", label: "Payment (Rs)", type: "money", align: "right" },
      { key: "due_date", label: "Due", type: "date", hideOnMobile: true },
      { key: "invoice_ref", label: "Invoice", type: "text", hideOnMobile: true },
    ],
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "customer_id", label: "Customer", type: "ref", refResource: "customers", required: true },
      { name: "entry_type", label: "Entry type", type: "enum", required: true, options: "ledger_entry_types" },
      { name: "bill_amount", label: "Bill amount (Rs)", type: "money", help: "For an Invoice." },
      { name: "payment_amount", label: "Payment amount (Rs)", type: "money", help: "For a Payment." },
      { name: "due_date", label: "Due date", type: "date" },
      { name: "invoice_ref", label: "Invoice ref", type: "text", max: 120 },
      notes(),
    ],
    searchKeys: ["invoice_ref", "notes"],
  },
  salaries: {
    key: "salaries", label: "Salaries", singular: "salary payment", module: "salaries", kind: "register",
    dateField: "payment_date", icon: Banknote, description: "Salary and advance payments to employees.",
    byField: "paid_by", byLabel: "Paid by",
    columns: [
      { key: "payment_date", label: "Paid on", type: "date" },
      { key: "employee_name", label: "Employee", type: "text" },
      { key: "kind", label: "Kind", type: "badge" },
      { key: "amount_paid", label: "Amount (Rs)", type: "money", align: "right" },
      { key: "payment_method", label: "Method", type: "text", hideOnMobile: true },
      { key: "period", label: "Period", type: "date", hideOnMobile: true },
      { key: "paid_by", label: "Paid by", type: "by", hideOnMobile: true },
    ],
    fields: [
      { name: "payment_date", label: "Payment date", type: "date", required: true },
      { name: "employee_id", label: "Employee", type: "ref", refResource: "employees", fills: { employee_name: "name" } },
      { name: "employee_name", label: "Employee name", type: "text", max: 160 },
      { name: "kind", label: "Kind", type: "enum", required: true, options: "salary_kinds" },
      { name: "amount_paid", label: "Amount paid (Rs)", type: "money", required: true },
      { name: "payment_method", label: "Payment method", type: "enum", required: true, options: "payment_methods" },
      { name: "period", label: "Period (month)", type: "date", help: "First day of the salary month, e.g. 2026-11-01." },
      notes(),
    ],
    searchKeys: ["employee_name", "notes"],
  },
  stock: {
    key: "stock", label: "Stock", singular: "stock transaction", module: "stock", kind: "register",
    dateField: "date", icon: Boxes, description: "Purchases, issues and returns of inventory.",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "item_code", label: "Item code", type: "text" },
      { key: "item_name", label: "Item", type: "text", hideOnMobile: true },
      { key: "txn_type", label: "Type", type: "badge" },
      { key: "qty_in", label: "In", type: "qty", align: "right" },
      { key: "qty_out", label: "Out", type: "qty", align: "right" },
      { key: "unit_cost", label: "Unit cost (Rs)", type: "money", align: "right", hideOnMobile: true },
      { key: "total_purchase", label: "Total (Rs)", type: "money", align: "right", hideOnMobile: true },
      { key: "supplier_issued_to", label: "Supplier / issued to", type: "text", hideOnMobile: true },
    ],
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "item_id", label: "Item", type: "ref", refResource: "items", fills: { item_code: "code", item_name: "name" } },
      { name: "item_code", label: "Item code", type: "text", max: 80 },
      { name: "item_name", label: "Item name", type: "text", max: 200 },
      { name: "txn_type", label: "Transaction type", type: "enum", required: true, options: "stock_tx_types" },
      { name: "qty_in", label: "Quantity in", type: "qty", help: "Purchases and returns." },
      { name: "qty_out", label: "Quantity out", type: "qty", help: "Issued / sold." },
      { name: "unit_cost", label: "Unit cost (Rs)", type: "money" },
      { name: "total_purchase", label: "Total purchase (Rs)", type: "money" },
      { name: "supplier_issued_to", label: "Supplier / issued to", type: "text", max: 160 },
      { name: "ref_notes", label: "Notes", type: "text", max: 500, textarea: true },
    ],
    searchKeys: ["item_code", "item_name", "supplier_issued_to", "ref_notes"],
  },
  customers: {
    key: "customers", label: "Customers", singular: "customer", module: "customers", kind: "master",
    icon: Contact, description: "Customer directory and follow-up status.",
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "due_date", label: "Due date", type: "date", hideOnMobile: true },
      { key: "followup_status", label: "Follow-up", type: "badge" },
    ],
    fields: [
      { name: "code", label: "Code", type: "text", max: 80, required: true, placeholder: "e.g. C-001" },
      { name: "name", label: "Name", type: "text", max: 160, required: true },
      { name: "due_date", label: "Due date", type: "date" },
      { name: "followup_status", label: "Follow-up status", type: "enum", options: "followup_statuses" },
      notes(),
    ],
    searchKeys: ["code", "name", "notes"],
  },
  items: {
    key: "items", label: "Items", singular: "item", module: "items", kind: "master",
    icon: Package, description: "Inventory items and reorder levels.",
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "unit", label: "Unit", type: "text", hideOnMobile: true },
      { key: "reorder_level", label: "Reorder level", type: "qty", align: "right" },
    ],
    fields: [
      { name: "code", label: "Code", type: "text", max: 80, required: true, placeholder: "e.g. 2F-6MM" },
      { name: "name", label: "Name", type: "text", max: 200, required: true },
      { name: "unit", label: "Unit", type: "text", max: 40, placeholder: "e.g. pcs, m" },
      { name: "reorder_level", label: "Reorder level", type: "qty" },
      notes(),
    ],
    searchKeys: ["code", "name", "notes"],
  },
  employees: {
    key: "employees", label: "Employees", singular: "employee", module: "employees", kind: "master",
    icon: Users, description: "Employee directory.",
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Name", type: "text" },
    ],
    fields: [
      { name: "code", label: "Code", type: "text", max: 80, placeholder: "e.g. E-001" },
      { name: "name", label: "Name", type: "text", max: 160, required: true },
      notes(),
    ],
    searchKeys: ["code", "name", "notes"],
  },
  salary_liabilities: {
    key: "salary_liabilities", label: "Salary Liabilities", singular: "salary liability", module: "salary_liabilities",
    kind: "liability", dateField: "month", icon: HandCoins, description: "Agreed salary vs paid, per employee per month.",
    columns: [
      { key: "month", label: "Month", type: "date" },
      { key: "employee_name", label: "Employee", type: "text" },
      { key: "agreed_salary", label: "Agreed (Rs)", type: "money", align: "right" },
      { key: "total_paid", label: "Paid (Rs)", type: "money", align: "right" },
      { key: "outstanding", label: "Outstanding (Rs)", type: "money", align: "right" },
      { key: "status", label: "Status", type: "badge" },
    ],
    fields: [
      { name: "month", label: "Month", type: "date", required: true, help: "First day of the month, e.g. 2026-11-01." },
      { name: "employee_id", label: "Employee", type: "ref", refResource: "employees", required: true },
      { name: "agreed_salary", label: "Agreed salary (Rs)", type: "money" },
      { name: "advance_paid", label: "Advance paid (Rs)", type: "money" },
      { name: "salary_paid", label: "Salary paid (Rs)", type: "money" },
      { name: "adjustment", label: "Adjustment (Rs)", type: "signed", help: "Can be negative." },
      notes(),
    ],
    searchKeys: ["notes"],
  },
  daily_salary_accrual: {
    key: "daily_salary_accrual", label: "Daily Salary Accrual", singular: "daily accrual", module: "pnl",
    kind: "daily", dateField: "date", icon: History, description: "Per-day salary expense used by the P&L.",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "salary_expense", label: "Salary expense (Rs)", type: "money", align: "right" },
    ],
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "salary_expense", label: "Salary expense (Rs)", type: "money" },
      notes(),
    ],
    searchKeys: ["notes"],
  },
  daily_reconciliation: {
    key: "daily_reconciliation", label: "Daily Reconciliation", singular: "reconciliation", module: "reconciliation",
    kind: "daily", dateField: "date", icon: ArrowLeftRight, description: "Opening / actual closing cash and bank per day.",
    byField: "checked_by", byLabel: "Checked by",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "opening_cash", label: "Opening cash", type: "money", align: "right" },
      { key: "actual_closing_cash", label: "Actual cash", type: "money", align: "right" },
      { key: "opening_bank", label: "Opening bank", type: "money", align: "right" },
      { key: "actual_closing_bank", label: "Actual bank", type: "money", align: "right" },
    ],
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "opening_cash", label: "Opening cash (Rs)", type: "money" },
      { name: "cash_received", label: "Cash received (Rs)", type: "money" },
      { name: "cash_paid", label: "Cash paid (Rs)", type: "money" },
      { name: "actual_closing_cash", label: "Actual closing cash (Rs)", type: "money?" },
      { name: "opening_bank", label: "Opening bank (Rs)", type: "money" },
      { name: "bank_received", label: "Bank received (Rs)", type: "money" },
      { name: "bank_paid", label: "Bank paid (Rs)", type: "money" },
      { name: "actual_closing_bank", label: "Actual closing bank (Rs)", type: "money?" },
      notes(),
    ],
    searchKeys: ["notes"],
  },
};

export interface NavItem {
  path: string;
  label: string;
  module: Module;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { label: "Overview", items: [{ path: "/dashboard", label: "Dashboard", module: "dashboard", icon: LayoutDashboard }] },
  {
    label: "Registers", items: [
      { path: "/income", label: "Income", module: "income", icon: TrendingUp },
      { path: "/expenses", label: "Expenses", module: "expenses", icon: TrendingDown },
      { path: "/cashbook", label: "Cashbook", module: "cashbook", icon: Wallet },
      { path: "/ledger", label: "Customer Ledger", module: "ledger", icon: BookOpen },
      { path: "/salaries", label: "Salaries", module: "salaries", icon: Banknote },
      { path: "/stock", label: "Stock", module: "stock", icon: Boxes },
    ],
  },
  {
    label: "Masters", items: [
      { path: "/customers", label: "Customers", module: "customers", icon: Contact },
      { path: "/items", label: "Items", module: "items", icon: Package },
      { path: "/employees", label: "Employees", module: "employees", icon: Users },
    ],
  },
  {
    label: "Reports", items: [
      { path: "/salary-liabilities", label: "Salary Liabilities", module: "salary_liabilities", icon: HandCoins },
      { path: "/pnl", label: "Profit & Loss", module: "pnl", icon: Scale },
      { path: "/reconciliation", label: "Reconciliation", module: "reconciliation", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Administration", items: [
      { path: "/users", label: "Users", module: "users", icon: Shield },
      { path: "/audit", label: "Audit Trail", module: "audit", icon: History },
    ],
  },
];

// Resources rendered by the generic list page (route path === resource key).
export const GENERIC_PAGES = ["income", "expenses", "cashbook", "ledger", "salaries", "stock", "customers", "items", "employees"];

export function refLabel(row: Record<string, unknown>): string {
  const code = typeof row.code === "string" ? row.code : "";
  const name = typeof row.name === "string" ? row.name : "";
  return code && name ? `${code} — ${name}` : name || code || "Untitled";
}

// First nav route the role is allowed to view. Drives post-login landing and
// "home" so limited roles (e.g. cashier) never land on a forbidden Dashboard.
export function firstAccessibleRoute(permissions: Permissions | null): string {
  for (const group of NAV) {
    for (const item of group.items) {
      if (permissions?.[item.module]?.includes("view")) return item.path;
    }
  }
  return "/dashboard";
}