import type { ProductRow, SupplierAvailability, SupplierRow } from "../../src/lib/types";
import { intBetween, type Rng } from "./random";
import { SCENARIO } from "./scenario";

/** Purchase cost as a share of selling price for the standard (Supplier A) tier. */
const COST_SHARE: Readonly<Record<string, number>> = {
  TV: 0.78,
  Laptop: 0.85,
  Mobile: 0.86,
  Earphones: 0.6,
  AC: 0.8,
  Refrigerator: 0.8,
  "Washing Machine": 0.8,
};

/** Small, high-volume items are bought in bigger lots. */
const MOQ_SCALE: Readonly<Record<string, number>> = { Mobile: 3, Earphones: 5 };

interface Tier {
  supplier: string;
  /** Price relative to Supplier A. Faster delivery costs more. */
  priceFactor: number;
  leadDays: readonly [min: number, max: number];
  baseMoq: number;
  /** Chance of [limited, backorder]; the rest is in_stock. */
  shortage: readonly [limited: number, backorder: number];
}

const TIERS: readonly Tier[] = [
  { supplier: "Supplier A", priceFactor: 1.0, leadDays: [6, 8], baseMoq: 10, shortage: [0.12, 0.05] },
  { supplier: "Supplier B", priceFactor: 1.05, leadDays: [2, 3], baseMoq: 5, shortage: [0.2, 0.05] },
  { supplier: "Supplier C", priceFactor: 0.96, leadDays: [10, 14], baseMoq: 25, shortage: [0.1, 0.15] },
];

const roundTo10 = (value: number) => Math.round(value / 10) * 10;

function availability(rng: Rng, [limited, backorder]: Tier["shortage"]): SupplierAvailability {
  const roll = rng();
  if (roll < backorder) return "backorder";
  if (roll < backorder + limited) return "limited";
  return "in_stock";
}

export function buildSuppliers(products: readonly ProductRow[], rng: Rng): SupplierRow[] {
  return products.flatMap((product) => {
    const isScenario = product.sku === SCENARIO.sku;
    const basePrice = isScenario
      ? SCENARIO.supplierA.price
      : roundTo10(product.selling_price * (COST_SHARE[product.category] ?? 0.8));

    return TIERS.map((tier): SupplierRow => {
      let lead_time_days = intBetween(rng, ...tier.leadDays);
      let avail = availability(rng, tier.shortage);
      if (isScenario && tier.supplier === SCENARIO.supplierA.supplier) lead_time_days = SCENARIO.supplierA.leadDays;
      if (isScenario && tier.supplier === SCENARIO.supplierB.supplier) lead_time_days = SCENARIO.supplierB.leadDays;
      if (isScenario) avail = "in_stock";

      const purchase_price = roundTo10(basePrice * tier.priceFactor);
      if (purchase_price >= product.selling_price) {
        throw new Error(`${tier.supplier} would sell ${product.sku} at or above retail`);
      }
      return {
        supplier: tier.supplier,
        sku: product.sku,
        purchase_price,
        lead_time_days,
        moq: tier.baseMoq * (MOQ_SCALE[product.category] ?? 1),
        availability: avail,
      };
    });
  });
}
