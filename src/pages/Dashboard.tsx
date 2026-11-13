import { useCallback, useEffect, useState } from "react";
import {
  Banknote, Boxes, ChevronLeft, ChevronRight, Coins, HandCoins, Receipt, Scale, TrendingDown, TrendingUp,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useAuth } from "@/auth/AuthContext";
import { api, messageFor } from "@/lib/api";
import { currentMonth, formatMonth, money, monthEnd, monthStart, shiftMonth } from "@/lib/format";
import type { Dashboard as DashboardData, OutstandingReport, PnlReport, StockReport } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { ErrorState, Forbidden, Loading } from "@/components/states";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Link } from "@/lib/router";

const chartConfig = { profit: { label: "Profit", color: "var(--chart-2)" } } satisfies ChartConfig;

export function Dashboard() {
  const { can } = useAuth();
  const allowed = can("dashboard", "view");
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<DashboardData | null>(null);
  const [pnl, setPnl] = useState<PnlReport | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingReport | null>(null);
  const [stock, setStock] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const dash = await api.dashboard(month);
      setData(dash);
      const [pnlResult, outstandingResult, stockResult] = await Promise.all([
        can("pnl", "view") ? api.pnl(monthStart(month), monthEnd(month), "day").catch(() => null) : Promise.resolve(null),
        can("customers", "view") ? api.outstanding().catch(() => null) : Promise.resolve(null),
        can("stock", "view") ? api.stockSummary().catch(() => null) : Promise.resolve(null),
      ]);
      setPnl(pnlResult);
      setOutstanding(outstandingResult);
      setStock(stockResult);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [month, can, allowed]);

  useEffect(() => { void load(); }, [load]);

  if (!allowed) return <Forbidden section="Dashboard" />;

  const topOutstanding = (outstanding?.rows ?? [])
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 5);
  const stockAlerts = (stock?.rows ?? []).filter((r) => r.alert !== "OK");
  const profitTone = (data?.monthly_pnl ?? 0) >= 0 ? "positive" : "negative";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={`Business overview for ${formatMonth(month)}.`}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-8 w-[10.5rem] text-sm" aria-label="Reporting month" />
            <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
              <ChevronRight />
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setMonth(currentMonth())}>Today</Button>
          </div>
        }
      />

      {error ? (
        <Card><ErrorState message={error} onRetry={() => void load()} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Service income" value={money(data?.service_income)} icon={TrendingUp} tone="positive" loading={loading} />
            <KpiCard label="Other income" value={money(data?.other_income)} icon={Coins} tone="positive" loading={loading} />
            <KpiCard label="Operating expenses" value={money(data?.operating_expenses)} icon={TrendingDown} tone="negative" loading={loading} />
            <KpiCard label="Salaries paid" value={money(data?.salaries_paid)} icon={Banknote} loading={loading} />
            <KpiCard label="Monthly P&L" value={money(data?.monthly_pnl)} icon={Scale} tone={profitTone} loading={loading} hint="Billed + other − opex − salary accrual" />
            <KpiCard label="Customer outstanding" value={money(data?.customer_outstanding)} icon={Receipt} tone="warning" loading={loading} />
            <KpiCard label="Stock below reorder" value={String(data?.stock_below_reorder ?? 0)} icon={Boxes} tone={(data?.stock_below_reorder ?? 0) > 0 ? "warning" : "default"} loading={loading} hint="Items needing attention" />
            <KpiCard label="Salary outstanding" value={money(data?.salary_outstanding)} icon={HandCoins} tone={(data?.salary_outstanding ?? 0) > 0 ? "warning" : "default"} loading={loading} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Daily profit — {formatMonth(month)}</CardTitle>
                <CardDescription>Billed revenue + other income − operating expenses − salary accrual.</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Loading label="Loading chart…" className="py-10" />
                ) : pnl && pnl.rows.length > 0 ? (
                  <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
                    <BarChart data={pnl.rows} margin={{ left: 4, right: 4, top: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24}
                        tickFormatter={(value: string) => value.slice(8)} />
                      <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
                      <ChartTooltip content={<ChartTooltipContent formatter={(value) => money(value)} labelFormatter={(label) => `Day ${String(label).slice(8)}`} />} />
                      <Bar dataKey="profit" fill="var(--color-profit)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">No profit &amp; loss data for this month.</p>
                )}
                {pnl ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:grid-cols-5">
                    <Summary label="Billed" value={pnl.totals.billed} />
                    <Summary label="Other" value={pnl.totals.other} />
                    <Summary label="Opex" value={pnl.totals.opex} />
                    <Summary label="Salary" value={pnl.totals.salary} />
                    <Summary label="Profit" value={pnl.totals.profit} strong />
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Top outstanding</CardTitle>
                  <CardDescription>
                    {can("customers", "view") ? <Link to="/customers" className="underline-offset-4 hover:underline">View all</Link> : "Customers"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {loading ? <Loading className="py-6" /> : topOutstanding.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">No outstanding balances.</p>
                  ) : topOutstanding.map((row) => (
                    <div key={row.customer_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{row.name}</span>
                      <span className="shrink-0 font-medium tabular-nums text-amber-600 dark:text-amber-400">{money(row.outstanding)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Stock alerts</CardTitle>
                  <CardDescription>
                    {can("items", "view") ? <Link to="/items" className="underline-offset-4 hover:underline">View items</Link> : "Inventory"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {loading ? <Loading className="py-6" /> : stockAlerts.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">All stock levels are healthy.</p>
                  ) : stockAlerts.slice(0, 5).map((row) => (
                    <div key={row.item_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{row.name}</span>
                      <StatusBadge value={row.alert} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Summary({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={strong ? "font-semibold tabular-nums" : "font-medium tabular-nums"}>{money(value)}</p>
    </div>
  );
}