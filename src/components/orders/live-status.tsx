import { AlertOctagon, CheckCircle2, Clock3, Truck } from "lucide-react";
import { formatShortDate, formatTimestamp } from "@/lib/format";
import { PO_STATUS_LABEL, type PoLive } from "@/lib/poStatus";
import { cn } from "@/lib/utils";
import { liveSummary } from "./po-status-dialog";

/** On time / late / delivered, with icon + text (never colour alone). */
export function LiveBadge({ live }: { live: PoLive }) {
  const tone =
    live.state === "delivered"
      ? { icon: CheckCircle2, className: "bg-healthy/10 text-healthy-ink ring-healthy/25" }
      : live.state === "on_time"
        ? { icon: Truck, className: "bg-info/10 text-info-ink ring-info/25" }
        : live.overdue
          ? { icon: AlertOctagon, className: "bg-critical/10 text-critical-ink ring-critical/25" }
          : { icon: Clock3, className: "bg-warning/15 text-warning-ink ring-warning/30" };
  const Icon = tone.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tone.className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {liveSummary(live)}
    </span>
  );
}

/** Promised vs current date and every supplier update, newest first. */
export function LiveTimeline({ live }: { live: PoLive }) {
  const updates = [...live.history].reverse();
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-[11px] text-muted-foreground">Promised</dt><dd className="font-medium">{formatShortDate(live.promisedDate)}</dd></div>
        <div>
          <dt className="text-[11px] text-muted-foreground">{live.state === "delivered" ? "Delivered" : "Latest ETA"}</dt>
          <dd className="font-medium">{live.overdue ? "No new date" : formatShortDate(live.currentEta)}</dd>
        </div>
        <div><dt className="text-[11px] text-muted-foreground">Status</dt><dd><LiveBadge live={live} /></dd></div>
      </dl>
      {updates.length === 0 ? (
        <p className="text-xs text-muted-foreground">No update from the supplier yet.</p>
      ) : (
        <ol className="flex flex-col gap-2 border-l pl-3">
          {updates.map((u) => (
            <li key={u.id} className="text-xs">
              <p>
                <span className="font-medium">{PO_STATUS_LABEL[u.status]}</span>
                {u.status === "delivered" ? ` on ${formatShortDate(u.eta)}` : `, ETA ${formatShortDate(u.eta)}`}
                {u.location && <span className="text-muted-foreground"> · {u.location}</span>}
              </p>
              {u.note && <p className="text-muted-foreground">&ldquo;{u.note}&rdquo;</p>}
              <p className="text-muted-foreground">{u.reportedBy}, {formatTimestamp(u.reportedAt)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
