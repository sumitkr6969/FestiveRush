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

## Live supplier status for purchase orders

Each open PO has **Update status** (Purchase orders page, and inside a Late PO review): the
supplier's status (confirmed, dispatched, in transit, delayed, delivered), the expected arrival,
location and a note. The PO keeps the date that was promised; the latest update gives the current
ETA. A PO is **late** when that ETA is after the promise, or the date has passed with no
delivery, so a delay is flagged as soon as the supplier reports it, before the date arrives.

For a late PO the engine targets the store that runs out first and suggests alternatives: move
stock from another store, order from a different supplier, or wait if the new ETA still beats
the stock-out. The "Agent suggestion" spells this out from computed numbers only; per rule 1 no
language model makes the recommendation. Updates are kept in `data/po-status.json` (in memory on
Vercel); the database is not changed.

## Store counter: Product vault, Billing counter, Sold vault

- **Product vault** (`/vault`): add a product with name, company, category, selling price, store,
  quantity and age (days in stock). Products are grouped by category; type a new category to
  start a new group. Supplier terms are pre-filled from the price and can be edited. Each
  product can receive more stock at any store or get an incoming purchase order.
- **Billing counter** (`/billing`): pick a store, add in-stock vault products to the bill and
  complete the sale. Live promotions are applied to the price. Stock can't go below zero.
- **Sold vault** (`/sold`): every counter sale, newest first, with totals and filters.

These pages write to the database (vault SKUs start with `V-`), and every write refreshes the
engine, so the 7 problem types react straight away: selling fast causes stock-out risk, idle
stock at another store causes an imbalance, stock older than 90 days causes ageing, a past-due
order causes a late PO, and so on. Stock signals has a "vault products only" view at
`/signals?vault=1`.

**Re-seeding (`npm run seed`, or `npm run build`) rebuilds the database and erases the vault.**
On a read-only deployment such as Vercel, saving returns a clear error instead.

Run only one dev server per folder. Two servers share `.next` and the database file, which
causes intermittent "Page not found" errors and makes `npm run build` fail with `EPERM`.

## Architecture

1. `scripts/seed.ts` builds the six-table SQLite file at build time. The engine reads it read-only; only the vault and billing routes write, through `getWritableDb()` in `vaultStore.ts`.
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
the counter drops by 4, because the store imbalance, supplier trade-off and late PO-001 signals
for the same TV at Store A are settled too. Open the Decisions log to show the transfer and the Supplier B
order, then Export CSV.

**1:50 Ask.** Select the speech-bubble icon and ask "Why is PO-001 a problem?". The answer uses
only the numbers the engine already computed.

**Extra: live supplier status.** On a fresh database, open the Late PO signal for PO-001. The
Agent suggestion says Supplier A has no new date, so: transfer 5 from Store B, top up from
Supplier B. Select **Update status**, report "In transit" for 10 Oct with a note. The suggestion
changes at once: the PO now lands before Store A runs out, so waiting for it plus a smaller
Supplier B top-up becomes the cheapest plan.

Keyboard: **Ctrl+K** opens the command palette. In a review, **A** approves, **R** rejects,
**J**/**K** move to the next or previous signal and **Esc** closes. The **?** icon replays the tour.
