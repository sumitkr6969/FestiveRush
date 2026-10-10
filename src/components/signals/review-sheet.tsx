"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { SeverityBadge } from "@/components/common/severity";
import { useDecisions } from "@/components/providers/decisions-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EVIDENCE_LABEL, MONEY_KEYS, TYPE_LABEL } from "@/lib/client/labels";
import { NO_SALES_DAYS_OF_STOCK, WAREHOUSE } from "@/lib/config";
import type { Option, OptionAdjustment } from "@/lib/decisionTypes";
import { createDraft } from "@/lib/drafts";
import type { Recommendation } from "@/lib/engine";
import { formatINR, formatNumber, formatShortDate } from "@/lib/format";
import { runWhatIf, sourcesFor } from "@/lib/whatIf";
import { DraftPreview } from "./draft-preview";
import { LatePoPanel } from "./late-po-panel";
import { OptionsTable } from "./options-table";
import { RejectDialog } from "./reject-dialog";
import { StockTimeline, type TimelineMarker } from "./stock-timeline";
import { WhatIfPanel } from "./what-if-panel";

interface ReviewSheetProps {
  rec: Recommendation | null;
  /** Open signals this decision also settles (same SKU, store and kind). */
  related: Recommendation[];
  position: { index: number; total: number };
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Called after a decision is sent, so the list can move on. */
  onDecided: () => void;
}

interface Selection {
  problemId: string;
  optionId: string;
  units: number;
  source: string;
}

const ADJUSTABLE =new Set<Option["kind"]>(["ORDER_FROM_SUPPLIER", "TRANSFER_FROM_STORE", "TRANSFER_FROM_WAREHOUSE", "WAIT_FOR_PO", "TRANSFER_TO_STORE", "MARKDOWN_REVIEW"]);
const SOURCED = new Set<Option["kind"]>(["ORDER_FROM_SUPPLIER", "TRANSFER_FROM_STORE", "TRANSFER_FROM_WAREHOUSE", "TRANSFER_TO_STORE"]);

function formatEvidence(key: string, value: string | number | boolean | null): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (MONEY_KEYS.has(key)) return formatINR(value);
    if (key === "expectedUplift") return `+${Math.round(value * 100)}%`;
    return formatNumber(value);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatShortDate(value) : value;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

export function ReviewSheet({ rec, related, position, onClose, onPrev, onNext, onDecided }: ReviewSheetProps) {
  const { decide } = useDecisions();
  const recommended = rec?.optionSet.options.find((o) => o.recommended) ?? rec?.optionSet.options[0] ?? null;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const defaultSource = (o: Option) => (o.kind === "TRANSFER_TO_STORE" ? o.to : o.from);
  const initial = (o: Option): Selection => ({ problemId: rec?.problem.id ?? "", optionId: o.id, units: o.units, source: defaultSource(o) });
  // A selection only counts for the signal it was made on; each new signal starts on its recommendation.
  const active = rec && selection?.problemId === rec.problem.id ? selection : recommended ? initial(recommended) : null;
  const base = rec?.optionSet.options.find((o) => o.id === active?.optionId) ?? recommended;
  const units = active?.units ?? 0;
  const source = active?.source ?? "";
  const excess = rec?.problem.context.kind === "excess";

  const selectOption = (o: Option) => setSelection(initial(o));
  const setUnits = (n: number) => active && setSelection({ ...active, units: n });
  const setSource = (s: string) => active && setSelection({ ...active, source: s });

  const adjustment: OptionAdjustment | undefined =
    base && (units !== base.units || source !== defaultSource(base)) ? { units, source } : undefined;

  const result = useMemo(
    () => (rec && base ? runWhatIf(rec.problem.id, rec.problem.context, base, adjustment) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rec, base, units, source],
  );

  const sources = useMemo(() => (rec && base && SOURCED.has(base.kind) ? sourcesFor(rec.problem.context) : []), [rec, base]);

  const maxUnits = useMemo(() => {
    if (!rec || !base) return 1;
    const ctx = rec.problem.context;
    if (ctx.kind === "excess") return ctx.excess.excessUnits;
    const { need } = ctx;
    if (base.kind === "WAIT_FOR_PO") return need.inbound.find((p) => p.po === base.po)?.qty ?? base.units;
    const donor = need.donors.find((d) => d.store === source);
    if (donor) return donor.spare;
    if (source === WAREHOUSE) return need.warehouseSpare ?? 1;
    const moq = need.suppliers.find((s) => s.supplier === source)?.moq ?? 1;
    return Math.max(need.unitsNeeded * 2, moq * 2, 10);
  }, [rec, base, source]);

  const changeSource = (next: string) => {
    if (!rec || rec.problem.context.kind !== "replenish") {
      setSource(next);
      return;
    }
    const { need } = rec.problem.context;
    const donor = need.donors.find((d) => d.store === next);
    // Sensible starting quantity for the new source: all it can spare, or the full need.
    const startUnits = donor ? Math.min(donor.spare, need.unitsNeeded) : next === WAREHOUSE ? Math.min(need.warehouseSpare ?? 1, need.unitsNeeded) : need.unitsNeeded;
    if (active) setSelection({ ...active, units: startUnits, source: next });
  };

  const drafts = result ? [result.option, result.topUp].flatMap((o) => (o ? [createDraft(o)] : [])) : [];
  const baseDraftId = rec?.drafts.find((d) => d.optionId === base?.id)?.id ?? null;

  const send = async (decision: "approve" | "reject", reason?: string) => {
    if (!rec || !result || !baseDraftId || busy) return;
    setBusy(true);
    const summary = result.topUp ? `${result.option.label}, plus ${result.topUp.label}` : result.option.label;
    const ok = await decide({ problemId: rec.problem.id, draftId: baseDraftId, decision, reason, adjustment, summary });
    setBusy(false);
    if (ok) onDecided();
  };

  useEffect(() => {
    if (!rec || rejectOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "a") {
        e.preventDefault();
        void send("approve");
      } else if (key === "r") {
        e.preventDefault();
        setRejectOpen(true);
      } else if (key === "j") {
        e.preventDefault();
        onNext();
      } else if (key === "k") {
        e.preventDefault();
        onPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const markers = useMemo<TimelineMarker[]>(() => {
    if (!rec || !result) return [];
    const ctx = rec.problem.context;
    const out: TimelineMarker[] = [];
    const { promotion: promo, asOf } = ctx.kind === "replenish" ? ctx.need : ctx.excess;
    if (ctx.kind === "replenish" && ctx.need.stockoutInDays < NO_SALES_DAYS_OF_STOCK) {
      out.push({ date: ctx.need.stockoutDate, label: "Stock-out", tone: "critical" });
    }
    if (promo && promo.start >= asOf) {
      out.push({ date: promo.start, label: `${promo.name} promo starts`, tone: "info" });
    }
    for (const o of rec.optionSet.options) {
      if (!o.arrivalDate || o.id === result.option.id) continue;
      out.push({ date: o.arrivalDate, label: `${o.from} arrives`, tone: "muted" });
    }
    if (result.option.arrivalDate) out.push({ date: result.option.arrivalDate, label: `${result.option.from} arrives (selected)`, tone: "accent" });
    if (result.topUp?.arrivalDate) out.push({ date: result.topUp.arrivalDate, label: `Top-up arrives`, tone: "accent" });
    return out;
  }, [rec, result]);

  const p = rec?.problem;
  return (
    <Sheet open={rec !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        {p && base && result && (
          <>
            <SheetHeader className="space-y-2 border-b p-4 pr-12 text-left sm:p-6 sm:pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={p.severity} />
                <span className="text-xs text-muted-foreground">{TYPE_LABEL[p.type]}</span>
                <span className="text-xs text-muted-foreground">· {position.index + 1} of {position.total}</span>
              </div>
              <SheetTitle className="text-lg leading-snug">
                Review action: {p.product} <span className="font-normal text-muted-foreground">· {p.store ?? "All stores"}</span>
              </SheetTitle>
              <SheetDescription>{p.message}</SheetDescription>
              {related.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Deciding here also settles {related.length} related {related.length === 1 ? "signal" : "signals"} for this SKU and store:{" "}
                  {related.map((r) => TYPE_LABEL[r.problem.type]).join(", ")}.
                </p>
              )}
            </SheetHeader>

            <div className="flex-1 space-y-8 overflow-y-auto p-4 sm:p-6">
              {p.type === "LATE_PO_GAP" && <LatePoPanel rec={rec} />}
              <Section title="Evidence">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  {Object.entries(p.evidence).map(([k, v]) => (
                    <div key={k} className="flex flex-col">
                      <dt className="text-[11px] text-muted-foreground">{EVIDENCE_LABEL[k] ?? k}</dt>
                      <dd className="font-medium tabular-nums">{formatEvidence(k, v)}</dd>
                    </div>
                  ))}
                </dl>
              </Section>

              <Section title="Projected stock, next 14 days">
                <StockTimeline plan={result.plan} baseline={result.baseline} markers={markers} planLabel="With selected option" />
              </Section>

              <Section title="Options">
                <OptionsTable set={rec.optionSet} selectedId={base.id} onSelect={(id) => {
                  const o = rec.optionSet.options.find((x) => x.id === id);
                  if (o) selectOption(o);
                }} showTiming={!excess} />
              </Section>

              {ADJUSTABLE.has(base.kind) && (
                <Section title="What if">
                  <WhatIfPanel
                    base={base}
                    result={result}
                    units={units}
                    maxUnits={maxUnits}
                    source={source}
                    sources={sources}
                    showTiming={!excess}
                    onUnits={setUnits}
                    onSource={changeSource}
                    onReset={() => selectOption(base)}
                  />
                </Section>
              )}

              <Section title="Draft preview">
                <DraftPreview drafts={drafts} />
              </Section>
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t bg-background p-3 sm:p-4">
              <Button onClick={() => void send("approve")} disabled={busy}>
                <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Approve
                <kbd className="ml-2 hidden rounded bg-primary-foreground/20 px-1 text-[10px] sm:inline">A</kbd>
              </Button>
              <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={busy}>
                <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Reject
                <kbd className="ml-2 hidden rounded bg-muted px-1 text-[10px] sm:inline">R</kbd>
              </Button>
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={onPrev} aria-label="Previous signal (K)">
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onNext} aria-label="Next signal (J)">
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </footer>
            <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} onConfirm={(reason) => {
              setRejectOpen(false);
              void send("reject", reason);
            }} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
