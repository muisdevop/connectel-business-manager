import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/auth/AuthContext";
import { api, ApiError, messageFor, newIdempotencyKey } from "@/lib/api";
import { currentMonth, todayISO } from "@/lib/format";
import { RESOURCES, refLabel, type FieldConfig } from "@/lib/resources";
import type { Row } from "@/lib/types";
import { cn } from "@/lib/utils";

const NONE = "__none__";

type Values = Record<string, string>;

function initialValues(fields: FieldConfig[], mode: "create" | "edit", row: Row | null, meta: Record<string, string[]>): Values {
  const values: Values = {};
  for (const field of fields) {
    if (mode === "edit" && row) {
      const raw = row[field.name];
      if (field.type === "ref") values[field.name] = raw ? String(raw) : NONE;
      else values[field.name] = raw === null || raw === undefined ? "" : String(raw);
      continue;
    }
    switch (field.type) {
      case "date":
        values[field.name] = field.name === "month" || field.name === "period" ? `${currentMonth()}-01` : todayISO();
        break;
      case "enum":
        values[field.name] = (field.options ? meta[field.options]?.[0] : "") ?? "";
        break;
      case "ref":
        values[field.name] = NONE;
        break;
      default:
        values[field.name] = "";
    }
  }
  return values;
}

function validate(fields: FieldConfig[], values: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.name] ?? "";
    const empty = value === "" || (field.type === "ref" && value === NONE);
    if (field.required && empty) {
      errors[field.name] = "Required";
      continue;
    }
    if (empty) continue;
    if (field.type === "money" || field.type === "qty" || field.type === "money?") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) errors[field.name] = "Enter a valid non-negative number";
    } else if (field.type === "signed") {
      if (!Number.isFinite(Number(value))) errors[field.name] = "Enter a valid number";
    } else if (field.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[field.name] = "Enter a valid date";
    }
  }
  return errors;
}

function buildBody(fields: FieldConfig[], values: Values): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.name] ?? "";
    if (field.type === "ref") {
      body[field.name] = value === NONE || value === "" ? null : value;
    } else if (field.type === "money" || field.type === "qty" || field.type === "signed") {
      body[field.name] = value === "" ? (field.type === "signed" ? 0 : 0) : Number(value);
    } else if (field.type === "money?") {
      body[field.name] = value === "" ? null : Number(value);
    } else {
      body[field.name] = value;
    }
  }
  return body;
}

export function ResourceFormDialog({
  resource,
  open,
  onOpenChange,
  mode,
  row,
  onSaved,
  onStale,
  createDefaults,
}: {
  resource: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  row?: Row | null;
  onSaved: (row: Row, replayed: boolean) => void;
  onStale?: () => void;
  createDefaults?: Record<string, string>;
}) {
  const config = RESOURCES[resource];
  const { meta } = useAuth();
  const metaOptions = (meta ?? {}) as unknown as Record<string, string[]>;
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [refData, setRefData] = useState<Record<string, Row[]>>({});
  const keyRef = useRef<string>(newIdempotencyKey());

  const refResources = useMemo(
    () => Array.from(new Set(config.fields.filter((f) => f.type === "ref" && f.refResource).map((f) => f.refResource!))),
    [config],
  );

  useEffect(() => {
    if (!open) return;
    const base = initialValues(config.fields, mode, row ?? null, metaOptions);
    setValues(mode === "create" && createDefaults ? { ...base, ...createDefaults } : base);
    setErrors({});
    setBanner(null);
    setUncertain(false);
    keyRef.current = newIdempotencyKey();
    let cancelled = false;
    (async () => {
      const loaded: Record<string, Row[]> = {};
      for (const refResource of refResources) {
        try {
          loaded[refResource] = await api.list(refResource);
        } catch {
          loaded[refResource] = [];
        }
      }
      if (!cancelled) setRefData(loaded);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, row?.id, resource]);

  function setValue(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: "" } : prev));
  }

  function onRefChange(field: FieldConfig, value: string) {
    setValues((prev) => {
      const next = { ...prev, [field.name]: value };
      if (field.fills && value !== NONE) {
        const source = refData[field.refResource ?? ""]?.find((r) => r.id === value);
        if (source) {
          for (const [target, prop] of Object.entries(field.fills)) {
            next[target] = String(source[prop] ?? "");
          }
        }
      }
      return next;
    });
    setErrors((prev) => (prev[field.name] ? { ...prev, [field.name]: "" } : prev));
  }

  async function handleSubmit() {
    const clientErrors = validate(config.fields, values);
    const hasErrors = Object.values(clientErrors).some(Boolean);
    if (hasErrors) {
      setErrors(clientErrors);
      return;
    }
    setPending(true);
    setBanner(null);
    const body = buildBody(config.fields, values);
    try {
      if (mode === "create") {
        const { row: saved, replayed } = await api.create(resource, body, keyRef.current);
        toast.success(replayed ? "Already recorded — duplicate prevented." : `${config.singular} added.`);
        onSaved(saved, replayed);
        onOpenChange(false);
      } else {
        const saved = await api.update(resource, row!.id, { ...body, version: row!.version });
        toast.success(`${config.singular} updated.`);
        onSaved(saved, false);
        onOpenChange(false);
      }
    } catch (error) {
      if (error instanceof ApiError && error.field) {
        setErrors((prev) => ({ ...prev, [error.field!]: messageFor(error) }));
      }
      if (error instanceof ApiError && (error.code === "write_conflict" || error.code === "idempotency_conflict")) {
        toast.error(messageFor(error));
        onStale?.();
        onOpenChange(false);
        return;
      }
      if (error instanceof ApiError && error.uncertain) {
        setUncertain(true);
        setBanner(messageFor(error));
        toast.warning("Connection interrupted — review the list before retrying.");
      } else {
        setBanner(messageFor(error));
        toast.error(messageFor(error));
      }
    } finally {
      setPending(false);
    }
  }

  const wide = config.fields.length > 6;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className={cn("max-h-[92vh] overflow-y-auto", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? `Add ${config.singular}` : `Edit ${config.singular}`}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        {uncertain ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              {banner} This entry may already be saved. Check the list before submitting again — retrying unchanged is safe.
            </AlertDescription>
          </Alert>
        ) : banner ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{banner}</AlertDescription>
          </Alert>
        ) : null}

        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}
        >
          {config.fields.map((field) => (
            <FieldControl
              key={field.name}
              field={field}
              value={values[field.name] ?? ""}
              error={errors[field.name]}
              metaOptions={metaOptions}
              refRows={refData[field.refResource ?? ""] ?? []}
              onChange={(value) => (field.type === "ref" ? onRefChange(field, value) : setValue(field.name, value))}
            />
          ))}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {mode === "create" ? "Add" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldControl({
  field,
  value,
  error,
  metaOptions,
  refRows,
  onChange,
}: {
  field: FieldConfig;
  value: string;
  error?: string;
  metaOptions: Record<string, string[]>;
  refRows: Row[];
  onChange: (value: string) => void;
}) {
  const id = `field-${field.name}`;
  const span = field.textarea || field.type === "text" && (field.max ?? 0) >= 200 ? "sm:col-span-2" : "";
  const options = field.options ? metaOptions[field.options] ?? [] : [];

  let control: ReactNode;
  if (field.type === "enum") {
    control = (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  } else if (field.type === "ref") {
    control = (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {!field.required ? <SelectItem value={NONE}>None</SelectItem> : null}
          {refRows.map((r) => <SelectItem key={r.id} value={r.id}>{refLabel(r)}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  } else if (field.type === "date") {
    control = <Input id={id} type="date" value={value} aria-invalid={Boolean(error)} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.type === "money" || field.type === "qty" || field.type === "signed" || field.type === "money?") {
    control = (
      <Input
        id={id} type="number" inputMode="decimal" step="0.01" min={field.type === "signed" ? undefined : 0}
        value={value} aria-invalid={Boolean(error)} placeholder="0"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else if (field.textarea) {
    control = <Textarea id={id} value={value} maxLength={field.max} aria-invalid={Boolean(error)} onChange={(e) => onChange(e.target.value)} />;
  } else {
    const listId = field.suggestions ? `list-${field.name}` : undefined;
    control = (
      <>
        <Input
          id={id} value={value} maxLength={field.max} placeholder={field.placeholder}
          aria-invalid={Boolean(error)} list={listId} onChange={(e) => onChange(e.target.value)}
        />
        {field.suggestions ? (
          <datalist id={listId}>
            {(metaOptions[field.suggestions] ?? []).map((option) => <option key={option} value={option} />)}
          </datalist>
        ) : null}
      </>
    );
  }

  return (
    <div className={cn("space-y-1.5", span)}>
      <Label htmlFor={id}>
        {field.label}
        {field.required ? <span className="text-destructive">*</span> : null}
      </Label>
      {control}
      {error ? <p className="text-xs text-destructive">{error}</p>
        : field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
    </div>
  );
}