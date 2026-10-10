import type Database from "better-sqlite3";
import { AGEING_HIGH_WEEKLY_LOSS, NETWORK, TRANSFER_LEAD_DAYS, TODAY } from "./config";
import { daysBetween } from "./dates";
import type { Problem, ProblemType } from "./decisionTypes";
import { formatINR, formatShortDate } from "./format";
import { promotionsFor } from "./metrics";
import { PO_STATUS_LABEL } from "./poStatus";
import {
  cellFacts,
  cellsFor,
  excessForCell,
  horizonEnd,
  inboundFor,
  isOverdue,
  needForCell,
  networkFacts,
  networkNeed,
  shortfall,
  stockoutDate,
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * A PO is late when the supplier's latest ETA is after the promised date, or the
 * date has passed with no delivery. The problem targets the store that runs out
 * first, so its options include moving stock from another store, and reorders
 * from suppliers other than the late one.
 */
function latePoGaps(input: DetectionInput): ProblemCore[] {
  return input.purchaseOrders.flatMap((po): ProblemCore[] => {
    const live = input.poLive[po.po];
    if (!live || live.state !== "late") return [];
    const cells = cellsFor(input, po.sku);
    const gap = Math.min(po.qty, cells.reduce((sum, c) => sum + shortfall(c), 0));
    const target = cells.filter((c) => c.avgDailySales > 0).sort((a, b) => a.stockoutInDays - b.stockoutInDays || a.store.localeCompare(b.store))[0];

    const etaDays = live.overdue ? Number.POSITIVE_INFINITY : daysBetween(input.asOf, live.currentEta);
    // The PO lands centrally; the first store still needs one more transfer hop.
    const runsOutFirst = target !== undefined && target.stockoutInDays <= etaDays + TRANSFER_LEAD_DAYS;
    const severity = runsOutFirst ? "CRITICAL" : gap > 0 ? "HIGH" : "MEDIUM";

    let need = target ? needForCell(input, target) : networkNeed(input, po.sku, gap, NETWORK);
    // Suggest alternatives to the supplier that is already late, when there are enough of them.
    const others = need.suppliers.filter((s) => s.supplier !== po.supplier);
    if (others.length >= 2) need = { ...need, suppliers: others };

    const status = live.latest ? PO_STATUS_LABEL[live.latest.status] : "No update from supplier";
    const when = live.overdue
      ? `is ${plural(live.daysLate, "day")} past its promised ${formatShortDate(live.promisedDate)} with no new date`
      : `now arrives ${formatShortDate(live.currentEta)}, ${plural(live.daysLate, "day")} late`;
    const impact = target && runsOutFirst ? `; ${target.store} runs out on ${formatShortDate(stockoutDate(input.asOf, target.stockoutInDays))}, before it lands` : "";

    return [{
      id: id("LATE_PO_GAP", po.po),
      type: "LATE_PO_GAP",
      severity,
      sku: po.sku,
      ...(target ? { store: target.store } : {}),
      evidence: {
        po: po.po,
        supplier: po.supplier,
        qty: po.qty,
        promisedDate: live.promisedDate,
        currentEta: live.overdue ? null : live.currentEta,
        liveStatus: status,
        lastUpdate: live.latest?.note ?? null,
        daysLate: live.daysLate,
        gapUnits: gap,
        firstStockoutStore: target?.store ?? null,
        firstStockoutDate: target ? stockoutDate(input.asOf, target.stockoutInDays) : null,
      },
      message: `${po.po} from ${po.supplier} ${when}${impact}.`,
      context: { kind: "replenish", need },
    }];
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

export const TYPE_ORDER: ProblemType[] = [
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
    poLive: snapshot.poLive,
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
