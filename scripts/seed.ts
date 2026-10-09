// Builds the read-only SQLite file at build time (`npm run seed`, also run by `npm run build`).
import { TODAY } from "../src/lib/config";
import { createDb, DB_PATH } from "../src/lib/db";
import { buildSeedData } from "./seed-data";
import { writeSeed } from "./seed-data/write";

const data = buildSeedData(TODAY);
const db = createDb();
writeSeed(db, data);
db.close();

console.log(`Seeded ${DB_PATH} as of ${TODAY}`);
console.table(Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])));
