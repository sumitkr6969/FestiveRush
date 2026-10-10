# The Festival Rush: VoltKart Supply Intelligence

A supply-chain prototype for VoltKart Electronics (6 Bengaluru stores and Central WH). It reads sales, stock, suppliers,
purchase orders and promotions, finds the problems, compares the ways to fix each one and
recommends a single action. Every action is a simulated draft that waits for a human to approve
or reject it. Nothing is ever sent.

The data is the challenge dataset in `data/source/`: a stock count taken the morning of
**Mon 16 Nov 2026** (`TODAY` in `src/lib/config.ts`), with sales from 18 Aug to 15 Nov.

## Data

| File | Rows | Notes |
| --- | --- | --- |
| `products.csv` | 151 | 11 categories |
| `inventory.csv` | 1,057 | every SKU at the 6 stores and `Central WH` |
| `sales.csv` | 20,919 | only days with sales; a missing day means 0 units |
| `suppliers.csv` | 231 | 1 or 2 suppliers per SKU |
| `purchase_orders.csv` | 43 | Received, Open (not yet confirmed) or Confirmed |
| `promotions.csv` | 4 | `expected_uplift` is a fraction (0.40 = +40% demand) |

`npm run seed` reads the six files, checks every value and every cross-reference, and refuses
to build if anything is wrong, listing each problem with its file and line. Only three things are
normalised: supplier availability and PO status are lower-cased (`In stock` → `in_stock`), and
the promotion dates load into `"start"`/`"end"`. Discounts keep their wording ("10%",
"Buy 2 Get 10% off"); only a flat percentage changes the till price at the Billing counter.

**Updated file?** Replace it in `data/source/` (same columns, same format), run `npm run seed`,
then restart the dev server. If the new sales run past 15 Nov, move `TODAY` to the day after the
last sales day; the seed prints a warning when that is needed.

How the engine reads this data:

- **Central WH** sells nothing, so it is never "understocked". Its cover is measured against the
  stores' combined sales, and it is only overstocked when the whole network holds more than
  `WAREHOUSE_OVERSTOCK_DAYS` (60) days, or its stock has aged. It is offered as a transfer source.
- **Velocity** is the last 30 days of sales with promotion uplift taken out (a day sold at +15%
  counts as units ÷ 1.15), so the Combo Offer that ran the whole window doesn't inflate the forecast.
- **Cannibalisation** needs the same brand, category and model line: `INS15-G12` and `INS15-G13`
  are one line, so the Inspiron 13th Gen launch is matched to the 12th Gen and to no other Dell.
- **Understocked** means it runs out before the slowest supplier could deliver; CRITICAL when
  even the fastest is too late or the shelf empties before a promotion starts.

## Setup

Requires Node.js 20 or newer (tested on Node 24, Windows).

```bash
npm install
npm run seed      # builds data/voltkart.db (deterministic, safe to re-run)
npm run dev       # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run seed` | Recreates `data/voltkart.db` from `scripts/schema.sql` and `data/source/*.csv` |
| `npm run build` | Seeds, then builds for production (the database ships with the build) |
| `npm test` | Vitest: schema, CSV import, engines on the real data, what-if, explanations, copy rules |
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

1. `scripts/seed.ts` builds the six-table SQLite file from `data/source/` at build time. The engine reads it read-only; only the vault and billing routes write, through `getWritableDb()` in `vaultStore.ts`.
2. `src/lib/snapshot.ts` holds all the SQL; everything after it is pure, deterministic TypeScript.
3. `stockAnalyzer` classifies each SKU at each store, `problemDetector` finds 7 problem types, `optionsEngine` compares 2 to 4 options and marks exactly one as recommended, and `drafts` turns the options into simulated actions. All thresholds are in `config.ts`.
4. `src/app/api/*` serves the engine results. `POST /api/decisions` recomputes any what-if change on the server before logging it, and `DELETE` undoes a decision.
5. The UI (Next.js App Router, shadcn/ui, Recharts) calls only those routes and two pure helpers: `whatIf` (live recalculation) and `explain` ("Ask the agent", which restates computed evidence and never calculates new numbers).

## Two-minute demo

**0:00 Overview.** "22 things need your attention today, 4 critical." The cards cover stock,
signals, open POs (27 open, 1 overdue) and promotions (the Wedding Season TV Fest starts in 3
days). Hover the info icon on a card to show how it is calculated.

**0:20 The problem.** Open Stock signals and search `TV-55Q7`, store `Koramangala`. The card
reads: 1.7/day, 2.4 days of stock, 2 to 7 day lead time, +40% promotion. Koramangala runs out on
18 Nov and the TV fest starts on 19 Nov.

**0:40 The options.** Open the card. Only Redington India (2 days, ₹48,510) arrives before the
stock-out; Brand Direct is ₹2,310 cheaper per unit but takes 7 days. Doing nothing loses
₹15,33,740 in sales over the next two weeks.

**1:00 The recommendation.** Transfer Malleshwaram's 11 spare units (₹6,490, arrives 17 Nov),
then top up 15 from Redington India. Malleshwaram is sitting on 36 days of stock, so moving it is
cheaper than buying more.

**1:20 What if.** Switch the source to Brand Direct: the arrival becomes 23 Nov and "Before
stock-out" turns to No. Select Reset. The draft preview is labelled "Simulated: nothing is sent".

**1:35 Decide.** Press **A** to approve. A toast appears with Undo, the card leaves the list, and
the counter drops by 2, because the supplier trade-off for the same TV at Koramangala is settled
too. Open the Decisions log to show the transfer and the Redington India order, then Export CSV.

**1:50 Ask.** Select the speech-bubble icon and ask "Why is PO-8857 a problem?". The answer uses
only the numbers the engine already computed: Reliance Digital Distribution's 40 headphones were
promised for 11 Nov, Indiranagar runs out on 17 Nov, so move 14 from HSR Layout.

**Extra: live supplier status.** On a fresh database, open the Late PO signal for PO-8857 and
select **Update status**: report "In transit" for today. The PO now lands before Indiranagar runs
out, so waiting for it becomes the cheapest plan.

**Other stories in the data:** the Inspiron 15 13th Gen (launched 27 Oct) has stalled the 12th
Gen, and confirmed PO-8851 is about to bring 30 more 12th Gens (the engine suggests cancelling
it); 28 LG front loaders have sat 140 days at HSR Layout while Jayanagar is nearly out; the Godrej
190L fridge has aged over 195 days everywhere.

Keyboard: **Ctrl+K** opens the command palette. In a review, **A** approves, **R** rejects,
**J**/**K** move to the next or previous signal and **Esc** closes. The **?** icon replays the tour.
