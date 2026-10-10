"use client";

import Link from "next/link";
import { LOW_STOCK_DAYS, NO_SALES_DAYS_OF_STOCK, OVERSTOCK_DAYS, WAREHOUSE, WAREHOUSE_OVERSTOCK_DAYS } from "@/lib/config";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StoresResponse } from "@/lib/views";

export type HeatCell = StoresResponse["heatmap"][number];

type Band = "low" | "healthy" | "over" | "none";

/** The warehouse's cover is against all stores' sales, and it may hold more before it is "over". */
export function bandOf(days: number, store?: string): Band {
  if (days >= NO_SALES_DAYS_OF_STOCK) return "none";
  if (days < LOW_STOCK_DAYS) return "low";
  if (days > (store === WAREHOUSE ? WAREHOUSE_OVERSTOCK_DAYS : OVERSTOCK_DAYS)) return "over";
  return "healthy";
}

// Semantic heat: red low, green healthy, blue overstock. Always with the number as text.
const BAND: Record<Band, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-critical/15 text-critical-ink" },
  healthy: { label: "Healthy", className: "bg-healthy/15 text-healthy-ink" },
  over: { label: "Overstock", className: "bg-info/15 text-info-ink" },
  none: { label: "No sales", className: "bg-muted text-muted-foreground" },
};

export function HeatLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      <li className="flex items-center gap-1.5"><span className={cn("h-3 w-4 rounded-sm", BAND.low.className)} />Low: under {LOW_STOCK_DAYS} days</li>
      <li className="flex items-center gap-1.5"><span className={cn("h-3 w-4 rounded-sm", BAND.healthy.className)} />Healthy: {LOW_STOCK_DAYS} to {OVERSTOCK_DAYS} days</li>
      <li className="flex items-center gap-1.5"><span className={cn("h-3 w-4 rounded-sm", BAND.over.className)} />Overstock: over {OVERSTOCK_DAYS} days</li>
      <li className="flex items-center gap-1.5"><span className={cn("h-3 w-4 rounded-sm", BAND.none.className)} />No recent sales</li>
      <li>{WAREHOUSE}: days of all stores&apos; sales it holds, overstock over {WAREHOUSE_OVERSTOCK_DAYS}</li>
    </ul>
  );
}

interface HeatmapProps {
  data: StoresResponse;
  onCell: (cell: HeatCell) => void;
}

/** Stores by categories, coloured by days of stock. Each cell shows its value as text. */
export function Heatmap({ data, onCell }: HeatmapProps) {
  const cell = (store: string, category: string) => data.heatmap.find((c) => c.store === store && c.category === category);
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full min-w-[1080px] border-separate border-spacing-1 p-1 text-xs">
        <caption className="sr-only">Days of stock by store and category. Select a cell to list its SKUs.</caption>
        <thead>
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium text-muted-foreground">Store</th>
            {data.categories.map((c) => (
              <th key={c} scope="col" className="px-2 py-1.5 text-left font-medium text-muted-foreground">{c}</th>
            ))}
            <th scope="col" className="px-2 py-1.5 text-right font-medium text-muted-foreground">Signals</th>
          </tr>
        </thead>
        <tbody>
          {data.stores.map((s) => (
            <tr key={s.store}>
              <th scope="row" className="whitespace-nowrap px-2 text-left font-medium">
                <Link href={`/signals?store=${encodeURIComponent(s.store)}`} className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {s.store}
                </Link>
              </th>
              {data.categories.map((c) => {
                const h = cell(s.store, c);
                if (!h) return <td key={c} />;
                const band = bandOf(h.daysOfStock, s.store);
                const days = band === "none" ? "No sales" : `${formatNumber(h.daysOfStock)}d`;
                return (
                  <td key={c} className="p-0">
                    <button
                      type="button"
                      onClick={() => onCell(h)}
                      aria-label={`${s.store}, ${c}: ${days === "No sales" ? "no recent sales" : `${formatNumber(h.daysOfStock)} days of stock`}, ${BAND[band].label}. ${h.skus.length} SKUs.`}
                      className={cn(
                        "flex h-11 w-full flex-col items-start justify-center rounded-md px-2 text-left tabular-nums transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-125",
                        BAND[band].className,
                      )}
                    >
                      <span className="font-semibold">{days}</span>
                      {/* Category averages can hide one SKU in trouble, so flag those SKUs explicitly. */}
                      {(h.understocked > 0 || h.overstocked > 0) && (
                        <span className="mt-0.5 flex gap-1 whitespace-nowrap text-[10px] font-semibold">
                          {h.understocked > 0 && <span className="rounded bg-card px-1 text-critical-ink ring-1 ring-inset ring-critical/40">{h.understocked} low</span>}
                          {h.overstocked > 0 && <span className="rounded bg-card px-1 text-info-ink ring-1 ring-inset ring-info/40">{h.overstocked} over</span>}
                        </span>
                      )}
                    </button>
                  </td>
                );
              })}
              <td className="px-2 text-right">
                <Link href={`/signals?store=${encodeURIComponent(s.store)}`} className="rounded font-medium tabular-nums text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {s.problems}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
