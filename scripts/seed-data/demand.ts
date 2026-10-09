import { dayOfWeek, daysBetween } from "../../src/lib/dates";
import type { IsoDate, PromotionRow } from "../../src/lib/types";
import { STORE_POPULARITY, type ProductSpec } from "./catalog";
import { activePromotion } from "./promotions";

const WEEKEND_FACTOR = 1.4;
/** Festival spike over the last 10 days of history. */
const FESTIVAL_DAYS = 10;
const FESTIVAL_FACTOR = 1.5;

/** Expected units sold of one SKU at one store on one day, before noise. */
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
    spec.baseDailyPerStore * (STORE_POPULARITY[store] ?? 1) * (spec.demandFactor?.(offset) ?? 1);
  const weekday = dayOfWeek(date);
  if (weekday === 0 || weekday === 6) rate *= WEEKEND_FACTOR;
  if (offset >= -FESTIVAL_DAYS) rate *= FESTIVAL_FACTOR;
  const promo = activePromotion(spec.row, date, promotions);
  if (promo) rate *= 1 + promo.expected_uplift;
  return rate;
}
