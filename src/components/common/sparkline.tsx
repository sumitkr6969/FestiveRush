import { cn } from "@/lib/utils";

const W = 96;
const H = 28;

/**
 * Tiny single-series trend. One series needs no legend; the card's label names it.
 * Muted line, with the latest point in the accent so "now" stands out.
 */
export function Sparkline({ values, label, className }: { values: readonly number[]; label: string; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const x = (i: number) => (i / (values.length - 1)) * (W - 4) + 2;
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("h-7 w-24", className)} role="img" aria-label={label}>
      <polyline points={points} fill="none" className="stroke-muted-foreground/60" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last] ?? 0)} r={2.5} className="fill-primary stroke-card" strokeWidth={1.5} />
    </svg>
  );
}

/** Tiny column strip for counts per day (e.g. POs due). Highlights non-zero days. */
export function MiniBars({ values, label, className }: { values: readonly number[]; label: string; className?: string }) {
  const max = Math.max(...values, 1);
  const bw = W / values.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("h-7 w-24", className)} role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = v === 0 ? 2 : Math.max(4, (v / max) * (H - 4));
        return (
          <rect
            key={i}
            x={i * bw + 1}
            y={H - h}
            width={Math.max(1, bw - 2)}
            height={h}
            rx={1}
            className={v === 0 ? "fill-muted" : "fill-primary/70"}
          />
        );
      })}
    </svg>
  );
}
