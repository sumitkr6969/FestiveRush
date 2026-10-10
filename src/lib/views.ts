import { NO_SALES_DAYS_OF_STOCK, PROJECTION_DAYS } from "./config";
import { addDays, daysBetween } from "./dates";
import type { ProblemType } from "./decisionTypes";
import type { EngineResult } from "./engine";
import { daysLate, isOverdue, isValidInbound } from "./problemContext";
import { isLive, promotionCovers, promotionStatus } from "./promotions";
import type { SalesDay } from "./salesSeries";
import type { IsoDate, Severity } from "./types";

// Pure shapers from one engine run to each API response.

const TOP_RECOMMENDATIONS = 5;
const SPARK_DAYS = 14;

function countBy<K extends string>(keys: readonly K[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
}

const nextDays = (asOf: IsoDate) => Array.from({ length: PROJECTION_DAYS }, (_, d) => addDays(asOf, d));

export function overviewView(r: EngineResult) {
  const problems = r.recommendations.map((rec) => rec.problem);
  const cheapest = new Map<string, number>();
  for (const s of r.snapshot.suppliers) cheapest.set(s.sku, Math.min(cheapest.get(s.sku) ?? Infinity, s.purchase_price));
  const open = r.snapshot.purchaseOrders.filter((po) => po.status !== "delivered");
  const days = nextDays(r.asOf);

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
    kpis: {
      inventory: {
        units: r.snapshot.inventory.reduce((s, i) => s + i.stock, 0),
        // Valued at the cheapest replacement cost, like cashTiedUp.
        value: r.snapshot.inventory.reduce((s, i) => s + i.stock * (cheapest.get(i.sku) ?? 0), 0),
        unitsSoldByDay: r.snapshot.dailyUnits.slice(-SPARK_DAYS).map((d) => d.units),
      },
      openPos: {
        open: open.length,
        overdue: open.filter((po) => isOverdue(po, r.asOf)).length,
        dueByDay: days.map((date) => open.filter((po) => po.expected_date === date).length),
      },
      promotions: {
        live: r.snapshot.promotions.filter((p) => isLive(p, r.asOf)).length,
        startingSoon: r.snapshot.promotions.filter((p) => promotionStatus(p, r.asOf) === "starting_soon").length,
        liveByDay: days.map((date) => r.snapshot.promotions.filter((p) => isLive(p, date)).length),
      },
    },
    topRecommendations: r.recommendations.slice(0, TOP_RECOMMENDATIONS),
  };
}

export function signalsView(r: EngineResult) {
  return { asOf: r.asOf, analysis: r.analysis, recommendations: r.recommendations };
}

type CellStatus = "overstocked" | "understocked" | "balanced";

export function storesView(r: EngineResult) {
  const stores = [...new Set(r.snapshot.inventory.map((i) => i.store))].sort();
  const products = new Map(r.snapshot.products.map((p) => [p.sku, p]));
  const categories = [...new Set(r.snapshot.products.map((p) => p.category))].sort();
  const price = (sku: string) => products.get(sku)?.selling_price ?? 0;

  const items = [
    ...r.analysis.overstocked.map((i) => ({ ...i, status: "overstocked" as CellStatus })),
    ...r.analysis.understocked.map((i) => ({ ...i, status: "understocked" as CellStatus })),
    ...r.analysis.balanced.map((i) => ({ ...i, status: "balanced" as CellStatus })),
  ];

  const heatmap = stores.flatMap((store) =>
    categories.map((category) => {
      const skus = items
        .filter((i) => i.store === store && products.get(i.sku)?.category === category)
        .map((i) => ({ sku: i.sku, product: i.product, stock: i.stock, avgDailySales: i.avgDailySales, daysOfStock: i.daysOfStock, status: i.status }))
        .sort((a, b) => a.daysOfStock - b.daysOfStock || a.sku.localeCompare(b.sku));
      const stock = skus.reduce((s, i) => s + i.stock, 0);
      const rate = skus.reduce((s, i) => s + i.avgDailySales, 0);
      return {
        store,
        category,
        stock,
        // Category cover = units on hand / combined daily sales of its SKUs.
        daysOfStock: rate > 0 ? Math.round((stock / rate) * 10) / 10 : NO_SALES_DAYS_OF_STOCK,
        understocked: skus.filter((s) => s.status === "understocked").length,
        overstocked: skus.filter((s) => s.status === "overstocked").length,
        skus,
      };
    }),
  );

  // Suggested store-to-store moves: the recommended option of each problem, deduplicated.
  const seen = new Set<string>();
  const transfers = r.recommendations.flatMap((rec) => {
    const o = rec.optionSet.options.find((x) => x.recommended);
    if (!o || (o.kind !== "TRANSFER_FROM_STORE" && o.kind !== "TRANSFER_TO_STORE")) return [];
    const key = `${o.sku}|${o.from}|${o.to}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ from: o.from, to: o.to, sku: o.sku, product: rec.problem.product, units: o.units, problemId: rec.problem.id }];
  });

  return {
    asOf: r.asOf,
    categories,
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
        understockedRisk: Math.round(under.reduce((s, u) => s + Math.max(0, u.projectedDemandWithPromo - u.stock) * price(u.sku), 0)),
        problems: r.recommendations.filter((rec) => rec.problem.store === store).length,
      };
    }),
    heatmap,
    transfers,
  };
}

export function ordersView(r: EngineResult) {
  const products = new Map(r.snapshot.products.map((p) => [p.sku, p.product]));
  const lead = new Map(r.snapshot.suppliers.map((s) => [`${s.supplier}|${s.sku}`, s.lead_time_days]));
  return {
    asOf: r.asOf,
    purchaseOrders: r.snapshot.purchaseOrders.map((po) => {
      const overdue = isOverdue(po, r.asOf);
      const leadDays = lead.get(`${po.supplier}|${po.sku}`) ?? null;
      const live = r.snapshot.poLive[po.po] ?? null;
      return {
        ...po,
        product: products.get(po.sku) ?? po.sku,
        // expected_date above is the live ETA; this is what the supplier first promised.
        promisedDate: live?.promisedDate ?? po.expected_date,
        live,
        overdue,
        daysLate: live?.daysLate ?? (overdue ? daysLate(po, r.asOf) : 0),
        daysUntilDue: daysBetween(r.asOf, po.expected_date),
        // POs carry no order date; the supplier's lead time is the best estimate of the journey.
        leadDays,
        countsAsInbound: isValidInbound(po, r.asOf),
        gapProblemId: r.recommendations.find((rec) => rec.problem.id === `LATE_PO_GAP:${po.po}`)?.problem.id ?? null,
      };
    }),
    suppliers: r.snapshot.suppliers,
  };
}

export function promotionsView(r: EngineResult) {
  return {
    asOf: r.asOf,
    promotions: r.snapshot.promotions.map((p) => {
      const skus = r.snapshot.products.filter((x) => promotionCovers(p, x.sku, x.category));
      const signals = r.recommendations
        .filter((rec) => promotionCovers(p, rec.problem.sku, rec.problem.category))
        .map((rec) => rec.problem.id);
      return {
        ...p,
        status: promotionStatus(p, r.asOf),
        live: isLive(p, r.asOf),
        startsInDays: daysBetween(r.asOf, p.start),
        endsInDays: daysBetween(r.asOf, p.end),
        skuCount: skus.length,
        skus: skus.map((s) => ({ sku: s.sku, product: s.product })),
        signalIds: signals,
      };
    }),
  };
}

export function salesView(asOf: IsoDate, days: readonly SalesDay[], r: EngineResult) {
  return {
    asOf,
    categories: [...new Set(days.map((d) => d.category))].sort(),
    days,
    promotions: r.snapshot.promotions,
  };
}

export type OverviewResponse = ReturnType<typeof overviewView>;
export type SignalsResponse = ReturnType<typeof signalsView>;
export type StoresResponse = ReturnType<typeof storesView>;
export type OrdersResponse = ReturnType<typeof ordersView>;
export type PromotionsResponse = ReturnType<typeof promotionsView>;
export type SalesResponse = ReturnType<typeof salesView>;
