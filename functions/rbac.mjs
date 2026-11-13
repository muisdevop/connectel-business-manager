// Role-based access control. Single source of truth for permissions.
// The server enforces this on every route; /api/me returns permissionsFor(role)
// so the frontend gates UI from the same matrix (no duplicated logic).

export const ROLES = ['admin', 'accountant', 'cashier', 'viewer'];
export const ACTIONS = ['view', 'create', 'edit', 'delete'];

export const MODULES = [
  'dashboard', 'income', 'expenses', 'cashbook', 'ledger', 'customers',
  'salaries', 'stock', 'items', 'employees', 'salary_liabilities',
  'pnl', 'reconciliation', 'users', 'audit',
];

const ALL = [...ACTIONS];
const VIEW = ['view'];
const EDIT = ['view', 'create', 'edit'];

function fullAccess() {
  return Object.fromEntries(MODULES.map((m) => [m, [...ALL]]));
}

const MATRIX = {
  admin: fullAccess(),
  accountant: {
    dashboard: VIEW, income: EDIT, expenses: EDIT, cashbook: EDIT, ledger: EDIT,
    customers: EDIT, salaries: EDIT, stock: EDIT, items: EDIT, employees: EDIT,
    salary_liabilities: EDIT, pnl: VIEW, reconciliation: VIEW, users: [], audit: VIEW,
  },
  cashier: {
    dashboard: [], income: EDIT, expenses: EDIT, cashbook: EDIT, ledger: EDIT,
    customers: VIEW, salaries: [], stock: [], items: [], employees: [],
    salary_liabilities: [], pnl: [], reconciliation: [], users: [], audit: [],
  },
  viewer: {
    dashboard: VIEW, income: VIEW, expenses: VIEW, cashbook: VIEW, ledger: VIEW,
    customers: VIEW, salaries: VIEW, stock: VIEW, items: VIEW, employees: VIEW,
    salary_liabilities: VIEW, pnl: VIEW, reconciliation: VIEW, users: [], audit: VIEW,
  },
};

export function isRole(value) {
  return typeof value === 'string' && ROLES.includes(value);
}

export function permissionsFor(role) {
  const base = MATRIX[role];
  if (!base) return Object.fromEntries(MODULES.map((m) => [m, []]));
  return Object.fromEntries(MODULES.map((m) => [m, [...(base[m] ?? [])]]));
}

export function can(role, module, action) {
  return (MATRIX[role]?.[module] ?? []).includes(action);
}

// Cashier may edit only rows they created; accountant/admin edit any; viewer none.
export function canEditRow(user, row) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'accountant') return true;
  if (user.role === 'cashier') return row.created_by === user.id;
  return false;
}

export function roleLabel(role) {
  return { admin: 'Admin / Owner', accountant: 'Accountant', cashier: 'Cashier / Entry', viewer: 'Viewer' }[role] ?? role;
}