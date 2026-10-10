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

// As stored: Open (never confirmed), promised 11 Nov, so 5 days late on 16 Nov.
const PO_8857: PurchaseOrderRow = { po: "PO-8857", supplier: "Reliance Digital Distribution", sku: "HP-ANC-700", qty: 40, expected_date: "2026-11-11", status: "open" };
// Confirmed, promised 20 Nov.
const PO_8862: PurchaseOrderRow = { po: "PO-8862", supplier: "Redington India", sku: "TV-65U8", qty: 20, expected_date: "2026-11-20", status: "confirmed" };
const update = (overrides: Partial<PoStatusUpdate>): PoStatusUpdate => ({
  id: "U-1", po: "PO-8857", status: "in_transit", eta: addDays(TODAY, 3), reportedBy: "Reliance Digital Distribution", reportedAt: "2026-11-16T08:00:00.000Z", ...overrides,
});

/** Engine run with the given supplier updates applied, like getEngine() does. */
const engineWith = (updates: PoStatusUpdate[]) => runEngine(withPoUpdates(loadSnapshot(db, TODAY), updates));
const find = (recs: Recommendation[], id: string) => recs.find((r) => r.problem.id === id);

describe("livePo", () => {
  it("with no update, a passed promise is overdue and late by the days since", () => {
    const { effective, live } = livePo(PO_8857, [], TODAY);
    expect(live).toMatchObject({ state: "late", overdue: true, daysLate: 5 });
    expect(effective).toMatchObject({ status: "overdue", supplierStatus: "open" });
  });

  it("a new ETA keeps the promise, counts as inbound and measures the slip", () => {
    const { effective, live } = livePo(PO_8857, [update({})], TODAY);
    expect(live).toMatchObject({ promisedDate: "2026-11-11", currentEta: addDays(TODAY, 3), state: "late", overdue: false, daysLate: 8 });
    expect(effective).toMatchObject({ status: "in_transit", supplierStatus: "open", expected_date: addDays(TODAY, 3) });
  });

  it("an ETA on or before the promise is on time; delivered closes the PO", () => {
    expect(livePo(PO_8862, [update({ po: "PO-8862", eta: "2026-11-19" })], TODAY).live.state).toBe("on_time");
    expect(livePo(PO_8857, [update({ status: "delivered", eta: TODAY })], TODAY).live).toMatchObject({ state: "delivered", daysLate: 5 });
  });

  it("a PO received in the data is delivered on its date", () => {
    const received: PurchaseOrderRow = { po: "PO-8819", supplier: "Brand Direct", sku: "REF-GOD-142", qty: 22, expected_date: "2026-11-14", status: "received" };
    expect(livePo(received, [], TODAY).effective).toMatchObject({ status: "delivered", supplierStatus: "received" });
  });
});

describe("validateStatusUpdate", () => {
  it("rejects impossible dates", () => {
    expect(validateStatusUpdate({ status: "in_transit", eta: addDays(TODAY, -1) }, PO_8857, TODAY).ok).toBe(false);
    expect(validateStatusUpdate({ status: "delivered", eta: addDays(TODAY, 1) }, PO_8857, TODAY).ok).toBe(false);
    expect(validateStatusUpdate({ status: "delayed", eta: "2026-11-19" }, PO_8862, TODAY).ok).toBe(false);
    expect(validateStatusUpdate({ status: "delayed", eta: "2026-11-25", note: "  Truck   breakdown " }, PO_8862, TODAY)).toEqual({
      ok: true,
      value: { status: "delayed", eta: "2026-11-25", note: "Truck breakdown" },
    });
  });
});

describe("late PO with live status", () => {
  it("with no supplier update, suggests a store transfer and never waiting", () => {
    const rec = find(engineWith([]).recommendations, "LATE_PO_GAP:PO-8857");
    expect(rec?.problem).toMatchObject({ store: "Indiranagar", severity: "CRITICAL" });
    expect(rec?.problem.evidence).toMatchObject({ daysLate: 5, currentEta: null, liveStatus: "No update from supplier", firstStockoutStore: "Indiranagar" });
    const options = rec?.optionSet.options ?? [];
    expect(options.find((o) => o.recommended)).toMatchObject({ kind: "TRANSFER_FROM_STORE", from: "HSR Layout", units: 14 });
    // Reliance is the only supplier of this SKU, so it stays an option despite being late.
    expect(options.filter((o) => o.kind === "ORDER_FROM_SUPPLIER").map((o) => o.from)).toEqual(["Reliance Digital Distribution"]);
    expect(options.some((o) => o.kind === "WAIT_FOR_PO")).toBe(false);
    const text = agentSuggestion(rec as Recommendation).join(" ");
    expect(text).toContain("no new date");
    expect(text).toContain("Suggested instead: Transfer 14 from HSR Layout to Indiranagar");
    expect(text).toContain("Waiting isn't counted on");
  });

  it("a confirmed delivery today still beats the stock-out, so waiting is the cheapest plan", () => {
    const rec = find(engineWith([update({ eta: TODAY, note: "Truck at Hosur" })]).recommendations, "LATE_PO_GAP:PO-8857");
    expect(rec?.problem.evidence).toMatchObject({ daysLate: 5, currentEta: TODAY, lastUpdate: "Truck at Hosur" });
    expect(rec?.optionSet.options.find((o) => o.recommended)).toMatchObject({ kind: "WAIT_FOR_PO", po: "PO-8857", units: 39, arrivesBeforeStockout: true }); // the 39 the stores need, of 40 on the PO
    expect(agentSuggestion(rec as Recommendation).join(" ")).toContain("Waiting for the PO still works");
  });

  it("a new date after the stock-out keeps the transfer, topped up from Reliance", () => {
    const rec = find(engineWith([update({})]).recommendations, "LATE_PO_GAP:PO-8857");
    const options = rec?.optionSet.options ?? [];
    expect(options.find((o) => o.recommended)).toMatchObject({ kind: "TRANSFER_FROM_STORE", from: "HSR Layout" });
    expect(options.find((o) => o.kind === "WAIT_FOR_PO")).toMatchObject({ arrivesBeforeStockout: false });
    expect(rec?.optionSet.topUp).toMatchObject({ from: "Reliance Digital Distribution", units: 25 });
  });

  it("a supplier delay on a PO not yet due raises a late PO before its date", () => {
    expect(find(engineWith([]).recommendations, "LATE_PO_GAP:PO-8816")).toBeUndefined();
    const delayed = update({ po: "PO-8816", reportedBy: "Ingram Micro India", status: "delayed", eta: addDays(TODAY, 12) });
    const after = find(engineWith([delayed]).recommendations, "LATE_PO_GAP:PO-8816");
    expect(after?.problem.evidence).toMatchObject({ po: "PO-8816", promisedDate: "2026-11-17", daysLate: 11, currentEta: addDays(TODAY, 12) });
  });

  it("delivered clears the late PO", () => {
    expect(find(engineWith([update({ status: "delivered", eta: TODAY })]).recommendations, "LATE_PO_GAP:PO-8857")).toBeUndefined();
  });
});

describe("PO status log", () => {
  it("numbers updates and keeps them in order", () => {
    const log = createPoStatusLog(null);
    log.add("PO-8857", "Reliance Digital Distribution", { status: "dispatched", eta: TODAY }, "t1");
    const second = log.add("PO-8857", "Reliance Digital Distribution", { status: "delayed", eta: addDays(TODAY, 3) }, "t2");
    expect(second.id).toBe("U-0002");
    expect(log.list().map((u) => u.status)).toEqual(["dispatched", "delayed"]);
  });
});
