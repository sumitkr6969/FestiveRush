import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY, WAREHOUSE } from "@/lib/config";
import { baselineUnits, projectDemand, weekendMultiplier } from "@/lib/metrics";
import { analyzeStockLevels, modelLine } from "@/lib/stockAnalyzer";
import type { PromotionRow } from "@/lib/types";
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

describe("analyzeStockLevels: TV-55Q7 before the Wedding Season TV Fest", () => {
  it("Koramangala is CRITICAL: 2.4 days of stock and the +40% fest starts in 3 days", () => {
    const k = analysis.understocked.find((u) => u.sku === "TV-55Q7" && u.store === "Koramangala");
    expect(k).toMatchObject({
      stock: 4,
      avgDailySales: 1.7, // 51 units in the 30 days to 15 Nov
      daysOfStock: 2.4,
      stockoutInDays: 2.4,
      reorderPoint: 3.4, // 1.7/day x Redington India's 2-day lead
      promotionStartingInDays: 3,
      severity: "CRITICAL",
    });
    expect(k?.otherStoresWithSurplus[0]).toBe("Malleshwaram");
  });

  it("Malleshwaram is overstocked at 36 days and slow-moving", () => {
    expect(analysis.overstocked.find((o) => o.sku === "TV-55Q7" && o.store === "Malleshwaram")).toMatchObject({
      stock: 18,
      avgDailySales: 0.5,
      daysOfStock: 36,
      reason: "slow_moving",
      cashTiedUp: 18 * 46200, // Brand Direct, the cheapest supplier
      otherStoresNeeding: ["Koramangala"],
    });
  });
});

describe("analyzeStockLevels: Central WH", () => {
  const wh = () => [...analysis.overstocked, ...analysis.understocked, ...analysis.balanced].filter((c) => c.store === WAREHOUSE);

  it("is never understocked: it sells nothing itself", () => {
    expect(wh()).toHaveLength(151);
    expect(analysis.understocked.some((u) => u.store === WAREHOUSE)).toBe(false);
  });

  it("measures its cover against the stores' sales: 40 x G12 feed 57 days of the network", () => {
    expect(analysis.overstocked.find((o) => o.sku === "LAP-I5-G12" && o.store === WAREHOUSE)).toMatchObject({
      stock: 40,
      avgDailySales: 0,
      daysOfStock: 57.1,
      reason: "new_launch_cannibalized",
    });
  });
});

describe("analyzeStockLevels: invariants", () => {
  it("puts every sku x location in exactly one of the three lists", () => {
    const keys = [...analysis.overstocked, ...analysis.understocked, ...analysis.balanced].map((i) => `${i.sku}|${i.store}`);
    const inventoryRows = (db.prepare("SELECT COUNT(*) AS n FROM inventory").get() as { n: number }).n;
    expect(keys).toHaveLength(inventoryRows);
    expect(new Set(keys).size).toBe(inventoryRows);
  });

  it("blames only the Inspiron 15 13th Gen launch, and only on the 12th Gen", () => {
    const cannibalised = analysis.overstocked.filter((o) => o.reason === "new_launch_cannibalized");
    expect([...new Set(cannibalised.map((o) => o.sku))]).toEqual(["LAP-I5-G12"]);
    expect(analysis.overstocked.filter((o) => o.reason === "aged").map((o) => o.sku).sort()).toEqual([...Array(7).fill("REF-DD-190"), "WM-FL-8KG"]);
  });

  it("summarises totals from the lists", () => {
    expect(analysis.summary.totalSkus).toBe(151);
    expect(analysis.summary.totalStores).toBe(6);
    expect(analysis.summary.totalOverstockedValue).toBe(analysis.overstocked.reduce((s, o) => s + o.cashTiedUp, 0));
    expect(analysis.summary.totalUnderstockedRisk).toBeGreaterThan(0);
  });

  it("returns deep-equal output for the same input", () => {
    expect(analyzeStockLevels(db, TODAY)).toEqual(analysis);
  });
});

describe("modelLine", () => {
  it("groups generations of one model and leaves bare codes alone", () => {
    expect(modelLine("INS15-G12")).toBe("INS15");
    expect(modelLine("INS15-G13")).toBe("INS15");
    expect(modelLine("DE263")).toBeNull();
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
    const promo: PromotionRow = { sku_or_category: "Televisions", promotion: "TV Fest", start: "2026-11-19", end: "2026-11-28", discount: "10%", expected_uplift: 0.4 };
    // 10 promo days at +40% on top of 28 → 36 with a flat week.
    expect(projectDemand(2, TODAY, [promo], 1)).toBeCloseTo(36, 1);
  });

  it("takes promotion uplift out of past sales so it isn't forecast twice", () => {
    const tv = { sku: "T1", product: "TV", brand: "B", category: "Televisions", model: "M", selling_price: 1, launch_date: "2026-01-01" };
    const promo: PromotionRow = { sku_or_category: "Televisions", promotion: "Fest", start: "2026-11-10", end: "2026-11-10", discount: "10%", expected_uplift: 0.4 };
    const sales = [
      { date: "2026-11-09", sku: "T1", store: "S", units: 2 },
      { date: "2026-11-10", sku: "T1", store: "S", units: 7 }, // 7 / 1.4 = 5 baseline units
    ];
    expect(baselineUnits(sales, [tv], [promo]).get("T1|S")).toBeCloseTo(7);
  });
});
