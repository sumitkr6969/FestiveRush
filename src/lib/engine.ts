// Server-only: opens the SQLite file. Never import from a client component.
import { createDecisionLog, DECISIONS_PATH, type DecisionLog } from "./actions";
import { createDraft } from "./drafts";
import { TODAY } from "./config";
import { getDb } from "./db";
import type { Draft, OptionSet, Problem } from "./decisionTypes";
import { buildOptions } from "./optionsEngine";
import { detectProblemsInSnapshot, TYPE_ORDER } from "./problemDetector";
import { loadSalesSeries, type SalesDay } from "./salesSeries";
import { createPoStatusLog, PO_STATUS_PATH, type PoStatusLog } from "./poStatusLog";
import { loadSnapshot, withPoUpdates, type Snapshot } from "./snapshot";
import { analyzeSnapshot, bySeverity } from "./stockAnalyzer";
import type { IsoDate, StockAnalysis } from "./types";

export interface Recommendation {
  problem: Problem;
  optionSet: OptionSet;
  /** One simulated draft per option, plus the top-up order if there is one. */
  drafts: Draft[];
}

export interface EngineResult {
  asOf: IsoDate;
  snapshot: Snapshot;
  analysis: StockAnalysis;
  recommendations: Recommendation[];
}

/** Pure: snapshot in, every analysis, problem, option and draft out. */
export function runEngine(snapshot: Snapshot): EngineResult {
  const recommendations = detectProblemsInSnapshot(snapshot)
    .map((problem): Recommendation => {
      const optionSet = buildOptions(problem);
      const options = optionSet.topUp ? [...optionSet.options, optionSet.topUp] : optionSet.options;
      return { problem, optionSet, drafts: options.map(createDraft) };
    })
    // Within a severity, put the most money at stake first so the overview leads with it.
    .sort(
      (a, b) =>
        bySeverity(a.problem.severity, b.problem.severity) ||
        b.optionSet.doNothing.cost - a.optionSet.doNothing.cost ||
        // Same money at stake (often the same shortage seen two ways): lead with the root cause.
        TYPE_ORDER.indexOf(a.problem.type) - TYPE_ORDER.indexOf(b.problem.type) ||
        a.problem.id.localeCompare(b.problem.id),
    );
  return { asOf: snapshot.asOf, snapshot, analysis: analyzeSnapshot(snapshot), recommendations };
}

// Vault, billing and supplier-status writes change the data; they call invalidateEngine().
const cache = new Map<IsoDate, EngineResult>();

export function getEngine(asOf: IsoDate = TODAY): EngineResult {
  const cached = cache.get(asOf);
  if (cached) return cached;
  const result = runEngine(withPoUpdates(loadSnapshot(getDb(), asOf), getPoStatusLog().list()));
  cache.set(asOf, result);
  return result;
}

const salesCache = new Map<IsoDate, SalesDay[]>();

export function getSalesSeries(asOf: IsoDate = TODAY): SalesDay[] {
  const cached = salesCache.get(asOf);
  if (cached) return cached;
  const series = loadSalesSeries(getDb(), asOf);
  salesCache.set(asOf, series);
  return series;
}

/** Product vault and Billing counter writes change the data: recompute on the next read. */
export function invalidateEngine(): void {
  cache.clear();
  salesCache.clear();
}

let decisionLog: DecisionLog | null = null;

/** File-backed locally; memory-only on Vercel, whose filesystem is read-only. */
export function getDecisionLog(): DecisionLog {
  decisionLog ??= createDecisionLog(process.env.VERCEL ? null : DECISIONS_PATH);
  return decisionLog;
}

let poStatusLog: PoStatusLog | null = null;

/** Supplier live-status updates; same storage rules as the decision log. */
export function getPoStatusLog(): PoStatusLog {
  poStatusLog ??= createPoStatusLog(process.env.VERCEL ? null : PO_STATUS_PATH);
  return poStatusLog;
}
