import type { OptionSet, Problem, ProblemType } from "./decisionTypes";
import { formatINR, formatShortDate } from "./format";

// "Ask the agent": answers questions ONLY by restating numbers the engine already
// computed (CLAUDE.md rule 1). No model call, no new arithmetic beyond formatting.

export interface ExplainableRec {
  problem: Problem;
  optionSet: OptionSet;
}

export interface Explanation {
  /** The signal the answer is about, or null if nothing matched. */
  problemId: string | null;
  lines: string[];
}

const TOPIC_WORDS: Record<ProblemType, RegExp> = {
  STOCKOUT_BEFORE_REPLENISHMENT: /stock.?out|run(s|ning)? out|empty|short/i,
  LATE_PO_GAP: /late|overdue|\bpo\b|purchase order|delay/i,
  DEMAND_SPIKE: /promo|promotion|spike|uplift|sale/i,
  SUPPLIER_TRADEOFF: /supplier|cheap|fast|expensive|premium|lead/i,
  STORE_IMBALANCE: /transfer|move|imbalance|surplus|spare/i,
  NEW_LAUNCH_CANNIBALIZATION: /launch|new model|old model|cannibal/i,
  AGEING_STOCK: /age|aged|ageing|aging|old stock|dust|markdown/i,
};

function score(question: string, p: Problem): number {
  const q = question.toLowerCase();
  let s = 0;
  if (q.includes(p.sku.toLowerCase())) s += 4;
  const store = /store\s+([a-l])\b/i.exec(question)?.[1];
  if (store && p.store?.toLowerCase() === `store ${store.toLowerCase()}`) s += 3;
  if (store && p.store && p.store.toLowerCase() !== `store ${store.toLowerCase()}`) s -= 3;
  const po = /po-\d+/i.exec(question)?.[0];
  if (po && String(p.evidence.po ?? "").toLowerCase() === po.toLowerCase()) s += 4;
  for (const word of p.product.toLowerCase().split(/[^a-z0-9-]+/)) {
    if (word.length >= 4 && q.includes(word)) s += 1;
  }
  if (q.includes(p.category.toLowerCase())) s += 1;
  if (TOPIC_WORDS[p.type].test(question)) s += 1;
  return s;
}

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

function factsLine(p: Problem): string {
  const f = p.facts;
  const where = p.store ?? "the network";
  if (p.context.kind === "excess") {
    return `${where} holds ${f.stock} units selling ${f.avgDailySales}/day: ${f.daysOfStock} days of stock, oldest units ${f.ageingDays} days old.`;
  }
  return `${where} holds ${f.stock} units selling ${f.avgDailySales}/day: ${f.daysOfStock} days of stock. Supplier lead times run ${f.fastestLead} to ${f.slowestLead} days.`;
}

function promoLine(p: Problem): string | null {
  const promo = p.context.kind === "replenish" ? p.context.need.promotion : p.context.excess.promotion;
  if (!promo || p.facts.promoUplift === null) return null;
  return `The ${promo.name} promotion runs ${formatShortDate(promo.start)} to ${formatShortDate(promo.end)} at +${pct(promo.uplift)}, adding about ${p.facts.promoExtraUnits ?? 0} units of demand over the next 14 days.`;
}

const asDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatShortDate(v) : null);

/**
 * The agent's suggestion for a signal, in plain sentences. Every number comes from
 * the computed evidence and options; for a late PO it leads with the supplier's
 * live status and what happens if we wait.
 */
export function agentSuggestion({ problem: p, optionSet }: ExplainableRec): string[] {
  const lines: string[] = [];
  const e = p.evidence;
  if (p.type === "LATE_PO_GAP") {
    const promised = asDate(e.promisedDate) ?? "the promised date";
    const eta = asDate(e.currentEta);
    lines.push(
      eta
        ? `${e.supplier} now expects to deliver ${e.po} on ${eta}, ${e.daysLate} ${e.daysLate === 1 ? "day" : "days"} after the promised ${promised}.`
        : `${e.po} from ${e.supplier} is ${e.daysLate} ${e.daysLate === 1 ? "day" : "days"} past the promised ${promised} and there is no new date.`,
    );
    if (e.lastUpdate) lines.push(`Supplier note: "${String(e.lastUpdate)}".`);
    const stockout = asDate(e.firstStockoutDate);
    if (e.firstStockoutStore && stockout) lines.push(`${e.firstStockoutStore} runs out first, on ${stockout}.`);
  }

  const rec = optionSet.options.find((o) => o.recommended);
  if (rec) {
    const arrives = rec.arrivalDate ? `, arrives ${formatShortDate(rec.arrivalDate)}` : "";
    lines.push(`Suggested instead: ${rec.label} (${formatINR(rec.cost)}${arrives}).`);
    if (optionSet.topUp) lines.push(`Then: ${optionSet.topUp.label} (${formatINR(optionSet.topUp.cost)}).`);
  }
  const wait = optionSet.options.find((o) => o.kind === "WAIT_FOR_PO");
  if (p.type === "LATE_PO_GAP") {
    if (!wait) lines.push("Waiting isn't counted on: the PO has no confirmed future date.");
    else lines.push(wait.arrivesBeforeStockout ? "Waiting for the PO still works: it lands before the stock-out." : "Waiting is risky: the PO lands after the stock-out.");
  }
  const onTime = optionSet.options.filter((o) => !o.recommended && o.kind !== "WAIT_FOR_PO" && o.arrivesBeforeStockout).map((o) => o.label);
  if (onTime.length > 0) lines.push(`Also on time: ${onTime.join("; ")}.`);
  const tooLate = optionSet.options.filter((o) => o.kind === "ORDER_FROM_SUPPLIER" && !o.arrivesBeforeStockout).map((o) => `${o.from}${o.arrivalDate ? ` (${formatShortDate(o.arrivalDate)})` : ""}`);
  if (tooLate.length > 0) lines.push(`Too late to help: ${tooLate.join(", ")}.`);
  lines.push(`Doing nothing: ${optionSet.doNothing.label.toLowerCase()}, ${formatINR(optionSet.doNothing.cost)}.`);
  return lines;
}

export function explain(question: string, recs: readonly ExplainableRec[]): Explanation {
  const ranked = recs
    .map((rec, rank) => ({ rec, rank, s: score(question, rec.problem) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.rank - b.rank);
  const best = ranked[0]?.rec;
  if (!best) {
    return {
      problemId: null,
      lines: [
        "I can only explain signals the engine has already computed.",
        'Try naming a store, SKU or PO, for example "Why Store A?" or "Why Supplier B for TV-55-SM?"',
      ],
    };
  }

  const { problem, optionSet } = best;
  const rec = optionSet.options.find((o) => o.recommended);
  const lines = [problem.message, factsLine(problem)];
  const promo = promoLine(problem);
  if (promo) lines.push(promo);
  if (rec) {
    lines.push(`Recommended: ${rec.label} for ${formatINR(rec.cost)}. ${rec.reason ?? ""}`.trim());
  }
  if (optionSet.topUp) lines.push(`Then: ${optionSet.topUp.label} for ${formatINR(optionSet.topUp.cost)}.`);
  for (const o of optionSet.options.filter((x) => !x.recommended)) {
    const timing = o.arrivalDate ? `arrives ${formatShortDate(o.arrivalDate)}` : "no delivery date";
    const late = o.arrivalDate && !o.arrivesBeforeStockout ? ", after the stock-out" : "";
    lines.push(`Alternative: ${o.label}, ${formatINR(o.cost)}, ${timing}${late}.`);
  }
  lines.push(`Doing nothing: ${optionSet.doNothing.label.toLowerCase()}, ${formatINR(optionSet.doNothing.cost)}.`);
  return { problemId: problem.id, lines };
}
