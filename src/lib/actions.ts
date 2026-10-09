import fs from "node:fs";
import path from "node:path";
import type {
  DecisionInput,
  DecisionRecord,
  Draft,
  DraftKind,
  Option,
} from "./decisionTypes";

// ---------------------------------------------------------------------------
// Simulated action drafts. Nothing here executes anything: a draft is what a
// human approves or rejects (CLAUDE.md rule 8).
// ---------------------------------------------------------------------------

function draftKind(option: Option): DraftKind {
  switch (option.kind) {
    case "TRANSFER_FROM_STORE":
    case "TRANSFER_FROM_WAREHOUSE":
    case "TRANSFER_TO_STORE":
      return "TRANSFER";
    case "ORDER_FROM_SUPPLIER":
      // A supplier that can't confirm stock gets an enquiry, not a purchase order.
      return option.supplierAvailability === "in_stock" ? "PO_DRAFT" : "SUPPLIER_ENQUIRY";
    case "WAIT_FOR_PO":
    case "CANCEL_INBOUND_PO":
    case "MARKDOWN_REVIEW":
    case "HOLD":
      return "ALERT";
  }
}

const TITLE: Record<DraftKind, string> = {
  TRANSFER: "Simulated transfer",
  PO_DRAFT: "Simulated purchase order",
  SUPPLIER_ENQUIRY: "Simulated supplier enquiry",
  ALERT: "Simulated alert",
};

export function createDraft(option: Option): Draft {
  const kind = draftKind(option);
  return {
    id: `DRAFT:${option.id}`,
    kind,
    optionId: option.id,
    title: `${TITLE[kind]}: ${option.label}`,
    sku: option.sku,
    qty: option.units,
    from: option.from,
    to: option.to,
    cost: option.cost,
    expectedArrival: option.arrivalDate,
    simulated: true,
  };
}

// ---------------------------------------------------------------------------
// Decision log: data/decisions.json locally. On Vercel the filesystem is read-only,
// so the log silently stays in memory for the life of the server instance.
// ---------------------------------------------------------------------------

export const DECISIONS_PATH = path.join(process.cwd(), "data", "decisions.json");

export interface DecisionLog {
  list(): DecisionRecord[];
  /** `decidedAt` is passed in: the caller owns the clock, so this stays testable. */
  record(input: DecisionInput, decidedAt: string): DecisionRecord;
  /** False once a write has failed (e.g. read-only filesystem). */
  readonly persistent: boolean;
}

function readExisting(filePath: string): DecisionRecord[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? (parsed as DecisionRecord[]) : [];
  } catch {
    return [];
  }
}

export function createDecisionLog(filePath: string | null = DECISIONS_PATH): DecisionLog {
  const records: DecisionRecord[] = filePath ? readExisting(filePath) : [];
  let persistent = filePath !== null;

  return {
    list: () => [...records],
    record(input, decidedAt) {
      const record: DecisionRecord = {
        id: `D-${String(records.length + 1).padStart(4, "0")}`,
        problemId: input.problemId,
        draftId: input.draftId,
        decision: input.decision,
        ...(input.reason ? { reason: input.reason } : {}),
        decidedAt,
      };
      records.push(record);
      if (persistent && filePath) {
        try {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
        } catch {
          persistent = false;
        }
      }
      return record;
    },
    get persistent() {
      return persistent;
    },
  };
}
