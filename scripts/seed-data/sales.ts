import { addDays } from "../../src/lib/dates";
import type { IsoDate, PromotionRow, SalesRow } from "../../src/lib/types";
import { STORES, type ProductSpec } from "./catalog";
import { expectedDemand } from "./demand";
import { activePromotion } from "./promotions";
import { poisson, type Rng } from "./random";

/** Days of history, ending the day before asOf (today's sales aren't complete yet). */
export const SALES_HISTORY_DAYS = 90;

export function generateSales(
  specs: readonly ProductSpec[],
  promotions: readonly PromotionRow[],
  asOf: IsoDate,
  rng: Rng,
): SalesRow[] {
  const rows: SalesRow[] = [];
  for (let offset = -SALES_HISTORY_DAYS; offset <= -1; offset += 1) {
    const date = addDays(asOf, offset);
    for (const spec of specs) {
      const promo = activePromotion(spec.row, date, promotions);
      const selling_price = promo
        ? Math.round(spec.row.selling_price * (1 - promo.discount))
        : spec.row.selling_price;
      for (const store of STORES) {
        const qty_sold = poisson(rng, expectedDemand(spec, store, date, asOf, promotions));
        // Zero-sales days get no row, as in a real POS export.
        if (qty_sold > 0) rows.push({ date, sku: spec.row.sku, store, qty_sold, selling_price });
      }
    }
  }
  return rows;
}
