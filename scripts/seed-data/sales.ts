import { addDays } from "../../src/lib/dates";
import type { IsoDate, PromotionRow, SalesRow } from "../../src/lib/types";
import { STORES, type ProductSpec } from "./catalog";
import { expectedDemand } from "./demand";
import { activePromotion } from "./promotions";
import type { Rng } from "./random";
import { scenarioDailyQty } from "./scenario";

/** Days of history, ending the day before asOf (today's sales aren't complete yet). */
export const SALES_HISTORY_DAYS = 90;
/** ±15% multiplicative noise on each day's rate: "light", so patterns stay visible. */
const NOISE = 0.15;

/**
 * Units are whole, rates are fractional (0.3/day). Carrying the remainder forward
 * means a 0.3/day SKU sells exactly ~9 units a month instead of rounding to 0 daily,
 * so the averages the engines compute match the intended rates.
 */
export function generateSales(
  specs: readonly ProductSpec[],
  promotions: readonly PromotionRow[],
  asOf: IsoDate,
  rng: Rng,
): SalesRow[] {
  const rows: SalesRow[] = [];
  for (const spec of specs) {
    const { sku, launch_date, selling_price: listPrice } = spec.row;
    for (const store of STORES) {
      let carry = rng(); // random phase so stores don't all sell on the same day
      for (let offset = -SALES_HISTORY_DAYS; offset <= -1; offset += 1) {
        const date = addDays(asOf, offset);
        if (date < launch_date) continue;

        const promo = activePromotion(spec.row, date, promotions);
        const selling_price = promo ? Math.round(listPrice * (1 - promo.discount)) : listPrice;

        let qty_sold = scenarioDailyQty(sku, store, offset);
        if (qty_sold === undefined) {
          const noise = 1 + NOISE * (2 * rng() - 1);
          carry += expectedDemand(spec, store, date, asOf, promotions) * noise;
          qty_sold = Math.floor(carry);
          carry -= qty_sold;
        }
        rows.push({ date, sku, store, qty_sold, selling_price });
      }
    }
  }
  return rows;
}
