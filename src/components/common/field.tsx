import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Label, control and error message wired together for screen readers. */
export function Field({ id, label, error, hint, children, className }: { id: string; label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs font-medium text-critical-ink">{error}</p>}
    </div>
  );
}

/** Props that link a control to its Field's hint or error. */
export const describedBy = (id: string, error?: string, hint?: string) => ({
  id,
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
});

export const selectClass =
  "h-9 w-full rounded-md border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-critical";
