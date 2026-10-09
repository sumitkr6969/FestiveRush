import { FileText, ShieldCheck } from "lucide-react";
import type { Draft } from "@/lib/decisionTypes";
import { DRAFT_LABEL } from "@/lib/drafts";
import { formatINR, formatShortDate } from "@/lib/format";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** What would be sent, if anything were sent. Nothing is. */
export function DraftPreview({ drafts }: { drafts: Draft[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="inline-flex w-fit items-center gap-1.5 rounded-md bg-info/10 px-2 py-1 text-xs font-medium text-info-ink ring-1 ring-inset ring-info/25">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Simulated: nothing is sent
      </p>
      {drafts.map((d) => (
        <div key={d.id} className="rounded-lg border border-dashed bg-muted/30 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {DRAFT_LABEL[d.kind]}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <Field label="SKU" value={d.sku} />
            <Field label="Quantity" value={d.qty} />
            <Field label="Cost" value={formatINR(d.cost)} />
            <Field label="From" value={d.from} />
            <Field label="To" value={d.to} />
            <Field label="Expected" value={d.expectedArrival ? formatShortDate(d.expectedArrival) : "Not applicable"} />
          </dl>
        </div>
      ))}
    </div>
  );
}
