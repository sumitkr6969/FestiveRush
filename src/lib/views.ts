import { PROMO_ENDING_SOON_DAYS } from "./config";
import { daysBetween } from "./dates";
import type { ProblemType } from "./decisionTypes";
import type { EngineResult } from "./engine";
import { daysLate, isOverdue, isValidInbound } from "./problemContext";
import type { Severity } from "./types";

// Pure shapers from one engine run to each API response.

const TOP_RECOMMENDATIONS = 5;

function countBy<K extends string>(keys: readonly K[]): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
}

export function overviewView(r: EngineResult) {
  const problems = r.recommendations.map((rec) => rec.problem);
  return {
    asOf: r.asOf,
    summary: r.analysis.summary,
    counts: {
      overstocked: r.analysis.overstocked.length,
      understocked: r.analysis.understocked.length,
      balanced: r.analysis.balanced.length,
    },
    problemsBySeverity: countBy<Severity>(problems.map((p) => p.severity)),
    problemsByType: countBy<ProblemType>(problems.map((p) => p.type)),
    topRecommendations: r.recommendations.slice(0, TOP_RECOMMENDATIONS),
  };
}

export function signalsView(r: EngineResult) {
  return { asOf: r.asOf, analysis: r.analysis, recommendations: r.recommendations };
}

export function storesView(r: EngineResult) {
  const stores = [...new Set(r.snapshot.inventory.map((i) => i.store))].sort();
  const price = new Map(r.snapshot.products.map((p) => [p.sku, p.selling_price]));
  return {
    asOf: r.asOf,
    stores: stores.map((store) => {
      const over = r.analysis.overstocked.filter((o) => o.store === store);
      const under = r.analysis.understocked.filter((u) => u.store === store);
      return {
        store,
        skus: r.snapshot.inventory.filter((i) => i.store === store).length,
        stockUnits: r.snapshot.inventory.filter((i) => i.store === store).reduce((s, i) => s + i.stock, 0),
        overstocked: over.length,
        understocked: under.length,
        balanced: r.analysis.balanced.filter((b) => b.store === store).length,
        critical: under.filter((u) => u.severity === "CRITICAL").length,
        cashTiedUp: over.reduce((s, o) => s + o.cashTiedUp, 0),
        understockedRisk: Math.round(
          under.reduce((s, u) => s + Math.max(0, u.projectedDemandWithPromo - u.stock) * (price.get(u.sku) ?? 0), 0),
        ),
        problems: r.recommendations.filter((rec) => rec.problem.store === store).length,
      };
    }),
  };
}

export function ordersView(r: EngineResult) {
  const products = new Map(r.snapshot.products.map((p) => [p.sku, p.product]));
  return {
    asOf: r.asOf,
    purchaseOrders: r.snapshot.purchaseOrders.map((po) => ({
      ...po,
      product: products.get(po.sku) ?? po.sku,
      overdue: isOverdue(po, r.asOf),
      daysLate: isOverdue(po, r.asOf) ? daysLate(po, r.asOf) : 0,
      countsAsInbound: isValidInbound(po, r.asOf),
    })),
    suppliers: r.snapshot.suppliers,
  };
}

export function promotionsView(r: EngineResult) {
  return {
    asOf: r.asOf,
    promotions: r.snapshot.promotions.map((p) => {
      const startsInDays = daysBetween(r.asOf, p.start);
      const endsInDays = daysBetween(r.asOf, p.end);
      const status =
        startsInDays > 0 ? "upcoming" : endsInDays < 0 ? "ended" : endsInDays <= PROMO_ENDING_SOON_DAYS ? "ending_soon" : "active";
      const skus = r.snapshot.products.filter((x) => x.sku === p.sku_or_category || x.category === p.sku_or_category);
      const atRisk = r.recommendations
        .filter((rec) => rec.problem.type === "DEMAND_SPIKE" && skus.some((s) => s.sku === rec.problem.sku))
        .map((rec) => rec.problem.sku);
      return { ...p, status, startsInDays, endsInDays, skuCount: skus.length, atRiskSkus: atRisk };
    }),
  };
}
