import fs from "node:fs";
import path from "node:path";
import type { PoStatusInput, PoStatusUpdate } from "./poStatus";

// Supplier status updates: data/po-status.json locally, memory-only on Vercel
// (read-only filesystem), the same pattern as the decisions log. The database
// keeps the promised dates untouched.

export const PO_STATUS_PATH = path.join(process.cwd(), "data", "po-status.json");

export interface PoStatusLog {
  list(): PoStatusUpdate[];
  add(po: string, reportedBy: string, input: PoStatusInput, reportedAt: string): PoStatusUpdate;
  readonly persistent: boolean;
}

function readExisting(filePath: string): PoStatusUpdate[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? (parsed as PoStatusUpdate[]) : [];
  } catch {
    return [];
  }
}

export function createPoStatusLog(filePath: string | null = PO_STATUS_PATH): PoStatusLog {
  const updates: PoStatusUpdate[] = filePath ? readExisting(filePath) : [];
  let persistent = filePath !== null;
  let highest = updates.reduce((max, u) => Math.max(max, Number(u.id.replace(/^U-/, "")) || 0), 0);

  return {
    list: () => [...updates],
    add(po, reportedBy, input, reportedAt) {
      highest += 1;
      const update: PoStatusUpdate = { id: `U-${String(highest).padStart(4, "0")}`, po, reportedBy, reportedAt, ...input };
      updates.push(update);
      if (persistent && filePath) {
        try {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, JSON.stringify(updates, null, 2));
        } catch {
          persistent = false;
        }
      }
      return update;
    },
    get persistent() {
      return persistent;
    },
  };
}
