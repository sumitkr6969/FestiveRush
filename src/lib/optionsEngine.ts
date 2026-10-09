import {
  MARKDOWN_RATE,
  MAX_OPTIONS,
  MIN_TRANSFER_COST_PER_UNIT,
  NETWORK,
  PROJECTION_DAYS,
  TRANSFER_COST_RATE,
  TRANSFER_LEAD_DAYS,
  WAREHOUSE,
} from "./config";
import { addDays } from "./dates";
import type { ExcessContext, Option, OptionKind, OptionSet, Problem, ReplenishmentNeed } from "./decisionTypes";
import { formatINR } from "./format";
import type { SupplierRow } from "./types";

/** Tie-break order: moving stock we already own beats buying more. */
const KIND_ORDER: Record<OptionKind, number> = {
  TRANSFER_FROM_STORE: 0,
  TRANSFER_FROM_WAREHOUSE: 1,
  WAIT_FOR_PO: 2,
  ORDER_FROM_SUPPLIER: 3,
  TRANSFER_TO_STORE: 0,
  CANCEL_INBOUND_PO: 1,
  MARKDOWN_REVIEW: 2,
  HOLD: 3,
};

export function transferCostPerUnit(sellingPrice: number): number {
  return Math.max(MIN_TRANSFER_COST_PER_UNIT, Math.round(sellingPrice * TRANSFER_COST_RATE));
}

type Draft = Omit<Option, "id" | "recommended" | "reason" | "sku">;

function finalize(problem: Problem, drafts: Draft[]): Option[] {
  return drafts.map((d) => ({
    ...d,
    id: `${problem.id}:${d.kind}:${d.from}>${d.to}`,
    sku: problem.sku,
    recommended: false,
    reason: null,
  }));
}

// ---------------------------------------------------------------------------
// Shortages
// ---------------------------------------------------------------------------

function supplierOrder(need: ReplenishmentNeed, s: SupplierRow, units: number): Draft {
  const qty = Math.max(units, s.moq);
  const arrivalDate = addDays(need.asOf, s.lead_time_days);
  const notes = [
    s.availability === "backorder" ? "On backorder: no firm delivery date." : null,
    s.availability === "limited" ? "Limited availability: confirm quantity first." : null,
    qty > units ? `MOQ ${s.moq} forces ${qty - units} extra units.` : null,
  ].filter((n): n is string => n !== null);
  return {
    kind: "ORDER_FROM_SUPPLIER",
    label: `Order ${qty} from ${s.supplier} (${s.lead_time_days}-day lead)`,
    from: s.supplier,
    to: need.destination,
    units: qty,
    cost: qty * s.purchase_price,
    arrivalDate,
    // Backorder has no firm date, so it can never be counted on to arrive in time.
    arrivesBeforeStockout: s.availability !== "backorder" && arrivalDate <= need.stockoutDate,
    moqOverbuy: qty - units,
    riskNote: notes.length > 0 ? notes.join(" ") : null,
    supplierAvailability: s.availability,
  };
}

function transferIn(need: ReplenishmentNeed, from: string, spare: number, kind: OptionKind): Draft {
  const units = Math.min(spare, need.unitsNeeded);
  return {
    kind,
    label: `Transfer ${units} from ${from} to ${need.destination}`,
    from,
    to: need.destination,
    units,
    cost: units * transferCostPerUnit(need.sellingPrice),
    arrivalDate: addDays(need.asOf, TRANSFER_LEAD_DAYS),
    arrivesBeforeStockout: addDays(need.asOf, TRANSFER_LEAD_DAYS) <= need.stockoutDate,
    moqOverbuy: 0,
    riskNote: units < need.unitsNeeded ? `Covers ${units} of ${need.unitsNeeded} units; top up with an order.` : null,
  };
}

function replenishDrafts(need: ReplenishmentNeed): Draft[] {
  const drafts: Draft[] = [];
  const donor = need.donors[0];
  if (need.destination !== NETWORK && donor) drafts.push(transferIn(need, donor.store, donor.spare, "TRANSFER_FROM_STORE"));
  if (need.destination !== WAREHOUSE && need.warehouseSpare !== null && need.warehouseSpare > 0) {
    drafts.push(transferIn(need, WAREHOUSE, need.warehouseSpare, "TRANSFER_FROM_WAREHOUSE"));
  }
  for (const s of need.suppliers) drafts.push(supplierOrder(need, s, need.unitsNeeded));
  const po = [...need.inbound].sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))[0];
  if (po) {
    // A PO lands at the network level; a store needs one more hop.
    const arrivalDate = need.destination === NETWORK ? po.expectedDate : addDays(po.expectedDate, TRANSFER_LEAD_DAYS);
    const units = Math.min(po.qty, need.unitsNeeded);
    drafts.push({
      kind: "WAIT_FOR_PO",
      label: `Wait for ${po.po} (${po.qty} units due ${po.expectedDate})`,
      from: po.supplier,
      to: need.destination,
      units,
      cost: 0,
      arrivalDate,
      arrivesBeforeStockout: arrivalDate <= need.stockoutDate,
      moqOverbuy: 0,
      riskNote: units < need.unitsNeeded ? `Covers ${units} of ${need.unitsNeeded} units.` : "Relies on the supplier delivering on time.",
      po: po.po,
    });
  }
  return drafts;
}

/** Cheapest supplier that lands before the stock-out; else the fastest one that can ship. */
function topUpFor(need: ReplenishmentNeed, units: number): Draft | null {
  if (units <= 0) return null;
  const orders = need.suppliers.filter((s) => s.availability !== "backorder").map((s) => supplierOrder(need, s, units));
  const onTime = orders.filter((o) => o.arrivesBeforeStockout).sort((a, b) => a.cost - b.cost);
  const fastest = [...orders].sort((a, b) => (a.arrivalDate ?? "").localeCompare(b.arrivalDate ?? "") || a.cost - b.cost);
  return onTime[0] ?? fastest[0] ?? null;
}

/** Cost to cover the WHOLE need: a partial option is charged for its top-up too. */
function coverCost(need: ReplenishmentNeed, d: Draft): number {
  const remaining = need.unitsNeeded - d.units;
  if (d.kind === "ORDER_FROM_SUPPLIER" || remaining <= 0) return d.cost;
  return d.cost + (topUpFor(need, remaining)?.cost ?? Number.POSITIVE_INFINITY);
}

function pickReplenishment(need: ReplenishmentNeed, drafts: Draft[]): { pick: Draft; reason: string } {
  const rank = (a: Draft, b: Draft) => coverCost(need, a) - coverCost(need, b) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  const onTime = drafts.filter((d) => d.arrivesBeforeStockout).sort(rank);
  const first = onTime[0];
  const who = need.destination === NETWORK ? "the first store" : need.destination;
  if (first) {
    const remaining = need.unitsNeeded - first.units;
    const topUp = first.kind === "ORDER_FROM_SUPPLIER" ? null : topUpFor(need, remaining);
    return {
      pick: first,
      reason:
        `Cheapest way to cover ${need.unitsNeeded} units before ${who} runs out on ${need.stockoutDate}` +
        (topUp ? `; top up ${topUp.units} from ${topUp.from}.` : "."),
    };
  }
  // Nothing arrives in time: limit lost sales with the earliest firm arrival.
  const fallback = drafts
    .filter((d) => d.supplierAvailability !== "backorder")
    .sort((a, b) => (a.arrivalDate ?? "9999").localeCompare(b.arrivalDate ?? "9999") || rank(a, b))[0];
  const pick = fallback ?? drafts[0];
  if (!pick) throw new Error(`No options for ${need.sku}`);
  return { pick, reason: `Nothing lands before the ${need.stockoutDate} stock-out; this is the earliest firm arrival.` };
}

function replenishSet(problem: Problem, need: ReplenishmentNeed): OptionSet {
  const drafts = replenishDrafts(need);
  const { pick, reason } = pickReplenishment(need, drafts);
  const rest = drafts
    .filter((d) => d !== pick)
    .sort(
      (a, b) =>
        Number(b.arrivesBeforeStockout) - Number(a.arrivesBeforeStockout) ||
        coverCost(need, a) - coverCost(need, b) ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.label.localeCompare(b.label),
    );
  const options = finalize(problem, [pick, ...rest].slice(0, MAX_OPTIONS));
  const recommended = options[0];
  if (recommended) Object.assign(recommended, { recommended: true, reason });

  const topUpDraft = pick.kind === "ORDER_FROM_SUPPLIER" ? null : topUpFor(need, need.unitsNeeded - pick.units);
  const [topUp] = topUpDraft ? finalize({ ...problem, id: `${problem.id}:TOP_UP` }, [topUpDraft]) : [null];
  return {
    problemId: problem.id,
    options,
    topUp: topUp ?? null,
    doNothing: {
      label: `Lost sales over the next ${PROJECTION_DAYS} days`,
      units: need.unitsNeeded,
      cost: need.unitsNeeded * need.sellingPrice,
    },
  };
}

// ---------------------------------------------------------------------------
// Excess stock
// ---------------------------------------------------------------------------

function excessDrafts(excess: ExcessContext): Draft[] {
  const drafts: Draft[] = excess.recipients.slice(0, 2).map((r): Draft => {
    const units = Math.min(excess.excessUnits, r.units);
    return {
      kind: "TRANSFER_TO_STORE",
      label: `Transfer ${units} from ${excess.store} to ${r.store}`,
      from: excess.store,
      to: r.store,
      units,
      cost: units * transferCostPerUnit(excess.sellingPrice),
      arrivalDate: addDays(excess.asOf, TRANSFER_LEAD_DAYS),
      arrivesBeforeStockout: true,
      moqOverbuy: 0,
      riskNote: null,
    };
  });
  const po = excess.inbound[0];
  if (po) {
    drafts.push({
      kind: "CANCEL_INBOUND_PO",
      label: `Ask ${po.supplier} to cancel ${po.po} (${po.qty} units)`,
      from: po.supplier,
      to: NETWORK,
      units: po.qty,
      cost: 0,
      arrivalDate: null,
      arrivesBeforeStockout: true,
      moqOverbuy: 0,
      riskNote: "Supplier may charge a cancellation fee.",
      po: po.po,
    });
  }
  drafts.push({
    kind: "MARKDOWN_REVIEW",
    label: `Review a ~${Math.round(MARKDOWN_RATE * 100)}% markdown on ${excess.excessUnits} units at ${excess.store}`,
    from: excess.store,
    to: excess.store,
    units: excess.excessUnits,
    cost: Math.round(excess.excessUnits * excess.unitCost * MARKDOWN_RATE),
    arrivalDate: null,
    arrivesBeforeStockout: true,
    moqOverbuy: 0,
    riskNote: "Cuts margin; needs pricing sign-off.",
  });
  if (drafts.length < 2) {
    drafts.push({
      kind: "HOLD",
      label: `Hold and review in ${PROJECTION_DAYS} days`,
      from: excess.store,
      to: excess.store,
      units: excess.excessUnits,
      cost: Math.round(excess.weeklyValueLoss * (PROJECTION_DAYS / 7)),
      arrivalDate: null,
      arrivesBeforeStockout: true,
      moqOverbuy: 0,
      riskNote: "Stock keeps losing value meanwhile.",
    });
  }
  return drafts;
}

function pickExcess(excess: ExcessContext, drafts: Draft[]): { pick: Draft; reason: string } {
  const transfer = drafts.filter((d) => d.kind === "TRANSFER_TO_STORE").sort((a, b) => b.units - a.units)[0];
  if (transfer) return { pick: transfer, reason: `Moves ${transfer.units} idle units to ${transfer.to}, which is short, for ${formatINR(transfer.cost)}.` };
  const cancel = drafts.find((d) => d.kind === "CANCEL_INBOUND_PO");
  if (cancel) return { pick: cancel, reason: `Stops ${cancel.units} more units arriving on top of ${excess.excessUnits} idle ones.` };
  const markdown = drafts.find((d) => d.kind === "MARKDOWN_REVIEW");
  if (!markdown) throw new Error(`No options for ${excess.sku}`);
  return { pick: markdown, reason: `No store needs these units; a markdown is the fastest way to free ${formatINR(excess.cashTiedUp)}.` };
}

function excessSet(problem: Problem, excess: ExcessContext): OptionSet {
  const drafts = excessDrafts(excess);
  const { pick, reason } = pickExcess(excess, drafts);
  const rest = drafts.filter((d) => d !== pick).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.cost - b.cost);
  const options = finalize(problem, [pick, ...rest].slice(0, MAX_OPTIONS));
  const recommended = options[0];
  if (recommended) Object.assign(recommended, { recommended: true, reason });
  return {
    problemId: problem.id,
    options,
    topUp: null,
    doNothing: {
      label: `Value lost to ageing over the next ${PROJECTION_DAYS} days`,
      units: excess.excessUnits,
      cost: Math.round(excess.weeklyValueLoss * (PROJECTION_DAYS / 7)),
    },
  };
}

/** 2–4 options, exactly one recommended, plus the cost of doing nothing. */
export function buildOptions(problem: Problem): OptionSet {
  return problem.context.kind === "replenish"
    ? replenishSet(problem, problem.context.need)
    : excessSet(problem, problem.context.excess);
}
