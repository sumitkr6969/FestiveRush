import fs from "node:fs";
import path from "node:path";
import type { DecisionInput, DecisionRecord, Draft } from "./decisionTypes";

// Drafts are built in drafts.ts (pure, browser-safe); re-exported here so the
// layout in CLAUDE.md ("actions.ts: drafts + decision log") still holds.
export { createDraft } from "./drafts";

// ---------------------------------------------------------------------------
// Decision log: data/decisions.json locally. On Vercel the filesystem is read-only,
// so the log silently stays in memory for the life of the server instance.
// ---------------------------------------------------------------------------

export const DECISIONS_PATH = path.join(process.cwd(), "data", "decisions.json");

export interface DecisionLog {
  list(): DecisionRecord[];
  /** `decidedAt` is passed in: the caller owns the clock, so this stays testable. */
  record(input: DecisionInput, draft: Draft, decidedAt: string): DecisionRecord;
  /** Undo. Returns false if the id doesn't exist. */
  remove(id: string): boolean;
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

const idNumber = (id: string) => Number(id.replace(/^D-/, "")) || 0;

export function createDecisionLog(filePath: string | null = DECISIONS_PATH): DecisionLog {
  const records: DecisionRecord[] = filePath ? readExisting(filePath) : [];
  let persistent = filePath !== null;
  // Counts up from the highest id ever issued, so an undo never frees an id for reuse.
  let highest = records.reduce((max, r) => Math.max(max, idNumber(r.id)), 0);

  const save = () => {
    if (!persistent || !filePath) return;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
    } catch {
      persistent = false;
    }
  };

  return {
    list: () => [...records],
    record(input, draft, decidedAt) {
      highest += 1;
      const record: DecisionRecord = {
        id: `D-${String(highest).padStart(4, "0")}`,
        problemId: input.problemId,
        draftId: input.draftId,
        decision: input.decision,
        ...(input.reason ? { reason: input.reason } : {}),
        decidedAt,
        draft,
      };
      records.push(record);
      save();
      return record;
    },
    remove(id) {
      const index = records.findIndex((r) => r.id === id);
      if (index === -1) return false;
      records.splice(index, 1);
      save();
      return true;
    },
    get persistent() {
      return persistent;
    },
  };
}
