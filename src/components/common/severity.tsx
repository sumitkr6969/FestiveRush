import { AlertOctagon, AlertTriangle, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

const STYLE: Record<Severity, { label: string; icon: LucideIcon; className: string }> = {
  CRITICAL: { label: "Critical", icon: AlertOctagon, className: "bg-critical/10 text-critical-ink ring-critical/25" },
  HIGH: { label: "Needs action", icon: AlertTriangle, className: "bg-warning/15 text-warning-ink ring-warning/30" },
  MEDIUM: { label: "Watch", icon: Info, className: "bg-info/10 text-info-ink ring-info/25" },
};

/** Severity is never colour alone: icon + text label + tint. */
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const { label, icon: Icon, className: tone } = STYLE[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tone,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
