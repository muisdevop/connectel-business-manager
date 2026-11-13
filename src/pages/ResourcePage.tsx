import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { api, messageFor } from "@/lib/api";
import { money } from "@/lib/format";
import { RESOURCES, refLabel } from "@/lib/resources";
import type { Row, User } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type RefMaps } from "@/components/DataTable";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ResourceFormDialog } from "@/components/ResourceFormDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState, ErrorState, Forbidden, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SUMMARY: Record<string, { key: string; label: string }[]> = {
  income: [{ key: "service_amount", label: "Service" }, { key: "other_amount", label: "Other" }],
  expenses: [{ key: "amount", label: "Total" }],
  ledger: [{ key: "bill_amount", label: "Billed" }, { key: "payment_amount", label: "Collected" }],
  salaries: [{ key: "amount_paid", label: "Paid" }],
  stock: [{ key: "total_purchase", label: "Purchases" }],
  cashbook: [{ key: "cash_received", label: "Cash in" }, { key: "cash_paid", label: "Cash out" }],
};

function rowEditable(user: User | null, row: Row, canEdit: boolean): boolean {
  if (!canEdit || !user || row.voided) return false;
  if (user.role === "admin" || user.role === "accountant") return true;
  if (user.role === "cashier") return row.created_by === user.id;
  return false;
}

export function ResourcePage({ resource }: { resource: string }) {
  const config = RESOURCES[resource];
  const { user, can } = useAuth();
  const canView = can(config.module, "view");
  const canCreate = can(config.module, "create");
  const canEdit = can(config.module, "edit");
  const canDelete = can(config.module, "delete");

  const [rows, setRows] = useState<Row[]>([]);
  const [refMaps, setRefMaps] = useState<RefMaps>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeVoided, setIncludeVoided] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [voidTarget, setVoidTarget] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.list(resource, {
        from: from || undefined, to: to || undefined, include_voided: includeVoided ? true : undefined,
      });
      setRows(data);
      const maps: RefMaps = {};
      for (const column of config.columns) {
        if (column.type === "ref" && column.refResource && !maps[column.refResource]) {
          const refRows = await api.list(column.refResource);
          maps[column.refResource] = new Map(refRows.map((r) => [r.id, refLabel(r)]));
        }
      }
      setRefMaps(maps);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [resource, from, to, includeVoided, canView, config]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const text = config.searchKeys.map((key) => String(row[key] ?? "")).join(" ");
      const refs = config.columns
        .filter((c) => c.type === "ref" && c.refResource)
        .map((c) => refMaps[c.refResource!]?.get(String(row[c.key])) ?? "")
        .join(" ");
      return `${text} ${refs}`.toLowerCase().includes(q);
    });
  }, [rows, search, config, refMaps]);

  const totals = useMemo(() => {
    const fields = SUMMARY[resource];
    if (!fields) return null;
    return fields.map((field) => ({
      label: field.label,
      value: visible.reduce((acc, row) => acc + (Number(row[field.key]) || 0), 0),
    }));
  }, [visible, resource]);

  if (!canView) return <Forbidden section={config.label} />;

  const showActions = canEdit || canDelete;

  function openCreate() {
    setEditRow(null);
    setFormMode("create");
    setFormOpen(true);
  }
  function openEdit(row: Row) {
    setEditRow(row);
    setFormMode("edit");
    setFormOpen(true);
  }
  async function confirmVoid() {
    if (!voidTarget) return;
    await api.voidRow(resource, voidTarget.id);
    toast.success(`${config.singular} voided.`);
    setVoidTarget(null);
    await load();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={config.label}
        description={config.description}
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh" title="Refresh">
              <RefreshCw />
            </Button>
            {canCreate ? <Button onClick={openCreate}><Plus /> Add {config.singular}</Button> : null}
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${config.label.toLowerCase()}…`}
            className="pl-9" aria-label={`Search ${config.label}`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {config.dateField ? <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /> : null}
          {canDelete ? (
            <Button
              variant={includeVoided ? "secondary" : "outline"} size="sm" className="h-8"
              onClick={() => setIncludeVoided((v) => !v)} aria-pressed={includeVoided}
            >
              <Eye /> {includeVoided ? "Hide voided" : "Show voided"}
            </Button>
          ) : null}
        </div>
      </div>

      {totals ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-muted-foreground">{visible.length} {visible.length === 1 ? "entry" : "entries"}</span>
          {totals.map((total) => (
            <span key={total.label} className="text-muted-foreground">
              {total.label}: <span className="font-medium text-foreground tabular-nums">{money(total.value)}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{visible.length} {visible.length === 1 ? "record" : "records"}</p>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : visible.length === 0 ? (
          <EmptyState
            title={search || from || to ? "No matching entries" : `No ${config.label.toLowerCase()} yet`}
            description={search || from || to ? "Try adjusting your search or date range." : canCreate ? `Add the first ${config.singular} to get started.` : "Entries will appear here once added."}
            action={canCreate && !search && !from && !to ? <Button size="sm" onClick={openCreate}><Plus /> Add {config.singular}</Button> : undefined}
          />
        ) : (
          <DataTable
            columns={config.columns}
            rows={visible}
            refMaps={refMaps}
            actions={showActions ? (row) => {
              const editable = rowEditable(user, row, canEdit);
              const voidable = canDelete && !row.voided;
              if (!editable && !voidable) return null;
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Row actions"><MoreHorizontal /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {editable ? <DropdownMenuItem onClick={() => openEdit(row)}><Pencil /> Edit</DropdownMenuItem> : null}
                    {voidable ? <DropdownMenuItem variant="destructive" onClick={() => setVoidTarget(row)}><Trash2 /> Void</DropdownMenuItem> : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            } : undefined}
          />
        )}
      </Card>

      {canCreate || canEdit ? (
        <ResourceFormDialog
          resource={resource}
          open={formOpen}
          onOpenChange={setFormOpen}
          mode={formMode}
          row={editRow}
          onSaved={() => void load()}
          onStale={() => void load()}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(voidTarget)}
        onOpenChange={(open) => { if (!open) setVoidTarget(null); }}
        title={`Void this ${config.singular}?`}
        description="Voiding hides the record from registers and reports but keeps it for the audit trail. This cannot be undone from the UI."
        confirmLabel="Void record"
        destructive
        onConfirm={confirmVoid}
      />
    </div>
  );
}