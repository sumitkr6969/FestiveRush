import { MARKDOWN_RATE, NETWORK, WAREHOUSE } from "./config";
import { addDays, daysBetween } from "./dates";
import type {
  ExcessContext,
  Option,
  OptionAdjustment,
  ProblemContext,
  ReplenishmentNeed,
} from "./decisionTypes";
import { supplierOrder, topUpFor, transferCostPerUnit, transferIn, type OptionDraft } from "./optionsEngine";
import type { IsoDate } from "./types";

// Pure what-if maths for the review sheet. Runs in the browser for instant
// feedback and on the server to rebuild exactly what was approved.

export interface StockPoint {
  day: number;
  date: IsoDate;
  /** Units on hand at the start of the day, after any delivery that day. */
  stock: number;
}

export interface Projection {
  curve: StockPoint[];
  /** First day demand can't be met in full; null if stock lasts the horizon. */
  stockoutDay: number | null;
  lostUnits: number;
}

export interface WhatIfResult {
  option: Option;
  /** Order covering what the option leaves short (shortages only). */
  topUp: Option | null;
  plan: Projection;
  baseline: Projection;
  /** Days covered before the first shortfall under the plan. */
  coverageDays: number;
}

export interface SourceChoice {
  value: string;
  label: string;
}

interface Delivery {
  day: number;
  units: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Day-by-day stock: deliveries land at the start of a day, then that day's demand sells. */
export function simulateStock(asOf: IsoDate, currentStock: number, dailyDemand: readonly number[], deliveries: readonly Delivery[]): Projection {
  let stock = currentStock;
  let lost = 0;
  let stockoutDay: number | null = null;
  const curve: StockPoint[] = [];
  dailyDemand.forEach((demand, day) => {
    stock = Math.max(0, stock + deliveries.filter((d) => Math.max(0, d.day) === day).reduce((s, d) => s + d.units, 0));
    curve.push({ day, date: addDays(asOf, day), stock: round1(stock) });
    const sold = Math.min(stock, demand);
    if (demand - sold > 0.01 && stockoutDay === null) stockoutDay = day;
    lost += demand - sold;
    stock -= sold;
  });
  curve.push({ day: dailyDemand.length, date: addDays(asOf, dailyDemand.length), stock: round1(stock) });
  return { curve, stockoutDay, lostUnits: round1(lost) };
}

/** Where the units could come from: suppliers and spare stock for shortages, recipients for excess. */
export function sourcesFor(context: ProblemContext): SourceChoice[] {
  if (context.kind === "excess") {
    return context.excess.recipients.slice(0, 3).map((r) => ({ value: r.store, label: `${r.store} (needs ${r.units})` }));
  }
  const { need } = context;
  const choices: SourceChoice[] = need.suppliers.map((s) => ({
    value: s.supplier,
    label: `${s.supplier} (${s.lead_time_days}d)`,
  }));
  if (need.destination !== NETWORK) {
    for (const d of need.donors.slice(0, 3)) choices.push({ value: d.store, label: `${d.store} (${d.spare} spare)` });
  }
  if (need.warehouseSpare) choices.push({ value: WAREHOUSE, label: `Warehouse (${need.warehouseSpare})` });
  return choices;
}

function adjustReplenishment(need: ReplenishmentNeed, base: Option, adj: OptionAdjustment): OptionDraft {
  const source = adj.source ?? base.from;
  const units = Math.max(1, Math.round(adj.units));
  if (base.kind === "WAIT_FOR_PO" && source === base.from) {
    const po = need.inbound.find((p) => p.po === base.po);
    return { ...base, units: Math.min(units, po?.qty ?? base.units) };
  }
  const supplier = need.suppliers.find((s) => s.supplier === source);
  if (supplier) return supplierOrder(need, supplier, units);
  const donor = need.donors.find((d) => d.store === source);
  if (donor) return transferIn(need, donor.store, donor.spare, "TRANSFER_FROM_STORE", units);
  if (source === WAREHOUSE && need.warehouseSpare) {
    return transferIn(need, WAREHOUSE, need.warehouseSpare, "TRANSFER_FROM_WAREHOUSE", units);
  }
  return base;
}

function adjustExcess(excess: ExcessContext, base: Option, adj: OptionAdjustment): OptionDraft {
  const units = Math.max(1, Math.min(Math.round(adj.units), excess.excessUnits));
  if (base.kind === "TRANSFER_TO_STORE") {
    const to = adj.source ?? base.to;
    return {
      ...base,
      to,
      units,
      label: `Transfer ${units} from ${excess.store} to ${to}`,
      cost: units * transferCostPerUnit(excess.sellingPrice),
    };
  }
  if (base.kind === "MARKDOWN_REVIEW") {
    return { ...base, units, cost: Math.round(units * excess.unitCost * MARKDOWN_RATE) };
  }
  return base;
}

function toOption(id: string, sku: string, d: OptionDraft, keepReason: Pick<Option, "recommended" | "reason">): Option {
  return { ...d, id, sku, ...keepReason };
}

function deliveriesFor(asOf: IsoDate, options: readonly (Option | null)[], direction: 1 | -1): Delivery[] {
  return options.flatMap((o) =>
    o && o.arrivalDate && o.units > 0 ? [{ day: daysBetween(asOf, o.arrivalDate), units: direction * o.units }] : [],
  );
}

/**
 * Applies an adjustment (or none) to an option and projects stock with and
 * without it. `problemId` names the top-up option consistently with the engine.
 */
export function runWhatIf(problemId: string, context: ProblemContext, base: Option, adj?: OptionAdjustment): WhatIfResult {
  const changed = adj !== undefined && (adj.units !== base.units || (adj.source !== undefined && adj.source !== base.from && adj.source !== base.to));
  const keep = changed ? { recommended: false, reason: null } : { recommended: base.recommended, reason: base.reason };

  if (context.kind === "excess") {
    const { excess } = context;
    const option = toOption(base.id, base.sku, adj ? adjustExcess(excess, base, adj) : base, keep);
    // Transfers out leave on day 0; other excess actions don't move units.
    const out = option.kind === "TRANSFER_TO_STORE" ? [{ day: 0, units: -option.units }] : [];
    const plan = simulateStock(excess.asOf, excess.currentStock, excess.dailyDemand, out);
    return {
      option,
      topUp: null,
      plan,
      baseline: simulateStock(excess.asOf, excess.currentStock, excess.dailyDemand, []),
      coverageDays: plan.stockoutDay ?? excess.dailyDemand.length,
    };
  }

  const { need } = context;
  const option = toOption(base.id, base.sku, adj ? adjustReplenishment(need, base, adj) : base, keep);
  const remaining = need.unitsNeeded - option.units;
  const topUpDraft = option.kind === "ORDER_FROM_SUPPLIER" || remaining <= 0 ? null : topUpFor(need, remaining);
  const topUp = topUpDraft
    ? toOption(`${problemId}:TOP_UP:${topUpDraft.kind}:${topUpDraft.from}>${topUpDraft.to}`, base.sku, topUpDraft, { recommended: false, reason: null })
    : null;
  const plan = simulateStock(need.asOf, need.currentStock, need.dailyDemand, deliveriesFor(need.asOf, [option, topUp], 1));
  return {
    option,
    topUp,
    plan,
    baseline: simulateStock(need.asOf, need.currentStock, need.dailyDemand, []),
    coverageDays: plan.stockoutDay ?? need.dailyDemand.length,
  };
}
