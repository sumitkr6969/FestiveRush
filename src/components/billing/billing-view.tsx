"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { selectClass } from "@/components/common/field";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/lib/client/useApi";
import { postAndRefresh } from "@/lib/client/vaultClient";
import { TODAY } from "@/lib/config";
import { formatDisplayDate, formatINR } from "@/lib/format";
import type { VaultProduct, VaultResponse } from "@/lib/vaultStore";

interface Line {
  product: VaultProduct;
  quantity: number;
}

interface Bill {
  units: number;
  total: number;
}

export function BillingView() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<VaultResponse>("/api/vault");
  const [store, setStore] = useState("");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  // Units just sold, subtracted only from the data they were sold against: once the
  // refreshed vault arrives (whenever that is) it already reflects the sale.
  const [justSold, setJustSold] = useState<{ base: VaultResponse | null; sold: Record<string, number> }>({ base: null, sold: {} });
  const pendingSold = justSold.base !== null && justSold.base === data ? justSold.sold : {};

  const stockAt = (p: VaultProduct) => Math.max(0, (p.inventory.find((i) => i.store === store)?.stock ?? 0) - (pendingSold[p.sku] ?? 0));
  const inCart = (sku: string) => cart.find((l) => l.product.sku === sku)?.quantity ?? 0;

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.products ?? [])
      .filter((p) => store && stockAt(p) > 0)
      .filter((p) => !q || `${p.sku} ${p.product} ${p.brand} ${p.category}`.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, store, query]);
  const outOfStock = (data?.products ?? []).filter((p) => store && stockAt(p) === 0).length;

  const changeStore = (next: string) => {
    if (cart.length > 0) toast("Cart cleared", { description: "A bill belongs to one store." });
    setCart([]);
    setStore(next);
  };

  const setQty = (p: VaultProduct, quantity: number) =>
    setCart((c) => {
      const q = Math.max(0, Math.min(quantity, stockAt(p)));
      const rest = c.filter((l) => l.product.sku !== p.sku);
      return q === 0 ? rest : c.some((l) => l.product.sku === p.sku) ? c.map((l) => (l.product.sku === p.sku ? { ...l, quantity: q } : l)) : [...c, { product: p, quantity: q }];
    });

  const total = cart.reduce((s, l) => s + l.quantity * l.product.counterPrice, 0);
  const units = cart.reduce((s, l) => s + l.quantity, 0);

  const checkout = async () => {
    const soldAgainst = data;
    setBusy(true);
    const res = await postAndRefresh<Bill>("/api/billing", { store, lines: cart.map((l) => ({ sku: l.product.sku, quantity: l.quantity })) });
    setBusy(false);
    if (!res.ok) {
      toast.error("Sale not recorded", { description: res.error });
      return;
    }
    toast.success(`Sold ${res.data.units} ${res.data.units === 1 ? "item" : "items"} for ${formatINR(res.data.total)}`, {
      description: `${store}, ${formatDisplayDate(TODAY)}. Stock and signals are updated.`,
      action: { label: "Sold vault", onClick: () => router.push("/sold") },
    });
    setJustSold({ base: soldAgainst, sold: Object.fromEntries(cart.map((l) => [l.product.sku, l.quantity])) });
    setCart([]);
  };

  if (error && !data) return <div className="mx-auto max-w-6xl"><ErrorState message={error} onRetry={reload} /></div>;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Billing counter" description={`Sell products from the vault. Sales are recorded for ${formatDisplayDate(TODAY)}.`} />

      {loading && !data ? (
        <ListSkeleton rows={3} />
      ) : (data?.products.length ?? 0) === 0 ? (
        <EmptyState
          title="Nothing to sell yet"
          body="Products sold here come from the Product vault. Add one there first."
          action={<Button asChild size="sm"><Link href="/vault">Go to Product vault</Link></Button>}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section aria-label="Products" className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:p-4">
              <label className="sr-only" htmlFor="bill-store">Store</label>
              <select id="bill-store" className={`${selectClass} sm:w-48`} value={store} onChange={(e) => changeStore(e.target.value)}>
                <option value="">Choose a store</option>
                {data?.stores.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="relative flex-1">
                <span className="sr-only">Search products</span>
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Product, company, category or SKU" className="pl-8" disabled={!store} />
              </label>
            </div>

            {!store ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Choose the store you&apos;re billing at to see what it has in stock.</p>
            ) : available.length === 0 ? (
              <EmptyState title={`Nothing in stock at ${store}`} body="Add stock to this store from the Product vault, or pick another store." />
            ) : (
              <ul className="flex flex-col divide-y rounded-xl border bg-card shadow-sm">
                {available.map((p) => {
                  const left = stockAt(p) - inCart(p.sku);
                  return (
                    <li key={p.sku} className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="font-medium">{p.product}</p>
                        <p className="text-xs text-muted-foreground">{p.category} · {p.brand} · {p.sku} · {left} left</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right tabular-nums">
                          <p className="font-medium">{formatINR(p.counterPrice)}</p>
                          {p.promotion && <p className="text-xs text-muted-foreground"><span className="line-through">{formatINR(p.sellingPrice)}</span> {p.promotion.name} promo</p>}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setQty(p, inCart(p.sku) + 1)} disabled={left <= 0} aria-label={`Add ${p.product} to the bill`}>
                          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          Add
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {store && outOfStock > 0 && <p className="text-xs text-muted-foreground">{outOfStock} vault {outOfStock === 1 ? "product has" : "products have"} no stock at {store}.</p>}
          </section>

          <aside aria-label="Bill" className="flex h-fit flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm lg:sticky lg:top-20">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              Bill{store && <span className="font-normal text-muted-foreground">· {store}</span>}
            </h2>
            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Add products to start a bill.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {cart.map((l) => (
                  <li key={l.product.sku} className="flex flex-col gap-2 py-2.5">
                    <div className="flex items-start justify-between gap-2 text-sm">
                      <span className="font-medium">{l.product.product}</span>
                      <span className="tabular-nums">{formatINR(l.quantity * l.product.counterPrice)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${l.product.product}`}>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product, l.quantity - 1)} aria-label="One fewer">
                          <Minus className="h-3 w-3" aria-hidden="true" />
                        </Button>
                        <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">{l.quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product, l.quantity + 1)} disabled={l.quantity >= stockAt(l.product)} aria-label="One more">
                          <Plus className="h-3 w-3" aria-hidden="true" />
                        </Button>
                        <span className="ml-1 text-xs text-muted-foreground">× {formatINR(l.product.counterPrice)}</span>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty(l.product, 0)} aria-label={`Remove ${l.product.product}`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">{units} {units === 1 ? "item" : "items"}</span>
              <span className="text-xl font-semibold">{formatINR(total)}</span>
            </div>
            <Button onClick={() => void checkout()} disabled={cart.length === 0 || busy}>
              {busy ? "Recording sale" : "Complete sale"}
            </Button>
          </aside>
        </div>
      )}
    </div>
  );
}
