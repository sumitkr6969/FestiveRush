// Builds data/voltkart.db from scratch (`npm run seed`, also run by `npm run build`).
// Deterministic: seeded PRNG only, every date relative to TODAY.
import { TODAY } from "../src/lib/config";
import { addDays } from "../src/lib/dates";
import { createDb, DB_PATH } from "../src/lib/db";
import { buildSeedData } from "./seed-data";
import { SCENARIO } from "./seed-data/scenario";
import { writeSeed } from "./seed-data/write";

const data = buildSeedData(TODAY);
const db = createDb(); // deletes any existing file first, so re-runs are idempotent
writeSeed(db, data);

console.log(`Seeded ${DB_PATH} as of ${TODAY}\n`);
console.log("Row counts");
console.table(
  Object.fromEntries(
    ["products", "inventory", "sales", "suppliers", "purchase_orders", "promotions"].map((table) => [
      table,
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
    ]),
  ),
);

const sku = SCENARIO.sku;
const show = (title: string, sql: string, ...params: unknown[]) => {
  console.log(title);
  console.table(db.prepare(sql).all(...params));
};

show("Scenario: product", "SELECT * FROM products WHERE sku = ?", sku);
show(
  "Scenario: stock and last-30-day sales",
  `SELECT i.store, i.stock, i.ageing_days, SUM(s.qty_sold) AS units_30d,
          ROUND(SUM(s.qty_sold) / 30.0, 2) AS per_day
     FROM inventory i JOIN sales s ON s.sku = i.sku AND s.store = i.store AND s.date >= ?
    WHERE i.sku = ? AND i.store IN (?, ?) GROUP BY i.store`,
  addDays(TODAY, -30), sku, SCENARIO.storeA.store, SCENARIO.storeB.store,
);
show("Scenario: suppliers", "SELECT * FROM suppliers WHERE sku = ? ORDER BY supplier", sku);
show("Scenario: promotion", "SELECT * FROM promotions WHERE sku_or_category = ?", SCENARIO.promo.category);
show("Scenario: purchase order", "SELECT * FROM purchase_orders WHERE po = ?", SCENARIO.po.po);

db.close();
