// Server-only: opens the SQLite file. Never import from a client component.
import { createDraft, createDecisionLog, DECISIONS_PATH, type DecisionLog } from "./actions";
import { TODAY } from "./config";
import { getDb } from "./db";
import type { Draft, OptionSet, Problem } from "./decisionTypes";
import { buildOptions } from "./optionsEngine";
import { detectProblemsInSnapshot } from "./problemDetector";
import { loadSnapshot, type Snapshot } from "./snapshot";
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
        a.problem.id.localeCompare(b.problem.id),
    );
  return { asOf: snapshot.asOf, snapshot, analysis: analyzeSnapshot(snapshot), recommendations };
}

// The database is read-only, so a result for a given asOf never changes.
const cache = new Map<IsoDate, EngineResult>();

export function getEngine(asOf: IsoDate = TODAY): EngineResult {
  const cached = cache.get(asOf);
  if (cached) return cached;
  const result = runEngine(loadSnapshot(getDb(), asOf));
  cache.set(asOf, result);
  return result;
}

let decisionLog: DecisionLog | null = null;

/** File-backed locally; memory-only on Vercel, whose filesystem is read-only. */
export function getDecisionLog(): DecisionLog {
  decisionLog ??= createDecisionLog(process.env.VERCEL ? null : DECISIONS_PATH);
  return decisionLog;
}
