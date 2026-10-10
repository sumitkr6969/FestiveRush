import { TODAY } from "@/lib/config";
import { getWritableDb } from "@/lib/db";
import { vaultWrite } from "@/lib/vaultHttp";
import { createOrder } from "@/lib/vaultStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Product vault: record an incoming purchase order for a vault product. */
export function POST(request: Request) {
  return vaultWrite(request, (body) => createOrder(getWritableDb(), body, TODAY));
}
