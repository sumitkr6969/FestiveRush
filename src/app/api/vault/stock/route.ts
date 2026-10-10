import { getWritableDb } from "@/lib/db";
import { vaultWrite } from "@/lib/vaultHttp";
import { addStock } from "@/lib/vaultStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Product vault: receive more units of a vault product at a store. */
export function POST(request: Request) {
  return vaultWrite(request, (body) => addStock(getWritableDb(), body));
}
