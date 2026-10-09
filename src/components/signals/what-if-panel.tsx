"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Option } from "@/lib/decisionTypes";
import { formatINR, formatShortDate } from "@/lib/format";
import type { SourceChoice, WhatIfResult } from "@/lib/whatIf";

interface WhatIfPanelProps {
  base: Option;
  result: WhatIfResult;
  units: number;
  maxUnits: number;
  source: string;
  sources: SourceChoice[];
  showTiming: boolean;
  onUnits: (n: number) => void;
  onSource: (s: string) => void;
  onReset: () => void;
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border p-2.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={tone === "good" ? "font-semibold text-healthy-ink" : tone === "bad" ? "font-semibold text-critical-ink" : "font-semibold"}>
        {value}
      </span>
    </div>
  );
}

/** Quantity and source controls that recompute cost, arrival and coverage live. */
export function WhatIfPanel({ base, result, units, maxUnits, source, sources, showTiming, onUnits, onSource, onReset }: WhatIfPanelProps) {
  const o = result.option;
  const horizon = result.plan.curve.length - 1;
  const changed = units !== base.units || source !== base.from;
  return (
    <div className="flex flex-col gap-4">
      {sources.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span id="whatif-source" className="text-xs font-medium text-muted-foreground">Source</span>
          <ToggleGroup
            type="single"
            value={source}
            onValueChange={(v) => v && onSource(v)}
            aria-labelledby="whatif-source"
            className="flex flex-wrap justify-start gap-1"
          >
            {sources.map((s) => (
              <ToggleGroupItem key={s.value} value={s.value} size="sm" variant="outline" className="h-8 text-xs">
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <label id="whatif-qty" className="font-medium text-muted-foreground">Quantity</label>
          <span className="font-semibold tabular-nums">{units} units{o.units !== units && ` (${o.units} after limits)`}</span>
        </div>
        <Slider
          aria-labelledby="whatif-qty"
          min={1}
          max={Math.max(1, maxUnits)}
          step={1}
          value={[units]}
          onValueChange={([v]) => v !== undefined && onUnits(v)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat label="Cost" value={formatINR(o.cost + (result.topUp?.cost ?? 0))} />
        <Stat label="Arrives" value={o.arrivalDate ? formatShortDate(o.arrivalDate) : "No delivery"} />
        {showTiming ? (
          <Stat label="Before stock-out" value={o.arrivesBeforeStockout ? "Yes" : "No"} tone={o.arrivesBeforeStockout ? "good" : "bad"} />
        ) : (
          <Stat label="Units" value={o.units} />
        )}
        <Stat
          label="Coverage"
          value={result.plan.stockoutDay === null ? `All ${horizon} days` : `${result.coverageDays} of ${horizon} days`}
          tone={result.plan.stockoutDay === null ? "good" : undefined}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Lost units over {horizon} days: <span className="font-semibold text-foreground tabular-nums">{result.plan.lostUnits}</span> with this plan,{" "}
          <span className="tabular-nums">{result.baseline.lostUnits}</span> with no action.
          {result.topUp && ` Includes top-up: ${result.topUp.label}.`}
        </span>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onReset} disabled={!changed}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Reset
        </Button>
      </div>
    </div>
  );
}
