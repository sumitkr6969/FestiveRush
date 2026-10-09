"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber, formatShortDate } from "@/lib/format";
import type { Projection } from "@/lib/whatIf";

export interface TimelineMarker {
  date: string;
  label: string;
  tone: "critical" | "info" | "accent" | "muted";
}

const TONE: Record<TimelineMarker["tone"], string> = {
  critical: "hsl(var(--critical))",
  info: "hsl(var(--info))",
  accent: "hsl(var(--chart-1))",
  muted: "hsl(var(--chart-muted))",
};

interface StockTimelineProps {
  plan: Projection;
  baseline: Projection;
  markers: TimelineMarker[];
  planLabel: string;
}

/** Projected stock with and without the selected action, plus key dates. */
export function StockTimeline({ plan, baseline, markers, planLabel }: StockTimelineProps) {
  const [asTable, setAsTable] = useState(false);
  const data = plan.curve.map((p, i) => ({ date: p.date, plan: p.stock, baseline: baseline.curve[i]?.stock ?? 0 }));
  const inRange = (d: string) => d >= (data[0]?.date ?? "") && d <= (data[data.length - 1]?.date ?? "");
  const shown = markers.filter((m) => inRange(m.date));

  return (
    <figure className="flex flex-col gap-2" aria-label="Projected stock over the next 14 days">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[hsl(var(--chart-1))]" />{planLabel}</span>
          <span className="flex items-center gap-1.5"><span className="h-px w-4 bg-[hsl(var(--chart-muted))]" />No action</span>
        </div>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="rounded text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-56 overflow-auto rounded-lg border">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-muted text-left">
              <tr><th className="px-2 py-1 font-medium">Date</th><th className="px-2 py-1 font-medium">{planLabel}</th><th className="px-2 py-1 font-medium">No action</th></tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date} className="border-t">
                  <td className="px-2 py-1">{formatShortDate(d.date)}</td>
                  <td className="px-2 py-1">{formatNumber(d.plan)}</td>
                  <td className="px-2 py-1">{formatNumber(d.baseline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="hsl(var(--chart-grid))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--chart-grid))" }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                labelFormatter={(d) => formatShortDate(String(d))}
                formatter={(v, name) => [`${formatNumber(Number(v))} units`, name === "plan" ? planLabel : "No action"]}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              {shown.map((m) => (
                <ReferenceLine
                  key={`${m.label}-${m.date}`}
                  x={m.date}
                  stroke={TONE[m.tone]}
                  strokeWidth={1}
                  // Only the two anchor dates get an in-chart label; arrivals cluster, so the caption names them.
                  label={m.tone === "critical" || m.tone === "info" ? { value: m.label, position: m.tone === "critical" ? "insideTopRight" : "insideTopLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" } : undefined}
                />
              ))}
              <Line type="monotone" dataKey="baseline" stroke="hsl(var(--chart-muted))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="plan" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {markers.map((m) => (
          <span key={`${m.label}-${m.date}`} className="flex items-center gap-1.5">
            <span className="h-3 w-0.5 rounded" style={{ background: TONE[m.tone] }} aria-hidden="true" />
            {m.label}: {formatShortDate(m.date)}
            {!inRange(m.date) && " (after this window)"}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
