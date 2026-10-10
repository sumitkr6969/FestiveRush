# The Festival Rush: VoltKart Supply Intelligence

An agentic supply-chain prototype for VoltKart Electronics (12 stores + central warehouse).
It watches sales, stock, suppliers, purchase orders and promotions, connects the facts,
compares options, and recommends ONE action with a simulated action ready for human
approval.

Requester: Ananya Rao, Regional Supply Manager. Her pain: "Our system tells me stock is
low. But it won't tell me the same TV is gathering dust in another store, that one
supplier is faster but costs more, or that a promotion starts on Friday. I need something
that puts those pieces together."

## Tech stack (do not substitute)
Next.js 14 (App Router) + TypeScript strict, Tailwind CSS, shadcn/ui, Recharts,
framer-motion, SQLite via better-sqlite3, Vitest, cmdk (command palette), sonner (toasts),
lucide-react (icons). Deployable to Vercel.

## Hard rules
1. All calculations are pure, deterministic TypeScript in `src/lib/`. NEVER use an LLM
   for math, thresholds, ranking or recommendations. An LLM may only be used for an
   optional chat that explains results already computed.
2. The database has EXACTLY 6 tables: products, inventory, sales, suppliers,
   purchase_orders, promotions. Do not add tables or columns. Approval decisions are kept
   in a JSON file / in-memory log, not the database.
3. Never call `new Date()` in business logic. Take `asOf: string` (YYYY-MM-DD). One
   `TODAY` constant lives in `src/lib/config.ts`. All thresholds are named constants there.
4. Currency is INR, formatted with Intl.NumberFormat('en-IN').
5. Vercel: the filesystem is read-only at runtime. Generate the SQLite file at build time
   (`npm run seed`) and open it with { readonly: true }. better-sqlite3 is server-side only.
   Exception (product owner's decision): the Product vault, Billing counter and vault
   orders write to the same 6 tables through `getWritableDb()` only. Vault SKUs start
   with `V-`. On a read-only deployment those writes return 503. Re-seeding wipes them.
6. No `any`. Small files. Comment the "why" of each formula.
7. Always run `npm run lint`, `npm run typecheck` and `npm test` before saying a task is done.
8. Nothing executes without human approval. Every action is labelled "Simulated".

## Layout
src/app/                  routes + UI
src/components/           UI components (ui/ = shadcn)
src/lib/config.ts         TODAY + thresholds
src/lib/types.ts          shared types
src/lib/stockAnalyzer.ts  stock clarification engine
src/lib/problemDetector.ts  7 problem types
src/lib/optionsEngine.ts  option comparison + single recommendation
src/lib/actions.ts        simulated action drafts + decision log
scripts/schema.sql, scripts/seed.ts
tests/

## Design system (UI must follow this)
- Look: calm, modern, "control tower". Light and dark themes (system default, toggle).
- Colours (CSS variables): background slate-50 / slate-950; primary indigo-600;
  Critical = red-600, Needs action = amber-500, Healthy = emerald-600, Info = sky-600.
  Never use colour alone: pair every severity with an icon and a text label.
- Type: Inter; numbers use tabular-nums. Radius 12px cards, soft shadows, 8px spacing grid.
- Motion: framer-motion, 150-250ms, ease-out. Respect prefers-reduced-motion.
- Accessibility: WCAG AA contrast, visible focus rings, full keyboard support, aria labels
  on charts and icon buttons.
- Every list has loading skeletons, an empty state with a friendly message, and an error state.