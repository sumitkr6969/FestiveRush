import { addDays } from "../../src/lib/dates";
import type { IsoDate, ProductRow, PromotionRow } from "../../src/lib/types";
import { SCENARIO } from "./scenario";

type Promo = [skuOrCategory: string, startOffset: number, endOffset: number, discount: number, uplift: number];

const { promo } = SCENARIO;

// Exactly three, offsets from asOf.
const PROMOS: readonly Promo[] = [
  [promo.category, promo.startOffset, promo.endOffset, promo.discount, promo.uplift], // starts in 3 days
  ["Earphones", -5, 9, 0.15, 0.35], // active now
  ["Washing Machine", -10, 2, 0.1, 0.25], // ends within 3 days
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
