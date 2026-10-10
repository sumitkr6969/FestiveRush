import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "@/lib/db";

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "voltkart-schema-"));
  db = createDb(path.join(dir, "test.db"));
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function names(type: "table" | "index"): string[] {
  return db
    .prepare<[string], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all(type)
    .map((row) => row.name);
}

describe("schema.sql", () => {
  it("has exactly the 6 allowed tables (CLAUDE.md rule 2)", () => {
    expect(names("table")).toEqual([
      "inventory",
      "products",
      "promotions",
      "purchase_orders",
      "sales",
      "suppliers",
    ]);
  });

  it("has the sales and inventory indexes", () => {
    expect(names("index")).toEqual(["idx_inventory_store", "idx_sales_sku_store_date"]);
  });

  it("rejects dates that are not YYYY-MM-DD", () => {
    const insert = db.prepare(
      "INSERT INTO products VALUES ('TV-1', 'TV', 'Brand', 'TV', 'M1', 1000, ?)",
    );
    expect(() => insert.run("09/10/2026")).toThrow(/CHECK/);
    expect(() => insert.run("2026-10-09")).not.toThrow();
  });

  it("enforces foreign keys", () => {
    expect(() =>
      db.prepare("INSERT INTO inventory VALUES ('NOPE', 'Koramangala', 1, 0)").run(),
    ).toThrow(/FOREIGN KEY/);
  });
});
