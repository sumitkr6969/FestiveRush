"use client";

import type { FieldErrors } from "@/lib/vault";
import { invalidateApi } from "./useApi";

export type SaveResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors: FieldErrors };

/** POSTs a write (vault, billing, supplier status). On success every engine view is refreshed. */
export async function postAndRefresh<T>(url: string, body: unknown): Promise<SaveResult<T>> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: FieldErrors };
    if (!res.ok) return { ok: false, error: json.error ?? `Request failed (${res.status})`, fieldErrors: json.fieldErrors ?? {} };
    invalidateApi();
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again.", fieldErrors: {} };
  }
}
