"use client";

import { Check, Minus, X } from "lucide-react";
import type { Option, OptionSet } from "@/lib/decisionTypes";
import { formatINR, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface OptionsTableProps {
  set: OptionSet;
  selectedId: string;
  onSelect: (id: string) => void;
  /** Shortages have a stock-out to beat; excess stock doesn't. */
  showTiming: boolean;
}

function YesNo({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="inline-flex items-center gap-1 text-healthy-ink"><Check className="h-3.5 w-3.5" aria-hidden="true" />Yes</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-critical-ink"><X className="h-3.5 w-3.5" aria-hidden="true" />No</span>
  );
}

const ROWS: { label: string; timing?: boolean; cell: (o: Option) => React.ReactNode }[] = [
  { label: "Units", cell: (o) => o.units },
  { label: "Cost", cell: (o) => formatINR(o.cost) },
  { label: "Arrives", cell: (o) => (o.arrivalDate ? formatShortDate(o.arrivalDate) : <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-label="No delivery" />) },
  { label: "Before stock-out", timing: true, cell: (o) => <YesNo yes={o.arrivesBeforeStockout} /> },
  { label: "MOQ", cell: (o) => (o.moqOverbuy > 0 ? `${o.moqOverbuy} extra` : "Fits") },
  { label: "Risk", cell: (o) => <span className="text-muted-foreground">{o.riskNote ?? "None noted"}</span> },
];

/** Options side by side: one column each, the recommended one highlighted. */
export function OptionsTable({ set, selectedId, onSelect, showTiming }: OptionsTableProps) {
  const rec = set.options.find((o) => o.recommended);
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[520px] border-collapse text-xs">
          <caption className="sr-only">Options compared. Select a column to adjust it below.</caption>
          <thead>
            <tr>
              <th scope="col" className="w-28 bg-muted/50 p-2 text-left font-medium text-muted-foreground">Option</th>
              {set.options.map((o) => (
                <th key={o.id} scope="col" className={cn("p-2 text-left align-top font-normal", o.recommended && "bg-primary/5")}>
                  <button
                    type="button"
                    aria-pressed={o.id === selectedId}
                    onClick={() => onSelect(o.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-md p-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      o.id === selectedId && "bg-muted ring-1 ring-primary/50",
                    )}
                  >
                    {o.recommended && (
                      <span className="w-fit rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">Recommended</span>
                    )}
                    <span className="font-medium leading-snug">{o.label}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {ROWS.filter((r) => showTiming || !r.timing).map((row) => (
              <tr key={row.label} className="border-t">
                <th scope="row" className="bg-muted/50 p-2 text-left font-medium text-muted-foreground">{row.label}</th>
                {set.options.map((o) => (
                  <td key={o.id} className={cn("p-2 align-top", o.recommended && "bg-primary/5")}>{row.cell(o)}</td>
                ))}
              </tr>
            ))}
            <tr className="border-t bg-critical/5">
              <th scope="row" className="p-2 text-left font-medium">Do nothing</th>
              <td colSpan={set.options.length} className="p-2">
                <span className="font-semibold text-critical-ink">{formatINR(set.doNothing.cost)}</span>
                <span className="text-muted-foreground"> {set.doNothing.label.toLowerCase()} ({set.doNothing.units} units)</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {rec?.reason && (
        <p className="rounded-lg bg-primary/5 p-3 text-sm">
          <span className="font-medium">Why this one: </span>
          {rec.reason}
          {set.topUp && <span className="text-muted-foreground"> Top-up: {set.topUp.label}, {formatINR(set.topUp.cost)}.</span>}
        </p>
      )}
    </div>
  );
}
