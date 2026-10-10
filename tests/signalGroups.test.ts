import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openSignals, relatedSignals } from "@/lib/client/signalGroups";
import { TODAY } from "@/lib/config";
import { runEngine, type EngineResult } from "@/lib/engine";
import { loadSnapshot } from "@/lib/snapshot";
import { openSeededDb } from "./helpers/seededDb";

let cleanup: () => void;
let engine: EngineResult;
const STOCKOUT = "STOCKOUT_BEFORE_REPLENISHMENT:HP-ANC-700:Indiranagar";

beforeAll(() => {
  const seeded = openSeededDb();
  cleanup = seeded.cleanup;
  engine = runEngine(loadSnapshot(seeded.db, TODAY));
});
afterAll(() => cleanup());

describe("signal groups", () => {
  it("groups every view of Indiranagar's headphone shortage, including the late PO meant to cover it", () => {
    const rec = engine.recommendations.find((r) => r.problem.id === STOCKOUT);
    if (!rec) throw new Error("HP-ANC-700 at Indiranagar missing");
    expect(relatedSignals(rec, engine.recommendations).map((r) => r.problem.type).sort()).toEqual(["LATE_PO_GAP", "STORE_IMBALANCE"]);
  });

  it("groups Koramangala's TV signals: one transfer settles both", () => {
    const rec = engine.recommendations.find((r) => r.problem.id === "STORE_IMBALANCE:TV-55Q7:Koramangala");
    if (!rec) throw new Error("TV-55Q7 at Koramangala missing");
    expect(relatedSignals(rec, engine.recommendations).map((r) => r.problem.id)).toEqual(["SUPPLIER_TRADEOFF:TV-55Q7:Koramangala"]);
  });

  it("one decision settles the group, so the same transfer can't be approved twice", () => {
    const all = engine.recommendations;
    const open = openSignals(all, new Set([STOCKOUT]));
    expect(open).toHaveLength(all.length - 3);
    expect(open.some((r) => r.problem.sku === "HP-ANC-700" && r.problem.store === "Indiranagar")).toBe(false);
    // Another shortage elsewhere is a different decision and stays open.
    expect(open.some((r) => r.problem.id === "STOCKOUT_BEFORE_REPLENISHMENT:WM-FL-8KG:Jayanagar")).toBe(true);
  });

  it("leads with the stock-out when several signals share the same plan", () => {
    const group = engine.recommendations.filter((r) => r.problem.sku === "HP-ANC-700" && r.problem.store === "Indiranagar");
    expect(group[0]?.problem.id).toBe(STOCKOUT);
  });
});
