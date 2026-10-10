// Builds data/voltkart.db from the CSVs in data/source/ (`npm run seed`, also run by `npm run build`).
// Deterministic: the same six files always give the same database. To load an updated
// file, replace it in data/source/ (same columns, same format) and run the seed again.
import { TODAY } from "../src/lib/config";
import { createDb, DB_PATH } from "../src/lib/db";
import { loadSeedData, SOURCE_DIR } from "./seed-data";
import { writeSeed } from "./seed-data/write";

const data = loadSeedData(SOURCE_DIR); // throws with every bad value before touching the database
const db = createDb(); // deletes any existing file first, so re-runs are idempotent
writeSeed(db, data);

const one = <T>(sql: string) => db.prepare(sql).get() as T;

console.log(`Seeded ${DB_PATH} from ${SOURCE_DIR}`);
console.table(
  Object.fromEntries(
    ["products", "inventory", "sales", "suppliers", "purchase_orders", "promotions"].map((table) => [
      table,
      one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).n,
    ]),
  ),
);

const range = one<{ first: string; last: string }>("SELECT MIN(date) AS first, MAX(date) AS last FROM sales");
console.log(`Sales history ${range.first} to ${range.last}; the app's TODAY is ${TODAY}.`);
if (range.last >= TODAY) {
  console.warn(`Warning: sales run to ${range.last}, on or after TODAY. Move TODAY in src/lib/config.ts past the last sales day.`);
}
console.table(db.prepare("SELECT store, COUNT(*) AS skus, SUM(stock) AS units FROM inventory GROUP BY store ORDER BY store").all());

db.close();
