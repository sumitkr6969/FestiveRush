import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY, WAREHOUSE } from "@/lib/config";
import { addDays } from "@/lib/dates";
import { loadSeedData, SOURCE_DIR } from "../scripts/seed-data";
import { parseCsv } from "../scripts/seed-data/csv";
import { openSeededDb, sourceData } from "./helpers/seededDb";

// The database `npm run seed` builds from data/source/*.csv, queried directly.
let db: Database.Database;
let cleanup: () => void;

beforeAll(() => {
  ({ db, cleanup } = openSeededDb());
});
afterAll(() => cleanup());

const all = <T>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...params) as T[];
const one = <T>(sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) as T;
const n = (sql: string, ...params: unknown[]) => one<{ n: number }>(sql, ...params).n;

const STORES = ["Central WH", "HSR Layout", "Indiranagar", "Jayanagar", "Koramangala", "Malleshwaram", "Whitefield"];

describe("seed: imports the source CSVs as given", () => {
  it("has exactly 6 tables", () => {
    expect(n("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).toBe(6);
  });

  it("loads every row the data README lists", () => {
    const counts = Object.fromEntries(
      ["products", "inventory", "sales", "suppliers", "purchase_orders", "promotions"].map((t) => [t, n(`SELECT COUNT(*) AS n FROM ${t}`)]),
    );
    expect(counts).toEqual({ products: 151, inventory: 1057, sales: 20919, suppliers: 231, purchase_orders: 43, promotions: 4 });
  });

  it("has six stores plus Central WH, with stock for every SKU at each", () => {
    expect(all<{ store: string }>("SELECT DISTINCT store FROM inventory ORDER BY store").map((r) => r.store)).toEqual(STORES);
    expect(STORES).toContain(WAREHOUSE);
    expect(n("SELECT COUNT(*) AS n FROM (SELECT sku FROM inventory GROUP BY sku HAVING COUNT(*) <> 7)")).toBe(0);
  });

  it("has the 11 categories in products.csv", () => {
    expect(all<{ category: string }>("SELECT DISTINCT category FROM products ORDER BY category").map((r) => r.category)).toEqual([
      "Accessories", "Air Conditioners", "Cameras", "Gaming", "Headphones", "Laptops",
      "Refrigerators", "Smartphones", "Smartwatches", "Televisions", "Washing Machines",
    ]);
  });

  it("has sales from 18 Aug up to the day before TODAY", () => {
    expect(one("SELECT MIN(date) AS first, MAX(date) AS last FROM sales")).toEqual({ first: "2026-08-18", last: addDays(TODAY, -1) });
  });

  it("keeps values exactly, normalising only the status labels", () => {
    expect(one("SELECT * FROM products WHERE sku = 'TV-55Q7'")).toEqual({
      sku: "TV-55Q7",
      product: "Samsung 55-inch 4K QLED Smart TV Q7",
      brand: "Samsung",
      category: "Televisions",
      model: "QA55Q7",
      selling_price: 58990,
      launch_date: "2026-01-20",
    });
    expect(one("SELECT * FROM purchase_orders WHERE po = 'PO-8857'")).toEqual({
      po: "PO-8857", supplier: "Reliance Digital Distribution", sku: "HP-ANC-700", qty: 40, expected_date: "2026-11-11", status: "open",
    });
    expect(all<{ status: string }>("SELECT DISTINCT status FROM purchase_orders ORDER BY status").map((r) => r.status)).toEqual(["confirmed", "open", "received"]);
    expect(all<{ a: string }>("SELECT DISTINCT availability AS a FROM suppliers ORDER BY a").map((r) => r.a)).toEqual(["in_stock", "limited"]);
  });

  it("keeps each promotion's name and offer wording", () => {
    expect(all('SELECT sku_or_category, promotion, "start", "end", discount, expected_uplift FROM promotions ORDER BY "start"')).toEqual([
      { sku_or_category: "Accessories", promotion: "Combo Offer", start: "2026-10-17", end: "2026-11-15", discount: "Buy 2 Get 10% off", expected_uplift: 0.15 },
      { sku_or_category: "Smartphones", promotion: "Weekend Phone Deals", start: "2026-11-07", end: "2026-11-08", discount: "5%", expected_uplift: 0.25 },
      { sku_or_category: "Televisions", promotion: "Wedding Season TV Fest", start: "2026-11-19", end: "2026-11-26", discount: "10%", expected_uplift: 0.4 },
      { sku_or_category: "Air Conditioners", promotion: "Winter Clearance", start: "2026-11-30", end: "2026-12-14", discount: "15%", expected_uplift: 0.3 },
    ]);
  });

  it("is deterministic", () => {
    expect(loadSeedData()).toEqual(sourceData());
  });
});

describe("seed: rejects bad source data with a clear message", () => {
  /** A copy of data/source with one file rewritten. */
  function withFile(file: string, rewrite: (text: string) => string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voltkart-source-"));
    for (const f of fs.readdirSync(SOURCE_DIR)) fs.copyFileSync(path.join(SOURCE_DIR, f), path.join(dir, f));
    fs.writeFileSync(path.join(dir, file), rewrite(fs.readFileSync(path.join(dir, file), "utf8")));
    return dir;
  }
  const loadError = (dir: string) => {
    try {
      loadSeedData(dir);
      return "";
    } catch (e) {
      return (e as Error).message;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("names the file and the columns when the header changes", () => {
    expect(loadError(withFile("inventory.csv", (t) => t.replace("ageing_days", "age")))).toMatch(/inventory\.csv: expected columns sku,store,stock,ageing_days/);
  });

  it("lists every bad value with its line number", () => {
    const msg = loadError(withFile("purchase_orders.csv", (t) => t.replace("2026-11-07,Received", "07/11/2026,Shipped")));
    expect(msg).toContain("purchase_orders.csv line 2: expected_date \"07/11/2026\" is not a YYYY-MM-DD date");
    expect(msg).toContain('purchase_orders.csv line 2: status "Shipped" is not one of received, open, confirmed');
  });

  it("refuses rows that point at unknown SKUs or suppliers", () => {
    expect(loadError(withFile("sales.csv", (t) => `${t.trimEnd()}\n2026-11-15,NOPE-1,Koramangala,1,100\n`))).toContain("sales.csv: unknown sku NOPE-1");
    expect(loadError(withFile("purchase_orders.csv", (t) => t.replace("PO-8857,Reliance Digital Distribution", "PO-8857,Brand Direct")))).toContain(
      "PO-8857 names Brand Direct for HP-ANC-700, which suppliers.csv doesn't list",
    );
  });
});

describe("csv reader", () => {
  it("handles quoted commas, escaped quotes, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n', "t.csv", ["a", "b"]);
    expect(rows).toEqual([{ line: 2, values: { a: "x, y", b: 'say "hi"' } }]);
  });
});
