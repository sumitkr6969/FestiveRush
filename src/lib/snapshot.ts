import type Database from "better-sqlite3";
import { HISTORY_DAYS, SALES_WINDOW_DAYS } from "./config";
import { addDays } from "./dates";
import { applyPoUpdates, type PoLive, type PoStatusUpdate } from "./poStatus";
import type {
  EffectivePurchaseOrder,
  InventoryRow,
  IsoDate,
  ProductRow,
  PromotionRow,
  PurchaseOrderRow,
  SupplierRow,
} from "./types";

/** Units one SKU sold at one store on one day (days without sales are absent). */
export interface DaySales {
  date: IsoDate;
  sku: string;
  store: string;
  units: number;
}

/**
 * Everything the engines read, loaded once. All SQL lives here so the analysis
 * code downstream is pure functions over plain data.
 */
export interface Snapshot {
  asOf: IsoDate;
  products: ProductRow[];
  inventory: InventoryRow[];
  suppliers: SupplierRow[];
  promotions: PromotionRow[];
  /** POs as the engine sees them: dates and status after supplier updates. */
  purchaseOrders: EffectivePurchaseOrder[];
  /** POs exactly as stored: expected_date is the date the supplier promised. */
  plannedPurchaseOrders: PurchaseOrderRow[];
  /** Live status per PO number (on time, late, delivered, with update history). */
  poLive: Record<string, PoLive>;
  /** Per-day sales in the SALES_WINDOW_DAYS before asOf, plus asOf itself (velocity input). */
  recentSales: DaySales[];
  /** Network units per day over HISTORY_DAYS before asOf (weekend multiplier input). */
  dailyUnits: { date: IsoDate; units: number }[];
}

export const cellKey = (sku: string, store: string) => `${sku}|${store}`;

/** Re-derives PO dates and lateness from supplier updates (pure; planned rows untouched). */
export function withPoUpdates(snapshot: Snapshot, updates: readonly PoStatusUpdate[]): Snapshot {
  return { ...snapshot, ...applyPoUpdates(snapshot.plannedPurchaseOrders, updates, snapshot.asOf) };
}

export function loadSnapshot(db: Database.Database, asOf: IsoDate): Snapshot {
  const all = <T>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...params) as T[];

  const planned = all<PurchaseOrderRow>("SELECT * FROM purchase_orders ORDER BY po");

  return {
    asOf,
    ...applyPoUpdates(planned, [], asOf),
    plannedPurchaseOrders: planned,
    products: all<ProductRow>("SELECT * FROM products ORDER BY sku"),
    inventory: all<InventoryRow>("SELECT * FROM inventory ORDER BY sku, store"),
    suppliers: all<SupplierRow>("SELECT * FROM suppliers ORDER BY sku, supplier"),
    promotions: all<PromotionRow>(
      `SELECT sku_or_category, promotion, "start" AS start, "end" AS end, discount, expected_uplift
         FROM promotions ORDER BY "start", sku_or_category`,
    ),
    // Includes today, so units sold at the Billing counter count at once. The source
    // sales end the day before TODAY, so the imported history is unaffected.
    recentSales: all<DaySales>(
      `SELECT date, sku, store, SUM(qty_sold) AS units FROM sales
        WHERE date >= ? AND date <= ? GROUP BY date, sku, store ORDER BY date, sku, store`,
      addDays(asOf, -SALES_WINDOW_DAYS),
      asOf,
    ),
    dailyUnits: all<{ date: IsoDate; units: number }>(
      `SELECT date, SUM(qty_sold) AS units FROM sales
        WHERE date >= ? AND date < ? GROUP BY date ORDER BY date`,
      addDays(asOf, -HISTORY_DAYS),
      asOf,
    ),
  };
}
