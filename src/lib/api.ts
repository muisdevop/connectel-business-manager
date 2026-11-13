// Same-origin API client for the app Edge Function. Credentials ride in the
// HttpOnly session cookie. Creates carry an idempotency key; edits carry a version.
// Uncertain outcomes (network / 5xx) are flagged so the UI never blind-retries.

import type {
  AuditReport, Dashboard, Meta, OutstandingReport, Permissions, PnlReport,
  PublicUser, ReconciliationReport, Row, SalaryLiabilitiesReport, StockReport, User,
} from "./types";

const BASE = "/functions/v1/app";

export class ApiError extends Error {
  code: string;
  status: number;
  field?: string;
  uncertain: boolean;
  constructor(code: string, status = 0, field?: string, uncertain = false) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.field = field;
    this.uncertain = uncertain;
  }
}

interface SendInit {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function send(path: string, init: SendInit = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { ...init.headers };
  let payload: string | undefined;
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(init.body);
  }
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers,
      body: payload,
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError("network_error", 0, undefined, true);
  }
  let body: any;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("invalid_response", response.status, undefined, true);
  }
  if (!response.ok) {
    const code = typeof body?.error === "string" ? body.error : "request_failed";
    const field = typeof body?.field === "string" ? body.field : undefined;
    if (response.status === 401 && code === "login_required") {
      window.dispatchEvent(new CustomEvent("app:unauthorized"));
    }
    throw new ApiError(code, response.status, field, response.status >= 500 || response.status === 408);
  }
  return { status: response.status, body };
}

async function request<T>(path: string, init?: SendInit): Promise<T> {
  return (await send(path, init)).body as T;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),
  login: (username: string, password: string) =>
    request<{ user: User }>("/api/login", { method: "POST", body: { username, password } }),
  logout: () => request<{ ok: boolean }>("/api/logout", { method: "POST" }),
  me: () => request<{ user: User; permissions: Permissions }>("/api/me"),
  meta: () => request<Meta>("/api/meta"),
  seed: (accounts?: unknown) =>
    request<{ bootstrapped: boolean; credentials: { username: string; password: string; role: string }[] | null; counts: Record<string, number> }>(
      "/api/admin/seed", { method: "POST", body: accounts ? { accounts } : {} }),

  list: (resource: string, params: { from?: string; to?: string; include_voided?: boolean } = {}) =>
    request<Row[]>(`/api/${resource}${qs(params)}`),
  get: (resource: string, id: string) => request<Row>(`/api/${resource}/${id}`),
  // A create is idempotent: the same key replays safely; changed content under the
  // same key is rejected (idempotency_conflict) rather than silently duplicated.
  create: async (resource: string, body: unknown, idempotencyKey: string) => {
    const { status, body: row } = await send(`/api/${resource}`, {
      method: "POST", body, headers: { "idempotency-key": idempotencyKey },
    });
    return { row: row as Row, replayed: status === 200 };
  },
  update: (resource: string, id: string, body: unknown) =>
    request<Row>(`/api/${resource}/${id}`, { method: "PATCH", body }),
  voidRow: (resource: string, id: string) =>
    request<Row>(`/api/${resource}/${id}`, { method: "DELETE" }),

  dashboard: (month?: string) => request<Dashboard>(`/api/dashboard${qs({ month })}`),
  pnl: (from: string, to: string, group: "day" | "month" | "year") =>
    request<PnlReport>(`/api/pnl${qs({ from, to, group })}`),
  outstanding: () => request<OutstandingReport>("/api/outstanding"),
  stockSummary: () => request<StockReport>("/api/stock-summary"),
  salaryLiabilities: (month?: string) => request<SalaryLiabilitiesReport>(`/api/salary-liabilities${qs({ month })}`),
  reconciliation: (from: string, to: string) => request<ReconciliationReport>(`/api/reconciliation${qs({ from, to })}`),
  audit: (limit = 100) => request<AuditReport>(`/api/audit${qs({ limit })}`),

  listUsers: () => request<{ users: PublicUser[]; roles: string[] }>("/api/users"),
  createUser: (body: { username: string; password: string; role: string; display_name?: string }) =>
    request<{ user: PublicUser }>("/api/users", { method: "POST", body }),
  updateUser: (id: string, body: { version: number; role?: string; is_active?: boolean; display_name?: string; password?: string }) =>
    request<{ user: PublicUser }>(`/api/users/${id}`, { method: "PATCH", body }),
  deactivateUser: (id: string) => request<{ user: PublicUser }>(`/api/users/${id}`, { method: "DELETE" }),
};

const MESSAGES: Record<string, string> = {
  login_required: "Please sign in to continue.",
  invalid_credentials: "Incorrect username or password.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  forbidden: "You don't have permission to do that.",
  not_found: "This record no longer exists, or you can't access it.",
  invalid_input: "Please check the highlighted fields and try again.",
  invalid_username: "Username must be 3–32 chars: lowercase letters, digits, underscore; start with a letter.",
  invalid_password: "Password must be at least 12 characters.",
  invalid_role: "Please choose a valid role.",
  username_taken: "That username is already taken.",
  cannot_modify_self: "You can't change your own role or deactivate your own account.",
  write_conflict: "This record was changed elsewhere. Reload the latest version and try again.",
  idempotency_conflict: "This entry may already be saved with different details. Review the list before retrying.",
  code_taken: "That code is already in use.",
  date_exists: "A record for that date already exists.",
  create_unconfirmed: "The save couldn't be confirmed. Review the list before retrying.",
  database_unavailable: "The data service is temporarily unavailable. Please try again.",
  service_unavailable: "The service is temporarily unavailable. Please try again.",
  network_error: "Connection interrupted — the result of this action is unconfirmed.",
  invalid_response: "The service returned an unrecognized response. Please reload.",
  origin_forbidden: "This request was blocked for security. Reload the page and try again.",
  method_not_allowed: "That action isn't supported here.",
  payload_too_large: "That entry is too large to save.",
  logout_unconfirmed: "Sign-out couldn't be confirmed. Please try again.",
  application_auth_not_configured: "Sign-in isn't configured yet. Contact the site administrator.",
};

export function messageFor(error: unknown): string {
  const code = error instanceof ApiError ? error.code : "";
  return MESSAGES[code] ?? "Something went wrong. Please try again.";
}

export function isUncertain(error: unknown): boolean {
  return error instanceof ApiError && error.uncertain;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}