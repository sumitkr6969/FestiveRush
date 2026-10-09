import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY } from "@/lib/config";
import { addDays } from "@/lib/dates";
import { createDb } from "@/lib/db";
import { buildSeedData } from "../scripts/seed-data";
import { writeSeed } from "../scripts/seed-data/write";

// Builds the same database `npm run seed` does, in a temp dir, and queries it.
let dir: string;
let db: Database.Database;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "voltkart-seed-"));
  db = createDb(path.join(dir, "seed.db"));
  writeSeed(db, buildSeedData(TODAY));
});

afterAll(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function one<T>(sql: string, ...params: unknown[]): T {
  return db.prepare(sql).get(...params) as T;
}

function all<T>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

const n = (sql: string, ...params: unknown[]) => one<{ n: number }>(sql, ...params).n;

describe("seed: shape", () => {
  it("is deterministic", () => {
    expect(buildSeedData(TODAY)).toEqual(buildSeedData(TODAY));
  });

  it("has exactly 6 tables", () => {
    expect(n("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).toBe(6);
  });

  it("has 12 stores, Store A to Store L, with inventory for every sku x store", () => {
    const stores = all<{ store: string }>("SELECT DISTINCT store FROM inventory ORDER BY store").map((r) => r.store);
    expect(stores).toEqual("ABCDEFGHIJKL".split("").map((l) => `Store ${l}`));
    expect(n("SELECT COUNT(*) AS n FROM inventory")).toBe(n("SELECT COUNT(*) AS n FROM products") * 12);
  });

  it("has 50+ SKUs across the 7 categories", () => {
    expect(n("SELECT COUNT(*) AS n FROM products")).toBeGreaterThanOrEqual(50);
    const categories = all<{ category: string }>("SELECT DISTINCT category FROM products ORDER BY category");
    expect(categories.map((r) => r.category)).toEqual([
      "AC", "Earphones", "Laptop", "Mobile", "Refrigerator", "TV", "Washing Machine",
    ]);
  });

  it("has 3 suppliers per SKU, each buying below selling price", () => {
    expect(n("SELECT COUNT(*) AS n FROM (SELECT sku FROM suppliers GROUP BY sku HAVING COUNT(*) <> 3)")).toBe(0);
    expect(
      n("SELECT COUNT(*) AS n FROM suppliers s JOIN products p USING (sku) WHERE s.purchase_price >= p.selling_price"),
    ).toBe(0);
  });

  it("has 10+ POs including an overdue one in the past", () => {
    expect(n("SELECT COUNT(*) AS n FROM purchase_orders")).toBeGreaterThanOrEqual(10);
    expect(n("SELECT COUNT(*) AS n FROM purchase_orders WHERE status = 'overdue' AND expected_date < ?", TODAY))
      .toBeGreaterThanOrEqual(1);
    const statuses = all<{ status: string }>("SELECT DISTINCT status FROM purchase_orders ORDER BY status");
    expect(statuses.map((r) => r.status)).toEqual(["delivered", "in_transit", "overdue"]);
  });

  it("has exactly 3 promotions: starting in 3 days, active now, ending within 3 days", () => {
    const promos = all<{ start: string; end: string }>('SELECT "start", "end" FROM promotions');
    expect(promos).toHaveLength(3);
    expect(promos.some((p) => p.start === addDays(TODAY, 3))).toBe(true);
    expect(promos.some((p) => p.start <= TODAY && p.end > addDays(TODAY, 3))).toBe(true);
    expect(promos.some((p) => p.start <= TODAY && p.end >= TODAY && p.end <= addDays(TODAY, 3))).toBe(true);
  });

  it("has 90 days of sales ending yesterday", () => {
    const range = one<{ first: string; last: string }>("SELECT MIN(date) AS first, MAX(date) AS last FROM sales");
    expect(range).toEqual({ first: addDays(TODAY, -90), last: addDays(TODAY, -1) });
  });
});

describe("seed: mandatory TV-55-SM scenario", () => {
  const since = addDays(TODAY, -30);
  const units30d = (store: string) =>
    n("SELECT SUM(qty_sold) AS n FROM sales WHERE sku = 'TV-55-SM' AND store = ? AND date >= ?", store, since);

  it("is a 55-inch Smart TV at ₹45,000", () => {
    const product = one<{ product: string; category: string; selling_price: number }>(
      "SELECT product, category, selling_price FROM products WHERE sku = 'TV-55-SM'",
    );
    expect(product.product).toContain("55-inch Smart TV");
    expect(product.category).toBe("TV");
    expect(product.selling_price).toBe(45000);
  });

  it("Store A: stock 4, exactly 2/day over the last 30 days", () => {
    expect(n("SELECT stock AS n FROM inventory WHERE sku = 'TV-55-SM' AND store = 'Store A'")).toBe(4);
    expect(units30d("Store A")).toBe(60);
  });

  it("Store B: stock 12, exactly 0.5/day over the last 30 days", () => {
    expect(n("SELECT stock AS n FROM inventory WHERE sku = 'TV-55-SM' AND store = 'Store B'")).toBe(12);
    expect(units30d("Store B")).toBe(15);
  });

  it("TV promotion starts TODAY+3 with expected_uplift 0.40", () => {
    const promo = one<{ start: string; expected_uplift: number }>(
      "SELECT \"start\", expected_uplift FROM promotions WHERE sku_or_category = 'TV'",
    );
    expect(promo).toEqual({ start: addDays(TODAY, 3), expected_uplift: 0.4 });
  });

  it("Supplier A: 7 days at ₹35,000; Supplier B: 2 days at ₹36,750 (+5%)", () => {
    const rows = all<{ supplier: string; lead_time_days: number; purchase_price: number }>(
      "SELECT supplier, lead_time_days, purchase_price FROM suppliers WHERE sku = 'TV-55-SM' ORDER BY supplier",
    );
    expect(rows[0]).toEqual({ supplier: "Supplier A", lead_time_days: 7, purchase_price: 35000 });
    expect(rows[1]).toEqual({ supplier: "Supplier B", lead_time_days: 2, purchase_price: 36750 });
  });

  it("PO-001: Supplier A, qty 10, expected TODAY-2, overdue", () => {
    expect(one("SELECT * FROM purchase_orders WHERE po = 'PO-001'")).toEqual({
      po: "PO-001",
      supplier: "Supplier A",
      sku: "TV-55-SM",
      qty: 10,
      expected_date: addDays(TODAY, -2),
      status: "overdue",
    });
  });
});

describe("seed: supporting stories", () => {
  it("includes overstocked, aged and understocked rows", () => {
    expect(n("SELECT COUNT(*) AS n FROM inventory WHERE ageing_days > 90")).toBeGreaterThanOrEqual(3);
    // Days of cover against the last 30 days' sales.
    const cover = all<{ days: number }>(
      `SELECT i.stock / (SUM(s.qty_sold) * 1.0 / COUNT(*)) AS days
         FROM inventory i JOIN sales s ON s.sku = i.sku AND s.store = i.store AND s.date >= ?
        GROUP BY i.sku, i.store HAVING SUM(s.qty_sold) > 0`,
      addDays(TODAY, -30),
    ).map((r) => r.days);
    expect(cover.filter((d) => d > 60).length).toBeGreaterThanOrEqual(3);
    expect(cover.filter((d) => d < 3).length).toBeGreaterThanOrEqual(3);
  });

  it("has a new launch whose older same-brand model sells slowly", () => {
    const launch = one<{ brand: string; launch_date: string }>(
      "SELECT brand, launch_date FROM products WHERE sku = 'MB-X14-VX'",
    );
    expect(launch.launch_date > addDays(TODAY, -30)).toBe(true);
    const old = one<{ brand: string }>("SELECT brand FROM products WHERE sku = 'MB-X12-VX'");
    expect(old.brand).toBe(launch.brand);
    const since = launch.launch_date;
    const units = (sku: string) =>
      n("SELECT SUM(qty_sold) AS n FROM sales WHERE sku = ? AND date >= ?", sku, since);
    expect(units("MB-X12-VX")).toBeLessThan(units("MB-X14-VX") / 3);
  });
});
