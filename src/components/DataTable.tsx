import type { ReactNode } from "react";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { amount, formatDate, num, qty } from "@/lib/format";
import type { ColumnConfig } from "@/lib/resources";
import type { Row } from "@/lib/types";
import { cn } from "@/lib/utils";

export type RefMaps = Record<string, Map<string, string>>;

function Cell({ column, row, refMaps }: { column: ColumnConfig; row: Row; refMaps?: RefMaps }) {
  const raw = row[column.key];
  switch (column.type) {
    case "money":
      return <span className="tabular-nums">{amount(raw)}</span>;
    case "qty":
      return <span className="tabular-nums">{qty(raw)}</span>;
    case "signed": {
      const n = num(raw);
      return <span className={cn("tabular-nums", n < 0 && "text-destructive")}>{n > 0 ? `+${amount(n)}` : amount(n)}</span>;
    }
    case "date":
      return <span className="whitespace-nowrap">{formatDate(raw)}</span>;
    case "badge":
      return <StatusBadge value={String(raw ?? "")} />;
    case "ref": {
      const label = column.refResource ? refMaps?.[column.refResource]?.get(String(raw ?? "")) : undefined;
      return <span>{label ?? "—"}</span>;
    }
    case "by":
      return <span className="text-muted-foreground">{String(raw ?? "") || "—"}</span>;
    default: {
      const text = raw === null || raw === undefined || raw === "" ? "" : String(raw);
      return text ? <span className="block max-w-[28ch] truncate">{text}</span> : <span className="text-muted-foreground">—</span>;
    }
  }
}

export function DataTable({
  columns,
  rows,
  refMaps,
  actions,
  footer,
  rowClassName,
}: {
  columns: ColumnConfig[];
  rows: Row[];
  refMaps?: RefMaps;
  actions?: (row: Row) => ReactNode;
  footer?: ReactNode;
  rowClassName?: (row: Row) => string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((column) => (
            <TableHead
              key={column.key}
              className={cn(column.align === "right" && "text-right", column.hideOnMobile && "hidden md:table-cell")}
            >
              {column.label}
            </TableHead>
          ))}
          {actions ? <TableHead className="w-px text-right"><span className="sr-only">Actions</span></TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className={cn(row.voided && "opacity-55", rowClassName?.(row))}>
            {columns.map((column) => (
              <TableCell
                key={column.key}
                className={cn(column.align === "right" && "text-right", column.hideOnMobile && "hidden md:table-cell")}
              >
                <Cell column={column} row={row} refMaps={refMaps} />
              </TableCell>
            ))}
            {actions ? <TableCell className="text-right">{actions(row)}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
      {footer ? <TableFooter>{footer}</TableFooter> : null}
    </Table>
  );
}