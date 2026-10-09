"use client";

import { useMemo } from "react";
import { useDecisions } from "@/components/providers/decisions-provider";
import type { Recommendation } from "@/lib/engine";
import type { SignalsResponse } from "@/lib/views";
import { openSignals } from "./signalGroups";
import { useApi } from "./useApi";

/**
 * Signals still waiting for a decision, in the engine's ranked order.
 * Decided signals (and the ones they settle) drop out the moment the user acts.
 */
export function useOpenSignals() {
  const api = useApi<SignalsResponse>("/api/signals");
  const { decidedIds } = useDecisions();
  const open = useMemo<Recommendation[]>(() => openSignals(api.data?.recommendations ?? [], decidedIds), [api.data, decidedIds]);
  return { ...api, open };
}
