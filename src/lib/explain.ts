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
