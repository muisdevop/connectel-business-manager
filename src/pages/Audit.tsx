import { useCallback, useEffect, useMemo, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { api, messageFor } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { AuditEvent, AuditReport } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, ErrorState, Forbidden, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const RESOURCE_LABELS: Record<string, string> = {
  income: "Income", expenses: "Expenses", cashbook: "Cashbook", ledger: "Customer Ledger",
  salaries: "Salaries", stock: "Stock", customers: "Customers", items: "Items", employees: "Employees",
  salary_liabilities: "Salary Liabilities", pnl: "Daily Salary Accrual", reconciliation: "Daily Reconciliation",
};
const ALL = "__all__";
const ACTION_LABEL: Record<string, string> = { created: "Created", updated: "Updated", voided: "Voided" };

export function Audit() {
  const { can } = useAuth();
  const allowed = can("audit", "view");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const [resource, setResource] = useState<string>(ALL);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await api.audit(limit));
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [allowed, limit]);

  useEffect(() => { void load(); }, [load]);

  const resources = useMemo(() => {
    const set = new Set((report?.rows ?? []).map((r) => r.resource));
    return [...set].sort();
  }, [report]);

  const rows = useMemo(() => {
    const all = report?.rows ?? [];
    return resource === ALL ? all : all.filter((r) => r.resource === resource);
  }, [report, resource]);

  if (!allowed) return <Forbidden section="Audit Trail" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Trail"
        description="Recent creates, edits and voids across every register, derived from row audit columns."
        actions={<Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh" title="Refresh"><RefreshCw /></Button>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Show</span>
        <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
          <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
            <SelectItem value="200">200</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">Module</span>
        <Select value={resource} onValueChange={setResource}>
          <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All modules</SelectItem>
            {resources.map((r) => <SelectItem key={r} value={r}>{RESOURCE_LABELS[r] ?? r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No activity yet" description="Creates, edits and voids will appear here as your team records entries." icon={<History className="size-6" />} />
        ) : (
          <ul className="divide-y">
            {rows.map((event, index) => <AuditRow key={`${event.resource}-${event.id}-${event.action}-${index}`} event={event} />)}
          </ul>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">Showing the {rows.length} most recent matching events (newest first).</p>
    </div>
  );
}

function AuditRow({ event }: { event: AuditEvent }) {
  const label = RESOURCE_LABELS[event.resource] ?? event.resource;
  return (
    <li className="flex items-start gap-3 p-3">
      <div className="w-20 shrink-0 pt-0.5">
        <StatusBadge value={event.action} className="capitalize" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground"> · {event.label || event.id}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {ACTION_LABEL[event.action] ?? event.action} by {event.actor || "unknown"}
        </p>
      </div>
      <time className="shrink-0 text-xs text-muted-foreground tabular-nums" dateTime={event.at} title={formatDateTime(event.at)}>
        {relativeTime(event.at)}
      </time>
    </li>
  );
}