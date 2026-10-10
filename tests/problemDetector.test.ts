import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY } from "@/lib/config";
import type { Problem, ProblemType } from "@/lib/decisionTypes";
import { detectProblems } from "@/lib/problemDetector";
import { openSeededDb } from "./helpers/seededDb";

let db: Database.Database;
let cleanup: () => void;
let problems: Problem[];

beforeAll(() => {
  ({ db, cleanup } = openSeededDb());
  problems = detectProblems(db, TODAY);
});
afterAll(() => cleanup());

const find = (id: string) => problems.find((p) => p.id === id);

describe("detectProblems", () => {
  it("finds all seven problem types in the seed data", () => {
    const types = new Set(problems.map((p) => p.type));
    const all: ProblemType[] = [
      "STOCKOUT_BEFORE_REPLENISHMENT",
      "AGEING_STOCK",
      "DEMAND_SPIKE",
      "NEW_LAUNCH_CANNIBALIZATION",
      "SUPPLIER_TRADEOFF",
      "STORE_IMBALANCE",
      "LATE_PO_GAP",
    ];
    expect([...types].sort()).toEqual([...all].sort());
  });

  it("flags PO-8857 as 5 days late with no new date", () => {
    const late = find("LATE_PO_GAP:PO-8857");
    expect(late).toMatchObject({ severity: "CRITICAL", store: "Indiranagar", sku: "HP-ANC-700" });
    expect(late?.evidence).toMatchObject({
      po: "PO-8857",
      supplier: "Reliance Digital Distribution",
      qty: 40,
      promisedDate: "2026-11-11",
      currentEta: null,
      daysLate: 5,
      firstStockoutStore: "Indiranagar",
      firstStockoutDate: "2026-11-17",
    });
    expect(Number(late?.evidence.gapUnits)).toBeGreaterThan(0);
  });

  it("excludes overdue PO-8857 from Indiranagar's inbound", () => {
    const stockout = find("STOCKOUT_BEFORE_REPLENISHMENT:HP-ANC-700:Indiranagar");
    expect(stockout?.severity).toBe("CRITICAL");
    expect(stockout?.evidence).toMatchObject({ stock: 6, avgDailySales: 3.2, stockoutInDays: 1.9, fastestLeadDays: 7, inboundUnits: 0, excludedOverduePos: "PO-8857" });
    expect(stockout?.context.kind === "replenish" && stockout.context.need.inbound).toEqual([]);
  });

  it("sees Malleshwaram's spare TVs and the Redington India trade-off for Koramangala", () => {
    expect(find("STORE_IMBALANCE:TV-55Q7:Koramangala")?.evidence).toMatchObject({ surplusStore: "Malleshwaram", spareUnits: 11, transferableUnits: 11 });
    expect(find("SUPPLIER_TRADEOFF:TV-55Q7:Koramangala")?.evidence).toMatchObject({
      cheapestSupplier: "Brand Direct",
      cheapestLeadDays: 7,
      onTimeSupplier: "Redington India",
      onTimePrice: 48510,
      premiumPerUnit: 2310,
      premiumPct: 5,
    });
  });

  it("sizes the TV fest shortfall net of every store's stock", () => {
    expect(find("DEMAND_SPIKE:TV-55Q7")?.evidence).toMatchObject({
      promotion: "Wedding Season TV Fest",
      promotionStart: "2026-11-19",
      expectedUplift: 0.4,
      networkStock: 63,
      shortfallUnits: 8,
    });
  });

  it("links the G12's stall to the G13 launch and its confirmed PO", () => {
    const wh = find("NEW_LAUNCH_CANNIBALIZATION:LAP-I5-G12:Central WH");
    expect(wh?.evidence).toMatchObject({ newSku: "LAP-I5-G13", newLaunchDate: "2026-10-27", oldNetworkDailySales: 0.7, newNetworkDailySales: 1.7, stock: 40 });
    expect(wh?.context.kind === "excess" && wh.context.excess.inbound).toEqual([{ po: "PO-8851", supplier: "Redington India", qty: 30, expectedDate: "2026-11-21" }]);
  });

  it("puts a weekly value loss on ageing stock", () => {
    const ageing = problems.filter((p) => p.type === "AGEING_STOCK");
    expect(ageing.length).toBeGreaterThan(0);
    for (const p of ageing) {
      expect(p.evidence.weeklyValueLoss).toBe(Math.round(Number(p.evidence.cashTiedUp) * 0.01));
    }
  });

  it("returns deep-equal output for the same input", () => {
    expect(detectProblems(db, TODAY)).toEqual(problems);
  });
});
