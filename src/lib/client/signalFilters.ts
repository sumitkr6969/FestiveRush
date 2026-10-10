import type { ProblemType } from "@/lib/decisionTypes";
import type { Recommendation } from "@/lib/engine";
import { promotionCovers } from "@/lib/promotions";
import { isVaultSku } from "@/lib/vault";
import type { Severity } from "@/lib/types";
import { TYPE_KEY } from "./labels";

// Stock signals filters live in the URL so any view can be shared as a link.

export type SignalSort = "urgency" | "cash" | "days";

export interface SignalFilters {
  severity: Severity[];
  types: ProblemType[];
  category: string | null;
  store: string | null;
  promo: string | null;
  /** Only signals about products added in the Product vault. */
  vault: boolean;
  q: string;
  sort: SignalSort;
}

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM"];
const TYPE_BY_KEY = new Map(Object.entries(TYPE_KEY).map(([type, key]) => [key, type as ProblemType]));

const list = (value: string | null) => (value ? value.split(",").filter(Boolean) : []);

export function parseFilters(params: URLSearchParams): SignalFilters {
  const sort = params.get("sort");
  return {
    severity: list(params.get("sev")).map((s) => s.toUpperCase()).filter((s): s is Severity => SEVERITIES.includes(s as Severity)),
    types: list(params.get("type")).flatMap((k) => {
      const t = TYPE_BY_KEY.get(k);
      return t ? [t] : [];
    }),
    category: params.get("cat"),
    store: params.get("store"),
    promo: params.get("promo"),
    vault: params.get("vault") === "1",
    q: params.get("q") ?? "",
    sort: sort === "cash" || sort === "days" ? sort : "urgency",
  };
}

/** Serialises filters (plus the open review, if any) back to a query string. */
export function toQuery(f: SignalFilters, review: string | null): string {
  const p = new URLSearchParams();
  if (f.severity.length) p.set("sev", f.severity.map((s) => s.toLowerCase()).join(","));
  if (f.types.length) p.set("type", f.types.map((t) => TYPE_KEY[t]).join(","));
  if (f.category) p.set("cat", f.category);
  if (f.store) p.set("store", f.store);
  if (f.promo) p.set("promo", f.promo);
  if (f.vault) p.set("vault", "1");
  if (f.q) p.set("q", f.q);
  if (f.sort !== "urgency") p.set("sort", f.sort);
  if (review) p.set("review", review);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function hasFilters(f: SignalFilters): boolean {
  return Boolean(f.severity.length || f.types.length || f.category || f.store || f.promo || f.vault || f.q);
}

function matchesText(rec: Recommendation, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const p = rec.problem;
  return [p.sku, p.product, p.store ?? "network", p.category, p.message, String(p.evidence.po ?? "")]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function applyFilters(recs: readonly Recommendation[], f: SignalFilters): Recommendation[] {
  const filtered = recs.filter((r) => {
    const p = r.problem;
    if (f.severity.length && !f.severity.includes(p.severity)) return false;
    if (f.types.length && !f.types.includes(p.type)) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.store && p.store !== f.store) return false;
    if (f.vault && !isVaultSku(p.sku)) return false;
    if (f.promo && !promotionCovers({ sku_or_category: f.promo }, p.sku, p.category)) return false;
    return matchesText(r, f.q);
  });
  if (f.sort === "cash") return [...filtered].sort((a, b) => b.problem.facts.cashAtRisk - a.problem.facts.cashAtRisk);
  if (f.sort === "days") return [...filtered].sort((a, b) => a.problem.facts.daysOfStock - b.problem.facts.daysOfStock);
  return filtered;
}
