"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { describedBy, Field, selectClass } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { postAndRefresh } from "@/lib/client/vaultClient";
import { formatINR } from "@/lib/format";
import type { SupplierAvailability } from "@/lib/types";
import { defaultSupplierTerms, KNOWN_CATEGORIES, validateProduct, type FieldErrors, type SupplierTermsInput } from "@/lib/vault";

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: string[];
  categories: string[];
}

const EMPTY = { name: "", company: "", category: "", model: "", sellingPrice: "", store: "", quantity: "", ageDays: "0" };
type Draft = typeof EMPTY;

const toInt = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function ProductForm({ open, onOpenChange, stores, categories }: ProductFormProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [suppliers, setSuppliers] = useState<SupplierTermsInput[]>([]);
  // Once the user edits supplier terms, stop overwriting them from price and category.
  const [suppliersEdited, setSuppliersEdited] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const price = toInt(draft.sellingPrice);
  const terms = suppliersEdited ? suppliers : Number.isInteger(price) && price > 0 ? defaultSupplierTerms(draft.category, price) : [];
  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setDraft((d) => ({ ...d, [key]: e.target.value }));
    // An error stops applying as soon as the user edits that field.
    setErrors((errs) => (errs[key] ? { ...errs, [key]: undefined } : errs));
  };

  // Each time the form opens it starts without leftover errors.
  useEffect(() => {
    if (open) setErrors({});
  }, [open]);

  const editSupplier = (i: number, patch: Partial<SupplierTermsInput>) => {
    setSuppliersEdited(true);
    setErrors((errs) => ({ ...errs, suppliers: undefined, [`suppliers.${i}`]: undefined }));
    setSuppliers(terms.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  };

  const reset = () => {
    setDraft(EMPTY);
    setSuppliers([]);
    setSuppliersEdited(false);
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      ...draft,
      sellingPrice: price,
      quantity: toInt(draft.quantity),
      ageDays: toInt(draft.ageDays),
      suppliers: terms,
    };
    const check = validateProduct(body, stores);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setSaving(true);
    const res = await postAndRefresh<{ sku: string }>("/api/vault/products", body);
    setSaving(false);
    if (!res.ok) {
      setErrors(res.fieldErrors);
      toast.error("Product not saved", { description: res.error });
      return;
    }
    toast.success(`Added ${check.value.name}`, { description: `${res.data.sku} in ${check.value.category}, ${check.value.quantity} units at ${check.value.store}.` });
    reset();
    onOpenChange(false);
  };

  const suggestions = [...new Set([...KNOWN_CATEGORIES, ...categories])].sort();
  const supplierError = errors.suppliers ?? [0, 1, 2].map((i) => errors[`suppliers.${i}`]).find(Boolean);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-4 pr-12 text-left sm:p-6">
          <SheetTitle>Add a product</SheetTitle>
          <SheetDescription>It is stocked at one store and joins its category group. Every signal updates straight away.</SheetDescription>
        </SheetHeader>
        <form id="product-form" onSubmit={submit} noValidate className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <Field id="p-name" label="Product name" error={errors.name}>
            <Input {...describedBy("p-name", errors.name)} value={draft.name} onChange={set("name")} placeholder="Korvi Book 15 (i7, 16 GB)" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="p-company" label="Company" error={errors.company}>
              <Input {...describedBy("p-company", errors.company)} value={draft.company} onChange={set("company")} placeholder="Korvi" />
            </Field>
            <Field id="p-category" label="Category" error={errors.category} hint="Pick one or type a new group">
              <Input {...describedBy("p-category", errors.category, "Pick one or type a new group")} value={draft.category} onChange={set("category")} list="category-options" placeholder="Laptops" />
              <datalist id="category-options">
                {suggestions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Field>
            <Field id="p-model" label="Model (optional)" error={errors.model}>
              <Input {...describedBy("p-model", errors.model)} value={draft.model} onChange={set("model")} placeholder="Book15-G4" />
            </Field>
            <Field id="p-price" label="Selling price (₹)" error={errors.sellingPrice}>
              <Input {...describedBy("p-price", errors.sellingPrice)} value={draft.sellingPrice} onChange={set("sellingPrice")} inputMode="numeric" type="number" min={1} step={1} placeholder="64990" />
            </Field>
            <Field id="p-store" label="Store" error={errors.store}>
              <select {...describedBy("p-store", errors.store)} value={draft.store} onChange={set("store")} className={selectClass}>
                <option value="">Choose a store</option>
                {stores.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field id="p-qty" label="Quantity" error={errors.quantity}>
              <Input {...describedBy("p-qty", errors.quantity)} value={draft.quantity} onChange={set("quantity")} inputMode="numeric" type="number" min={1} step={1} placeholder="20" />
            </Field>
            <Field id="p-age" label="Age (days in stock)" error={errors.ageDays} hint="Over 90 days counts as ageing stock" className="sm:col-span-2">
              <Input {...describedBy("p-age", errors.ageDays, "Over 90 days counts as ageing stock")} value={draft.ageDays} onChange={set("ageDays")} inputMode="numeric" type="number" min={0} step={1} />
            </Field>
          </div>

          <details className="rounded-lg border p-3" open={Boolean(supplierError)}>
            <summary className="cursor-pointer text-sm font-medium">
              Supplier terms <span className="font-normal text-muted-foreground">(pre-filled from the price; edit if you know them)</span>
            </summary>
            {terms.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Enter a selling price to see suggested terms.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[500px] table-fixed text-xs">
                  <colgroup><col className="w-[26%]" /><col className="w-[22%]" /><col className="w-[15%]" /><col className="w-[13%]" /><col className="w-[24%]" /></colgroup>
                  <thead className="text-left text-muted-foreground">
                    <tr><th className="pb-1 font-medium">Supplier</th><th className="pb-1 font-medium">Price (₹)</th><th className="pb-1 font-medium">Lead (days)</th><th className="pb-1 font-medium">MOQ</th><th className="pb-1 font-medium">Availability</th></tr>
                  </thead>
                  <tbody>
                    {terms.map((t, i) => (
                      <tr key={i}>
                        <td className="py-1 pr-1"><Input aria-label={`Supplier ${i + 1} name`} className="h-8 px-2 text-xs" value={t.supplier} onChange={(e) => editSupplier(i, { supplier: e.target.value })} /></td>
                        <td className="py-1 pr-1"><Input aria-label={`${t.supplier} price`} className="h-8 px-2 text-xs" type="number" min={1} value={t.purchasePrice} onChange={(e) => editSupplier(i, { purchasePrice: Number(e.target.value) })} /></td>
                        <td className="py-1 pr-1"><Input aria-label={`${t.supplier} lead time`} className="h-8 px-2 text-xs" type="number" min={0} value={t.leadDays} onChange={(e) => editSupplier(i, { leadDays: Number(e.target.value) })} /></td>
                        <td className="py-1 pr-1"><Input aria-label={`${t.supplier} minimum order`} className="h-8 px-2 text-xs" type="number" min={1} value={t.moq} onChange={(e) => editSupplier(i, { moq: Number(e.target.value) })} /></td>
                        <td className="py-1">
                          <select aria-label={`${t.supplier} availability`} className={`${selectClass} h-8 text-xs`} value={t.availability} onChange={(e) => editSupplier(i, { availability: e.target.value as SupplierAvailability })}>
                            <option value="in_stock">In stock</option>
                            <option value="limited">Limited</option>
                            <option value="backorder">Backorder</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {Number.isInteger(price) && price > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">Purchase prices must stay below {formatINR(price)}.</p>
                )}
              </div>
            )}
            {supplierError && <p className="mt-2 text-xs font-medium text-critical-ink">{supplierError}</p>}
          </details>
        </form>
        <footer className="flex items-center justify-end gap-2 border-t p-3 sm:p-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="product-form" disabled={saving}>{saving ? "Saving" : "Add product"}</Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
