"use client";

import { useCallback, useEffect, useState } from "react";

// Tiny fetch cache shared by every page, so moving between pages is instant and
// several components can read one response without refetching.
const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function load<T>(url: string): Promise<T> {
  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;
  const promise = fetchJson<T>(url)
    .then((data) => {
      cache.set(url, data);
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, promise);
  return promise;
}

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Pass null to stay idle (e.g. until a dialog opens). */
export function useApi<T>(url: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(() => (url ? ((cache.get(url) as T | undefined) ?? null) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => Boolean(url && !cache.has(url)));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const cached = cache.get(url) as T | undefined;
    if (cached && version === 0) {
      setData(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    load<T>(url)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Something went wrong"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [url, version]);

  const reload = useCallback(() => {
    if (url) cache.delete(url);
    setVersion((v) => v + 1);
  }, [url]);

  return { data, error, loading, reload };
}
