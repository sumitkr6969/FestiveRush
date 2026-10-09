import { NO_SALES_DAYS_OF_STOCK, PROJECTION_DAYS, WAREHOUSE, WEEKLY_DEPRECIATION } from "./config";
import { addDays, daysBetween } from "./dates";
import type {
  Donor,
  ExcessContext,
  InboundPo,
  PromotionWindow,
  ReplenishmentNeed,
  SignalFacts,
} from "./decisionTypes";
import type { CellAssessment } from "./stockAnalyzer";
import type { IsoDate, PromotionRow, PurchaseOrderRow, SupplierRow } from "./types";

/** Shared lookups for building problem contexts from one assessed snapshot. */
export interface DetectionInput {
  asOf: IsoDate;
  cells: CellAssessment[];
  suppliers: SupplierRow[];
  purchaseOrders: PurchaseOrderRow[];
}

/** Not delivered and its date hasn't passed: the only POs allowed to count as inbound. */
export function isValidInbound(po: PurchaseOrderRow, asOf: IsoDate): boolean {
  return po.status === "in_transit" && po.expected_date >= asOf;
}

/** Explicitly overdue, or still in transit past its expected date. */
export function isOverdue(po: PurchaseOrderRow, asOf: IsoDate): boolean {
  return po.status === "overdue" || (po.status === "in_transit" && po.expected_date < asOf);
}

export const daysLate = (po: PurchaseOrderRow, asOf: IsoDate) => Math.max(0, daysBetween(po.expected_date, asOf));

export function inboundFor(input: DetectionInput, sku: string): InboundPo[] {
  return input.purchaseOrders
    .filter((po) => po.sku === sku && isValidInbound(po, input.asOf))
    .map((po) => ({ po: po.po, supplier: po.supplier, qty: po.qty, expectedDate: po.expected_date }));
}

export const cellsFor = (input: DetectionInput, sku: string) =>
  input.cells.filter((c) => c.sku === sku && c.store !== WAREHOUSE);

/** Units this cell can't serve from its own stock over the projection horizon. */
export const shortfall = (c: CellAssessment) => Math.max(0, Math.ceil(c.projectedDemandWithPromo - c.stock));

/** Stock-out date; whole days, since a delivery on the stock-out day still saves the sale. */
export const stockoutDate = (asOf: IsoDate, stockoutInDays: number) => addDays(asOf, Math.floor(stockoutInDays));

/** Stores with spare units; overstocked stores first (moving true excess is the point), then most spare. */
export function donorsFor(input: DetectionInput, sku: string, exceptStore: string): Donor[] {
  return cellsFor(input, sku)
    .filter((c) => c.store !== exceptStore && c.surplus > 0)
    .map((c) => ({ store: c.store, spare: c.surplus, overstocked: c.status === "overstocked" }))
    .sort((a, b) => Number(b.overstocked) - Number(a.overstocked) || b.spare - a.spare || a.store.localeCompare(b.store));
}

function warehouseSpare(input: DetectionInput, sku: string): number | null {
  const wh = input.cells.find((c) => c.sku === sku && c.store === WAREHOUSE);
  return wh ? wh.stock : null;
}

const windowOf = (p: PromotionRow | null): PromotionWindow | null =>
  p ? { name: p.sku_or_category, start: p.start, end: p.end, uplift: p.expected_uplift } : null;

const round2 = (n: number) => Math.round(n * 100) / 100;

function cellOutlook(c: CellAssessment) {
  return { currentStock: c.stock, dailyDemand: c.dailyDemand, promotion: windowOf(c.promotion) };
}

function networkOutlook(cells: readonly CellAssessment[]) {
  const days = cells[0]?.dailyDemand.length ?? 0;
  return {
    currentStock: cells.reduce((s, c) => s + c.stock, 0),
    dailyDemand: Array.from({ length: days }, (_, d) => round2(cells.reduce((s, c) => s + (c.dailyDemand[d] ?? 0), 0))),
    promotion: windowOf(cells[0]?.promotion ?? null),
  };
}

/** Facts for one store's signal card. */
export function cellFacts(c: CellAssessment, cashAtRisk: number): SignalFacts {
  return {
    stock: c.stock,
    avgDailySales: c.avgDailySales,
    daysOfStock: c.daysOfStock,
    fastestLead: c.fastestLead,
    slowestLead: c.slowestLead,
    ageingDays: c.ageingDays,
    promoUplift: c.promotion?.expected_uplift ?? null,
    promoExtraUnits: c.promotion ? Math.round((c.projectedDemandWithPromo - c.projectedDemandBase) * 10) / 10 : null,
    cashAtRisk,
  };
}

/** Facts for a SKU-wide signal: stock and sales summed, days of stock recomputed. */
export function networkFacts(input: DetectionInput, sku: string, cashAtRisk: number): SignalFacts {
  const cells = cellsFor(input, sku);
  const first = cells[0];
  if (!first) throw new Error(`No inventory for ${sku}`);
  const stock = cells.reduce((s, c) => s + c.stock, 0);
  const rate = cells.reduce((s, c) => s + c.avgDailySales, 0);
  const extra = cells.reduce((s, c) => s + c.projectedDemandWithPromo - c.projectedDemandBase, 0);
  return {
    stock,
    avgDailySales: Math.round(rate * 100) / 100,
    daysOfStock: rate > 0 ? Math.round((stock / rate) * 10) / 10 : NO_SALES_DAYS_OF_STOCK,
    fastestLead: first.fastestLead,
    slowestLead: first.slowestLead,
    ageingDays: Math.max(...cells.map((c) => c.ageingDays)),
    promoUplift: first.promotion?.expected_uplift ?? null,
    promoExtraUnits: first.promotion ? Math.round(extra * 10) / 10 : null,
    cashAtRisk,
  };
}

export function needForCell(input: DetectionInput, c: CellAssessment): ReplenishmentNeed {
  return {
    ...cellOutlook(c),
    asOf: input.asOf,
    sku: c.sku,
    product: c.product,
    sellingPrice: c.sellingPrice,
    destination: c.store,
    unitsNeeded: Math.max(1, shortfall(c)),
    stockoutInDays: c.stockoutInDays,
    stockoutDate: stockoutDate(input.asOf, c.stockoutInDays),
    donors: donorsFor(input, c.sku, c.store),
    warehouseSpare: warehouseSpare(input, c.sku),
    suppliers: input.suppliers.filter((s) => s.sku === c.sku),
    inbound: inboundFor(input, c.sku),
  };
}

/** SKU-wide need (no store): transfers between stores don't apply. */
export function networkNeed(input: DetectionInput, sku: string, units: number, destination: string): ReplenishmentNeed {
  const cells = cellsFor(input, sku);
  const first = cells[0];
  if (!first) throw new Error(`No inventory for ${sku}`);
  const soonest = Math.min(...cells.map((c) => c.stockoutInDays));
  return {
    ...networkOutlook(cells),
    asOf: input.asOf,
    sku,
    product: first.product,
    sellingPrice: first.sellingPrice,
    destination,
    unitsNeeded: Math.max(1, units),
    stockoutInDays: soonest,
    stockoutDate: stockoutDate(input.asOf, soonest),
    donors: [],
    warehouseSpare: warehouseSpare(input, sku),
    suppliers: input.suppliers.filter((s) => s.sku === sku),
    inbound: inboundFor(input, sku),
  };
}

export function excessForCell(input: DetectionInput, c: CellAssessment): ExcessContext {
  // Ideally only the units beyond two weeks' demand; if that's ≤ 0 (aged but thin
  // cover), the whole stock is the problem because it's all ageing.
  const excessUnits = c.surplus > 0 ? c.surplus : c.stock;
  return {
    ...cellOutlook(c),
    asOf: input.asOf,
    sku: c.sku,
    product: c.product,
    store: c.store,
    sellingPrice: c.sellingPrice,
    excessUnits,
    unitCost: c.cheapestPrice,
    cashTiedUp: c.cashTiedUp,
    weeklyValueLoss: Math.round(c.cashTiedUp * WEEKLY_DEPRECIATION),
    recipients: cellsFor(input, c.sku)
      .filter((o) => o.store !== c.store && o.surplus < 0)
      .map((o) => ({ store: o.store, units: -o.surplus }))
      .sort((a, b) => b.units - a.units || a.store.localeCompare(b.store)),
    inbound: inboundFor(input, c.sku),
  };
}

export const horizonEnd = (asOf: IsoDate) => addDays(asOf, PROJECTION_DAYS - 1);
