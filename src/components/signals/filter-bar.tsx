"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TYPE_LABEL, TYPES_IN_ORDER } from "@/lib/client/labels";
import { hasFilters, type SignalFilters, type SignalSort } from "@/lib/client/signalFilters";
import type { ProblemType } from "@/lib/decisionTypes";
import type { Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEVERITY_CHIPS: { value: Severity; label: string }[] = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "Needs action" },
  { value: "MEDIUM", label: "Watch" },
];

const SORTS: { value: SignalSort; label: string }[] = [
  { value: "urgency", label: "Urgency" },
  { value: "cash", label: "Cash at risk" },
  { value: "days", label: "Days of stock" },
];

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(list: readonly T[], item: T): T[] =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

const selectClass =
  "h-9 rounded-md border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface FilterBarProps {
  filters: SignalFilters;
  onChange: (next: SignalFilters) => void;
  categories: string[];
  stores: string[];
  counts: Partial<Record<ProblemType, number>>;
}

export function FilterBar({ filters, onChange, categories, stores, counts }: FilterBarProps) {
  const set = (patch: Partial<SignalFilters>) => onChange({ ...filters, ...patch });
  return (
    <section aria-label="Filters" className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search signals</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="SKU, product, store or PO"
            className="pl-8"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="filter-category">Category</label>
          <select id="filter-category" className={selectClass} value={filters.category ?? ""} onChange={(e) => set({ category: e.target.value || null })}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filter-store">Store</label>
          <select id="filter-store" className={selectClass} value={filters.store ?? ""} onChange={(e) => set({ store: e.target.value || null })}>
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filter-sort">Sort by</label>
          <select id="filter-sort" className={selectClass} value={filters.sort} onChange={(e) => set({ sort: e.target.value as SignalSort })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>Sort: {s.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Severity">
        {SEVERITY_CHIPS.map((s) => (
          <Chip key={s.value} pressed={filters.severity.includes(s.value)} onClick={() => set({ severity: toggle(filters.severity, s.value) })}>
            {s.label}
          </Chip>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" aria-hidden="true" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Problem type">
          {TYPES_IN_ORDER.map((t) => (
            <Chip key={t} pressed={filters.types.includes(t)} onClick={() => set({ types: toggle(filters.types, t) })}>
              {TYPE_LABEL[t]} <span className="tabular-nums opacity-70">{counts[t] ?? 0}</span>
            </Chip>
          ))}
        </div>
      </div>
      {hasFilters(filters) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {filters.promo && <span>Promotion: {filters.promo}</span>}
          {filters.vault && <span>Vault products only</span>}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => onChange({ severity: [], types: [], category: null, store: null, promo: null, vault: false, q: "", sort: filters.sort })}
          >
            <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Clear filters
          </Button>
        </div>
      )}
    </section>
  );
}
