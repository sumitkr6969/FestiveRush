import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openSignals, relatedSignals } from "@/lib/client/signalGroups";
import { TODAY } from "@/lib/config";
import { runEngine, type EngineResult } from "@/lib/engine";
import { loadSnapshot } from "@/lib/snapshot";
import { openSeededDb } from "./helpers/seededDb";

let cleanup: () => void;
let engine: EngineResult;
const STOCKOUT_A = "STOCKOUT_BEFORE_REPLENISHMENT:TV-55-SM:Store A";

beforeAll(() => {
  const seeded = openSeededDb();
  cleanup = seeded.cleanup;
  engine = runEngine(loadSnapshot(seeded.db, TODAY));
});
afterAll(() => cleanup());

describe("signal groups", () => {
  it("groups every view of Store A's TV shortage, including the late PO that was meant to cover it", () => {
    const rec = engine.recommendations.find((r) => r.problem.id === STOCKOUT_A);
    if (!rec) throw new Error("Scenario missing");
    expect(relatedSignals(rec, engine.recommendations).map((r) => r.problem.type).sort()).toEqual([
      "LATE_PO_GAP",
      "STORE_IMBALANCE",
      "SUPPLIER_TRADEOFF",
    ]);
  });

  it("one decision settles the group, so the same transfer can't be approved twice", () => {
    const all = engine.recommendations;
    const open = openSignals(all, new Set([STOCKOUT_A]));
    expect(open).toHaveLength(all.length - 4);
    expect(open.some((r) => r.problem.sku === "TV-55-SM" && r.problem.store === "Store A")).toBe(false);
    // The network-wide promotion shortfall is a different decision and stays open.
    expect(open.some((r) => r.problem.id === "DEMAND_SPIKE:TV-55-SM")).toBe(true);
  });

  it("leads with the stock-out when several signals share the same plan", () => {
    const storeA = engine.recommendations.filter((r) => r.problem.sku === "TV-55-SM" && r.problem.store === "Store A");
    expect(storeA[0]?.problem.id).toBe(STOCKOUT_A);
  });
});
