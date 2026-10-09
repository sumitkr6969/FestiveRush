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

  it("flags PO-001 as 2 days late", () => {
    const late = find("LATE_PO_GAP:PO-001");
    expect(late?.severity).toBe("CRITICAL");
    expect(late?.evidence).toMatchObject({ po: "PO-001", supplier: "Supplier A", qty: 10, daysLate: 2 });
    expect(Number(late?.evidence.gapUnits)).toBeGreaterThan(0);
  });

  it("excludes overdue PO-001 from Store A's inbound", () => {
    const stockout = find("STOCKOUT_BEFORE_REPLENISHMENT:TV-55-SM:Store A");
    expect(stockout?.severity).toBe("CRITICAL");
    expect(stockout?.evidence).toMatchObject({ inboundUnits: 0, excludedOverduePos: "PO-001", stockoutInDays: 2 });
    expect(stockout?.context.kind === "replenish" && stockout.context.need.inbound).toEqual([]);
  });

  it("sees Store B's surplus and the Supplier B trade-off for Store A", () => {
    expect(find("STORE_IMBALANCE:TV-55-SM:Store A")?.evidence).toMatchObject({ surplusStore: "Store B", spareUnits: 5 });
    expect(find("SUPPLIER_TRADEOFF:TV-55-SM:Store A")?.evidence).toMatchObject({
      cheapestSupplier: "Supplier C",
      onTimeSupplier: "Supplier B",
      onTimePrice: 36750,
    });
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
