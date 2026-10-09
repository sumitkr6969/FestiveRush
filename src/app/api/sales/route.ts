import { NextResponse } from "next/server";
import { TODAY } from "@/lib/config";
import { getEngine, getSalesSeries } from "@/lib/engine";
import { salesView } from "@/lib/views";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(salesView(TODAY, getSalesSeries(TODAY), getEngine(TODAY)));
}
