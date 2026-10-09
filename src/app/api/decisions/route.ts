import { NextResponse } from "next/server";
import { parseDecision } from "@/lib/decisionRequest";
import { getDecisionLog, getEngine } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const log = getDecisionLog();
  return NextResponse.json({ decisions: log.list(), persistent: log.persistent });
}

/**
 * Logs a human approve/reject: one record per draft in the plan (the option and
 * its top-up order, if any). Nothing is executed; every draft stays simulated.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const parsed = parseDecision(body, getEngine().recommendations);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const log = getDecisionLog();
  // Wall-clock audit time, not business time, so `new Date()` is right here.
  const decidedAt = new Date().toISOString();
  const decisions = parsed.drafts.map((draft) =>
    log.record(
      { problemId: parsed.problemId, draftId: draft.id, decision: parsed.decision, ...(parsed.reason ? { reason: parsed.reason } : {}) },
      draft,
      decidedAt,
    ),
  );
  return NextResponse.json({ decisions, persistent: log.persistent }, { status: 201 });
}
