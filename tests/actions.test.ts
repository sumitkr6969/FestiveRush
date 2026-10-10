import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDecisionLog, createDraft } from "@/lib/actions";
import { TODAY } from "@/lib/config";
import { parseDecision } from "@/lib/decisionRequest";
import type { Draft, Option } from "@/lib/decisionTypes";
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
  label: "Transfer 11 from Malleshwaram to Koramangala",
  sku: "TV-55Q7",
  from: "Malleshwaram",
  to: "Koramangala",
  units: 11,
  cost: 6490,
  arrivalDate: "2026-11-17",
  arrivesBeforeStockout: true,
  moqOverbuy: 0,
  riskNote: null,
  recommended: true,
  reason: "x",
  ...overrides,
});

const draft: Draft = createDraft(option({}));
const AT = "2026-10-09T10:00:00.000Z";

describe("createDraft", () => {
  it("maps each option kind to one of the four draft kinds, always simulated", () => {
    const cases: [Partial<Option>, string][] = [
      [{ kind: "TRANSFER_FROM_STORE" }, "TRANSFER"],
      [{ kind: "TRANSFER_TO_STORE" }, "TRANSFER"],
      [{ kind: "ORDER_FROM_SUPPLIER", supplierAvailability: "in_stock" }, "PO_DRAFT"],
      [{ kind: "ORDER_FROM_SUPPLIER", supplierAvailability: "limited" }, "SUPPLIER_ENQUIRY"],
      [{ kind: "WAIT_FOR_PO", po: "PO-8851" }, "ALERT"],
      [{ kind: "MARKDOWN_REVIEW" }, "ALERT"],
    ];
    for (const [overrides, kind] of cases) {
      const d = createDraft(option(overrides));
      expect(d.kind).toBe(kind);
      expect(d.simulated).toBe(true);
      expect(d.title).toMatch(/^Simulated /);
    }
  });

  it("carries SKU, qty, from, to, cost and arrival", () => {
    expect(draft).toMatchObject({ sku: "TV-55Q7", qty: 11, from: "Malleshwaram", to: "Koramangala", cost: 6490, expectedArrival: "2026-11-17" });
  });
});

describe("decision log", () => {
  it("records approvals and rejections in memory, with the draft", () => {
    const log = createDecisionLog(null);
    const a = log.record({ problemId: "P1", draftId: draft.id, decision: "approved" }, draft, AT);
    const r = log.record({ problemId: "P1", draftId: draft.id, decision: "rejected", reason: "Too costly" }, draft, AT);
    expect(a.id).toBe("D-0001");
    expect(a.draft.qty).toBe(11);
    expect(r).toMatchObject({ id: "D-0002", decision: "rejected", reason: "Too costly" });
    expect(log.list()).toHaveLength(2);
    expect(log.persistent).toBe(false);
  });

  it("undo removes a record and never reuses its id", () => {
    const log = createDecisionLog(null);
    const first = log.record({ problemId: "P1", draftId: draft.id, decision: "approved" }, draft, AT);
    expect(log.remove(first.id)).toBe(true);
    expect(log.remove(first.id)).toBe(false);
    expect(log.record({ problemId: "P1", draftId: draft.id, decision: "approved" }, draft, AT).id).toBe("D-0002");
  });

  it("persists to a JSON file and reloads it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voltkart-decisions-"));
    const file = path.join(dir, "decisions.json");
    try {
      createDecisionLog(file).record({ problemId: "P1", draftId: draft.id, decision: "approved" }, draft, AT);
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
      log.record({ problemId: "P1", draftId: draft.id, decision: "approved" }, draft, AT);
      expect(log.persistent).toBe(false);
      expect(log.list()).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("parseDecision (POST /api/decisions)", () => {
  const scenario = () => {
    const rec = engine.recommendations.find((r) => r.problem.id === "SUPPLIER_TRADEOFF:TV-55Q7:Koramangala");
    const recommended = rec?.drafts[0];
    if (!rec || !recommended) throw new Error("Scenario missing");
    return { rec, recommended };
  };

  it("approves the recommended plan: the transfer and its Redington India top-up", () => {
    const { rec, recommended } = scenario();
    const parsed = parseDecision({ problemId: rec.problem.id, draftId: recommended.id, decision: "approve" }, engine.recommendations);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.decision).toBe("approved");
    expect(parsed.drafts.map((d) => [d.kind, d.from, d.qty])).toEqual([
      ["TRANSFER", "Malleshwaram", 11],
      ["PO_DRAFT", "Redington India", 15],
    ]);
  });

  it("recomputes what-if changes server-side", () => {
    const { rec, recommended } = scenario();
    const parsed = parseDecision(
      { problemId: rec.problem.id, draftId: recommended.id, decision: "reject", reason: "  later ", adjustment: { units: 3 } },
      engine.recommendations,
    );
    expect(parsed).toMatchObject({ ok: true, decision: "rejected", reason: "later" });
    if (!parsed.ok) return;
    expect(parsed.drafts[0]).toMatchObject({ qty: 3, cost: 3 * 590 });
    expect(parsed.drafts[1]?.qty).toBe(23);
  });

  it("rejects bad input and unknown drafts", () => {
    const { rec, recommended } = scenario();
    expect(parseDecision(null, engine.recommendations)).toMatchObject({ ok: false, status: 400 });
    expect(parseDecision({ problemId: "x", draftId: "y", decision: "maybe" }, engine.recommendations)).toMatchObject({ ok: false, status: 400 });
    expect(parseDecision({ problemId: "x", draftId: "y", decision: "approve" }, engine.recommendations)).toMatchObject({ ok: false, status: 404 });
    expect(
      parseDecision({ problemId: rec.problem.id, draftId: recommended.id, decision: "approve", adjustment: { units: 0 } }, engine.recommendations),
    ).toMatchObject({ ok: false, status: 400 });
  });
});
