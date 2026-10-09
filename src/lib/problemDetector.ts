import type Database from "better-sqlite3";
import { AGEING_HIGH_WEEKLY_LOSS, NETWORK, TRANSFER_LEAD_DAYS, TODAY } from "./config";
import { daysBetween } from "./dates";
import type { Problem, ProblemType } from "./decisionTypes";
import { formatINR } from "./format";
import { promotionsFor } from "./metrics";
import {
  cellFacts,
  cellsFor,
  daysLate,
  excessForCell,
  horizonEnd,
  inboundFor,
  isOverdue,
  needForCell,
  networkFacts,
  networkNeed,
  shortfall,
  type DetectionInput,
} from "./problemContext";
import { loadSnapshot, type Snapshot } from "./snapshot";
import { assessCells, bySeverity, type CellAssessment } from "./stockAnalyzer";
import type { IsoDate } from "./types";

/** What each detector produces; enrich() adds the fields every card shares. */
type ProblemCore = Omit<Problem, "product" | "category" | "facts">;
type Understocked = Extract<CellAssessment, { status: "understocked" }>;
type Overstocked = Extract<CellAssessment, { status: "overstocked" }>;

const inr = formatINR;
const id = (type: ProblemType, ...parts: string[]) => [type, ...parts].join(":");

function stockoutBeforeReplenishment(input: DetectionInput, c: Understocked): ProblemCore | null {
  const inbound = inboundFor(input, c.sku);
  const overdue = input.purchaseOrders.filter((po) => po.sku === c.sku && isOverdue(po, input.asOf));
  // Earliest anything can land: the fastest supplier, or a valid PO plus the hop to the store.
  const inboundDays = inbound.map((po) => daysBetween(input.asOf, po.expectedDate) + TRANSFER_LEAD_DAYS);
  const replenishDays = Math.min(c.fastestLead, ...inboundDays);
  if (c.stockoutInDays > replenishDays) return null;
  return {
    id: id("STOCKOUT_BEFORE_REPLENISHMENT", c.sku, c.store),
    type: "STOCKOUT_BEFORE_REPLENISHMENT",
    severity: c.severity,
    sku: c.sku,
    store: c.store,
    evidence: {
      stock: c.stock,
      avgDailySales: c.avgDailySales,
      stockoutInDays: c.stockoutInDays,
      fastestLeadDays: c.fastestLead,
      promotionStartingInDays: c.promotionStartingInDays,
      inboundUnits: inbound.reduce((sum, po) => sum + po.qty, 0),
      excludedOverduePos: overdue.map((po) => po.po).join(", ") || null,
    },
    message: `${c.product} at ${c.store} runs out in ${c.stockoutInDays} days; the fastest supplier needs ${c.fastestLead}.`,
    context: { kind: "replenish", need: needForCell(input, c) },
  };
}

function supplierTradeoff(input: DetectionInput, c: Understocked): ProblemCore | null {
  const usable = input.suppliers.filter((s) => s.sku === c.sku && s.availability !== "backorder");
  const byPrice = [...usable].sort((a, b) => a.purchase_price - b.purchase_price || a.lead_time_days - b.lead_time_days);
  const cheapest = byPrice[0];
  const onTime = byPrice.find((s) => s.lead_time_days <= Math.floor(c.stockoutInDays));
  if (!cheapest || !onTime || onTime === cheapest) return null;
  const need = needForCell(input, c);
  const premium = onTime.purchase_price - cheapest.purchase_price;
  return {
    id: id("SUPPLIER_TRADEOFF", c.sku, c.store),
    type: "SUPPLIER_TRADEOFF",
    severity: c.severity === "CRITICAL" ? "HIGH" : "MEDIUM",
    sku: c.sku,
    store: c.store,
    evidence: {
      cheapestSupplier: cheapest.supplier,
      cheapestPrice: cheapest.purchase_price,
      cheapestLeadDays: cheapest.lead_time_days,
      onTimeSupplier: onTime.supplier,
      onTimePrice: onTime.purchase_price,
      onTimeLeadDays: onTime.lead_time_days,
      premiumPerUnit: premium,
      premiumPct: Math.round((premium / cheapest.purchase_price) * 1000) / 10,
      unitsNeeded: need.unitsNeeded,
      extraCost: premium * need.unitsNeeded,
    },
    message: `${cheapest.supplier} is cheapest for ${c.sku} but lands after ${c.store} runs out; ${onTime.supplier} is on time for ${inr(premium)} more per unit.`,
    context: { kind: "replenish", need },
  };
}

function storeImbalance(input: DetectionInput, c: Understocked): ProblemCore | null {
  const need = needForCell(input, c);
  const donor = need.donors.find((d) => d.overstocked);
  if (!donor) return null;
  const donorCell = cellsFor(input, c.sku).find((o) => o.store === donor.store);
  return {
    id: id("STORE_IMBALANCE", c.sku, c.store),
    type: "STORE_IMBALANCE",
    severity: "HIGH",
    sku: c.sku,
    store: c.store,
    evidence: {
      shortStore: c.store,
      shortStoreDaysOfStock: c.daysOfStock,
      surplusStore: donor.store,
      surplusStoreDaysOfStock: donorCell?.daysOfStock ?? null,
      spareUnits: donor.spare,
      transferableUnits: Math.min(donor.spare, need.unitsNeeded),
    },
    message: `${c.store} has ${c.daysOfStock} days of ${c.sku} while ${donor.store} has ${donor.spare} spare units.`,
    context: { kind: "replenish", need },
  };
}

function ageingStock(input: DetectionInput, c: Overstocked): ProblemCore | null {
  if (c.reason !== "aged") return null;
  const excess = excessForCell(input, c);
  return {
    id: id("AGEING_STOCK", c.sku, c.store),
    type: "AGEING_STOCK",
    severity: excess.weeklyValueLoss >= AGEING_HIGH_WEEKLY_LOSS ? "HIGH" : "MEDIUM",
    sku: c.sku,
    store: c.store,
    evidence: {
      ageingDays: c.ageingDays,
      stock: c.stock,
      daysOfStock: c.daysOfStock,
      cashTiedUp: excess.cashTiedUp,
      weeklyValueLoss: excess.weeklyValueLoss,
    },
    message: `${c.stock} × ${c.product} at ${c.store} have aged ${c.ageingDays} days, tying up ${inr(c.cashTiedUp)} and losing ~${inr(excess.weeklyValueLoss)} a week.`,
    context: { kind: "excess", excess },
  };
}

function cannibalization(input: DetectionInput, c: Overstocked): ProblemCore | null {
  if (c.reason !== "new_launch_cannibalized" || !c.cannibalizedBy) return null;
  const rate = (sku: string) => cellsFor(input, sku).reduce((sum, o) => sum + o.avgDailySales, 0);
  const newer = cellsFor(input, c.cannibalizedBy)[0];
  const excess = excessForCell(input, c);
  return {
    id: id("NEW_LAUNCH_CANNIBALIZATION", c.sku, c.store),
    type: "NEW_LAUNCH_CANNIBALIZATION",
    severity: "HIGH",
    sku: c.sku,
    store: c.store,
    evidence: {
      newSku: c.cannibalizedBy,
      newLaunchDate: newer?.launchDate ?? null,
      oldNetworkDailySales: Math.round(rate(c.sku) * 10) / 10,
      newNetworkDailySales: Math.round(rate(c.cannibalizedBy) * 10) / 10,
      stock: c.stock,
      daysOfStock: c.daysOfStock,
      cashTiedUp: excess.cashTiedUp,
      weeklyValueLoss: excess.weeklyValueLoss,
    },
    message: `${c.product} stalled at ${c.store} since ${newer?.product ?? c.cannibalizedBy} launched: ${c.daysOfStock} days of stock.`,
    context: { kind: "excess", excess },
  };
}

function demandSpikes(input: DetectionInput, snapshot: Snapshot): ProblemCore[] {
  const end = horizonEnd(input.asOf);
  return snapshot.products.flatMap((product): ProblemCore[] => {
    const promo = promotionsFor(product, snapshot.promotions).find((p) => p.start <= end && p.end >= input.asOf);
    if (!promo) return [];
    const cells = cellsFor(input, product.sku);
    const projected = cells.reduce((sum, c) => sum + c.projectedDemandWithPromo, 0);
    const stock = cells.reduce((sum, c) => sum + c.stock, 0);
    const inbound = inboundFor(input, product.sku)
      .filter((po) => po.expectedDate <= end)
      .reduce((sum, po) => sum + po.qty, 0);
    // Net across the network: one store's surplus can cover another's gap.
    const short = Math.ceil(projected - stock - inbound);
    if (short <= 0) return [];
    const startsIn = Math.max(0, daysBetween(input.asOf, promo.start));
    const emptyBeforeStart = startsIn > 0 && cells.some((c) => c.avgDailySales > 0 && c.stockoutInDays <= startsIn);
    return [{
      id: id("DEMAND_SPIKE", product.sku),
      type: "DEMAND_SPIKE",
      severity: emptyBeforeStart ? "CRITICAL" : "HIGH",
      sku: product.sku,
      evidence: {
        promotion: promo.sku_or_category,
        promotionStart: promo.start,
        promotionEnd: promo.end,
        expectedUplift: promo.expected_uplift,
        projectedDemand: Math.round(projected),
        networkStock: stock,
        inboundUnits: inbound,
        shortfallUnits: short,
      },
      message: `${product.product}: ${promo.sku_or_category} promotion (+${Math.round(promo.expected_uplift * 100)}%) needs ${short} more units than the network holds.`,
      context: { kind: "replenish", need: networkNeed(input, product.sku, short, NETWORK) },
    }];
  });
}

function latePoGaps(input: DetectionInput): ProblemCore[] {
  return input.purchaseOrders
    .filter((po) => isOverdue(po, input.asOf))
    .map((po): ProblemCore => {
      const cells = cellsFor(input, po.sku);
      const needed = cells.reduce((sum, c) => sum + shortfall(c), 0);
      const gap = Math.min(po.qty, needed);
      const critical = cells.some((c) => c.status === "understocked" && c.severity === "CRITICAL");
      const late = daysLate(po, input.asOf);
      return {
        id: id("LATE_PO_GAP", po.po),
        type: "LATE_PO_GAP",
        severity: critical ? "CRITICAL" : gap > 0 ? "HIGH" : "MEDIUM",
        sku: po.sku,
        evidence: { po: po.po, supplier: po.supplier, qty: po.qty, expectedDate: po.expected_date, daysLate: late, gapUnits: gap },
        message: `${po.po} from ${po.supplier} is ${late} ${late === 1 ? "day" : "days"} late; ${gap} units of ${po.sku} are uncovered without it.`,
        context: { kind: "replenish", need: networkNeed(input, po.sku, gap, NETWORK) },
      };
    });
}

/** Adds what every card shows: product, category and the evidence-chip numbers. */
function enrich(input: DetectionInput, p: ProblemCore): Problem {
  const cell = p.store ? cellsFor(input, p.sku).find((c) => c.store === p.store) : cellsFor(input, p.sku)[0];
  if (!cell) throw new Error(`No inventory for ${p.sku}`);
  const cashAtRisk =
    p.context.kind === "replenish"
      ? p.context.need.unitsNeeded * p.context.need.sellingPrice
      : p.context.excess.cashTiedUp;
  return {
    ...p,
    product: cell.product,
    category: cell.category,
    facts: p.store ? cellFacts(cell, cashAtRisk) : networkFacts(input, p.sku, cashAtRisk),
  };
}

const TYPE_ORDER: ProblemType[] = [
  "STOCKOUT_BEFORE_REPLENISHMENT",
  "LATE_PO_GAP",
  "DEMAND_SPIKE",
  "STORE_IMBALANCE",
  "SUPPLIER_TRADEOFF",
  "NEW_LAUNCH_CANNIBALIZATION",
  "AGEING_STOCK",
];

export function detectProblemsInSnapshot(snapshot: Snapshot): Problem[] {
  const cells = assessCells(snapshot);
  const input: DetectionInput = {
    asOf: snapshot.asOf,
    cells,
    suppliers: snapshot.suppliers,
    purchaseOrders: snapshot.purchaseOrders,
  };
  const problems: ProblemCore[] = [];
  for (const c of cells) {
    if (c.status === "understocked") {
      for (const detect of [stockoutBeforeReplenishment, supplierTradeoff, storeImbalance]) {
        const p = detect(input, c);
        if (p) problems.push(p);
      }
    } else if (c.status === "overstocked") {
      for (const detect of [ageingStock, cannibalization]) {
        const p = detect(input, c);
        if (p) problems.push(p);
      }
    }
  }
  problems.push(...demandSpikes(input, snapshot), ...latePoGaps(input));
  return problems.map((p) => enrich(input, p)).sort(
    (a, b) =>
      bySeverity(a.severity, b.severity) ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      a.id.localeCompare(b.id),
  );
}

export function detectProblems(db: Database.Database, asOf: IsoDate = TODAY): Problem[] {
  return detectProblemsInSnapshot(loadSnapshot(db, asOf));
}
