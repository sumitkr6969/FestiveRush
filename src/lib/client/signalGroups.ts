import type { Problem } from "@/lib/decisionTypes";
import type { Recommendation } from "@/lib/engine";

/**
 * Stock-out risk, store imbalance and supplier trade-off at one store are three
 * views of the same shortage, and they recommend the same plan. Deciding one
 * settles the others, so the same transfer can't be approved twice.
 * Network-wide signals (no store) stand alone.
 */
export function groupKey(p: Problem): string | null {
  return p.store ? `${p.sku}|${p.store}|${p.context.kind}` : null;
}

/** Other signals settled by a decision on `rec`. */
export function relatedSignals(rec: Recommendation, recs: readonly Recommendation[]): Recommendation[] {
  const key = groupKey(rec.problem);
  return key ? recs.filter((r) => r.problem.id !== rec.problem.id && groupKey(r.problem) === key) : [];
}

/** Signals with no decision on them or on any signal in their group. */
export function openSignals(recs: readonly Recommendation[], decidedIds: ReadonlySet<string>): Recommendation[] {
  const decidedGroups = new Set(
    recs.flatMap((r) => (decidedIds.has(r.problem.id) ? [groupKey(r.problem)] : [])).filter((k): k is string => k !== null),
  );
  return recs.filter((r) => {
    if (decidedIds.has(r.problem.id)) return false;
    const key = groupKey(r.problem);
    return key === null || !decidedGroups.has(key);
  });
}
