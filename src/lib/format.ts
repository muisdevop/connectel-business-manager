// Display formatting. Currency is Rs (PKR). Register money/qty arrive as text,
// so everything parses through num() before formatting.

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const grouped2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// "1,500" / "1,500.50" — no currency prefix (for table cells under a "(Rs)" header).
export function amount(value: unknown): string {
  return grouped.format(num(value));
}

// "Rs 1,500" / "Rs -8,000" — full currency label.
export function money(value: unknown): string {
  const n = num(value);
  return `Rs ${grouped.format(n)}`;
}

// Always two decimals, for reconciliation / liability precision.
export function money2(value: unknown): string {
  return `Rs ${grouped2.format(num(value))}`;
}

export function qty(value: unknown): string {
  return grouped.format(num(value));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ISO 'YYYY-MM-DD' -> '02 Nov 2026'. Pass-through for anything unexpected.
export function formatDate(iso: unknown): string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso ? String(iso) : "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

// 'YYYY-MM' -> 'Nov 2026'.
export function formatMonth(month: unknown): string {
  if (typeof month !== "string" || !/^\d{4}-\d{2}/.test(month)) return String(month ?? "");
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// Full ISO timestamp -> '02 Nov 2026, 14:30'.
export function formatDateTime(iso: unknown): string {
  if (typeof iso !== "string") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = formatDate(d.toISOString().slice(0, 10));
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

// Humanized relative time for the audit feed.
export function relativeTime(iso: unknown): string {
  if (typeof iso !== "string") return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso.slice(0, 10));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// Shift a 'YYYY-MM' by delta months.
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}