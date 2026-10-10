import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { createDb } from "@/lib/db";
import { loadSeedData, type SeedData } from "../../scripts/seed-data";
import { writeSeed } from "../../scripts/seed-data/write";

// Parsing 21k sales rows once per test run is plenty.
let cached: SeedData | null = null;
export const sourceData = (): SeedData => (cached ??= loadSeedData());

/** The same database `npm run seed` builds from data/source/, in a throwaway temp directory. */
export function openSeededDb(): { db: Database.Database; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voltkart-test-"));
  const db = createDb(path.join(dir, "test.db"));
  writeSeed(db, sourceData());
  return {
    db,
    cleanup: () => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
