import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY } from "@/lib/config";
import { runEngine, type EngineResult, type Recommendation } from "@/lib/engine";
import { explain } from "@/lib/explain";
import { loadSnapshot } from "@/lib/snapshot";
import { runWhatIf, simulateStock, sourcesFor } from "@/lib/whatIf";
import { openSeededDb } from "./helpers/seededDb";

let cleanup: () => void;
let engine: EngineResult;
let storeA: Recommendation;

beforeAll(() => {
  const seeded = openSeededDb();
  cleanup = seeded.cleanup;
  engine = runEngine(loadSnapshot(seeded.db, TODAY));
  const rec = engine.recommendations.find((r) => r.problem.id === "STOCKOUT_BEFORE_REPLENISHMENT:TV-55-SM:Store A");
  if (!rec) throw new Error("Scenario missing");
  storeA = rec;
});
afterAll(() => cleanup());

const recommended = () => {
  const o = storeA.optionSet.options.find((x) => x.recommended);
  if (!o) throw new Error("No recommendation");
  return o;
};

describe("simulateStock", () => {
  it("sells down, lands deliveries at the start of a day and counts lost units", () => {
    const p = simulateStock("2026-10-09", 4, [2, 2, 2, 2], [{ day: 3, units: 10 }]);
    expect(p.curve.map((c) => c.stock)).toEqual([4, 2, 0, 10, 8]);
    expect(p.stockoutDay).toBe(2);
    expect(p.lostUnits).toBe(2);
  });
});

describe("runWhatIf: TV-55-SM at Store A", () => {
  it("with no change reproduces the engine's plan and top-up", () => {
    const r = runWhatIf(storeA.problem.id, storeA.problem.context, recommended());
    expect(r.option).toEqual(recommended());
    expect(r.topUp).toEqual(storeA.optionSet.topUp);
    expect(r.baseline.lostUnits).toBeGreaterThan(r.plan.lostUnits);
  });

  it("switching to Supplier A arrives after the stock-out", () => {
    const r = runWhatIf(storeA.problem.id, storeA.problem.context, recommended(), { units: 32, source: "Supplier A" });
    expect(r.option).toMatchObject({ kind: "ORDER_FROM_SUPPLIER", from: "Supplier A", units: 32, cost: 32 * 35000, arrivesBeforeStockout: false, recommended: false });
    expect(r.topUp).toBeNull();
  });

  it("caps a transfer at the donor's spare units", () => {
    const r = runWhatIf(storeA.problem.id, storeA.problem.context, recommended(), { units: 50 });
    expect(r.option.units).toBe(5);
  });

  it("offers suppliers and spare stores as sources", () => {
    const values = sourcesFor(storeA.problem.context).map((s) => s.value);
    expect(values).toEqual(expect.arrayContaining(["Supplier A", "Supplier B", "Supplier C", "Store B"]));
  });
});

describe("explain", () => {
  it("answers 'why Store A?' from computed evidence only", () => {
    const e = explain("Why Store A?", engine.recommendations);
    expect(e.problemId).toBe("STOCKOUT_BEFORE_REPLENISHMENT:TV-55-SM:Store A");
    const text = e.lines.join(" ");
    expect(text).toContain("2 days of stock");
    expect(text).toContain("Transfer 5 from Store B to Store A");
    expect(text).toContain("Supplier B");
    expect(text).not.toContain(String.fromCharCode(0x2014));
  });

  it("finds a PO by number", () => {
    expect(explain("why is PO-001 a problem", engine.recommendations).problemId).toBe("LATE_PO_GAP:PO-001");
  });

  it("admits when nothing matches", () => {
    expect(explain("what's the weather", engine.recommendations).problemId).toBeNull();
  });
});
