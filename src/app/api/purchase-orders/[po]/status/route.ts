import { NextResponse } from "next/server";
import { TODAY } from "@/lib/config";
import { getEngine, getPoStatusLog, invalidateEngine } from "@/lib/engine";
import { validateStatusUpdate } from "@/lib/poStatus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Live status from the supplier (or a buyer relaying it): a new ETA, dispatched,
 * delayed or delivered. Logged alongside the PO; the promised date never changes.
 */
export async function POST(request: Request, { params }: { params: { po: string } }) {
  const po = getEngine().snapshot.plannedPurchaseOrders.find((p) => p.po === params.po);
  if (!po) return NextResponse.json({ error: "No such purchase order." }, { status: 404 });
  const live = getEngine().snapshot.poLive[po.po];
  if (live?.state === "delivered") return NextResponse.json({ error: `${po.po} is already delivered.` }, { status: 409 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const parsed = validateStatusUpdate(body, po, TODAY);
  if (!parsed.ok) return NextResponse.json({ error: "Some fields need attention.", fieldErrors: parsed.errors }, { status: 400 });

  const log = getPoStatusLog();
  // Wall-clock time the update arrived; business dates stay on TODAY.
  const update = log.add(po.po, po.supplier, parsed.value, new Date().toISOString());
  invalidateEngine();
  return NextResponse.json({ update, live: getEngine().snapshot.poLive[po.po], persistent: log.persistent }, { status: 201 });
}
