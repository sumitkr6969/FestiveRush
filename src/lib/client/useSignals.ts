"use client";

import { useMemo } from "react";
import { useDecisions } from "@/components/providers/decisions-provider";
import type { Recommendation } from "@/lib/engine";
import type { SignalsResponse } from "@/lib/views";
import { useApi } from "./useApi";

/**
 * Signals still waiting for a decision, in the engine's ranked order.
 * Decided signals drop out the moment the user approves or rejects.
 */
export function useOpenSignals() {
  const api = useApi<SignalsResponse>("/api/signals");
  const { decidedIds } = useDecisions();
  const open = useMemo<Recommendation[]>(
    () => (api.data?.recommendations ?? []).filter((r) => !decidedIds.has(r.problem.id)),
    [api.data, decidedIds],
  );
  return { ...api, open };
}
