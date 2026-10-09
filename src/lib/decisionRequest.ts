import type { DecisionOutcome, Draft, OptionAdjustment } from "./decisionTypes";
import { createDraft } from "./drafts";
import type { Recommendation } from "./engine";
import { runWhatIf } from "./whatIf";

const MAX_REASON_LENGTH = 500;

export type ParsedDecision =
  | { ok: true; problemId: string; decision: DecisionOutcome; reason?: string; drafts: Draft[] }
  | { ok: false; status: 400 | 404; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function parseAdjustment(value: unknown): OptionAdjustment | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || typeof value.units !== "number" || !Number.isFinite(value.units) || value.units < 1) return null;
  if (value.source !== undefined && typeof value.source !== "string") return null;
  return { units: value.units, ...(typeof value.source === "string" ? { source: value.source } : {}) };
}

/**
 * Validates a POST /api/decisions body. The draft must be one the engine proposed,
 * and any what-if change is recomputed here with the same pure function the browser
 * used, so the logged cost and arrival can't be edited client-side.
 */
export function parseDecision(body: unknown, recommendations: readonly Recommendation[]): ParsedDecision {
  if (!isRecord(body)) return { ok: false, status: 400, error: "Body must be a JSON object." };
  const { problemId, draftId, decision, reason, adjustment } = body;
  if (typeof problemId !== "string" || typeof draftId !== "string") {
    return { ok: false, status: 400, error: "problemId and draftId are required strings." };
  }
  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, status: 400, error: "decision must be 'approve' or 'reject'." };
  }
  if (reason !== undefined && (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH)) {
    return { ok: false, status: 400, error: `reason must be a string of at most ${MAX_REASON_LENGTH} characters.` };
  }
  const adj = parseAdjustment(adjustment);
  if (adj === null) return { ok: false, status: 400, error: "adjustment must be { units >= 1, source? }." };

  const rec = recommendations.find((r) => r.problem.id === problemId);
  const draft = rec?.drafts.find((d) => d.id === draftId);
  const base = rec ? [...rec.optionSet.options, rec.optionSet.topUp].find((o) => o?.id === draft?.optionId) : undefined;
  if (!rec || !base) return { ok: false, status: 404, error: "No such draft for that problem." };

  const result = runWhatIf(problemId, rec.problem.context, base, adj);
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  return {
    ok: true,
    problemId,
    decision: decision === "approve" ? "approved" : "rejected",
    ...(trimmed ? { reason: trimmed } : {}),
    drafts: [result.option, result.topUp].flatMap((o) => (o ? [createDraft(o)] : [])),
  };
}
