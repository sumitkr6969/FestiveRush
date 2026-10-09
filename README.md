# The Festival Rush: VoltKart Supply Intelligence

A supply-chain prototype for VoltKart Electronics (12 stores). It reads sales, stock, suppliers,
purchase orders and promotions, finds the problems, compares the ways to fix each one and
recommends a single action. Every action is a simulated draft that waits for a human to approve
or reject it. Nothing is ever sent.

The data is a fixed snapshot dated **Fri 9 Oct 2026** (`TODAY` in `src/lib/config.ts`).

## Setup

Requires Node.js 20 or newer (tested on Node 24, Windows).

```bash
npm install
npm run seed      # builds data/voltkart.db (deterministic, safe to re-run)
npm run dev       # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run seed` | Recreates `data/voltkart.db` from `scripts/schema.sql` and the seeded generator |
| `npm run build` | Seeds, then builds for production (the database ships with the build) |
| `npm test` | Vitest: schema, seed scenario, engines, what-if, explanations, copy rules |
| `npm run typecheck` / `npm run lint` | TypeScript strict and ESLint |

Approved and rejected decisions go to `data/decisions.json`. On Vercel the filesystem is
read-only, so the log is kept in memory instead and resets on redeploy.

Run only one dev server per folder. Two servers share `.next` and the database file, which
causes intermittent "Page not found" errors and makes `npm run build` fail with `EPERM`.

## Architecture

1. `scripts/seed.ts` builds the six-table SQLite file at build time; the app only opens it read-only.
2. `src/lib/snapshot.ts` holds all the SQL; everything after it is pure, deterministic TypeScript.
3. `stockAnalyzer` classifies each SKU at each store, `problemDetector` finds 7 problem types, `optionsEngine` compares 2 to 4 options and marks exactly one as recommended, and `drafts` turns the options into simulated actions. All thresholds are in `config.ts`.
4. `src/app/api/*` serves the engine results. `POST /api/decisions` recomputes any what-if change on the server before logging it, and `DELETE` undoes a decision.
5. The UI (Next.js App Router, shadcn/ui, Recharts) calls only those routes and two pure helpers: `whatIf` (live recalculation) and `explain` ("Ask the agent", which restates computed evidence and never calculates new numbers).

## Two-minute demo

**0:00 Overview.** "45 things need your attention today, 14 critical." The four cards cover stock,
signals, open POs (3 overdue) and live promotions (2 running, TV starts in 3 days). Hover the
info icon on a card to show how it is calculated.

**0:20 The problem.** Open Stock signals and search `TV-55-SM`, store `Store A`. The card reads:
2/day, 2 days of stock, 2 to 10 day lead time, +40% promotion. Store A runs out on 11 Oct and the
TV promotion starts on 12 Oct.

**0:40 The options.** Open the card. Point out the evidence: PO-001 from Supplier A is 2 days late,
so it is not counted as incoming stock. In the options table, only Supplier B (2 days, ₹36,750)
arrives before the stock-out. Supplier A is 7 days and Supplier C is 10 days. Doing nothing loses
₹14,40,000 in sales.

**1:00 The recommendation.** Transfer Store B's 5 spare units (₹2,250, arrives 10 Oct), then top
up 27 units from Supplier B. Store B is sitting on 24 days of stock, so moving its stock is
cheaper than buying more.

**1:20 What if.** Switch the source to Supplier A: the arrival becomes 16 Oct and "Before
stock-out" turns to No. Select Reset. The draft preview is labelled "Simulated: nothing is sent".

**1:35 Decide.** Press **A** to approve. A toast appears with Undo, the card leaves the list, and
the counter drops by 3, because the store imbalance and supplier trade-off signals for the same
TV at Store A are settled too. Open the Decisions log to show the transfer and the Supplier B
order, then Export CSV.

**1:50 Ask.** Select the speech-bubble icon and ask "Why is PO-001 a problem?". The answer uses
only the numbers the engine already computed.

Keyboard: **Ctrl+K** opens the command palette. In a review, **A** approves, **R** rejects,
**J**/**K** move to the next or previous signal and **Esc** closes. The **?** icon replays the tour.
