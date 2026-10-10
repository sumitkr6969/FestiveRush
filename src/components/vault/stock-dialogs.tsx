"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { describedBy, Field, selectClass } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { postAndRefresh } from "@/lib/client/vaultClient";
import { TODAY } from "@/lib/config";
import { addDays } from "@/lib/dates";
import { formatINR, formatShortDate } from "@/lib/format";
import type { PurchaseOrderRow } from "@/lib/types";
import type { FieldErrors } from "@/lib/vault";
import type { VaultProduct } from "@/lib/vaultStore";

export type StockAction = { kind: "stock" | "order"; product: VaultProduct } | null;

interface StockDialogsProps {
  action: StockAction;
  stores: string[];
  onClose: () => void;
}

/** "Add stock" receives units at a store; "Order" records an incoming purchase order. */
export function StockDialogs({ action, stores, onClose }: StockDialogsProps) {
  const product = action?.product;
  const [store, setStore] = useState("");
  const [quantity, setQuantity] = useState("");
  const [ageDays, setAgeDays] = useState("0");
  const [supplier, setSupplier] = useState("");
  const [expected, setExpected] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  // Sensible defaults each time a dialog opens: the product's main store, its first supplier.
  useEffect(() => {
    if (!product) return;
    const first = product.suppliers[0];
    setStore(product.inventory[0]?.store ?? "");
    setQuantity(action?.kind === "order" ? String(first?.moq ?? 1) : "");
    setAgeDays("0");
    setSupplier(first?.supplier ?? "");
    setExpected(addDays(TODAY, first?.lead_time_days ?? 7));
    setErrors({});
  }, [product, action?.kind]);

  const pickSupplier = (name: string) => {
    setSupplier(name);
    const s = product?.suppliers.find((x) => x.supplier === name);
    if (s) setExpected(addDays(TODAY, s.lead_time_days));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !action) return;
    setSaving(true);
    const qty = quantity.trim() === "" ? NaN : Number(quantity);
    const res =
      action.kind === "stock"
        ? await postAndRefresh<{ stock: number }>("/api/vault/stock", { sku: product.sku, store, quantity: qty, ageDays: Number(ageDays) })
        : await postAndRefresh<PurchaseOrderRow>("/api/vault/orders", { sku: product.sku, supplier, quantity: qty, expectedDate: expected });
    setSaving(false);
    if (!res.ok) {
      setErrors(res.fieldErrors);
      if (Object.keys(res.fieldErrors).length === 0) toast.error("Not saved", { description: res.error });
      return;
    }
    if (action.kind === "stock") {
      toast.success(`Received ${qty} × ${product.product}`, { description: `${store} now holds ${(res.data as { stock: number }).stock}.` });
    } else {
      const po = res.data as PurchaseOrderRow;
      toast.success(`${po.po} recorded`, { description: `${po.qty} × ${product.product} from ${po.supplier}, due ${formatShortDate(po.expected_date)}${po.status === "overdue" ? " (already overdue)" : ""}.` });
    }
    onClose();
  };

  const selected = product?.suppliers.find((s) => s.supplier === supplier);

  return (
    <Dialog open={action !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {product && action && (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{action.kind === "stock" ? "Add stock" : "Order stock"}: {product.product}</DialogTitle>
              <DialogDescription>
                {action.kind === "stock"
                  ? "Units arriving at a store now. A new store starts its own stock."
                  : "Records an incoming purchase order. It counts as inbound stock until its date passes."}
              </DialogDescription>
            </DialogHeader>
            {action.kind === "stock" ? (
              <>
                <Field id="s-store" label="Store" error={errors.store}>
                  <select {...describedBy("s-store", errors.store)} className={selectClass} value={store} onChange={(e) => setStore(e.target.value)}>
                    {stores.map((s) => <option key={s} value={s}>{s}{product.inventory.some((i) => i.store === s) ? " (has stock)" : ""}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="s-qty" label="Quantity" error={errors.quantity}>
                    <Input {...describedBy("s-qty", errors.quantity)} type="number" min={1} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
                  </Field>
                  <Field id="s-age" label="Age (days in stock)" error={errors.ageDays}>
                    <Input {...describedBy("s-age", errors.ageDays)} type="number" min={0} inputMode="numeric" value={ageDays} onChange={(e) => setAgeDays(e.target.value)} />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <Field id="o-supplier" label="Supplier" error={errors.supplier}>
                  <select {...describedBy("o-supplier", errors.supplier)} className={selectClass} value={supplier} onChange={(e) => pickSupplier(e.target.value)}>
                    {product.suppliers.map((s) => (
                      <option key={s.supplier} value={s.supplier}>{s.supplier}: {formatINR(s.purchase_price)}, {s.lead_time_days}-day lead, MOQ {s.moq}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="o-qty" label="Quantity" error={errors.quantity} hint={selected && Number(quantity) < selected.moq ? `Below the MOQ of ${selected.moq}` : undefined}>
                    <Input {...describedBy("o-qty", errors.quantity)} type="number" min={1} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                  </Field>
                  <Field id="o-date" label="Expected date" error={errors.expectedDate}>
                    <Input {...describedBy("o-date", errors.expectedDate)} type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
                  </Field>
                </div>
              </>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving" : action.kind === "stock" ? "Add stock" : "Record order"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
