import type Database from "better-sqlite3";
import { HISTORY_DAYS } from "./config";
import { addDays } from "./dates";
import type { IsoDate } from "./types";

export interface SalesDay {
  date: IsoDate;
  category: string;
  units: number;
  /** INR actually charged (promotion prices included). */
  revenue: number;
}

/** Daily units and revenue per category over the HISTORY_DAYS before asOf. */
export function loadSalesSeries(db: Database.Database, asOf: IsoDate): SalesDay[] {
  return db
    .prepare(
      `SELECT s.date, p.category, SUM(s.qty_sold) AS units, SUM(s.qty_sold * s.selling_price) AS revenue
         FROM sales s JOIN products p ON p.sku = s.sku
        WHERE s.date >= ? AND s.date < ?
        GROUP BY s.date, p.category
        ORDER BY s.date, p.category`,
    )
    .all(addDays(asOf, -HISTORY_DAYS), asOf) as SalesDay[];
}
