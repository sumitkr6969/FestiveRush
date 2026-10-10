"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { fetchJson } from "@/lib/client/useApi";
import type { DecisionRecord, OptionAdjustment } from "@/lib/decisionTypes";

const UNDO_WINDOW_MS = 8000;

export interface DecideArgs {
  problemId: string;
  draftId: string;
  decision: "approve" | "reject";
  reason?: string;
  adjustment?: OptionAdjustment;
  /** Short description for the toast, e.g. "Transfer 11 from Malleshwaram to Koramangala". */
  summary: string;
}

interface DecisionsContextValue {
  records: DecisionRecord[];
  loading: boolean;
  error: string | null;
  persistent: boolean;
  /** Problems with a decision, including ones still being saved. */
  decidedIds: ReadonlySet<string>;
  decide: (args: DecideArgs) => Promise<boolean>;
  reload: () => void;
}

const DecisionsContext = createContext<DecisionsContextValue | null>(null);

export function DecisionsProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [persistent, setPersistent] = useState(true);
  const recordsRef = useRef(records);
  recordsRef.current = records;

  const reload = useCallback(() => {
    setLoading(true);
    fetchJson<{ decisions: DecisionRecord[]; persistent: boolean }>("/api/decisions")
      .then((d) => {
        setRecords(d.decisions);
        setPersistent(d.persistent);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load decisions"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);

  const setPendingFor = (problemId: string, on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(problemId);
      else next.delete(problemId);
      return next;
    });

  const undo = useCallback(
    async (ids: string[]) => {
      const removed = recordsRef.current.filter((r) => ids.includes(r.id));
      setRecords((prev) => prev.filter((r) => !ids.includes(r.id)));
      try {
        await Promise.all(ids.map((id) => fetchJson(`/api/decisions/${encodeURIComponent(id)}`, { method: "DELETE" })));
        toast("Decision undone", { description: "The signal is back in your queue." });
      } catch {
        setRecords((prev) => [...prev, ...removed]);
        toast.error("Couldn't undo", { description: "The decision is still logged. Try again from the Decisions log." });
      }
    },
    [],
  );

  const decide = useCallback(
    async ({ summary, ...body }: DecideArgs) => {
      // Optimistic: the card leaves and counters drop before the server answers.
      setPendingFor(body.problemId, true);
      try {
        const res = await fetchJson<{ decisions: DecisionRecord[]; persistent: boolean }>("/api/decisions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        setRecords((prev) => [...prev, ...res.decisions]);
        setPersistent(res.persistent);
        const ids = res.decisions.map((d) => d.id);
        const verb = body.decision === "approve" ? "Approved" : "Rejected";
        toast.success(`${verb}: ${summary}`, {
          description: "Simulated. Nothing was sent.",
          duration: UNDO_WINDOW_MS,
          action: { label: "Undo", onClick: () => void undo(ids) },
        });
        return true;
      } catch (e) {
        toast.error("Decision not saved", { description: e instanceof Error ? e.message : "Try again." });
        return false;
      } finally {
        setPendingFor(body.problemId, false);
      }
    },
    [undo],
  );

  const decidedIds = useMemo(() => new Set([...records.map((r) => r.problemId), ...pending]), [records, pending]);

  const value = useMemo(
    () => ({ records, loading, error, persistent, decidedIds, decide, reload }),
    [records, loading, error, persistent, decidedIds, decide, reload],
  );
  return <DecisionsContext.Provider value={value}>{children}</DecisionsContext.Provider>;
}

export function useDecisions(): DecisionsContextValue {
  const ctx = useContext(DecisionsContext);
  if (!ctx) throw new Error("useDecisions must be used inside <DecisionsProvider>");
  return ctx;
}
