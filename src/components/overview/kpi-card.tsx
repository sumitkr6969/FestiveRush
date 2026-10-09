import type { ReactNode } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  visual: ReactNode;
  explain: string;
  href: string;
}

/** Stat tile: label, value, one supporting line, a tiny trend. The whole card links to filtered signals. */
export function KpiCard({ label, value, detail, visual, explain, href }: KpiCardProps) {
  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors duration-150 hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={href}
          className="text-sm font-medium text-muted-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {label}
        </Link>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`How "${label}" is calculated`}
              className="relative z-10 -m-1 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64 text-xs leading-relaxed">{explain}</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-3xl font-semibold tracking-tight">{value}</span>
          <span className="text-xs text-muted-foreground">{detail}</span>
        </div>
        {visual}
      </div>
    </div>
  );
}
