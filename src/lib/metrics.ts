import { NO_SALES_DAYS_OF_STOCK, PROJECTION_DAYS, SALES_WINDOW_DAYS } from "./config";
import { addDays, dayOfWeek, daysBetween } from "./dates";
import { cellKey, type Snapshot } from "./snapshot";
import type { IsoDate, ProductRow, PromotionRow, SupplierRow } from "./types";

/** Every number the engines need about one SKU at one store. */
export interface CellMetrics {
  sku: string;
  product: string;
  brand: string;
  category: string;
  launchDate: IsoDate;
  sellingPrice: number;
  store: string;
  stock: number;
  ageingDays: number;
  avgDailySales: number;
  daysOfStock: number;
  fastestLead: number;
  slowestLead: number;
  reorderPoint: number;
  stockoutInDays: number;
  cheapestPrice: number;
  cashTiedUp: number;
  projectedDemandWithPromo: number;
  /** stock − ceil(avgDailySales × PROJECTION_DAYS); spare units when > 0. */
  surplus: number;
  promotionStartingInDays: number | null;
}

export const round1 = (value: number) => Math.round(value * 10) / 10;

const isWeekend = (date: IsoDate) => {
  const day = dayOfWeek(date);
  return day === 0 || day === 6;
};

/**
 * Average weekend-day units ÷ average weekday units across the whole network.
 * Learned from history rather than assumed, so it tracks real shopping patterns.
 */
export function weekendMultiplier(dailyUnits: readonly { date: IsoDate; units: number }[]): number {
  const sum = { weekend: 0, weekday: 0 };
  const days = { weekend: 0, weekday: 0 };
  for (const { date, units } of dailyUnits) {
    const kind = isWeekend(date) ? "weekend" : "weekday";
    sum[kind] += units;
    days[kind] += 1;
  }
  if (days.weekend === 0 || days.weekday === 0 || sum.weekday === 0) return 1;
  return sum.weekend / days.weekend / (sum.weekday / days.weekday);
}

export function promotionsFor(product: ProductRow, promotions: readonly PromotionRow[]): PromotionRow[] {
  return promotions.filter((p) => p.sku_or_category === product.sku || p.sku_or_category === product.category);
}

/**
 * Σ over the next PROJECTION_DAYS of avgDailySales × day shape × (1 + uplift).
 * avgDailySales already blends weekdays and weekends, so the day shape is
 * normalised to average 1 over a week: it redistributes demand, never inflates it.
 */
export function projectDemand(
  avgDailySales: number,
  asOf: IsoDate,
  promos: readonly PromotionRow[],
  weekendFactor: number,
): number {
  const weekMean = (5 + 2 * weekendFactor) / 7;
  let total = 0;
  for (let d = 0; d < PROJECTION_DAYS; d += 1) {
    const date = addDays(asOf, d);
    const shape = (isWeekend(date) ? weekendFactor : 1) / weekMean;
    const promo = promos.find((p) => p.start <= date && date <= p.end);
    total += avgDailySales * shape * (1 + (promo?.expected_uplift ?? 0));
  }
  return round1(total);
}

/** Leads from suppliers that can actually ship; if all are on backorder, use them all. */
function leadRange(suppliers: readonly SupplierRow[]): { fastest: number; slowest: number } {
  const usable = suppliers.filter((s) => s.availability !== "backorder");
  const leads = (usable.length > 0 ? usable : suppliers).map((s) => s.lead_time_days);
  return { fastest: Math.min(...leads), slowest: Math.max(...leads) };
}

function nextPromotionInDays(asOf: IsoDate, promos: readonly PromotionRow[]): number | null {
  const upcoming = promos.filter((p) => p.end >= asOf).map((p) => Math.max(0, daysBetween(asOf, p.start)));
  return upcoming.length > 0 ? Math.min(...upcoming) : null;
}

export function computeMetrics(snapshot: Snapshot): CellMetrics[] {
  const { asOf } = snapshot;
  const weekendFactor = weekendMultiplier(snapshot.dailyUnits);
  const products = new Map(snapshot.products.map((p) => [p.sku, p]));
  const suppliersBySku = new Map<string, SupplierRow[]>();
  for (const s of snapshot.suppliers) suppliersBySku.set(s.sku, [...(suppliersBySku.get(s.sku) ?? []), s]);

  return snapshot.inventory.map((row): CellMetrics => {
    const product = products.get(row.sku);
    const suppliers = suppliersBySku.get(row.sku) ?? [];
    if (!product || suppliers.length === 0) throw new Error(`Missing product or suppliers for ${row.sku}`);

    // A SKU launched 21 days ago has only 21 days of sales: dividing by 30 would
    // understate its rate by 30%, so divide by the days it has actually been on sale.
    const daysOnSale = Math.max(1, Math.min(SALES_WINDOW_DAYS, daysBetween(product.launch_date, asOf)));
    const avgDailySales = (snapshot.recentUnits.get(cellKey(row.sku, row.store)) ?? 0) / daysOnSale;
    const daysOfStock = avgDailySales > 0 ? round1(row.stock / avgDailySales) : NO_SALES_DAYS_OF_STOCK;
    const { fastest, slowest } = leadRange(suppliers);
    const cheapestPrice = Math.min(...suppliers.map((s) => s.purchase_price));
    const promos = promotionsFor(product, snapshot.promotions);

    return {
      sku: row.sku,
      product: product.product,
      brand: product.brand,
      category: product.category,
      launchDate: product.launch_date,
      sellingPrice: product.selling_price,
      store: row.store,
      stock: row.stock,
      ageingDays: row.ageing_days,
      avgDailySales: Math.round(avgDailySales * 1000) / 1000,
      daysOfStock,
      fastestLead: fastest,
      slowestLead: slowest,
      // Units that sell while the fastest order is in transit.
      reorderPoint: round1(avgDailySales * fastest),
      stockoutInDays: daysOfStock,
      cheapestPrice,
      // Valued at the cheapest replacement cost: what this stock would cost to rebuy.
      cashTiedUp: row.stock * cheapestPrice,
      projectedDemandWithPromo: projectDemand(avgDailySales, asOf, promos, weekendFactor),
      surplus: row.stock - Math.ceil(avgDailySales * PROJECTION_DAYS),
      promotionStartingInDays: nextPromotionInDays(asOf, promos),
    };
  });
}
