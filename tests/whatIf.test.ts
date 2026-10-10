import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY } from "@/lib/config";
import { runEngine, type EngineResult, type Recommendation } from "@/lib/engine";
import { explain } from "@/lib/explain";
import { loadSnapshot } from "@/lib/snapshot";
import { runWhatIf, simulateStock, sourcesFor } from "@/lib/whatIf";
import { openSeededDb } from "./helpers/seededDb";

let cleanup: () => void;
let engine: EngineResult;
let kora: Recommendation;

beforeAll(() => {
  const seeded = openSeededDb();
  cleanup = seeded.cleanup;
  engine = runEngine(loadSnapshot(seeded.db, TODAY));
  const rec = engine.recommendations.find((r) => r.problem.id === "SUPPLIER_TRADEOFF:TV-55Q7:Koramangala");
  if (!rec) throw new Error("TV-55Q7 at Koramangala missing");
  kora = rec;
});
afterAll(() => cleanup());

const recommended = () => {
  const o = kora.optionSet.options.find((x) => x.recommended);
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

describe("runWhatIf: TV-55Q7 at Koramangala", () => {
  it("with no change reproduces the engine's plan and top-up", () => {
    const r = runWhatIf(kora.problem.id, kora.problem.context, recommended());
    expect(r.option).toEqual(recommended());
    expect(r.topUp).toEqual(kora.optionSet.topUp);
    expect(r.baseline.lostUnits).toBeGreaterThan(r.plan.lostUnits);
  });

  it("switching to Brand Direct arrives after the stock-out", () => {
    const r = runWhatIf(kora.problem.id, kora.problem.context, recommended(), { units: 26, source: "Brand Direct" });
    expect(r.option).toMatchObject({ kind: "ORDER_FROM_SUPPLIER", from: "Brand Direct", units: 26, cost: 26 * 46200, arrivalDate: "2026-11-23", arrivesBeforeStockout: false, recommended: false });
    expect(r.topUp).toBeNull();
  });

  it("caps a transfer at the donor's spare units", () => {
    const r = runWhatIf(kora.problem.id, kora.problem.context, recommended(), { units: 50 });
    expect(r.option.units).toBe(11);
  });

  it("offers suppliers and spare stores as sources", () => {
    const values = sourcesFor(kora.problem.context).map((s) => s.value);
    expect(values).toEqual(expect.arrayContaining(["Brand Direct", "Redington India", "Malleshwaram", "Whitefield"]));
  });
});

describe("explain", () => {
  it("answers 'why Koramangala?' from computed evidence only", () => {
    const e = explain("Why Koramangala?", engine.recommendations);
    expect(e.problemId).toBe("STORE_IMBALANCE:TV-55Q7:Koramangala");
    const text = e.lines.join(" ");
    expect(text).toContain("2.4 days of stock");
    expect(text).toContain("Transfer 11 from Malleshwaram to Koramangala");
    expect(text).toContain("Redington India");
    expect(text).toContain("Wedding Season TV Fest");
    expect(text).not.toContain(String.fromCharCode(0x2014));
  });

  it("finds a PO by number, and a supplier by name", () => {
    expect(explain("why is PO-8857 a problem", engine.recommendations).problemId).toBe("LATE_PO_GAP:PO-8857");
    expect(explain("Why Redington India for TV-55Q7?", engine.recommendations).problemId).toBe("SUPPLIER_TRADEOFF:TV-55Q7:Koramangala");
  });

  it("admits when nothing matches", () => {
    expect(explain("what's the weather", engine.recommendations).problemId).toBeNull();
  });
});
