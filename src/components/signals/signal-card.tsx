"use client";

import { ChevronRight } from "lucide-react";
import { SeverityBadge } from "@/components/common/severity";
import { TYPE_LABEL } from "@/lib/client/labels";
import type { Recommendation } from "@/lib/engine";
import { formatCompactINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EvidenceChips } from "./evidence-chips";

interface SignalCardProps {
  rec: Recommendation;
  onOpen: () => void;
  active?: boolean;
  /** Overview's "Next best move" uses a shorter card without chips. */
  compact?: boolean;
}

export function SignalCard({ rec, onOpen, active, compact }: SignalCardProps) {
  const p = rec.problem;
  const excess = p.context.kind === "excess";
  return (
    <article
      onClick={onOpen}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm transition-colors duration-150 ease-out hover:border-primary/40",
        active && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={p.severity} />
          <span className="text-xs text-muted-foreground">{TYPE_LABEL[p.type]}</span>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold">{formatCompactINR(p.facts.cashAtRisk)}</p>
          <p className="text-[11px] text-muted-foreground">{excess ? "tied up" : "sales at risk"}</p>
        </div>
      </div>
      <h3 className="text-sm font-medium leading-snug">
        {/* The title button is the keyboard target; the whole card is clickable for pointers. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {p.product}
          <span className="font-normal text-muted-foreground"> · {p.store ?? "All stores"}</span>
        </button>
      </h3>
      <p className="text-sm text-muted-foreground">{p.message}</p>
      {!compact && (
        <div className="relative z-10">
          <EvidenceChips problem={p} />
        </div>
      )}
      {compact && (
        <span className="mt-1 inline-flex items-center text-xs font-medium text-primary">
          Review
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      )}
    </article>
  );
}
