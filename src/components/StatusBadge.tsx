import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Semantic tones for data-driven statuses. Kept subtle so dense tables stay calm.
const TONES: Record<string, string> = {
  // positive / settled
  Cleared: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  OK: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  Promised: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/20",
  Contacted: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/20",
  // attention
  Pending: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/20",
  REORDER: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/20",
  Advance: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/20",
  // negative / destructive
  "NEGATIVE STOCK": "bg-destructive/12 text-destructive border-destructive/25",
  voided: "bg-destructive/12 text-destructive border-destructive/25",
  // neutral categories
  Invoice: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
  Payment: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  Purchase: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/20",
  Issued: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/20",
  Returned: "bg-violet-500/12 text-violet-700 dark:text-violet-400 border-violet-500/20",
  "Monthly Salary": "bg-secondary text-secondary-foreground border-border",
  created: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  updated: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/20",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const tone = TONES[value];
  return (
    <Badge variant="outline" className={cn("font-medium", tone ?? "bg-secondary text-secondary-foreground border-border", className)}>
      {value}
    </Badge>
  );
}

const ROLE_TONES: Record<string, string> = {
  admin: "bg-violet-500/12 text-violet-700 dark:text-violet-400 border-violet-500/20",
  accountant: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/20",
  cashier: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/20",
  viewer: "bg-secondary text-secondary-foreground border-border",
};

export function RoleBadge({ role, label }: { role: string; label?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", ROLE_TONES[role] ?? ROLE_TONES.viewer)}>
      {label ?? role}
    </Badge>
  );
}