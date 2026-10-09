import { dayOfWeek, daysBetween } from "../../src/lib/dates";
import type { IsoDate, PromotionRow } from "../../src/lib/types";
import { STORE_TRAFFIC, type ProductSpec } from "./catalog";
import { activePromotion } from "./promotions";

const WEEKEND_FACTOR = 1.3;
/** Festive-season lift over the last two weeks of history. */
const FESTIVE_RAMP_DAYS = 14;
const FESTIVE_FACTOR = 1.25;

/**
 * Story-specific demand per (SKU, store), on top of store traffic.
 * The hero TV flies off the shelf in Koramangala and Indiranagar but barely moves
 * in Whitefield and Yelahanka: the "same TV gathering dust in another store".
 */
const SKU_STORE_DEMAND: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  "TV-LUM-55Q": { Koramangala: 2.2, Indiranagar: 1.6, Whitefield: 0.15, Yelahanka: 0.3 },
  "LP-KOR-14": { Hebbal: 1.8 },
  "AU-SON-TWS": { Marathahalli: 1.5 },
};

/** Expected units sold of one SKU at one store on one day (the Poisson mean). */
export function expectedDemand(
  spec: ProductSpec,
  store: string,
  date: IsoDate,
  asOf: IsoDate,
  promotions: readonly PromotionRow[],
): number {
  if (date < spec.row.launch_date) return 0;
  const offset = daysBetween(asOf, date);
  let rate =
    spec.baseDailyPerStore *
    (STORE_TRAFFIC[store] ?? 1) *
    (SKU_STORE_DEMAND[spec.row.sku]?.[store] ?? 1) *
    (spec.demandFactor?.(offset) ?? 1);
  const weekday = dayOfWeek(date);
  if (weekday === 0 || weekday === 6) rate *= WEEKEND_FACTOR;
  if (offset >= -FESTIVE_RAMP_DAYS) rate *= FESTIVE_FACTOR;
  const promo = activePromotion(spec.row, date, promotions);
  if (promo) rate *= 1 + promo.expected_uplift;
  return rate;
}
