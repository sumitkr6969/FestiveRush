import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDecisionLog, createDraft } from "@/lib/actions";
import { TODAY } from "@/lib/config";
import { parseDecision } from "@/lib/decisionRequest";
import type { Option } from "@/lib/decisionTypes";
import { runEngine, type EngineResult } from "@/lib/engine";
import { loadSnapshot } from "@/lib/snapshot";
import { openSeededDb } from "./helpers/seededDb";

let cleanup: () => void;
let engine: EngineResult;

beforeAll(() => {
  const seeded = openSeededDb();
  cleanup = seeded.cleanup;
  engine = runEngine(loadSnapshot(seeded.db, TODAY));
});
afterAll(() => cleanup());

const option = (overrides: Partial<Option>): Option => ({
  id: "P:OPT",
  kind: "TRANSFER_FROM_STORE",
  label: "Transfer 5 from Store B to Store A",
  sku: "TV-55-SM",
  from: "Store B",
  to: "Store A",
  units: 5,
  cost: 2250,
  arrivalDate: "2026-10-10",
  arrivesBeforeStockout: true,
  moqOverbuy: 0,
  riskNote: null,
  recommended: true,
  reason: "x",
  ...overrides,
});

describe("createDraft", () => {
  it("maps each option kind to one of the four draft kinds, always simulated", () => {
    const cases: [Partial<Option>, string][] = [
      [{ kind: "TRANSFER_FROM_STORE" }, "TRANSFER"],
      [{ kind: "TRANSFER_TO_STORE" }, "TRANSFER"],
      [{ kind: "ORDER_FROM_SUPPLIER", supplierAvailability: "in_stock" }, "PO_DRAFT"],
      [{ kind: "ORDER_FROM_SUPPLIER", supplierAvailability: "limited" }, "SUPPLIER_ENQUIRY"],
      [{ kind: "WAIT_FOR_PO", po: "PO-002" }, "ALERT"],
      [{ kind: "MARKDOWN_REVIEW" }, "ALERT"],
    ];
    for (const [overrides, kind] of cases) {
      const draft = createDraft(option(overrides));
      expect(draft.kind).toBe(kind);
      expect(draft.simulated).toBe(true);
      expect(draft.title).toMatch(/^Simulated /);
    }
  });

  it("carries SKU, qty, from, to, cost and arrival", () => {
    expect(createDraft(option({}))).toMatchObject({
      sku: "TV-55-SM",
      qty: 5,
      from: "Store B",
      to: "Store A",
      cost: 2250,
      expectedArrival: "2026-10-10",
    });
  });
});

describe("decision log", () => {
  it("records approvals and rejections in memory", () => {
    const log = createDecisionLog(null);
    const a = log.record({ problemId: "P1", draftId: "D1", decision: "approved" }, "2026-10-09T10:00:00.000Z");
    const r = log.record({ problemId: "P1", draftId: "D2", decision: "rejected", reason: "Too costly" }, "2026-10-09T10:01:00.000Z");
    expect(a.id).toBe("D-0001");
    expect(r).toMatchObject({ id: "D-0002", decision: "rejected", reason: "Too costly" });
    expect(log.list()).toHaveLength(2);
    expect(log.persistent).toBe(false);
  });

  it("persists to a JSON file and reloads it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voltkart-decisions-"));
    const file = path.join(dir, "decisions.json");
    try {
      createDecisionLog(file).record({ problemId: "P1", draftId: "D1", decision: "approved" }, "2026-10-09T10:00:00.000Z");
      const reloaded = createDecisionLog(file);
      expect(reloaded.list()).toHaveLength(1);
      expect(reloaded.persistent).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to memory when the file can't be written (read-only filesystem)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voltkart-decisions-"));
    const blocker = path.join(dir, "not-a-dir");
    fs.writeFileSync(blocker, "");
    try {
      const log = createDecisionLog(path.join(blocker, "decisions.json"));
      log.record({ problemId: "P1", draftId: "D1", decision: "approved" }, "2026-10-09T10:00:00.000Z");
      expect(log.persistent).toBe(false);
      expect(log.list()).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("parseDecision (POST /api/decisions)", () => {
  it("accepts a real draft and normalises approve/reject", () => {
    const rec = engine.recommendations[0];
    const draft = rec?.drafts[0];
    if (!rec || !draft) throw new Error("No recommendations");
    expect(parseDecision({ problemId: rec.problem.id, draftId: draft.id, decision: "reject", reason: "  later " }, engine.recommendations)).toEqual({
      ok: true,
      input: { problemId: rec.problem.id, draftId: draft.id, decision: "rejected", reason: "later" },
    });
  });

  it("rejects bad input and unknown drafts", () => {
    expect(parseDecision(null, engine.recommendations)).toMatchObject({ ok: false, status: 400 });
    expect(parseDecision({ problemId: "x", draftId: "y", decision: "maybe" }, engine.recommendations)).toMatchObject({ ok: false, status: 400 });
    expect(parseDecision({ problemId: "x", draftId: "y", decision: "approve" }, engine.recommendations)).toMatchObject({ ok: false, status: 404 });
  });
});
