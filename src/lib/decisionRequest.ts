import type { DecisionInput } from "./decisionTypes";
import type { Recommendation } from "./engine";

const MAX_REASON_LENGTH = 500;

export type ParsedDecision =
  | { ok: true; input: DecisionInput }
  | { ok: false; status: 400 | 404; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Validates a POST /api/decisions body and checks the draft really belongs to the
 * problem, so nobody can log a decision for an action the engine never proposed.
 */
export function parseDecision(body: unknown, recommendations: readonly Recommendation[]): ParsedDecision {
  if (!isRecord(body)) return { ok: false, status: 400, error: "Body must be a JSON object." };
  const { problemId, draftId, decision, reason } = body;
  if (typeof problemId !== "string" || typeof draftId !== "string") {
    return { ok: false, status: 400, error: "problemId and draftId are required strings." };
  }
  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, status: 400, error: "decision must be 'approve' or 'reject'." };
  }
  if (reason !== undefined && (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH)) {
    return { ok: false, status: 400, error: `reason must be a string of at most ${MAX_REASON_LENGTH} characters.` };
  }
  const rec = recommendations.find((r) => r.problem.id === problemId);
  if (!rec || !rec.drafts.some((d) => d.id === draftId)) {
    return { ok: false, status: 404, error: "No such draft for that problem." };
  }
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  return {
    ok: true,
    input: {
      problemId,
      draftId,
      decision: decision === "approve" ? "approved" : "rejected",
      ...(trimmed ? { reason: trimmed } : {}),
    },
  };
}
