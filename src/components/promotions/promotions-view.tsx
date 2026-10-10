"use client";

import Link from "next/link";
import { CalendarClock, CircleDot, Clock3, type LucideIcon } from "lucide-react";
import { ErrorState, PageHeader } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/client/useApi";
import { addDays, daysBetween } from "@/lib/dates";
import { formatShortDate } from "@/lib/format";
import { offerLabel, type PromotionStatus } from "@/lib/promotions";
import { cn } from "@/lib/utils";
import type { PromotionsResponse } from "@/lib/views";

type Promo = PromotionsResponse["promotions"][number];

const STATUS: Record<PromotionStatus, { label: (p: Promo) => string; icon: LucideIcon; className: string; bar: string }> = {
  active: { label: (p) => `Live, ends in ${p.endsInDays} days`, icon: CircleDot, className: "bg-healthy/10 text-healthy-ink ring-healthy/25", bar: "bg-healthy/70" },
  ending_soon: { label: (p) => (p.endsInDays === 0 ? "Live, ends today" : `Live, ends in ${p.endsInDays} ${p.endsInDays === 1 ? "day" : "days"}`), icon: Clock3, className: "bg-warning/15 text-warning-ink ring-warning/30", bar: "bg-warning/80" },
  starting_soon: { label: (p) => `Starts in ${p.startsInDays} ${p.startsInDays === 1 ? "day" : "days"}`, icon: CalendarClock, className: "bg-info/10 text-info-ink ring-info/25", bar: "bg-info/70" },
  upcoming: { label: (p) => `Starts in ${p.startsInDays} days`, icon: CalendarClock, className: "bg-muted text-muted-foreground ring-border", bar: "bg-muted-foreground/40" },
  ended: { label: () => "Ended", icon: Clock3, className: "bg-muted text-muted-foreground ring-border", bar: "bg-muted-foreground/30" },
};

function Tile({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card p-4 shadow-sm">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tracking-tight">{value}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  );
}

export function PromotionsView() {
  const { data, error, loading, reload } = useApi<PromotionsResponse>("/api/promotions");

  if (error && !data) return <div className="mx-auto max-w-6xl"><ErrorState message={error} onRetry={reload} /></div>;

  const promos = data?.promotions ?? [];
  const asOf = data?.asOf ?? "";
  // Window: two weeks back to three weeks ahead, stretched to fit every promotion.
  const from = [addDays(asOf || "2000-01-01", -14), ...promos.map((p) => p.start)].sort()[0] ?? asOf;
  const to = [addDays(asOf || "2000-01-01", 21), ...promos.map((p) => p.end)].sort().reverse()[0] ?? asOf;
  const span = Math.max(1, daysBetween(from, to) + 1);
  const pos = (d: string) => (daysBetween(from, d) / span) * 100;

  const live = promos.filter((p) => p.live).length;
  const startingSoon = promos.filter((p) => p.status === "starting_soon").length;
  const endingSoon = promos.filter((p) => p.status === "ending_soon").length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Promotions" description="What is running, what starts soon, and the stock signals each one drives." />
      {loading || !data ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : promos.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No promotions are planned.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="Live promotions" value={live} note="Start on or before today, end on or after today" />
            <Tile label="Starting soon" value={startingSoon} note="Within the next 7 days" />
            <Tile label="Ending soon" value={endingSoon} note="Live, ending within 3 days" />
          </div>

          <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-label="Promotion timeline">
            <div className="relative ml-0 h-5 text-[11px] text-muted-foreground sm:ml-56" aria-hidden="true">
              <span className="absolute left-0">{formatShortDate(from)}</span>
              <span className="absolute -translate-x-1/2 font-semibold text-foreground" style={{ left: `${pos(asOf)}%` }}>Today</span>
              <span className="absolute right-0">{formatShortDate(to)}</span>
            </div>
            <ul className="flex flex-col gap-5">
              {promos.map((p) => {
                const s = STATUS[p.status];
                const Icon = s.icon;
                return (
                  <li key={`${p.sku_or_category}-${p.start}`} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                    <div className="flex flex-col gap-1 sm:w-52 sm:shrink-0">
                      <span className="font-semibold">{p.promotion}</span>
                      <span className="text-xs text-muted-foreground">{p.sku_or_category}</span>
                      <span className={cn("inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", s.className)}>
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {s.label(p)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatShortDate(p.start)} to {formatShortDate(p.end)} · +{Math.round(p.expected_uplift * 100)}% demand · {offerLabel(p.discount)}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="relative h-7 rounded-md bg-muted/60">
                        <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${pos(asOf)}%` }} aria-hidden="true" />
                        <div
                          className={cn("absolute inset-y-1 rounded", s.bar)}
                          style={{ left: `${pos(p.start)}%`, width: `${Math.max(1, ((daysBetween(p.start, p.end) + 1) / span) * 100)}%` }}
                          role="img"
                          aria-label={`${p.promotion} runs ${formatShortDate(p.start)} to ${formatShortDate(p.end)}`}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">{p.skuCount} SKUs:</span>
                        {p.skus.slice(0, 5).map((x) => (
                          <span key={x.sku} className="rounded border px-1.5 py-0.5">{x.sku}</span>
                        ))}
                        {p.skuCount > 5 && <span className="text-muted-foreground">and {p.skuCount - 5} more</span>}
                        <Link
                          href={`/signals?promo=${encodeURIComponent(p.sku_or_category)}`}
                          className="ml-auto rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {p.signalIds.length} {p.signalIds.length === 1 ? "signal" : "signals"}
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
