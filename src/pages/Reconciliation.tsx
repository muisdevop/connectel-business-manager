import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CheckCircle2, Pencil, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { api, messageFor } from "@/lib/api";
import { currentMonth, formatDate, money, money2, monthEnd, monthStart } from "@/lib/format";
import type { ReconciliationReport, ReconciliationRow, Row } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ResourceFormDialog } from "@/components/ResourceFormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { ErrorState, Forbidden, Loading } from "@/components/states";
import { ResourcePage } from "@/pages/ResourcePage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const unbalanced = (r: ReconciliationRow) =>
  (r.cash_difference != null && r.cash_difference !== 0) || (r.bank_difference != null && r.bank_difference !== 0);
const uncounted = (r: ReconciliationRow) => r.actual_closing_cash == null || r.actual_closing_bank == null;
const needsAttention = (r: ReconciliationRow) => unbalanced(r) || uncounted(r);

function Diff({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const zero = value === 0;
  return (
    <span className={cn("font-medium tabular-nums", zero ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
      {zero ? "0" : `${value > 0 ? "+" : ""}${money(value).replace("Rs ", "")}`}
    </span>
  );
}

export function Reconciliation() {
  const { can } = useAuth();
  const allowed = can("reconciliation", "view");
  const canCreate = can("reconciliation", "create");
  const canEdit = can("reconciliation", "edit");

  const [from, setFrom] = useState(monthStart(currentMonth()));
  const [to, setTo] = useState(monthEnd(currentMonth()));
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [records, setRecords] = useState<Map<string, Row>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [createDate, setCreateDate] = useState<string>("");

  const load = useCallback(async () => {
    if (!allowed || !from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const [rep, snaps] = await Promise.all([
        api.reconciliation(from, to),
        canCreate || canEdit ? api.list("daily_reconciliation", { from, to }).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
      ]);
      setReport(rep);
      setRecords(new Map(snaps.map((r) => [String(r.date), r])));
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [from, to, allowed, canCreate, canEdit]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const all = [...(report?.rows ?? [])].sort((a, b) => b.date.localeCompare(a.date));
    return onlyIssues ? all.filter(needsAttention) : all;
  }, [report, onlyIssues]);

  const stats = useMemo(() => {
    const all = report?.rows ?? [];
    const cashVar = all.reduce((a, r) => a + (r.cash_difference ?? 0), 0);
    const bankVar = all.reduce((a, r) => a + (r.bank_difference ?? 0), 0);
    return { days: all.length, cashVar, bankVar, issues: all.filter(needsAttention).length };
  }, [report]);

  if (!allowed) return <Forbidden section="Reconciliation" />;

  function openAdd(date: string) {
    setEditRow(null);
    setCreateDate(date);
    setFormMode("create");
    setFormOpen(true);
  }
  function openEdit(date: string) {
    const rec = records.get(date);
    if (!rec) return;
    setEditRow(rec);
    setFormMode("edit");
    setFormOpen(true);
  }

  function rowAction(r: ReconciliationRow) {
    if (r.has_record && canEdit) {
      return <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r.date)} aria-label={`Edit ${formatDate(r.date)}`} title="Edit snapshot"><Pencil /></Button>;
    }
    if (!r.has_record && canCreate) {
      return <Button variant="ghost" size="icon-sm" onClick={() => openAdd(r.date)} aria-label={`Add snapshot for ${formatDate(r.date)}`} title="Add snapshot"><Plus /></Button>;
    }
    return null;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reconciliation"
        description="Expected closing cash & bank vs the counted actual, per day. Variances flag counting or posting errors."
        actions={
          <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh" title="Refresh"><RefreshCw /></Button>
        }
      />

      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} allowAll={false} />
            <Button
              variant={onlyIssues ? "secondary" : "outline"} size="sm" className="h-8"
              onClick={() => setOnlyIssues((v) => !v)} aria-pressed={onlyIssues}
            >
              <TriangleAlert /> {onlyIssues ? "Showing issues" : "Only issues"}
            </Button>
          </div>

          {error ? (
            <Card><ErrorState message={error} onRetry={() => void load()} /></Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="Days in view" value={String(stats.days)} icon={ArrowLeftRight} loading={loading} />
                <KpiCard label="Cash variance" value={money(stats.cashVar)} icon={ArrowLeftRight} tone={stats.cashVar === 0 ? "positive" : "negative"} loading={loading} />
                <KpiCard label="Bank variance" value={money(stats.bankVar)} icon={ArrowLeftRight} tone={stats.bankVar === 0 ? "positive" : "negative"} loading={loading} />
                <KpiCard label="Needs attention" value={String(stats.issues)} icon={stats.issues > 0 ? TriangleAlert : CheckCircle2} tone={stats.issues > 0 ? "warning" : "positive"} loading={loading} hint="Unbalanced or not yet counted" />
              </div>

              <Card className="gap-0 overflow-hidden py-0">
                {loading ? (
                  <Loading />
                ) : rows.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {onlyIssues ? "Every day in this range balances." : "No cash or bank movement in this range."}
                  </p>
                ) : (
                  <>
                    {/* Desktop dense table */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead rowSpan={2} className="align-bottom">Date</TableHead>
                            <TableHead colSpan={3} className="border-l text-center">Cash (Rs)</TableHead>
                            <TableHead colSpan={3} className="border-l text-center">Bank (Rs)</TableHead>
                            <TableHead rowSpan={2} className="align-bottom">Source</TableHead>
                            <TableHead rowSpan={2} className="w-px align-bottom"><span className="sr-only">Actions</span></TableHead>
                          </TableRow>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="border-l text-right">Expected</TableHead>
                            <TableHead className="text-right">Actual</TableHead>
                            <TableHead className="text-right">Δ</TableHead>
                            <TableHead className="border-l text-right">Expected</TableHead>
                            <TableHead className="text-right">Actual</TableHead>
                            <TableHead className="text-right">Δ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r) => (
                            <TableRow key={r.date} className={cn(needsAttention(r) && "bg-amber-500/[0.04]")}>
                              <TableCell className="font-medium whitespace-nowrap">{formatDate(r.date)}</TableCell>
                              <TableCell className="border-l text-right tabular-nums">{money(r.expected_cash).replace("Rs ", "")}</TableCell>
                              <TableCell className="text-right tabular-nums">{r.actual_closing_cash == null ? <span className="text-muted-foreground">—</span> : money(r.actual_closing_cash).replace("Rs ", "")}</TableCell>
                              <TableCell className="text-right"><Diff value={r.cash_difference} /></TableCell>
                              <TableCell className="border-l text-right tabular-nums">{money(r.expected_bank).replace("Rs ", "")}</TableCell>
                              <TableCell className="text-right tabular-nums">{r.actual_closing_bank == null ? <span className="text-muted-foreground">—</span> : money(r.actual_closing_bank).replace("Rs ", "")}</TableCell>
                              <TableCell className="text-right"><Diff value={r.bank_difference} /></TableCell>
                              <TableCell><StatusBadge value={r.has_record ? "Manual" : "Auto"} /></TableCell>
                              <TableCell className="text-right">{rowAction(r)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile stacked cards */}
                    <div className="divide-y md:hidden">
                      {rows.map((r) => (
                        <div key={r.date} className={cn("space-y-2 p-3", needsAttention(r) && "bg-amber-500/[0.05]")}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{formatDate(r.date)}</span>
                            <div className="flex items-center gap-1">
                              <StatusBadge value={r.has_record ? "Manual" : "Auto"} />
                              {rowAction(r)}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <MobileLeg title="Cash" expected={r.expected_cash} actual={r.actual_closing_cash} diff={r.cash_difference} />
                            <MobileLeg title="Bank" expected={r.expected_bank} actual={r.actual_closing_bank} diff={r.bank_difference} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>
              <p className="text-xs text-muted-foreground">
                Δ = counted actual − expected closing. A day without a snapshot falls back to register-derived movement (Auto).
              </p>
            </>
          )}
        </TabsContent>

        <TabsContent value="snapshots">
          <ResourcePage resource="daily_reconciliation" />
        </TabsContent>
      </Tabs>

      {canCreate || canEdit ? (
        <ResourceFormDialog
          resource="daily_reconciliation"
          open={formOpen}
          onOpenChange={setFormOpen}
          mode={formMode}
          row={editRow}
          createDefaults={formMode === "create" && createDate ? { date: createDate } : undefined}
          onSaved={() => void load()}
          onStale={() => void load()}
        />
      ) : null}
    </div>
  );
}

function MobileLeg({ title, expected, actual, diff }: { title: string; expected: number; actual: number | null; diff: number | null }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <p className="mb-1 font-semibold text-muted-foreground uppercase">{title}</p>
      <dl className="space-y-0.5">
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Expected</dt><dd className="tabular-nums">{money2(expected).replace("Rs ", "")}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Actual</dt><dd className="tabular-nums">{actual == null ? "—" : money2(actual).replace("Rs ", "")}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Δ</dt><dd><Diff value={diff} /></dd></div>
      </dl>
    </div>
  );
}