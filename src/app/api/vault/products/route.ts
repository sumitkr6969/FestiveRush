import { TODAY } from "@/lib/config";
import { getWritableDb } from "@/lib/db";
import { vaultWrite } from "@/lib/vaultHttp";
import { createProduct } from "@/lib/vaultStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Product vault: add a product, its stock at one store and its supplier terms. */
export function POST(request: Request) {
  return vaultWrite(request, (body) => createProduct(getWritableDb(), body, TODAY));
}
