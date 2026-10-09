import type Database from "better-sqlite3";
import type { SeedData } from "./index";

function insertMany<T>(
  db: Database.Database,
  sql: string,
  rows: readonly T[],
  toParams: (row: T) => unknown[],
): void {
  const statement = db.prepare(sql);
  for (const row of rows) statement.run(...toParams(row));
}

/** Inserts in foreign-key order inside one transaction (fast, and all-or-nothing). */
export function writeSeed(db: Database.Database, data: SeedData): void {
  db.transaction(() => {
    insertMany(
      db,
      "INSERT INTO products (sku, product, brand, category, model, selling_price, launch_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
      data.products,
      (r) => [r.sku, r.product, r.brand, r.category, r.model, r.selling_price, r.launch_date],
    );
    insertMany(
      db,
      "INSERT INTO suppliers (supplier, sku, purchase_price, lead_time_days, moq, availability) VALUES (?, ?, ?, ?, ?, ?)",
      data.suppliers,
      (r) => [r.supplier, r.sku, r.purchase_price, r.lead_time_days, r.moq, r.availability],
    );
    insertMany(
      db,
      "INSERT INTO inventory (sku, store, stock, ageing_days) VALUES (?, ?, ?, ?)",
      data.inventory,
      (r) => [r.sku, r.store, r.stock, r.ageing_days],
    );
    insertMany(
      db,
      "INSERT INTO sales (date, sku, store, qty_sold, selling_price) VALUES (?, ?, ?, ?, ?)",
      data.sales,
      (r) => [r.date, r.sku, r.store, r.qty_sold, r.selling_price],
    );
    insertMany(
      db,
      "INSERT INTO purchase_orders (po, supplier, sku, qty, expected_date, status) VALUES (?, ?, ?, ?, ?, ?)",
      data.purchaseOrders,
      (r) => [r.po, r.supplier, r.sku, r.qty, r.expected_date, r.status],
    );
    insertMany(
      db,
      'INSERT INTO promotions (sku_or_category, "start", "end", discount, expected_uplift) VALUES (?, ?, ?, ?, ?)',
      data.promotions,
      (r) => [r.sku_or_category, r.start, r.end, r.discount, r.expected_uplift],
    );
  })();
}
