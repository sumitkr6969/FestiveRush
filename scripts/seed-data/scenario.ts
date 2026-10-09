/**
 * The mandatory demo scenario. These values are fixed by the brief and asserted
 * literally in tests/seed.test.ts, so the engines always have the same story:
 * Store A is about to run out of a TV that is sitting slowly in Store B, a TV
 * promotion starts in 3 days, the cheap supplier is slow and its PO is overdue.
 */
export const SCENARIO = {
  sku: "TV-55-SM",
  sellingPrice: 45000,
  storeA: { store: "Store A", stock: 4, ageingDays: 6 },
  storeB: { store: "Store B", stock: 12, ageingDays: 35 },
  promo: { category: "TV", startOffset: 3, endOffset: 12, discount: 0.1, uplift: 0.4 },
  supplierA: { supplier: "Supplier A", leadDays: 7, price: 35000 },
  supplierB: { supplier: "Supplier B", leadDays: 2, price: 36750 },
  po: { po: "PO-001", supplier: "Supplier A", qty: 10, expectedOffset: -2, status: "overdue" },
} as const;

/**
 * Exact daily sales for the scenario cells, for every day of history, so any
 * window ending yesterday gives Store A exactly 2/day and Store B exactly 0.5/day
 * (B alternates 1, 0 on even/odd day offsets; 30 days → 15 units).
 */
export function scenarioDailyQty(sku: string, store: string, offset: number): number | undefined {
  if (sku !== SCENARIO.sku) return undefined;
  if (store === SCENARIO.storeA.store) return 2;
  if (store === SCENARIO.storeB.store) return Math.abs(offset) % 2 === 0 ? 1 : 0;
  return undefined;
}
