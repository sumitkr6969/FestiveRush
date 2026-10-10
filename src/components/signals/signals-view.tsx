"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { applyFilters, hasFilters, parseFilters, toQuery, type SignalFilters } from "@/lib/client/signalFilters";
import { relatedSignals } from "@/lib/client/signalGroups";
import { useOpenSignals } from "@/lib/client/useSignals";
import type { ProblemType } from "@/lib/decisionTypes";
import { FilterBar } from "./filter-bar";
import { ReviewSheet } from "./review-sheet";
import { SignalCard } from "./signal-card";

export function SignalsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { open, data, error, loading, reload } = useOpenSignals();

  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const reviewId = params.get("review");
  const visible = useMemo(() => applyFilters(open, filters), [open, filters]);

  const navigate = useCallback(
    (next: SignalFilters, review: string | null) => router.replace(`${pathname}${toQuery(next, review)}`, { scroll: false }),
    [router, pathname],
  );

  // The review may target a signal hidden by filters (e.g. from Overview), so look in all open ones.
  const reviewList = visible.some((r) => r.problem.id === reviewId) ? visible : open;
  const index = reviewList.findIndex((r) => r.problem.id === reviewId);
  const current = index >= 0 ? (reviewList[index] ?? null) : null;

  const step = (delta: number) => {
    if (reviewList.length === 0) return;
    const next = reviewList[(Math.max(index, 0) + delta + reviewList.length) % reviewList.length];
    if (next) navigate(filters, next.problem.id);
  };

  // After a decision, move to the next signal so a review can run start to finish,
  // skipping signals the decision just settled.
  const afterDecision = () => {
    if (!current) return navigate(filters, null);
    const settled = new Set([current.problem.id, ...relatedSignals(current, reviewList).map((r) => r.problem.id)]);
    const after = reviewList.slice(index + 1).find((r) => !settled.has(r.problem.id));
    const before = reviewList.slice(0, index).reverse().find((r) => !settled.has(r.problem.id));
    navigate(filters, (after ?? before)?.problem.id ?? null);
  };

  const categories = useMemo(() => [...new Set((data?.recommendations ?? []).map((r) => r.problem.category))].sort(), [data]);
  const stores = useMemo(() => [...new Set((data?.recommendations ?? []).flatMap((r) => (r.problem.store ? [r.problem.store] : [])))].sort(), [data]);
  const typeCounts = useMemo(() => {
    const counts: Partial<Record<ProblemType, number>> = {};
    for (const r of open) counts[r.problem.type] = (counts[r.problem.type] ?? 0) + 1;
    return counts;
  }, [open]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Stock signals"
        description={loading && !data ? "Loading signals" : `${visible.length} of ${open.length} open signals${filters.sort === "urgency" ? ", most urgent first" : ""}`}
      />
      <FilterBar filters={filters} onChange={(f) => navigate(f, reviewId)} categories={categories} stores={stores} counts={typeCounts} />

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <ListSkeleton rows={5} />
      ) : visible.length === 0 ? (
        open.length === 0 ? (
          <EmptyState title="Queue cleared" body="Every signal has a decision. New ones appear when stock, sales or orders change." />
        ) : (
          <EmptyState
            title="No signals match these filters"
            body="Try removing a filter or searching for a different SKU or store."
            action={hasFilters(filters) ? <Button variant="outline" size="sm" onClick={() => navigate({ ...filters, severity: [], types: [], category: null, store: null, promo: null, vault: false, q: "" }, null)}>Clear filters</Button> : undefined}
          />
        )
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Signals">
          <AnimatePresence initial={false}>
            {visible.map((rec) => (
              <motion.li
                key={rec.problem.id}
                layout
                exit={{ opacity: 0, x: 32, transition: { duration: 0.2, ease: "easeOut" } }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <SignalCard rec={rec} active={rec.problem.id === reviewId} onOpen={() => navigate(filters, rec.problem.id)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <ReviewSheet
        rec={current}
        related={current ? relatedSignals(current, open) : []}
        position={{ index: Math.max(index, 0), total: reviewList.length }}
        onClose={() => navigate(filters, null)}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onDecided={afterDecision}
      />
    </div>
  );
}
