import { NextResponse } from "next/server";
import { TODAY } from "@/lib/config";
import { getDb } from "@/lib/db";
import { listVault } from "@/lib/vaultStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(listVault(getDb(), TODAY));
}
