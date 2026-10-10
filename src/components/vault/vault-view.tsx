"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PackagePlus, Search, Truck } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/lib/client/useApi";
import { useOpenSignals } from "@/lib/client/useSignals";
import { AGED_DAYS } from "@/lib/config";
import { formatINR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VaultProduct, VaultResponse } from "@/lib/vaultStore";
import { ProductForm } from "./product-form";
import { StockDialogs, type StockAction } from "./stock-dialogs";

export function VaultView() {
  const { data, error, loading, reload } = useApi<VaultResponse>("/api/vault");
  const { open } = useOpenSignals();
  const [formOpen, setFormOpen] = useState(false);
  const [action, setAction] = useState<StockAction>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const products = useMemo(() => data?.products ?? [], [data]);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = products.filter(
      (p) => (!category || p.category === category) && (!q || `${p.sku} ${p.product} ${p.brand} ${p.model}`.toLowerCase().includes(q)),
    );
    const byCategory = new Map<string, VaultProduct[]>();
    for (const p of shown) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [products, query, category]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [products]);
  const signalCount = (sku: string) => open.filter((r) => r.problem.sku === sku).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Product vault"
        description="Products you add are stocked at a store, grouped by category, and feed every stock signal."
        actions={
          <Button onClick={() => setFormOpen(true)} disabled={!data}>
            <PackagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Add product
          </Button>
        }
      />

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <ListSkeleton rows={3} />
      ) : products.length === 0 ? (
        <EmptyState
          title="The vault is empty"
          body="Add your first product with its company, category, store, quantity and age. You can then sell it at the Billing counter."
          action={<Button size="sm" onClick={() => setFormOpen(true)}>Add product</Button>}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:p-4">
            <label className="relative flex-1">
              <span className="sr-only">Search the vault</span>
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, company, model or SKU" className="pl-8" />
            </label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
              {[["All", products.length] as const, ...categoryCounts].map(([c, n]) => {
                const value = c === "All" ? null : c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === value}
                    onClick={() => setCategory(value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      category === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                    )}
                  >
                    {c} <span className="tabular-nums opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {groups.length === 0 ? (
            <EmptyState title="No products match" body="Try a different search or category." />
          ) : (
            groups.map(([cat, items]) => (
              <section key={cat} aria-labelledby={`cat-${cat}`} className="flex flex-col gap-2">
                <h2 id={`cat-${cat}`} className="flex items-baseline gap-2 font-semibold">
                  {cat}
                  <span className="text-sm font-normal text-muted-foreground">
                    {items.length} {items.length === 1 ? "product" : "products"}, {formatNumber(items.reduce((s, p) => s + p.totalStock, 0))} units
                  </span>
                </h2>
                <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="p-3 font-medium">Product</th>
                        <th className="p-3 font-medium">Stock by store</th>
                        <th className="p-3 text-right font-medium">Oldest</th>
                        <th className="p-3 text-right font-medium">Price</th>
                        <th className="p-3 font-medium">Signals</th>
                        <th className="p-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((p) => {
                        const oldest = Math.max(0, ...p.inventory.filter((i) => i.stock > 0).map((i) => i.ageingDays));
                        const n = signalCount(p.sku);
                        return (
                          <tr key={p.sku} className="border-t align-top">
                            <td className="p-3">
                              <p className="font-medium">{p.product}</p>
                              <p className="text-xs text-muted-foreground">{p.brand} · {p.sku}</p>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                {p.inventory.map((i) => (
                                  <span key={i.store} className={cn("rounded border px-1.5 py-0.5 text-xs tabular-nums", i.stock === 0 && "border-critical/40 text-critical-ink")}>
                                    {i.store.replace("Store ", "")} · {i.stock}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className={cn("p-3 text-right tabular-nums", oldest > AGED_DAYS && "font-medium text-warning-ink")}>{oldest}d</td>
                            <td className="p-3 text-right tabular-nums">
                              {p.counterPrice < p.sellingPrice ? (
                                <>
                                  <span className="font-medium">{formatINR(p.counterPrice)}</span>
                                  <span className="block text-xs text-muted-foreground line-through">{formatINR(p.sellingPrice)}</span>
                                </>
                              ) : (
                                formatINR(p.sellingPrice)
                              )}
                            </td>
                            <td className="p-3">
                              {n > 0 ? (
                                <Link href={`/signals?q=${encodeURIComponent(p.sku)}`} className="rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  {n} open
                                </Link>
                              ) : (
                                <span className="text-xs text-muted-foreground">None</span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" className="h-8" onClick={() => setAction({ kind: "stock", product: p })}>Add stock</Button>
                                <Button size="sm" variant="ghost" className="h-8" onClick={() => setAction({ kind: "order", product: p })}>
                                  <Truck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                  Order
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Saved in the database. Running <code className="rounded bg-muted px-1">npm run seed</code> or <code className="rounded bg-muted px-1">npm run build</code> rebuilds it and clears the vault.
      </p>

      {data && (
        <>
          <ProductForm open={formOpen} onOpenChange={setFormOpen} stores={data.stores} categories={data.categories} />
          <StockDialogs action={action} stores={data.stores} onClose={() => setAction(null)} />
        </>
      )}
    </div>
  );
}
