import { addDays } from "../../src/lib/dates";
import type { IsoDate, ProductRow, PromotionRow } from "../../src/lib/types";

type Promo = [skuOrCategory: string, startOffset: number, endOffset: number, discount: number, uplift: number];

// Offsets from asOf. With TODAY = Fri 2026-10-09, +7 is the following Friday.
const PROMOS: readonly Promo[] = [
  ["Televisions", 7, 16, 0.15, 0.6], // Dussehra TV fest
  ["PH-VEL-X14", 14, 31, 0.08, 0.4], // Diwali launch offer
  ["Audio", 21, 31, 0.2, 0.5], // Diwali week
  ["Home Appliances", 21, 31, 0.12, 0.35], // Diwali week
  ["Laptops", -57, -53, 0.1, 0.3], // Independence Day (past, visible in sales)
  ["PH-VEL-X12", -19, -9, 0.12, 0.25], // attempt to clear X12 (past, too small)
];

export function buildPromotions(asOf: IsoDate): PromotionRow[] {
  return PROMOS.map(([sku_or_category, startOffset, endOffset, discount, expected_uplift]) => ({
    sku_or_category,
    start: addDays(asOf, startOffset),
    end: addDays(asOf, endOffset),
    discount,
    expected_uplift,
  }));
}

/** A promotion applies when it names the SKU or the SKU's category and covers the date. */
export function activePromotion(
  product: ProductRow,
  date: IsoDate,
  promotions: readonly PromotionRow[],
): PromotionRow | undefined {
  return promotions.find(
    (p) =>
      (p.sku_or_category === product.sku || p.sku_or_category === product.category) &&
      p.start <= date &&
      date <= p.end,
  );
}
