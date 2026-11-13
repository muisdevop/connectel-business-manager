import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentMonth, monthEnd, monthStart, shiftMonth } from "@/lib/format";

export function DateRangeFilter({
  from,
  to,
  onChange,
  allowAll = true,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  allowAll?: boolean;
}) {
  const thisMonth = currentMonth();
  const lastMonth = shiftMonth(thisMonth, -1);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Calendar className="size-4 text-muted-foreground" />
        <Input
          type="date" aria-label="From date" value={from}
          className="h-8 w-[9.5rem] text-sm" onChange={(e) => onChange(e.target.value, to)}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="date" aria-label="To date" value={to}
          className="h-8 w-[9.5rem] text-sm" onChange={(e) => onChange(from, e.target.value)}
        />
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-8" onClick={() => onChange(monthStart(thisMonth), monthEnd(thisMonth))}>
          This month
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={() => onChange(monthStart(lastMonth), monthEnd(lastMonth))}>
          Last month
        </Button>
        {allowAll ? (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => onChange("", "")}>
            All time
          </Button>
        ) : null}
      </div>
    </div>
  );
}