"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { selectClass } from "@/components/common/field";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/client/useApi";
import { useOpenSignals } from "@/lib/client/useSignals";
import { formatINR, formatNumber, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isVaultSku } from "@/lib/vault";
import type { SoldRow } from "@/lib/vaultStore";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card p-4 shadow-sm">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
    </div>
  );
}

export function SoldView() {
  const { data, error, loading, reload } = useApi<{ sales: SoldRow[] }>("/api/sold");
  const { open } = useOpenSignals();
  const [category, setCategory] = useState<string | null>(null);
  const [store, setStore] = useState("");

  const sales = useMemo(() => data?.sales ?? [], [data]);
  const categories = useMemo(() => [...new Set(sales.map((s) => s.category))].sort(), [sales]);
  const stores = useMemo(() => [...new Set(sales.map((s) => s.store))].sort(), [sales]);
  const shown = sales.filter((s) => (!category || s.category === category) && (!store || s.store === store));
  const units = shown.reduce((t, s) => t + s.qty, 0);
  const revenue = shown.reduce((t, s) => t + s.total, 0);
  const vaultSignals = open.filter((r) => isVaultSku(r.problem.sku)).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Sold vault" description="Every product sold at the Billing counter, newest first." />
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <ListSkeleton rows={3} />
      ) : sales.length === 0 ? (
        <EmptyState
          title="Nothing sold yet"
          body="Sales from the Billing counter appear here with their store, quantity and price."
          action={<Button asChild size="sm"><Link href="/billing">Open the Billing counter</Link></Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="Items sold" value={formatNumber(units)} />
            <Tile label="Revenue" value={formatINR(revenue)} />
            <Tile label="Products sold" value={formatNumber(new Set(shown.map((s) => s.sku)).size)} />
          </div>

          <Link
            href="/signals?vault=1"
            className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>
              These sales feed the engine.{" "}
              <span className="font-semibold">{vaultSignals} open {vaultSignals === 1 ? "signal involves" : "signals involve"} your vault products</span>
              {vaultSignals > 0 ? ": stock-outs, ageing stock, imbalances and more." : "."}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          </Link>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
              {[null, ...categories].map((c) => (
                <button
                  key={c ?? "all"}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    category === c ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  )}
                >
                  {c ?? "All"}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="sold-store">Store</label>
            <select id="sold-store" className={`${selectClass} sm:ml-auto sm:w-44`} value={store} onChange={(e) => setStore(e.target.value)}>
              <option value="">All stores</option>
              {stores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Sale</th>
                  <th className="p-3 font-medium">Product</th>
                  <th className="p-3 font-medium">Category</th>
                  <th className="p-3 font-medium">Store</th>
                  <th className="p-3 text-right font-medium">Qty</th>
                  <th className="p-3 text-right font-medium">Unit price</th>
                  <th className="p-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {shown.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-3 text-muted-foreground">#{s.number}<span className="block text-xs">{formatShortDate(s.date)}</span></td>
                    <td className="p-3">
                      <Link href={`/signals?q=${encodeURIComponent(s.sku)}`} className="rounded font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{s.product}</Link>
                      <span className="block text-xs text-muted-foreground">{s.brand} · {s.sku}</span>
                    </td>
                    <td className="p-3">{s.category}</td>
                    <td className="p-3">{s.store}</td>
                    <td className="p-3 text-right">{s.qty}</td>
                    <td className="p-3 text-right">{formatINR(s.unitPrice)}</td>
                    <td className="p-3 text-right font-medium">{formatINR(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
