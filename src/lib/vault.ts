import {
  VAULT_MAX_AGE_DAYS,
  VAULT_MAX_PRICE,
  VAULT_MAX_UNITS,
  VAULT_SKU_PREFIX,
  VAULT_SUPPLIER_DEFAULTS,
} from "./config";
import { flatDiscountRate, promotionCovers } from "./promotions";
import type { IsoDate, PromotionRow, SupplierAvailability } from "./types";

// Pure rules for the Product vault and Billing counter, shared by the forms (instant
// feedback) and the API (the final say). No I/O here.

/** Suggested categories (the ones in data/source/products.csv); any other name starts a new group. */
export const KNOWN_CATEGORIES = [
  "Accessories", "Air Conditioners", "Cameras", "Gaming", "Headphones", "Laptops",
  "Refrigerators", "Smartphones", "Smartwatches", "Televisions", "Washing Machines",
];

/**
 * Purchase cost as a share of selling price, per category: the average supplier price ÷
 * selling price in suppliers.csv, rounded to two places.
 */
const COST_SHARE: Readonly<Record<string, number>> = {
  Accessories: 0.77,
  "Air Conditioners": 0.8,
  Cameras: 0.8,
  Gaming: 0.79,
  Headphones: 0.78,
  Laptops: 0.81,
  Refrigerators: 0.78,
  Smartphones: 0.79,
  Smartwatches: 0.79,
  Televisions: 0.8,
  "Washing Machines": 0.8,
};
const DEFAULT_COST_SHARE = 0.8;

/** SKU code per category, from the source SKUs (SMA is shared there, so smartwatches get SWT). */
const CATEGORY_CODE: Readonly<Record<string, string>> = {
  Accessories: "ACC",
  "Air Conditioners": "AIR",
  Cameras: "CAM",
  Gaming: "GAM",
  Headphones: "HEA",
  Laptops: "LAP",
  Refrigerators: "REF",
  Smartphones: "SMA",
  Smartwatches: "SWT",
  Televisions: "TEL",
  "Washing Machines": "WAS",
};

const AVAILABILITY: SupplierAvailability[] = ["in_stock", "limited", "backorder"];

export interface SupplierTermsInput {
  supplier: string;
  purchasePrice: number;
  leadDays: number;
  moq: number;
  availability: SupplierAvailability;
}

export interface VaultProductInput {
  name: string;
  company: string;
  category: string;
  model?: string;
  sellingPrice: number;
  store: string;
  quantity: number;
  /** Days the units have already been in stock (drives the ageing signal). */
  ageDays: number;
  suppliers: SupplierTermsInput[];
}

export type FieldErrors = Partial<Record<string, string>>;

const roundTo10 = (n: number) => Math.round(n / 10) * 10;
const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
const clean = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "");

export const isVaultSku = (sku: string) => sku.startsWith(VAULT_SKU_PREFIX);

/** Suppliers A/B/C priced from the selling price, like the seed data. */
export function defaultSupplierTerms(category: string, sellingPrice: number): SupplierTermsInput[] {
  const base = roundTo10(sellingPrice * (COST_SHARE[category] ?? DEFAULT_COST_SHARE));
  return VAULT_SUPPLIER_DEFAULTS.map((t) => ({
    supplier: t.supplier,
    purchasePrice: roundTo10(base * t.priceFactor),
    leadDays: t.leadDays,
    moq: t.moq,
    availability: "in_stock" as const,
  }));
}

/** e.g. V-LP-003: prefix, category code, next number across all vault SKUs. */
export function nextVaultSku(category: string, existingSkus: readonly string[]): string {
  const code = CATEGORY_CODE[category] ?? (category.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "XX");
  const highest = existingSkus
    .filter(isVaultSku)
    .reduce((max, sku) => Math.max(max, Number(/-(\d+)$/.exec(sku)?.[1] ?? 0)), 0);
  return `${VAULT_SKU_PREFIX}${code}-${String(highest + 1).padStart(3, "0")}`;
}

/** Normalises and validates a new product. Returns the cleaned input or per-field errors. */
export function validateProduct(
  raw: unknown,
  stores: readonly string[],
): { ok: true; value: VaultProductInput } | { ok: false; errors: FieldErrors } {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};
  const name = clean(r.name);
  const company = clean(r.company);
  const category = clean(r.category);
  const model = clean(r.model);
  const store = clean(r.store);
  const { sellingPrice, quantity, ageDays } = r;

  if (name.length < 2 || name.length > 80) errors.name = "Enter a name of 2 to 80 characters.";
  if (company.length < 1 || company.length > 40) errors.company = "Enter the company (up to 40 characters).";
  if (category.length < 1 || category.length > 30) errors.category = "Choose or type a category.";
  if (model.length > 40) errors.model = "Keep the model under 40 characters.";
  if (!isInt(sellingPrice) || sellingPrice < 1 || sellingPrice > VAULT_MAX_PRICE) errors.sellingPrice = "Enter a whole-rupee price.";
  if (!stores.includes(store)) errors.store = "Choose a store.";
  if (!isInt(quantity) || quantity < 1 || quantity > VAULT_MAX_UNITS) errors.quantity = `Enter 1 to ${VAULT_MAX_UNITS} units.`;
  if (!isInt(ageDays) || ageDays < 0 || ageDays > VAULT_MAX_AGE_DAYS) errors.ageDays = "Enter days in stock (0 or more).";

  const rawSuppliers = Array.isArray(r.suppliers) ? (r.suppliers as unknown[]) : [];
  const suppliers: SupplierTermsInput[] = rawSuppliers.map((s) => {
    const o = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
    return {
      supplier: clean(o.supplier),
      purchasePrice: o.purchasePrice as number,
      leadDays: o.leadDays as number,
      moq: o.moq as number,
      availability: o.availability as SupplierAvailability,
    };
  });
  if (suppliers.length < 1 || suppliers.length > 3) errors.suppliers = "Give 1 to 3 suppliers.";
  suppliers.forEach((s, i) => {
    const price = isInt(sellingPrice) ? sellingPrice : Infinity;
    if (!s.supplier) errors[`suppliers.${i}`] = "Supplier name is required.";
    // A purchase price at or above retail would make every sale a loss.
    else if (!isInt(s.purchasePrice) || s.purchasePrice < 1 || s.purchasePrice >= price) errors[`suppliers.${i}`] = "Purchase price must be below the selling price.";
    else if (!isInt(s.leadDays) || s.leadDays < 0 || s.leadDays > 365) errors[`suppliers.${i}`] = "Lead time is 0 to 365 days.";
    else if (!isInt(s.moq) || s.moq < 1 || s.moq > VAULT_MAX_UNITS) errors[`suppliers.${i}`] = "Minimum order is 1 or more.";
    else if (!AVAILABILITY.includes(s.availability)) errors[`suppliers.${i}`] = "Choose availability.";
  });
  if (new Set(suppliers.map((s) => s.supplier.toLowerCase())).size !== suppliers.length) errors.suppliers = "Supplier names must be different.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      company,
      category,
      ...(model ? { model } : {}),
      sellingPrice: sellingPrice as number,
      store,
      quantity: quantity as number,
      ageDays: ageDays as number,
      suppliers,
    },
  };
}

/** Counter price today: list price less any promotion running on that SKU or its category. */
export function counterPrice(
  product: { sku: string; category: string; sellingPrice: number },
  promotions: readonly PromotionRow[],
  asOf: IsoDate,
): { price: number; promotion: PromotionRow | null } {
  const promo = promotions.find((p) => promotionCovers(p, product.sku, product.category) && p.start <= asOf && asOf <= p.end) ?? null;
  // Only a flat percentage changes the till price; "Buy 2 Get 10% off" stays with the cashier.
  return { price: promo ? Math.round(product.sellingPrice * (1 - flatDiscountRate(promo.discount))) : product.sellingPrice, promotion: promo };
}
