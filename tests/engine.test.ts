import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY } from "@/lib/config";
import { runEngine, type EngineResult } from "@/lib/engine";
import { loadSnapshot } from "@/lib/snapshot";
import { openSeededDb } from "./helpers/seededDb";

let cleanup: () => void;
let result: EngineResult;
let rerun: () => EngineResult;

beforeAll(() => {
  const seeded = openSeededDb();
  cleanup = seeded.cleanup;
  rerun = () => runEngine(loadSnapshot(seeded.db, TODAY));
  result = rerun();
});
afterAll(() => cleanup());

describe("runEngine", () => {
  it("ranks by severity, then by money lost if nothing is done", () => {
    const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 } as const;
    const recs = result.recommendations;
    for (let i = 1; i < recs.length; i += 1) {
      const prev = recs[i - 1];
      const cur = recs[i];
      if (!prev || !cur) continue;
      const bySev = rank[prev.problem.severity] - rank[cur.problem.severity];
      expect(bySev <= 0).toBe(true);
      if (bySev === 0) expect(prev.optionSet.doNothing.cost).toBeGreaterThanOrEqual(cur.optionSet.doNothing.cost);
    }
  });

  it("leads with the headphone stock-out the late PO-8857 was meant to prevent", () => {
    const top = result.recommendations.slice(0, 5).map((r) => r.problem.id);
    expect(top.slice(0, 2)).toEqual(["STOCKOUT_BEFORE_REPLENISHMENT:HP-ANC-700:Indiranagar", "LATE_PO_GAP:PO-8857"]);
    expect(top).toContain("DEMAND_SPIKE:TV-55Q7");
  });

  it("drafts every option (plus the top-up) as simulated", () => {
    for (const rec of result.recommendations) {
      const expected = rec.optionSet.options.length + (rec.optionSet.topUp ? 1 : 0);
      expect(rec.drafts).toHaveLength(expected);
      expect(rec.drafts.every((d) => d.simulated)).toBe(true);
    }
  });

  it("returns deep-equal output for the same input", () => {
    expect(rerun()).toEqual(result);
  });
});
