import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY } from "@/lib/config";
import { addDays } from "@/lib/dates";
import { runEngine, type Recommendation } from "@/lib/engine";
import { agentSuggestion } from "@/lib/explain";
import { livePo, validateStatusUpdate, type PoStatusUpdate } from "@/lib/poStatus";
import { createPoStatusLog } from "@/lib/poStatusLog";
import { loadSnapshot, withPoUpdates } from "@/lib/snapshot";
import type { PurchaseOrderRow } from "@/lib/types";
import { openSeededDb } from "./helpers/seededDb";

let db: Database.Database;
let cleanup: () => void;
beforeAll(() => {
  ({ db, cleanup } = openSeededDb());
});
afterAll(() => cleanup());

const PO_001: PurchaseOrderRow = { po: "PO-001", supplier: "Supplier A", sku: "TV-55-SM", qty: 10, expected_date: addDays(TODAY, -2), status: "overdue" };
const update = (overrides: Partial<PoStatusUpdate>): PoStatusUpdate => ({
  id: "U-1", po: "PO-001", status: "in_transit", eta: addDays(TODAY, 1), reportedBy: "Supplier A", reportedAt: "2026-10-09T08:00:00.000Z", ...overrides,
});

/** Engine run with the given supplier updates applied, like getEngine() does. */
const engineWith = (updates: PoStatusUpdate[]) => runEngine(withPoUpdates(loadSnapshot(db, TODAY), updates));
const find = (recs: Recommendation[], id: string) => recs.find((r) => r.problem.id === id);

describe("livePo", () => {
  it("with no update, a passed promise is overdue and late by the days since", () => {
    expect(livePo(PO_001, [], TODAY).live).toMatchObject({ state: "late", overdue: true, daysLate: 2 });
  });

  it("a new ETA keeps the promise, counts as inbound and measures the slip", () => {
    const { effective, live } = livePo(PO_001, [update({})], TODAY);
    expect(live).toMatchObject({ promisedDate: addDays(TODAY, -2), currentEta: addDays(TODAY, 1), state: "late", overdue: false, daysLate: 3 });
    expect(effective).toMatchObject({ status: "in_transit", expected_date: addDays(TODAY, 1) });
  });

  it("an ETA on or before the promise is on time; delivered closes the PO", () => {
    const future = { ...PO_001, status: "in_transit" as const, expected_date: addDays(TODAY, 5) };
    expect(livePo(future, [update({ eta: addDays(TODAY, 4) })], TODAY).live.state).toBe("on_time");
    expect(livePo(PO_001, [update({ status: "delivered", eta: TODAY })], TODAY).live).toMatchObject({ state: "delivered", daysLate: 2 });
  });
});

describe("validateStatusUpdate", () => {
  it("rejects impossible dates", () => {
    expect(validateStatusUpdate({ status: "in_transit", eta: addDays(TODAY, -1) }, PO_001, TODAY).ok).toBe(false);
    expect(validateStatusUpdate({ status: "delivered", eta: addDays(TODAY, 1) }, PO_001, TODAY).ok).toBe(false);
    const future = { ...PO_001, expected_date: addDays(TODAY, 5) };
    expect(validateStatusUpdate({ status: "delayed", eta: addDays(TODAY, 4) }, future, TODAY).ok).toBe(false);
    expect(validateStatusUpdate({ status: "delayed", eta: addDays(TODAY, 8), note: "  Truck   breakdown " }, future, TODAY)).toEqual({
      ok: true,
      value: { status: "delayed", eta: addDays(TODAY, 8), note: "Truck breakdown" },
    });
  });
});

describe("late PO with live status", () => {
  it("with no supplier update, suggests another store and other suppliers, never the late one", () => {
    const rec = find(engineWith([]).recommendations, "LATE_PO_GAP:PO-001");
    expect(rec?.problem).toMatchObject({ store: "Store A", severity: "CRITICAL" });
    expect(rec?.problem.evidence).toMatchObject({ daysLate: 2, currentEta: null, liveStatus: "No update from supplier", firstStockoutStore: "Store A" });
    const options = rec?.optionSet.options ?? [];
    expect(options.find((o) => o.recommended)).toMatchObject({ kind: "TRANSFER_FROM_STORE", from: "Store B", units: 5 });
    expect(options.filter((o) => o.kind === "ORDER_FROM_SUPPLIER").map((o) => o.from).sort()).toEqual(["Supplier B", "Supplier C"]);
    expect(options.some((o) => o.kind === "WAIT_FOR_PO")).toBe(false);
    const text = agentSuggestion(rec as Recommendation).join(" ");
    expect(text).toContain("no new date");
    expect(text).toContain("Suggested instead: Transfer 5 from Store B to Store A");
    expect(text).toContain("Waiting isn't counted on");
  });

  it("a confirmed new ETA that still beats the stock-out makes waiting the cheapest plan", () => {
    const rec = find(engineWith([update({ note: "Truck breakdown at Hosur" })]).recommendations, "LATE_PO_GAP:PO-001");
    expect(rec?.problem.evidence).toMatchObject({ daysLate: 3, currentEta: addDays(TODAY, 1), lastUpdate: "Truck breakdown at Hosur" });
    const recommended = rec?.optionSet.options.find((o) => o.recommended);
    expect(recommended).toMatchObject({ kind: "WAIT_FOR_PO", po: "PO-001", units: 10, arrivesBeforeStockout: true });
    expect(rec?.optionSet.topUp).toMatchObject({ from: "Supplier B", units: 22 });
    expect(agentSuggestion(rec as Recommendation).join(" ")).toContain("Waiting for the PO still works");
  });

  it("a supplier delay on a PO not yet due raises a late PO before its date", () => {
    const before = find(engineWith([]).recommendations, "LATE_PO_GAP:PO-002");
    expect(before).toBeUndefined();
    const after = find(engineWith([update({ po: "PO-002", reportedBy: "Supplier C", status: "delayed", eta: addDays(TODAY, 10) })]).recommendations, "LATE_PO_GAP:PO-002");
    expect(after?.problem.evidence).toMatchObject({ po: "PO-002", daysLate: 6, currentEta: addDays(TODAY, 10) });
  });

  it("delivered clears the late PO", () => {
    expect(find(engineWith([update({ status: "delivered", eta: TODAY })]).recommendations, "LATE_PO_GAP:PO-001")).toBeUndefined();
  });
});

describe("PO status log", () => {
  it("numbers updates and keeps them in order", () => {
    const log = createPoStatusLog(null);
    log.add("PO-001", "Supplier A", { status: "dispatched", eta: TODAY }, "t1");
    const second = log.add("PO-001", "Supplier A", { status: "delayed", eta: addDays(TODAY, 3) }, "t2");
    expect(second.id).toBe("U-0002");
    expect(log.list().map((u) => u.status)).toEqual(["dispatched", "delayed"]);
  });
});
