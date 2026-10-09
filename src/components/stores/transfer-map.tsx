"use client";

import Link from "next/link";
import type { StoresResponse } from "@/lib/views";

const SIZE = 360;
const R = 140;
const NODE = 18;

/** Stores on a ring with arrows for each suggested store-to-store move. */
export function TransferMap({ data }: { data: StoresResponse }) {
  const stores = data.stores.map((s) => s.store);
  const pos = new Map(
    stores.map((s, i) => {
      const a = (i / stores.length) * Math.PI * 2 - Math.PI / 2;
      return [s, { x: SIZE / 2 + R * Math.cos(a), y: SIZE / 2 + R * Math.sin(a) }];
    }),
  );
  const involved = new Set(data.transfers.flatMap((t) => [t.from, t.to]));

  if (data.transfers.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No store-to-store moves are recommended right now.</p>;
  }

  return (
    <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-[minmax(0,360px)_1fr]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-[360px]" role="img" aria-label={`${data.transfers.length} suggested transfers between stores`}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-primary" />
          </marker>
        </defs>
        {data.transfers.map((t) => {
          const a = pos.get(t.from);
          const b = pos.get(t.to);
          if (!a || !b) return null;
          // Shorten to the node edges, and bow the line so opposite moves don't overlap.
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const sx = a.x + (dx / len) * (NODE + 2);
          const sy = a.y + (dy / len) * (NODE + 2);
          const ex = b.x - (dx / len) * (NODE + 4);
          const ey = b.y - (dy / len) * (NODE + 4);
          const cx = (sx + ex) / 2 - (dy / len) * 24;
          const cy = (sy + ey) / 2 + (dx / len) * 24;
          return (
            <g key={`${t.sku}-${t.from}-${t.to}`}>
              <path d={`M${sx},${sy} Q${cx},${cy} ${ex},${ey}`} fill="none" className="stroke-primary" strokeWidth={2} markerEnd="url(#arrow)" />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-[10px] font-semibold" paintOrder="stroke" stroke="hsl(var(--card))" strokeWidth={3}>
                {t.units}
              </text>
            </g>
          );
        })}
        {stores.map((s) => {
          const p = pos.get(s);
          if (!p) return null;
          const on = involved.has(s);
          return (
            <g key={s}>
              <circle cx={p.x} cy={p.y} r={NODE} className={on ? "fill-primary/15 stroke-primary" : "fill-muted stroke-border"} strokeWidth={1.5} />
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" className={on ? "fill-foreground text-[11px] font-semibold" : "fill-muted-foreground text-[11px]"}>
                {s.replace("Store ", "")}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Suggested transfers</h3>
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {data.transfers.map((t) => (
            <li key={`${t.sku}-${t.from}-${t.to}`} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <span>
                <span className="font-medium">{t.from}</span> to <span className="font-medium">{t.to}</span>: {t.units} × {t.product}
              </span>
              <Link href={`/signals?review=${encodeURIComponent(t.problemId)}`} className="rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Review
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
