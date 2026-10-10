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

/** The offer as a label: a bare "10%" reads "10% off"; other wording is kept as given. */
export function offerLabel(discount: string): string {
  return /^\s*\d+(?:\.\d+)?\s*%\s*$/.test(discount) ? `${discount.trim()} off` : discount;
}

/**
 * The price cut a promotion applies to any single sale: only a flat "10%" / "10% off".
 * Conditional offers such as "Buy 2 Get 10% off" return 0, because they depend on the
 * basket and are left for the cashier to apply.
 */
export function flatDiscountRate(discount: string): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*%(?:\s*off)?\s*$/i.exec(discount);
  if (!m) return 0;
  const pct = Number(m[1]);
  return pct > 0 && pct < 100 ? pct / 100 : 0;
}
