import { useCallback, useEffect, useState } from "react";
import { Coins, Scale, TrendingDown, TrendingUp, Banknote } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useAuth } from "@/auth/AuthContext";
import { api, messageFor } from "@/lib/api";
import { currentMonth, formatDate, formatMonth, money, monthEnd, monthStart } from "@/lib/format";
import type { PnlReport } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ErrorState, Forbidden, Loading } from "@/components/states";
import { ResourcePage } from "@/pages/ResourcePage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const chartConfig = { profit: { label: "Profit", color: "var(--chart-2)" } } satisfies ChartConfig;
type Group = "day" | "month" | "year";

export function Pnl() {
  const { can } = useAuth();
  const allowed = can("pnl", "view");
  const [from, setFrom] = useState(monthStart(currentMonth()));
  const [to, setTo] = useState(monthEnd(currentMonth()));
  const [group, setGroup] = useState<Group>("day");
  const [report, setReport] = useState<PnlReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed || !from || !to) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await api.pnl(from, to, group));
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [from, to, group, allowed]);

  useEffect(() => { void load(); }, [load]);

  if (!allowed) return <Forbidden section="Profit & Loss" />;

  const totals = report?.totals;
  const rows = report?.rows ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="Profit & Loss" description="Computed from ledger invoices, other income, expenses and daily salary accruals." />

      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="accruals">Daily salary accruals</TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} allowAll={false} />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Group by</span>
              <Select value={group} onValueChange={(value) => setGroup(value as Group)}>
                <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8" onClick={() => { const y = currentMonth().slice(0, 4); setFrom(`${y}-01-01`); setTo(`${y}-12-31`); }}>
                This year
              </Button>
            </div>
          </div>

          {error ? (
            <Card><ErrorState message={error} onRetry={() => void load()} /></Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <KpiCard label="Billed" value={money(totals?.billed)} icon={TrendingUp} tone="positive" loading={loading} />
                <KpiCard label="Other income" value={money(totals?.other)} icon={Coins} tone="positive" loading={loading} />
                <KpiCard label="Opex" value={money(totals?.opex)} icon={TrendingDown} tone="negative" loading={loading} />
                <KpiCard label="Salary accrual" value={money(totals?.salary)} icon={Banknote} loading={loading} />
                <KpiCard label="Profit" value={money(totals?.profit)} icon={Scale} tone={(totals?.profit ?? 0) >= 0 ? "positive" : "negative"} loading={loading} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Profit by {group}</CardTitle>
                  <CardDescription>{formatDate(from)} – {formatDate(to)}</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? <Loading label="Loading chart…" className="py-10" /> : rows.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">No data in this range.</p>
                  ) : (
                    <ChartContainer config={chartConfig} className="aspect-[2.4/1] w-full">
                      <BarChart data={rows} margin={{ left: 4, right: 4, top: 8 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20}
                          tickFormatter={(value: string) => (group === "day" ? value.slice(8) : group === "month" ? formatMonth(value) : value)} />
                        <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
                        <ChartTooltip content={<ChartTooltipContent formatter={(value) => money(value)} />} />
                        <Bar dataKey="profit" fill="var(--color-profit)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="gap-0 overflow-hidden py-0">
                {loading ? <Loading /> : rows.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">No data in this range.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Billed (Rs)</TableHead>
                        <TableHead className="text-right">Other (Rs)</TableHead>
                        <TableHead className="text-right">Opex (Rs)</TableHead>
                        <TableHead className="text-right">Salary (Rs)</TableHead>
                        <TableHead className="text-right">Profit (Rs)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.period}>
                          <TableCell className="font-medium">{group === "day" ? formatDate(row.period) : group === "month" ? formatMonth(row.period) : row.period}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(row.billed)}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(row.other)}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(row.opex)}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(row.salary)}</TableCell>
                          <TableCell className={cn("text-right font-medium tabular-nums", row.profit < 0 && "text-destructive")}>{money(row.profit)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="accruals">
          <ResourcePage resource="daily_salary_accrual" />
        </TabsContent>
      </Tabs>
    </div>
  );
}