import type Database from "better-sqlite3";
import { HISTORY_DAYS, SALES_WINDOW_DAYS } from "./config";
import { addDays } from "./dates";
import type {
  InventoryRow,
  IsoDate,
  ProductRow,
  PromotionRow,
  PurchaseOrderRow,
  SupplierRow,
} from "./types";

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
  purchaseOrders: PurchaseOrderRow[];
  /** Units sold per `sku|store` in the SALES_WINDOW_DAYS before asOf. */
  recentUnits: Map<string, number>;
  /** Network units per day over HISTORY_DAYS before asOf (weekend multiplier input). */
  dailyUnits: { date: IsoDate; units: number }[];
}

export const cellKey = (sku: string, store: string) => `${sku}|${store}`;

export function loadSnapshot(db: Database.Database, asOf: IsoDate): Snapshot {
  const all = <T>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...params) as T[];

  const recent = all<{ sku: string; store: string; units: number }>(
    `SELECT sku, store, SUM(qty_sold) AS units FROM sales
      WHERE date >= ? AND date < ? GROUP BY sku, store`,
    addDays(asOf, -SALES_WINDOW_DAYS),
    asOf,
  );

  return {
    asOf,
    products: all<ProductRow>("SELECT * FROM products ORDER BY sku"),
    inventory: all<InventoryRow>("SELECT * FROM inventory ORDER BY sku, store"),
    suppliers: all<SupplierRow>("SELECT * FROM suppliers ORDER BY sku, supplier"),
    promotions: all<PromotionRow>(
      `SELECT sku_or_category, "start" AS start, "end" AS end, discount, expected_uplift
         FROM promotions ORDER BY "start", sku_or_category`,
    ),
    purchaseOrders: all<PurchaseOrderRow>("SELECT * FROM purchase_orders ORDER BY po"),
    recentUnits: new Map(recent.map((r) => [cellKey(r.sku, r.store), r.units])),
    dailyUnits: all<{ date: IsoDate; units: number }>(
      `SELECT date, SUM(qty_sold) AS units FROM sales
        WHERE date >= ? AND date < ? GROUP BY date ORDER BY date`,
      addDays(asOf, -HISTORY_DAYS),
      asOf,
    ),
  };
}
