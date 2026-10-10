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
let kora: OptionSet;

beforeAll(() => {
  ({ db, cleanup } = openSeededDb());
  problems = detectProblems(db, TODAY);
  const p = problems.find((x) => x.id === "SUPPLIER_TRADEOFF:TV-55Q7:Koramangala");
  if (!p) throw new Error("TV-55Q7 at Koramangala missing");
  kora = buildOptions(p);
});
afterAll(() => cleanup());

describe("buildOptions: TV-55Q7 at Koramangala", () => {
  it("only Redington India arrives before the stock-out", () => {
    const orders = kora.options.filter((o) => o.kind === "ORDER_FROM_SUPPLIER");
    expect(orders.map((o) => o.from).sort()).toEqual(["Brand Direct", "Redington India"]);
    expect(orders.filter((o) => o.arrivesBeforeStockout).map((o) => o.from)).toEqual(["Redington India"]);
  });

  it("recommends moving Malleshwaram's 11 spare units, topped up from Redington India", () => {
    const recommended = kora.options.filter((o) => o.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0]).toMatchObject({
      kind: "TRANSFER_FROM_STORE",
      from: "Malleshwaram",
      to: "Koramangala",
      units: 11,
      cost: 6490, // 1% of the 58,990 rupee price per unit
      arrivalDate: "2026-11-17",
      arrivesBeforeStockout: true,
    });
    expect(recommended[0]?.reason).toMatch(/Redington India/);
    const p = problems.find((x) => x.id === kora.problemId);
    const need = p?.context.kind === "replenish" ? p.context.need.unitsNeeded : 0;
    expect(need).toBe(26);
    expect(kora.topUp).toMatchObject({ kind: "ORDER_FROM_SUPPLIER", from: "Redington India", to: "Koramangala", units: 15 });
    // Doing nothing loses every unit the store can't serve over the next 14 days.
    expect(kora.doNothing).toMatchObject({ units: 26, cost: 26 * 58990 });
  });

  it("never offers to wait for an overdue PO", () => {
    const late = problems.find((x) => x.id === "LATE_PO_GAP:PO-8857");
    if (!late) throw new Error("PO-8857 missing");
    expect(buildOptions(late).options.some((o) => o.kind === "WAIT_FOR_PO")).toBe(false);
  });

  it("offers to cancel the G12 order that is still coming", () => {
    const g12 = problems.find((x) => x.id === "NEW_LAUNCH_CANNIBALIZATION:LAP-I5-G12:Central WH");
    if (!g12) throw new Error("G12 missing");
    expect(buildOptions(g12).options.find((o) => o.recommended)).toMatchObject({ kind: "CANCEL_INBOUND_PO", po: "PO-8851", units: 30 });
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
