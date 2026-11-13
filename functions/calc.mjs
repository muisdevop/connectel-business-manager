// Pure accounting computations, faithful to the workbook formulas.
// No DB / no framework imports: unit-testable on Node. All functions ignore voided rows.
// Money is Rs (PKR), rounded to 2 decimals. Dates are ISO 'YYYY-MM-DD' strings.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const active = (rows) => (rows ?? []).filter((r) => r && !r.voided);
const sum = (rows, field) => round2(rows.reduce((acc, r) => acc + num(r[field]), 0));
export const inRange = (date, from, to) => typeof date === 'string' && date >= from && date <= to;

// ---- Customer outstanding (Customer Ledger -> Outstanding Summary) ----
export function customerBalances(ledgerRows, customers) {
  const ledger = active(ledgerRows);
  return active(customers).map((c) => {
    const rows = ledger.filter((r) => r.customer_id === c.id);
    const bills = sum(rows, 'bill_amount');
    const payments = sum(rows, 'payment_amount');
    return {
      customer_id: c.id, code: c.code, name: c.name,
      bills, payments, outstanding: round2(bills - payments),
      due_date: c.due_date ?? null, followup_status: c.followup_status ?? '',
    };
  });
}

export function totalOutstanding(ledgerRows, customers) {
  return round2(customerBalances(ledgerRows, customers).reduce((a, r) => a + r.outstanding, 0));
}

// ---- Stock balance + reorder alert (Stock -> Stock Summary) ----
export function stockAlert(remaining, reorderLevel) {
  if (remaining < 0) return 'NEGATIVE STOCK';
  if (remaining <= num(reorderLevel)) return 'REORDER';
  return 'OK';
}

export function stockBalances(stockRows, items) {
  const tx = active(stockRows);
  return active(items).map((item) => {
    const rows = tx.filter((r) => r.item_id === item.id);
    const total_in = sum(rows, 'qty_in');
    const total_out = sum(rows, 'qty_out');
    const remaining = round2(total_in - total_out);
    return {
      item_id: item.id, code: item.code, name: item.name, unit: item.unit ?? '',
      total_in, total_out, remaining, reorder_level: num(item.reorder_level),
      alert: stockAlert(remaining, item.reorder_level),
    };
  });
}

// ---- Salary liability (per employee-month) ----
export function salaryLiabilityComputed(row) {
  const total_paid = round2(num(row.advance_paid) + num(row.salary_paid) + num(row.adjustment));
  const outstanding = round2(num(row.agreed_salary) - total_paid);
  return { total_paid, outstanding, status: outstanding <= 0 ? 'Cleared' : 'Pending' };
}

export function totalSalaryOutstanding(liabilityRows) {
  return round2(active(liabilityRows).reduce((a, r) => a + salaryLiabilityComputed(r).outstanding, 0));
}

// ---- Profit & Loss ----
// Billed revenue uses Customer Ledger Invoice rows (not collections), per the sheet.
export function pnlForRange(data, from, to) {
  const ledger = active(data.ledger).filter((r) => r.entry_type === 'Invoice' && inRange(r.date, from, to));
  const income = active(data.income).filter((r) => inRange(r.date, from, to));
  const expenses = active(data.expenses).filter((r) => inRange(r.date, from, to));
  const accruals = active(data.accruals).filter((r) => inRange(r.date, from, to));
  const billed = sum(ledger, 'bill_amount');
  const other = sum(income, 'other_amount');
  const opex = sum(expenses, 'amount');
  const salary = sum(accruals, 'salary_expense');
  return { billed, other, opex, salary, profit: round2(billed + other - opex - salary) };
}

export function eachDay(from, to) {
  const days = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

export function dailyPnl(data, from, to) {
  return eachDay(from, to).map((date) => ({ date, ...pnlForRange(data, date, date) }));
}

export function groupedPnl(data, from, to, group) {
  if (group === 'day') return dailyPnl(data, from, to).map((r) => ({ period: r.date, ...r }));
  const buckets = new Map();
  for (const day of eachDay(from, to)) {
    const key = group === 'year' ? day.slice(0, 4) : day.slice(0, 7);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(day);
  }
  return [...buckets.entries()].map(([period, days]) => ({
    period, ...pnlForRange(data, days[0], days[days.length - 1]),
  }));
}

// ---- Dashboard KPIs for a reporting month ('YYYY-MM') ----
export function dashboard(data, month) {
  const from = `${month}-01`;
  const to = monthEnd(month);
  const income = active(data.income).filter((r) => inRange(r.date, from, to));
  const expenses = active(data.expenses).filter((r) => inRange(r.date, from, to));
  const salaries = active(data.salaries).filter((r) => inRange(r.payment_date, from, to));
  const stock = stockBalances(data.stock, data.items);
  return {
    month,
    service_income: sum(income, 'service_amount'),
    other_income: sum(income, 'other_amount'),
    operating_expenses: sum(expenses, 'amount'),
    salaries_paid: sum(salaries, 'amount_paid'),
    monthly_pnl: pnlForRange(data, from, to).profit,
    customer_outstanding: totalOutstanding(data.ledger, data.customers),
    stock_below_reorder: stock.filter((s) => s.alert !== 'OK').length,
    salary_outstanding: totalSalaryOutstanding(data.liabilities),
  };
}

export function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this month
  return d.toISOString().slice(0, 10);
}

// ---- Daily cash & bank reconciliation ----
const isCash = (r) => r.payment_method === 'Cash';
const isBank = (r) => r.payment_method === 'Bank Transfer';

export function reconciliationForDate(data, date) {
  const income = active(data.income).filter((r) => r.date === date);
  const expenses = active(data.expenses).filter((r) => r.date === date);
  const salaries = active(data.salaries).filter((r) => r.payment_date === date);
  const incomeTotal = (r) => num(r.service_amount) + num(r.other_amount);
  // Register-derived movement (the formula-driven cross-check).
  const reg_cash_received = round2(income.filter(isCash).reduce((a, r) => a + incomeTotal(r), 0));
  const reg_bank_received = round2(income.filter(isBank).reduce((a, r) => a + incomeTotal(r), 0));
  const reg_cash_paid = round2(
    expenses.filter(isCash).reduce((a, r) => a + num(r.amount), 0)
    + salaries.filter(isCash).reduce((a, r) => a + num(r.amount_paid), 0));
  const reg_bank_paid = round2(
    expenses.filter(isBank).reduce((a, r) => a + num(r.amount), 0)
    + salaries.filter(isBank).reduce((a, r) => a + num(r.amount_paid), 0));

  const rec = active(data.reconciliation).find((r) => r.date === date) ?? null;
  // A stored cashbook snapshot uses its own manual figures (faithful to the sheet);
  // a date without a snapshot falls back to register-derived movement.
  const opening_cash = rec ? num(rec.opening_cash) : 0;
  const opening_bank = rec ? num(rec.opening_bank) : 0;
  const cash_received = rec ? num(rec.cash_received) : reg_cash_received;
  const cash_paid = rec ? num(rec.cash_paid) : reg_cash_paid;
  const bank_received = rec ? num(rec.bank_received) : reg_bank_received;
  const bank_paid = rec ? num(rec.bank_paid) : reg_bank_paid;
  const expected_cash = round2(opening_cash + cash_received - cash_paid);
  const expected_bank = round2(opening_bank + bank_received - bank_paid);
  const actual_cash = rec && rec.actual_closing_cash != null ? num(rec.actual_closing_cash) : null;
  const actual_bank = rec && rec.actual_closing_bank != null ? num(rec.actual_closing_bank) : null;
  return {
    date, opening_cash, cash_received, cash_paid, expected_cash,
    actual_closing_cash: actual_cash, cash_difference: actual_cash == null ? null : round2(actual_cash - expected_cash),
    opening_bank, bank_received, bank_paid, expected_bank,
    actual_closing_bank: actual_bank, bank_difference: actual_bank == null ? null : round2(actual_bank - expected_bank),
    register_cash_received: reg_cash_received, register_cash_paid: reg_cash_paid,
    register_bank_received: reg_bank_received, register_bank_paid: reg_bank_paid,
    checked_by: rec?.checked_by ?? '', has_record: Boolean(rec),
  };
}

export function reconciliationRange(data, from, to) {
  return eachDay(from, to)
    .map((date) => reconciliationForDate(data, date))
    .filter((r) => r.has_record || r.cash_received || r.cash_paid || r.bank_received || r.bank_paid);
}