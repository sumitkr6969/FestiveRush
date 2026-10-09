import { addDays } from "../../src/lib/dates";
import type { InventoryRow, IsoDate, ProductRow, SalesRow } from "../../src/lib/types";
import { NEW_LAUNCH_SKU, OLD_MODEL_SKU, STORES } from "./catalog";
import { intBetween, type Rng } from "./random";
import { SCENARIO } from "./scenario";

/** Cover is measured against the last 30 days of sales. */
const VELOCITY_DAYS = 30;
const NORMAL_COVER_DAYS = [7, 20] as const;
const NORMAL_AGEING_DAYS = [5, 60] as const;

/** Either an exact stock figure or a target days-of-cover against recent sales. */
type Override = { sku: string; store: string; ageingDays: number } & (
  | { stock: number }
  | { coverDays: number }
);

/** Deliberate problem rows. They replace the generated values for those cells. */
const OVERRIDES: readonly Override[] = [
  // Mandatory scenario.
  { sku: SCENARIO.sku, store: SCENARIO.storeA.store, stock: SCENARIO.storeA.stock, ageingDays: SCENARIO.storeA.ageingDays },
  { sku: SCENARIO.sku, store: SCENARIO.storeB.store, stock: SCENARIO.storeB.stock, ageingDays: SCENARIO.storeB.ageingDays },
  // Old model cannibalised by the new launch: overstocked and aged.
  { sku: OLD_MODEL_SKU, store: "Store C", coverDays: 110, ageingDays: 120 },
  { sku: OLD_MODEL_SKU, store: "Store D", coverDays: 95, ageingDays: 105 },
  { sku: OLD_MODEL_SKU, store: "Store E", coverDays: 120, ageingDays: 130 },
  // Hot new launch running short before its PO lands.
  { sku: NEW_LAUNCH_SKU, store: "Store A", coverDays: 2, ageingDays: 4 },
  { sku: NEW_LAUNCH_SKU, store: "Store C", coverDays: 1.5, ageingDays: 3 },
  // Overstocked and aged (> 90 days).
  { sku: "AC-15-PL", store: "Store F", coverDays: 150, ageingDays: 160 },
  { sku: "WM-8-FL", store: "Store G", coverDays: 75, ageingDays: 95 },
  { sku: "TV-65-QL", store: "Store K", coverDays: 95, ageingDays: 130 },
  // Overstocked but fresh.
  { sku: "RF-340-FL", store: "Store H", coverDays: 60, ageingDays: 45 },
  { sku: "LP-15-ZN", store: "Store L", coverDays: 70, ageingDays: 30 },
  // Understocked.
  { sku: "LP-14-KV", store: "Store I", coverDays: 1.5, ageingDays: 3 },
  { sku: "EP-TWS-SQ", store: "Store J", coverDays: 2, ageingDays: 5 },
  { sku: "MB-N5-NX", store: "Store A", coverDays: 2.5, ageingDays: 8 },
];

/**
 * Average daily units over the last VELOCITY_DAYS. Sales has one row per day from
 * launch, so dividing by row count gives "since launch" for newer SKUs.
 */
function recentVelocity(sales: readonly SalesRow[], asOf: IsoDate) {
  const since = addDays(asOf, -VELOCITY_DAYS);
  const units = new Map<string, number>();
  const days = new Map<string, number>();
  for (const row of sales) {
    if (row.date < since) continue;
    const key = `${row.sku}|${row.store}`;
    units.set(key, (units.get(key) ?? 0) + row.qty_sold);
    days.set(key, (days.get(key) ?? 0) + 1);
  }
  return (sku: string, store: string): number => {
    const key = `${sku}|${store}`;
    const observed = days.get(key) ?? 0;
    return observed === 0 ? 0 : (units.get(key) ?? 0) / observed;
  };
}

export function generateInventory(
  products: readonly ProductRow[],
  sales: readonly SalesRow[],
  asOf: IsoDate,
  rng: Rng,
): InventoryRow[] {
  const velocity = recentVelocity(sales, asOf);
  const overrides = new Map(OVERRIDES.map((o) => [`${o.sku}|${o.store}`, o]));

  return products.flatMap((product) =>
    STORES.map((store): InventoryRow => {
      const override = overrides.get(`${product.sku}|${store}`);
      const rate = velocity(product.sku, store);
      if (override) {
        const stock = "stock" in override ? override.stock : Math.max(1, Math.round(rate * override.coverDays));
        return { sku: product.sku, store, stock, ageing_days: override.ageingDays };
      }
      // Most cells carry 7–20 days of cover; at least one display unit per store.
      const cover = NORMAL_COVER_DAYS[0] + rng() * (NORMAL_COVER_DAYS[1] - NORMAL_COVER_DAYS[0]);
      const stock = Math.max(1, Math.round(rate * cover));
      return { sku: product.sku, store, stock, ageing_days: intBetween(rng, ...NORMAL_AGEING_DAYS) };
    }),
  );
}
