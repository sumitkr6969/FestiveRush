import { TODAY } from "@/lib/config";
import { getWritableDb } from "@/lib/db";
import { vaultWrite } from "@/lib/vaultHttp";
import { sell } from "@/lib/vaultStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Billing counter: sell vault products at a store, dated today. */
export function POST(request: Request) {
  return vaultWrite(request, (body) => sell(getWritableDb(), body, TODAY));
}
