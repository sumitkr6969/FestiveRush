import type { ReactNode } from "react";
import { CalendarClock, Hourglass, Megaphone, Timer, TrendingUp, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AGED_DAYS, NO_SALES_DAYS_OF_STOCK } from "@/lib/config";
import type { Problem } from "@/lib/decisionTypes";
import { formatNumber } from "@/lib/format";

function Chip({ icon: Icon, children, how }: { icon: LucideIcon; children: ReactNode; how: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs tabular-nums text-foreground/80 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs leading-relaxed">{how}</TooltipContent>
    </Tooltip>
  );
}

/** The numbers behind a signal. Hover or focus a chip to see how it was worked out. */
export function EvidenceChips({ problem }: { problem: Problem }) {
  const f = problem.facts;
  const network = !problem.store;
  const excess = problem.context.kind === "excess";
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip icon={TrendingUp} how={`Units sold in the last 30 days divided by 30 (or by days on sale for newer SKUs)${network ? ", summed across stores" : ""}.`}>
        {formatNumber(f.avgDailySales)}/day
      </Chip>
      <Chip icon={Hourglass} how="Stock on hand divided by units sold per day.">
        {f.daysOfStock >= NO_SALES_DAYS_OF_STOCK ? "No recent sales" : `${formatNumber(f.daysOfStock)} days of stock`}
      </Chip>
      {!excess && (
        <Chip icon={Timer} how="Fastest to slowest supplier lead time for this SKU. Suppliers on backorder are left out.">
          {f.fastestLead === f.slowestLead ? `${f.fastestLead}d lead` : `${f.fastestLead} to ${f.slowestLead}d lead`}
        </Chip>
      )}
      {(excess || f.ageingDays > AGED_DAYS) && (
        <Chip icon={CalendarClock} how={`Days the oldest unit has been in stock. Over ${AGED_DAYS} days counts as aged.`}>
          {f.ageingDays}d old
        </Chip>
      )}
      {f.promoUplift !== null && (
        <Chip
          icon={Megaphone}
          how="Promotion uplift applied to each promotion day in the 14-day forecast. Extra units are the forecast with the promotion minus the forecast without it."
        >
          +{Math.round(f.promoUplift * 100)}% promo, +{formatNumber(f.promoExtraUnits ?? 0)} units
        </Chip>
      )}
    </div>
  );
}
