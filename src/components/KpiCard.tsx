import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "default" | "positive" | "negative" | "warning";

const VALUE_TONE: Record<Tone, string> = {
  default: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
};

const ICON_TONE: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  positive: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  negative: "bg-destructive/12 text-destructive",
  warning: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  loading,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <Card className="gap-3 py-4">
      <div className="flex items-center justify-between gap-2 px-4">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", ICON_TONE[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="px-4">
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", VALUE_TONE[tone])}>{value}</p>
        )}
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  );
}