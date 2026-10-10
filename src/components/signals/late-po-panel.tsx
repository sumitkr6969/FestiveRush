"use client";

import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { LiveTimeline } from "@/components/orders/live-status";
import { PoStatusDialog, type PoRef } from "@/components/orders/po-status-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/client/useApi";
import type { Recommendation } from "@/lib/engine";
import { agentSuggestion } from "@/lib/explain";
import type { OrdersResponse } from "@/lib/views";

/**
 * For a late PO: the agent's suggestion first (what to do instead of waiting), then
 * the supplier's live status with a way to record a new update. Every update
 * re-runs the engine, so the suggestion follows the latest status.
 */
export function LatePoPanel({ rec }: { rec: Recommendation }) {
  const orders = useApi<OrdersResponse>("/api/orders");
  const [editing, setEditing] = useState<PoRef | null>(null);
  const po = orders.data?.purchaseOrders.find((p) => p.po === rec.problem.evidence.po);
  const lines = agentSuggestion(rec);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4" aria-labelledby="agent-suggestion">
        <h3 id="agent-suggestion" className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Agent suggestion
        </h3>
        <ul className="flex flex-col gap-1 text-sm">
          {lines.map((line, i) => (
            <li key={i} className={i === 0 ? "font-medium" : undefined}>{line}</li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">Worked out by the decision engine from live status, stock and supplier terms. No guesses.</p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="live-status">
        <div className="flex items-center justify-between gap-2">
          <h3 id="live-status" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplier live status</h3>
          {po && po.live?.state !== "delivered" && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(po)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Update status
            </Button>
          )}
        </div>
        {!po?.live ? <Skeleton className="h-24 w-full rounded-lg" /> : <LiveTimeline live={po.live} />}
      </section>
      <PoStatusDialog po={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
