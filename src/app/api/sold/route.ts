import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listSold } from "@/lib/vaultStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ sales: listSold(getDb()) });
}
