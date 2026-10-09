import { NextResponse } from "next/server";
import { parseDecision } from "@/lib/decisionRequest";
import { getDecisionLog, getEngine } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const log = getDecisionLog();
  return NextResponse.json({ decisions: log.list(), persistent: log.persistent });
}

/** Logs a human approve/reject. Records the decision only: the action stays simulated. */
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
  const record = log.record(parsed.input, new Date().toISOString());
  return NextResponse.json({ decision: record, persistent: log.persistent }, { status: 201 });
}
