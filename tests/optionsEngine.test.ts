import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY } from "@/lib/config";
import type { OptionSet, Problem } from "@/lib/decisionTypes";
import { buildOptions } from "@/lib/optionsEngine";
import { detectProblems } from "@/lib/problemDetector";
import { openSeededDb } from "./helpers/seededDb";

let cleanup: () => void;
let db: Database.Database;
let problems: Problem[];
let storeA: OptionSet;

beforeAll(() => {
  ({ db, cleanup } = openSeededDb());
  problems = detectProblems(db, TODAY);
  const p = problems.find((x) => x.id === "STOCKOUT_BEFORE_REPLENISHMENT:TV-55-SM:Store A");
  if (!p) throw new Error("Scenario problem missing");
  storeA = buildOptions(p);
});
afterAll(() => cleanup());

describe("buildOptions: TV-55-SM at Store A", () => {
  it("only Supplier B arrives before the stock-out", () => {
    const orders = storeA.options.filter((o) => o.kind === "ORDER_FROM_SUPPLIER");
    expect(orders.map((o) => o.from).sort()).toEqual(["Supplier A", "Supplier B", "Supplier C"]);
    expect(orders.filter((o) => o.arrivesBeforeStockout).map((o) => o.from)).toEqual(["Supplier B"]);
  });

  it("recommends moving Store B's 5 spare units, topped up from Supplier B", () => {
    const recommended = storeA.options.filter((o) => o.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0]).toMatchObject({
      kind: "TRANSFER_FROM_STORE",
      from: "Store B",
      to: "Store A",
      units: 5,
      arrivesBeforeStockout: true,
    });
    expect(recommended[0]?.reason).toMatch(/Supplier B/);
    const p = problems.find((x) => x.id === storeA.problemId);
    const need = p?.context.kind === "replenish" ? p.context.need.unitsNeeded : 0;
    expect(need).toBeGreaterThan(5);
    expect(storeA.topUp).toMatchObject({ kind: "ORDER_FROM_SUPPLIER", from: "Supplier B", to: "Store A", units: need - 5 });
    // Doing nothing loses every unit the store can't serve over the next 14 days.
    expect(storeA.doNothing).toMatchObject({ units: need, cost: need * 45000 });
  });

  it("never offers to wait for the overdue PO", () => {
    expect(storeA.options.some((o) => o.kind === "WAIT_FOR_PO")).toBe(false);
  });
});

describe("buildOptions: every problem", () => {
  it("returns 2–4 options with exactly one recommendation and a reason", () => {
    for (const p of problems) {
      const set = buildOptions(p);
      expect(set.options.length, p.id).toBeGreaterThanOrEqual(2);
      expect(set.options.length, p.id).toBeLessThanOrEqual(4);
      const rec = set.options.filter((o) => o.recommended);
      expect(rec, p.id).toHaveLength(1);
      expect(rec[0]?.reason, p.id).toBeTruthy();
    }
  });

  it("respects supplier MOQs and records the overbuy", () => {
    for (const p of problems) {
      if (p.context.kind !== "replenish") continue;
      const { need } = p.context;
      for (const o of buildOptions(p).options.filter((x) => x.kind === "ORDER_FROM_SUPPLIER")) {
        const moq = need.suppliers.find((s) => s.supplier === o.from)?.moq ?? 0;
        expect(o.units).toBeGreaterThanOrEqual(moq);
        expect(o.moqOverbuy).toBe(o.units - Math.min(o.units, need.unitsNeeded));
      }
    }
  });

  it("returns deep-equal output for the same input", () => {
    expect(problems.map(buildOptions)).toEqual(problems.map(buildOptions));
  });
});
