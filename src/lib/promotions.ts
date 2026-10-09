import { PROMO_ENDING_SOON_DAYS, PROMO_STARTING_SOON_DAYS } from "./config";
import { daysBetween } from "./dates";
import type { IsoDate, PromotionRow } from "./types";

// Pure promotion helpers shared by the API views and the browser.

export type PromotionStatus = "starting_soon" | "upcoming" | "active" | "ending_soon" | "ended";

/** Live means running today: start <= asOf <= end. */
export function isLive(p: PromotionRow, asOf: IsoDate): boolean {
  return p.start <= asOf && asOf <= p.end;
}

export function promotionStatus(p: PromotionRow, asOf: IsoDate): PromotionStatus {
  if (p.end < asOf) return "ended";
  if (p.start > asOf) return daysBetween(asOf, p.start) <= PROMO_STARTING_SOON_DAYS ? "starting_soon" : "upcoming";
  return daysBetween(asOf, p.end) <= PROMO_ENDING_SOON_DAYS ? "ending_soon" : "active";
}

/** A promotion names either one SKU or a whole category. */
export function promotionCovers(p: Pick<PromotionRow, "sku_or_category">, sku: string, category: string): boolean {
  return p.sku_or_category === sku || p.sku_or_category === category;
}
