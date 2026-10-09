import { NextResponse } from "next/server";
import { getDecisionLog } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Undo: removes one logged decision. */
export function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const removed = getDecisionLog().remove(params.id);
  if (!removed) return NextResponse.json({ error: "No such decision." }, { status: 404 });
  return NextResponse.json({ removed: params.id });
}
