import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY } from "@/lib/config";
import { projectDemand, weekendMultiplier } from "@/lib/metrics";
import { analyzeStockLevels } from "@/lib/stockAnalyzer";
import type { StockAnalysis } from "@/lib/types";
import { openSeededDb } from "./helpers/seededDb";

let db: Database.Database;
let cleanup: () => void;
let analysis: StockAnalysis;

beforeAll(() => {
  ({ db, cleanup } = openSeededDb());
  analysis = analyzeStockLevels(db, TODAY);
});
afterAll(() => cleanup());

describe("analyzeStockLevels: TV-55-SM scenario", () => {
  it("Store A is CRITICAL with 2 days of stock and a promotion in 3 days", () => {
    const a = analysis.understocked.find((u) => u.sku === "TV-55-SM" && u.store === "Store A");
    expect(a).toMatchObject({
      stock: 4,
      avgDailySales: 2,
      daysOfStock: 2,
      stockoutInDays: 2,
      reorderPoint: 4,
      promotionStartingInDays: 3,
      severity: "CRITICAL",
    });
    expect(a?.otherStoresWithSurplus[0]).toBe("Store B");
  });

  it("Store B is overstocked at 24 days and slow-moving", () => {
    const b = analysis.overstocked.find((o) => o.sku === "TV-55-SM" && o.store === "Store B");
    expect(b).toMatchObject({
      stock: 12,
      avgDailySales: 0.5,
      daysOfStock: 24,
      reason: "slow_moving",
      cashTiedUp: 12 * 33600,
      otherStoresNeeding: ["Store A"],
    });
  });
});

describe("analyzeStockLevels: invariants", () => {
  it("puts every sku x store in exactly one of the three lists", () => {
    const keys = [...analysis.overstocked, ...analysis.understocked, ...analysis.balanced].map((i) => `${i.sku}|${i.store}`);
    const inventoryRows = (db.prepare("SELECT COUNT(*) AS n FROM inventory").get() as { n: number }).n;
    expect(keys).toHaveLength(inventoryRows);
    expect(new Set(keys).size).toBe(inventoryRows);
  });

  it("labels the cannibalised old model and the aged rows", () => {
    const x12 = analysis.overstocked.filter((o) => o.sku === "MB-X12-VX");
    expect(x12.length).toBeGreaterThan(0);
    expect(x12.every((o) => o.reason === "new_launch_cannibalized")).toBe(true);
    expect(analysis.overstocked.some((o) => o.reason === "aged")).toBe(true);
  });

  it("summarises totals from the lists", () => {
    expect(analysis.summary.totalSkus).toBe(54);
    expect(analysis.summary.totalStores).toBe(12);
    expect(analysis.summary.totalOverstockedValue).toBe(analysis.overstocked.reduce((s, o) => s + o.cashTiedUp, 0));
    expect(analysis.summary.totalUnderstockedRisk).toBeGreaterThan(0);
  });

  it("returns deep-equal output for the same input", () => {
    expect(analyzeStockLevels(db, TODAY)).toEqual(analysis);
  });
});

describe("demand helpers", () => {
  it("learns the weekend multiplier from history", () => {
    // Fri 2026-10-09 weekday 10, Sat/Sun 14 → 1.4.
    const days = [
      { date: "2026-10-09", units: 10 },
      { date: "2026-10-10", units: 14 },
      { date: "2026-10-11", units: 14 },
      { date: "2026-10-12", units: 10 },
    ];
    expect(weekendMultiplier(days)).toBeCloseTo(1.4);
  });

  it("weekend shape redistributes demand but never inflates it", () => {
    // 14 days = exactly two weeks, so without promos the total is avg × 14.
    expect(projectDemand(2, TODAY, [], 1.4)).toBeCloseTo(28, 1);
  });

  it("adds promotion uplift only on promotion days", () => {
    const promo = { sku_or_category: "TV", start: "2026-10-12", end: "2026-10-21", discount: 0.1, expected_uplift: 0.4 };
    // 10 promo days at +40% on top of 28 → 36 with a flat week.
    expect(projectDemand(2, TODAY, [promo], 1)).toBeCloseTo(36, 1);
  });
});
