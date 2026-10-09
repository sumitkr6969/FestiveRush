import type Database from "better-sqlite3";
import {
  AGED_DAYS,
  AGED_MIN_DAYS_OF_STOCK,
  CANNIBALIZATION_WINDOW_DAYS,
  OVERSTOCK_DAYS,
  TODAY,
} from "./config";
import { daysBetween } from "./dates";
import { computeMetrics, type CellMetrics } from "./metrics";
import { loadSnapshot, type Snapshot } from "./snapshot";
import type {
  IsoDate,
  OverstockReason,
  Severity,
  StockAnalysis,
  UnderstockItem,
} from "./types";

export type CellAssessment = CellMetrics &
  (
    | { status: "overstocked"; reason: OverstockReason; cannibalizedBy: string | null }
    | { status: "understocked"; severity: Severity }
    | { status: "balanced" }
  );

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
export const bySeverity = (a: Severity, b: Severity) => SEVERITY_RANK[a] - SEVERITY_RANK[b];

function isOverstocked(c: CellMetrics): boolean {
  if (c.stock === 0) return false;
  // Aged stock needs less cover to be a problem: it's already losing value.
  return c.daysOfStock > OVERSTOCK_DAYS || (c.ageingDays > AGED_DAYS && c.daysOfStock > AGED_MIN_DAYS_OF_STOCK);
}

function isUnderstocked(c: CellMetrics): boolean {
  // No demand means nothing to run out of.
  if (c.avgDailySales === 0) return false;
  return c.stock <= c.reorderPoint || c.stockoutInDays <= c.fastestLead;
}

function understockSeverity(c: CellMetrics): Severity {
  // Out before the fastest order can land, or out before the promotion starts.
  if (c.stockoutInDays <= c.fastestLead) return "CRITICAL";
  if (c.promotionStartingInDays !== null && c.stockoutInDays <= c.promotionStartingInDays) return "CRITICAL";
  if (c.stockoutInDays <= c.slowestLead) return "HIGH";
  return "MEDIUM";
}

/**
 * The newest same-brand, same-category SKU launched after this one within the
 * window that sells more across the network, or null.
 */
function findCannibal(cell: CellMetrics, networkRate: Map<string, number>, cells: readonly CellMetrics[], asOf: IsoDate) {
  const candidates = new Map<string, CellMetrics>();
  for (const other of cells) {
    if (
      other.brand === cell.brand &&
      other.category === cell.category &&
      other.launchDate > cell.launchDate &&
      daysBetween(other.launchDate, asOf) <= CANNIBALIZATION_WINDOW_DAYS &&
      (networkRate.get(other.sku) ?? 0) > (networkRate.get(cell.sku) ?? 0)
    ) {
      candidates.set(other.sku, other);
    }
  }
  const [best] = [...candidates.values()].sort((a, b) => (networkRate.get(b.sku) ?? 0) - (networkRate.get(a.sku) ?? 0));
  return best?.sku ?? null;
}

export function assessCells(snapshot: Snapshot): CellAssessment[] {
  const cells = computeMetrics(snapshot);
  const networkRate = new Map<string, number>();
  for (const c of cells) networkRate.set(c.sku, (networkRate.get(c.sku) ?? 0) + c.avgDailySales);

  return cells.map((c): CellAssessment => {
    if (isOverstocked(c)) {
      const cannibalizedBy = findCannibal(c, networkRate, cells, snapshot.asOf);
      const reason: OverstockReason = cannibalizedBy
        ? "new_launch_cannibalized"
        : c.ageingDays > AGED_DAYS
          ? "aged"
          : "slow_moving";
      return { ...c, status: "overstocked", reason, cannibalizedBy };
    }
    if (isUnderstocked(c)) return { ...c, status: "understocked", severity: understockSeverity(c) };
    return { ...c, status: "balanced" };
  });
}

const byName = (a: string, b: string) => a.localeCompare(b);

export function analyzeSnapshot(snapshot: Snapshot): StockAnalysis {
  const cells = assessCells(snapshot);
  const sameSku = (sku: string, store: string) => cells.filter((c) => c.sku === sku && c.store !== store);

  const overstocked = cells.flatMap((c) =>
    c.status === "overstocked"
      ? [{
          sku: c.sku,
          product: c.product,
          store: c.store,
          stock: c.stock,
          avgDailySales: c.avgDailySales,
          daysOfStock: c.daysOfStock,
          ageingDays: c.ageingDays,
          cashTiedUp: c.cashTiedUp,
          reason: c.reason,
          otherStoresNeeding: sameSku(c.sku, c.store).filter((o) => o.status === "understocked").map((o) => o.store).sort(byName),
        }]
      : [],
  );

  const understocked = cells.flatMap((c): UnderstockItem[] =>
    c.status === "understocked"
      ? [{
          sku: c.sku,
          product: c.product,
          store: c.store,
          stock: c.stock,
          avgDailySales: c.avgDailySales,
          daysOfStock: c.daysOfStock,
          reorderPoint: c.reorderPoint,
          stockoutInDays: c.stockoutInDays,
          promotionStartingInDays: c.promotionStartingInDays,
          projectedDemandWithPromo: c.projectedDemandWithPromo,
          otherStoresWithSurplus: sameSku(c.sku, c.store)
            .filter((o) => o.surplus > 0)
            .sort((a, b) => b.surplus - a.surplus || byName(a.store, b.store))
            .map((o) => o.store),
          severity: c.severity,
        }]
      : [],
  );

  const balanced = cells.flatMap((c) =>
    c.status === "balanced"
      ? [{ sku: c.sku, product: c.product, store: c.store, stock: c.stock, avgDailySales: c.avgDailySales, daysOfStock: c.daysOfStock }]
      : [],
  );

  const priceBySku = new Map(cells.map((c) => [c.sku, c.sellingPrice]));
  return {
    overstocked: overstocked.sort((a, b) => b.cashTiedUp - a.cashTiedUp || byName(a.sku, b.sku) || byName(a.store, b.store)),
    understocked: understocked.sort(
      (a, b) => bySeverity(a.severity, b.severity) || a.stockoutInDays - b.stockoutInDays || byName(a.sku, b.sku) || byName(a.store, b.store),
    ),
    balanced,
    summary: {
      totalSkus: new Set(cells.map((c) => c.sku)).size,
      totalStores: new Set(cells.map((c) => c.store)).size,
      totalOverstockedValue: overstocked.reduce((sum, o) => sum + o.cashTiedUp, 0),
      // Revenue lost if the projected two-week demand can't be served from stock.
      totalUnderstockedRisk: Math.round(
        understocked.reduce(
          (sum, u) => sum + Math.max(0, u.projectedDemandWithPromo - u.stock) * (priceBySku.get(u.sku) ?? 0),
          0,
        ),
      ),
    },
  };
}

export function analyzeStockLevels(db: Database.Database, asOf: IsoDate = TODAY): StockAnalysis {
  return analyzeSnapshot(loadSnapshot(db, asOf));
}
