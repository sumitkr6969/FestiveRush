"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useApi } from "@/lib/client/useApi";
import { formatCompactINR, formatINR, formatNumber, formatShortDate } from "@/lib/format";
import type { SalesResponse } from "@/lib/views";

const RANGES = [7, 14, 30, 90] as const;
type Range = (typeof RANGES)[number];

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tooltipStyle = {
  contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "hsl(var(--foreground))" },
};

/**
 * Revenue and units as two stacked panels on one shared date axis, never a
 * dual-axis chart. Hover is linked across both. Promotion windows are shaded.
 */
export function SalesMomentum() {
  const { data, error, loading, reload } = useApi<SalesResponse>("/api/sales");
  const [range, setRange] = useState<Range>(30);
  const [category, setCategory] = useState<string>("");
  const [asTable, setAsTable] = useState(false);

  const series = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, { date: string; revenue: number; units: number }>();
    for (const d of data.days) {
      if (category && d.category !== category) continue;
      const row = byDate.get(d.date) ?? { date: d.date, revenue: 0, units: 0 };
      row.revenue += d.revenue;
      row.units += d.units;
      byDate.set(d.date, row);
    }
    return [...byDate.values()].slice(-range);
  }, [data, range, category]);

  const first = series[0]?.date ?? "";
  const last = series[series.length - 1]?.date ?? "";
  const promos = (data?.promotions ?? [])
    .filter((p) => !category || p.sku_or_category === category)
    .map((p) => ({ name: p.sku_or_category, x1: p.start < first ? first : p.start, x2: p.end > last ? last : p.end }))
    .filter((p) => p.x1 <= p.x2);
  const totals = series.reduce((t, d) => ({ revenue: t.revenue + d.revenue, units: t.units + d.units }), { revenue: 0, units: 0 });

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="momentum-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="momentum-title" className="font-semibold">Sales momentum</h2>
          <p className="text-sm text-muted-foreground">
            {data ? `${formatINR(totals.revenue)} from ${formatNumber(totals.units)} units in the last ${range} days` : "Daily revenue and units sold"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" value={String(range)} onValueChange={(v) => v && setRange(Number(v) as Range)} aria-label="Date range" variant="outline" size="sm">
            {RANGES.map((r) => (
              <ToggleGroupItem key={r} value={String(r)} className="h-8 px-2.5 text-xs">{r}d</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <label className="sr-only" htmlFor="momentum-category">Category</label>
          <select
            id="momentum-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All categories</option>
            {(data?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-muted text-left">
              <tr><th className="px-2 py-1 font-medium">Date</th><th className="px-2 py-1 font-medium">Revenue</th><th className="px-2 py-1 font-medium">Units</th></tr>
            </thead>
            <tbody>
              {series.map((d) => (
                <tr key={d.date} className="border-t"><td className="px-2 py-1">{formatShortDate(d.date)}</td><td className="px-2 py-1">{formatINR(d.revenue)}</td><td className="px-2 py-1">{formatNumber(d.units)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-1" role="img" aria-label={`Revenue and units sold per day, last ${range} days${category ? `, ${category}` : ""}`}>
          <p className="text-xs font-medium text-muted-foreground">Revenue per day</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} syncId="momentum" margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="hsl(var(--chart-grid))" vertical={false} />
                {promos.map((p) => (
                  <ReferenceArea key={p.name} x1={p.x1} x2={p.x2} fill="hsl(var(--info))" fillOpacity={0.08} stroke="none" />
                ))}
                <XAxis dataKey="date" hide />
                <YAxis tickFormatter={(v: number) => formatCompactINR(v)} tick={axisTick} tickLine={false} axisLine={false} width={64} />
                <Tooltip {...tooltipStyle} labelFormatter={(d) => formatShortDate(String(d))} formatter={(v) => [formatINR(Number(v)), "Revenue"]} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs font-medium text-muted-foreground">Units sold per day</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} syncId="momentum" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="hsl(var(--chart-grid))" vertical={false} />
                {promos.map((p) => (
                  <ReferenceArea key={p.name} x1={p.x1} x2={p.x2} fill="hsl(var(--info))" fillOpacity={0.08} stroke="none" />
                ))}
                <XAxis dataKey="date" tickFormatter={formatShortDate} tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--chart-grid))" }} minTickGap={28} />
                <YAxis allowDecimals={false} tickFormatter={(v: number) => formatNumber(v)} tick={axisTick} tickLine={false} axisLine={false} width={64} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} labelFormatter={(d) => formatShortDate(String(d))} formatter={(v) => [formatNumber(Number(v)), "Units"]} />
                <Bar dataKey="units" fill="hsl(var(--chart-1))" fillOpacity={0.75} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm bg-info/20" aria-hidden="true" />
          {promos.length === 0
            ? "No promotions in this range"
            : `Shaded: ${promos.map((p) => `${p.name} promotion (${formatShortDate(p.x1)} to ${formatShortDate(p.x2)})`).join(", ")}`}
        </span>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>
    </section>
  );
}
