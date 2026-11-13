import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, HandCoins, Pencil, Plus, RefreshCw, Wallet } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { api, messageFor } from "@/lib/api";
import { formatMonth, money } from "@/lib/format";
import type { Row, SalaryLiabilitiesReport, SalaryLiabilityRow } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { ResourceFormDialog } from "@/components/ResourceFormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { ErrorState, Forbidden, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ALL = "__all__";

export function SalaryLiabilities() {
  const { can } = useAuth();
  const allowed = can("salary_liabilities", "view");
  const canCreate = can("salary_liabilities", "create");
  const canEdit = can("salary_liabilities", "edit");

  const [report, setReport] = useState<SalaryLiabilitiesReport | null>(null);
  const [records, setRecords] = useState<Map<string, Row>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(ALL);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editRow, setEditRow] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const [rep, raw] = await Promise.all([
        api.salaryLiabilities(),
        canCreate || canEdit ? api.list("salary_liabilities").catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
      ]);
      setReport(rep);
      setRecords(new Map(raw.map((r) => [r.id, r])));
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [allowed, canCreate, canEdit]);

  useEffect(() => { void load(); }, [load]);

  const months = useMemo(() => {
    const set = new Set((report?.rows ?? []).map((r) => r.month));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [report]);

  const rows = useMemo(() => {
    const all = report?.rows ?? [];
    return month === ALL ? all : all.filter((r) => r.month === month);
  }, [report, month]);

  const stats = useMemo(() => ({
    outstanding: rows.reduce((a, r) => a + r.outstanding, 0),
    agreed: rows.reduce((a, r) => a + r.agreed_salary, 0),
    paid: rows.reduce((a, r) => a + r.total_paid, 0),
    pending: rows.filter((r) => r.status === "Pending").length,
  }), [rows]);

  if (!allowed) return <Forbidden section="Salary Liabilities" />;

  function openCreate() {
    setEditRow(null);
    setFormMode("create");
    setFormOpen(true);
  }
  function openEdit(r: SalaryLiabilityRow) {
    const rec = records.get(r.id);
    if (!rec) return;
    setEditRow(rec);
    setFormMode("edit");
    setFormOpen(true);
  }
  const action = (r: SalaryLiabilityRow) =>
    canEdit ? <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)} aria-label={`Edit ${r.employee_name}`} title="Edit"><Pencil /></Button> : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Salary Liabilities"
        description="Agreed salary versus paid, per employee per month. Outstanding = agreed − (advance + salary + adjustment)."
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh" title="Refresh"><RefreshCw /></Button>
            {canCreate ? <Button onClick={openCreate}><Plus /> Add liability</Button> : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Month</span>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All months</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <Card><ErrorState message={error} onRetry={() => void load()} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Outstanding" value={money(stats.outstanding)} icon={HandCoins} tone={stats.outstanding > 0 ? "warning" : "positive"} loading={loading} />
            <KpiCard label="Agreed" value={money(stats.agreed)} icon={Wallet} loading={loading} />
            <KpiCard label="Paid" value={money(stats.paid)} icon={Wallet} tone="positive" loading={loading} />
            <KpiCard label="Pending" value={String(stats.pending)} icon={stats.pending > 0 ? HandCoins : CheckCircle2} tone={stats.pending > 0 ? "warning" : "positive"} loading={loading} hint="Employees still owed" />
          </div>

          <Card className="gap-0 overflow-hidden py-0">
            {loading ? (
              <Loading />
            ) : rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {month === ALL ? "No salary liabilities recorded yet." : `No liabilities for ${formatMonth(month)}.`}
              </p>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Month</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Agreed (Rs)</TableHead>
                        <TableHead className="text-right">Advance (Rs)</TableHead>
                        <TableHead className="text-right">Salary (Rs)</TableHead>
                        <TableHead className="text-right">Adjustment (Rs)</TableHead>
                        <TableHead className="text-right">Paid (Rs)</TableHead>
                        <TableHead className="text-right">Outstanding (Rs)</TableHead>
                        <TableHead>Status</TableHead>
                        {canEdit ? <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap">{formatMonth(r.month)}</TableCell>
                          <TableCell className="font-medium">{r.employee_name || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(r.agreed_salary).replace("Rs ", "")}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(r.advance_paid).replace("Rs ", "")}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(r.salary_paid).replace("Rs ", "")}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", r.adjustment < 0 && "text-destructive")}>{money(r.adjustment).replace("Rs ", "")}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(r.total_paid).replace("Rs ", "")}</TableCell>
                          <TableCell className={cn("text-right font-medium tabular-nums", r.outstanding > 0 && "text-amber-600 dark:text-amber-400")}>{money(r.outstanding).replace("Rs ", "")}</TableCell>
                          <TableCell><StatusBadge value={r.status} /></TableCell>
                          {canEdit ? <TableCell className="text-right">{action(r)}</TableCell> : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="divide-y md:hidden">
                  {rows.map((r) => (
                    <div key={r.id} className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.employee_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{formatMonth(r.month)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <StatusBadge value={r.status} />
                          {action(r)}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <Leg label="Agreed" value={r.agreed_salary} />
                        <Leg label="Paid" value={r.total_paid} />
                        <Leg label="Outstanding" value={r.outstanding} highlight={r.outstanding > 0} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {canCreate || canEdit ? (
        <ResourceFormDialog
          resource="salary_liabilities"
          open={formOpen}
          onOpenChange={setFormOpen}
          mode={formMode}
          row={editRow}
          onSaved={() => void load()}
          onStale={() => void load()}
        />
      ) : null}
    </div>
  );
}

function Leg({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <p className="text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-0.5 font-medium tabular-nums", highlight && "text-amber-600 dark:text-amber-400")}>{money(value).replace("Rs ", "")}</p>
    </div>
  );
}