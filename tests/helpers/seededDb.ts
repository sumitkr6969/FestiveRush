import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { TODAY } from "@/lib/config";
import { createDb } from "@/lib/db";
import { buildSeedData } from "../../scripts/seed-data";
import { writeSeed } from "../../scripts/seed-data/write";

/** The same database `npm run seed` builds, in a throwaway temp directory. */
export function openSeededDb(): { db: Database.Database; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voltkart-test-"));
  const db = createDb(path.join(dir, "test.db"));
  writeSeed(db, buildSeedData(TODAY));
  return {
    db,
    cleanup: () => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
