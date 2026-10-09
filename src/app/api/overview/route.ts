import { NextResponse } from "next/server";
import { getEngine } from "@/lib/engine";
import { overviewView } from "@/lib/views";

// Reads SQLite via better-sqlite3, so it must run on the Node.js runtime per request.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(overviewView(getEngine()));
}
