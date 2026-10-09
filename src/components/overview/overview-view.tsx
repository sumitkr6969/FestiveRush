"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, PlayCircle } from "lucide-react";
import { CountUp } from "@/components/common/count-up";
import { MiniBars, Sparkline } from "@/components/common/sparkline";
import { ErrorState, ListSkeleton } from "@/components/common/states";
import { SignalCard } from "@/components/signals/signal-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/client/useApi";
import { useOpenSignals } from "@/lib/client/useSignals";
import { formatCompactINR, formatNumber } from "@/lib/format";
import type { OverviewResponse } from "@/lib/views";
import { KpiCard } from "./kpi-card";
import { SalesMomentum } from "./sales-momentum";

const reviewHref = (id: string) => `/signals?review=${encodeURIComponent(id)}`;

function SeverityStrip({ critical, high, medium }: { critical: number; high: number; medium: number }) {
  const total = Math.max(1, critical + high + medium);
  return (
    <div className="flex h-2 w-24 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${critical} critical, ${high} needs action, ${medium} watch`}>
      {critical > 0 && <span className="bg-critical" style={{ width: `${(critical / total) * 100}%` }} />}
      {high > 0 && <span className="bg-warning" style={{ width: `${(high / total) * 100}%` }} />}
      {medium > 0 && <span className="bg-info" style={{ width: `${(medium / total) * 100}%` }} />}
    </div>
  );
}

export function OverviewView() {
  const router = useRouter();
  const overview = useApi<OverviewResponse>("/api/overview");
  const signals = useOpenSignals();
  const open = signals.open;
  const critical = open.filter((r) => r.problem.severity === "CRITICAL").length;
  const high = open.filter((r) => r.problem.severity === "HIGH").length;
  const k = overview.data?.kpis;
  const top = open[0];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Good morning, Ananya</h1>
          {signals.data ? (
            <p className="text-muted-foreground" aria-live="polite">
              {open.length === 0 ? "Nothing needs your attention right now." : (
                <><span className="font-semibold text-foreground">{open.length} things</span> need your attention today{critical > 0 && <>, <span className="font-medium text-critical-ink">{critical} critical</span></>}.</>
              )}
            </p>
          ) : (
            <Skeleton className="h-5 w-72" />
          )}
        </div>
        {top && (
          <Button size="lg" onClick={() => router.push(reviewHref(top.problem.id))}>
            <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
            Start review
          </Button>
        )}
      </header>

      {overview.error && !overview.data ? (
        <ErrorState message={overview.error} onRetry={overview.reload} />
      ) : (
        <div data-tour="kpis" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {!k ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
          ) : (
            <>
              <KpiCard
                label="Network inventory"
                value={<CountUp value={k.inventory.units} format={(n) => formatNumber(Math.round(n))} />}
                detail={`units, ${formatCompactINR(k.inventory.value)} at cost`}
                visual={<Sparkline values={k.inventory.unitsSoldByDay} label="Units sold per day, last 14 days" />}
                explain="Units on hand across all 12 stores, valued at each SKU's cheapest supplier price. The line shows network units sold per day over the last 14 days."
                href="/signals?sort=cash"
              />
              <KpiCard
                label="Need attention"
                value={<CountUp value={open.length} />}
                detail={<><span className="font-medium text-critical-ink">{critical} critical</span>, {high} need action</>}
                visual={<SeverityStrip critical={critical} high={high} medium={open.length - critical - high} />}
                explain="Signals still waiting for your decision. Critical means the store runs out before the fastest supplier can deliver, or before a promotion starts."
                href="/signals?sev=critical"
              />
              <KpiCard
                label="Open POs"
                value={<CountUp value={k.openPos.open} />}
                detail={k.openPos.overdue > 0 ? <span className="font-medium text-critical-ink">{k.openPos.overdue} overdue</span> : "none overdue"}
                visual={<MiniBars values={k.openPos.dueByDay} label="Purchase orders due per day, next 14 days" />}
                explain="Purchase orders not yet delivered. Overdue means the expected date has passed; overdue POs never count as incoming stock. Bars show POs due per day for the next 14 days."
                href="/signals?type=late-po"
              />
              <KpiCard
                label="Live promotions"
                value={<CountUp value={k.promotions.live} />}
                detail={`${k.promotions.startingSoon} starting soon`}
                visual={<MiniBars values={k.promotions.liveByDay} label="Promotions live per day, next 14 days" />}
                explain="Promotions running today: started on or before today and ending on or after today. Starting soon means within 7 days. Bars show how many are live each day for the next 14 days."
                href="/signals?type=demand-spike"
              />
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SalesMomentum />
        <section data-tour="next-move" className="flex flex-col gap-3" aria-labelledby="next-move-title">
          <div className="flex items-center justify-between">
            <h2 id="next-move-title" className="font-semibold">Next best move</h2>
            <Link href="/signals" className="inline-flex items-center rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              All signals
              <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          {signals.error && !signals.data ? (
            <ErrorState message={signals.error} onRetry={signals.reload} />
          ) : !signals.data ? (
            <ListSkeleton rows={3} />
          ) : open.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">All caught up. New signals appear here as stock and sales change.</p>
          ) : (
            open.slice(0, 3).map((rec) => (
              <SignalCard key={rec.problem.id} rec={rec} compact onOpen={() => router.push(reviewHref(rec.problem.id))} />
            ))
          )}
        </section>
      </div>
    </div>
  );
}
