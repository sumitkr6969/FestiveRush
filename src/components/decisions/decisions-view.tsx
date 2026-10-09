"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { useDecisions } from "@/components/providers/decisions-provider";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DecisionRecord } from "@/lib/decisionTypes";
import { DRAFT_LABEL } from "@/lib/drafts";
import { formatINR, formatShortDate, formatTimestamp } from "@/lib/format";

type Filter = "all" | "approved" | "rejected";

const CSV_COLUMNS = ["id", "decidedAt", "decision", "reason", "problemId", "draftKind", "sku", "qty", "from", "to", "cost", "expectedArrival"] as const;

/** Quotes every field so commas and quotes in reasons can't break the file. */
function toCsv(records: readonly DecisionRecord[]): string {
  const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = records.map((r) =>
    [r.id, r.decidedAt, r.decision, r.reason, r.problemId, r.draft.kind, r.draft.sku, r.draft.qty, r.draft.from, r.draft.to, r.draft.cost, r.draft.expectedArrival]
      .map(cell)
      .join(","),
  );
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n");
}

function download(records: readonly DecisionRecord[]) {
  const url = URL.createObjectURL(new Blob([toCsv(records)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "voltkart-decisions.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function DecisionsView() {
  const { records, loading, error, persistent, reload } = useDecisions();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = useMemo(
    () => [...records].filter((r) => filter === "all" || r.decision === filter).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt) || b.id.localeCompare(a.id)),
    [records, filter],
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Decisions log"
        description={persistent ? "Every approved or rejected action, newest first. All actions are simulated." : "Kept in memory on this server, so it resets on redeploy. All actions are simulated."}
        actions={
          <>
            <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as Filter)} aria-label="Filter by decision" variant="outline" size="sm">
              <ToggleGroupItem value="all" className="h-8 px-3 text-xs">All</ToggleGroupItem>
              <ToggleGroupItem value="approved" className="h-8 px-3 text-xs">Approved</ToggleGroupItem>
              <ToggleGroupItem value="rejected" className="h-8 px-3 text-xs">Rejected</ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" size="sm" onClick={() => download(shown)} disabled={shown.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Export CSV
            </Button>
          </>
        }
      />
      {error && records.length === 0 ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && records.length === 0 ? (
        <ListSkeleton rows={3} />
      ) : shown.length === 0 ? (
        <EmptyState
          title={records.length === 0 ? "No decisions yet" : `No ${filter} decisions`}
          body={records.length === 0 ? "Approve or reject a signal and it shows up here with its quantity, cost and reason." : "Switch the filter to see the rest."}
          action={records.length === 0 ? <Button asChild size="sm"><Link href="/signals">Go to Stock signals</Link></Button> : undefined}
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {shown.map((r) => {
            const approved = r.decision === "approved";
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {approved ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-healthy/10 px-2 py-0.5 font-medium text-healthy-ink ring-1 ring-inset ring-healthy/25">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground ring-1 ring-inset ring-border">
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />Rejected
                      </span>
                    )}
                    <span className="text-muted-foreground">{DRAFT_LABEL[r.draft.kind]} · simulated</span>
                  </div>
                  <p className="text-sm font-medium">
                    {r.draft.qty} × {r.draft.sku}: {r.draft.from} to {r.draft.to}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatINR(r.draft.cost)}
                    {r.draft.expectedArrival && `, expected ${formatShortDate(r.draft.expectedArrival)}`}
                  </p>
                  {r.reason && <p className="text-sm">Reason: {r.reason}</p>}
                </div>
                <time dateTime={r.decidedAt} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatTimestamp(r.decidedAt)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
