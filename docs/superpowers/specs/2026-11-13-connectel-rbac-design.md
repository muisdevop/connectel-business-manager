# ConnecTEL Business Manager — RBAC Web App (Design Spec)

Date: 2026-11-13
Status: Approved by owner (verbal go-ahead: "keep working until everything is perfect and deliverable").
Source: a 14-sheet ISP bookkeeping workbook, currency Rs (PKR).

## 1. Goal
Faithful web conversion of all 14 sheets with 4-role RBAC, multi-user login, server-enforced
permissions, audit trail, and a one-time import of the existing sheet data. Target: **Qoder Sites
native** (owner explicitly dropped portability to gpanel/Coolify).

## 2. Roles (owner chose the 4-role set)
- **admin** (Owner/CEO): everything, incl. user management and void/delete.
- **accountant** (AC - Office): create/edit all registers + masters, view all reports. No user admin, no delete.
- **cashier** (Entry): create/edit **own** Income/Expenses/Cashbook/Customer-Ledger rows; view customers.
  No Salaries, Stock, Items/Employees/Salary-Liabilities, no Dashboard/P&L/Reconciliation, no user admin.
- **viewer**: read-only across all modules except user management. No writes anywhere.

## 3. Architecture (Qoder Sites)
- Frontend: bundled React starter (React 19 + Vite 8 + Tailwind 4 + shadcn catalog), static `dist/`.
- Backend: one `app` Edge Function (Deno entry `functions/index.ts`), business logic in runtime-agnostic
  `.mjs` modules so it is testable on Node (Deno is not installed locally; Deno check deferred to delivery).
- Database: managed Postgres (`app` schema), standard DDL via reviewed migration. Access only inside the
  Function through the platform Supabase-like client. Queries limited to the proven subset
  (`select/eq/order/limit/insertIfAbsent/update`); date-range filtering + aggregation done in pure JS.
- Auth: application-owned username/password (PBKDF2 via WebCrypto), DB-backed sessions in
  `__Host-app_auth.session` HttpOnly/Secure/SameSite=Lax cookie. **No open registration** — admin creates users.
- Writes: idempotent create (client UUID idempotency key), versioned edits (optimistic concurrency),
  soft-delete/void (admin). No multi-step transactions (platform limitation); reconcile, never blind-retry.
- Local dev: Node server `dev/server.mjs` runs the real router against an in-memory fake DB + seed; Vite
  proxies `/functions/v1/app` → 127.0.0.1:8000. No cloud credentials needed to build/test.

## 4. Data model (Postgres, `app` schema)
Identity: `users`, `sessions`, `auth_limiter`.
Masters: `customers`, `items`, `employees`.
Registers: `income`, `expenses`, `salary_payments`, `stock_transactions`, `cashbook`, `customer_ledger`.
Accrual/manual: `salary_liabilities` (per employee-month), `daily_salary_accrual` (per day),
`daily_reconciliation` (per day: opening + actual closing cash/bank).
Every business row: `id uuid`, audit `created_by/updated_by/created_at/updated_at`, `version int`, `voided bool`.
Computed on read (no stored rows): customer outstanding, stock balance + alert, salary outstanding,
Daily/Monthly/Yearly P&L, Dashboard KPIs, reconciliation expected/difference.

## 5. Computations (faithful to sheet formulas)
- Customer outstanding = Σ bills − Σ payments (per customer, from customer_ledger, non-voided).
- Stock remaining = Σ qty_in − Σ qty_out; alert = NEGATIVE STOCK if <0, REORDER if ≤ reorder level, else OK.
  (Returned stock is entered as qty_in.)
- Salary liability: total_paid = advance + salary_paid + adjustment; outstanding = agreed − total_paid;
  status = Cleared if outstanding ≤ 0 else Pending.
- Daily P&L = billed revenue (ledger Invoice rows) + other income (income.other) − operating expenses
  − daily salary accrual. Monthly/Yearly roll up Daily over the range.
- Dashboard (selected month): service income, other income, opex, salaries paid, monthly P&L,
  total customer outstanding, count of stock items below reorder, total salary outstanding.
- Reconciliation: cash/bank received & paid derived from registers by payment method; expected closing =
  opening + received − paid; difference = actual − expected.

## 6. RBAC enforcement
`functions/rbac.mjs` holds the permission matrix + `can(role, module, action)` + `permissionsFor(role)`.
Every mutating route checks permission server-side; cashier edit additionally requires `created_by == user.id`.
`/api/me` returns `{user, permissions}` so the frontend gates UI from the server's own matrix (no duplication).
Delete/void = admin only. Forbidden → 403 `forbidden`; unauthenticated → 401 `login_required`.

## 7. API surface (same-origin `/functions/v1/app`)
- `GET /api/health`, `POST /api/login`, `POST /api/logout`, `GET /api/me`.
- Users (admin): `GET/POST /api/users`, `PATCH /api/users/:id` (role/name/active/reset password).
- Generic resources (income, expenses, cashbook, ledger, salaries, stock, customers, items, employees,
  salary_liabilities, daily_salary_accrual, daily_reconciliation):
  `GET /api/:res` (list), `POST /api/:res` (idempotent create), `PATCH /api/:res/:id` (versioned edit),
  `POST /api/:res/:id/void` (admin).
- Reports: `GET /api/reports/dashboard?month=YYYY-MM`, `/api/reports/pnl?from&to&group=day|month|year`,
  `/api/reports/outstanding`, `/api/reports/stock`, `/api/reports/salary-liabilities?month`,
  `/api/reports/reconciliation?from&to`.
- `GET /api/meta` (enums + defaults).

## 8. Frontend screens
Login; Dashboard (month picker + KPI cards); six register pages (table + filter/search + add/edit form);
Customers / Items / Employees / Salary-Liabilities management; P&L (daily/monthly/yearly) + Reconciliation;
User management (admin). Role-aware navigation/actions from `/api/me` permissions. Responsive at 390px.

## 9. Validation, errors, audit
Server-side validation of every field (dates, non-negative amounts, bounded strings, whitelisted editable
fields). Safe stable error codes; no raw SQL/credentials/provider details leaked. `received/approved/paid/
checked_by` auto-filled from the authenticated user (no separate approval workflow). Audit columns on all rows.

## 10. Data import
One-time seed of existing rows (Income 9, Expenses 5, Salaries 1, Stock 1, Cashbook 2, Salary Liabilities 1,
Daily P&L manual 3, Reconciliation 1) + derived masters (item "Cable 6mm", employee "Demo Employee"). Excel serial
dates → ISO (epoch 1899-12-30). Reporting month in sheet = 2026-11. Manual Monthly/Yearly P&L sample rows are
NOT imported (those reports are computed). Seed also creates 4 role accounts (initial passwords reported to
owner; owner should change them).

## 11. Testing & acceptance
- Unit: calculation + RBAC modules (pure, node --test).
- API: auth, RBAC allow/deny per role, CRUD, idempotency, versioned-edit conflict, reports — via real router
  + fake DB on Node.
- Build: `npm run build` (tsc + Vite) must pass.
- Browser: golden path (login → add income → dashboard) + a denied action per role, at desktop and 390px.
- Deployed: one real end-to-end flow + RBAC denial on the published site. Evidence before any "done" claim.

## 12. Out of scope (YAGNI)
Portability adapters (gpanel/Coolify), open self-registration, email/password recovery, multi-step approval
workflow, hard deletes, Storage/attachments, AI features, multi-currency.