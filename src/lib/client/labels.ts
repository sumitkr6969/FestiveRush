import type { ProblemType } from "@/lib/decisionTypes";

/** Short, plain names for each problem type. */
export const TYPE_LABEL: Record<ProblemType, string> = {
  STOCKOUT_BEFORE_REPLENISHMENT: "Stock-out risk",
  AGEING_STOCK: "Ageing stock",
  STORE_IMBALANCE: "Store imbalance",
  LATE_PO_GAP: "Late PO",
  DEMAND_SPIKE: "Demand spike",
  NEW_LAUNCH_CANNIBALIZATION: "New launch",
  SUPPLIER_TRADEOFF: "Supplier trade-off",
};

/** URL-friendly keys for the type filter, so shared links stay readable. */
export const TYPE_KEY: Record<ProblemType, string> = {
  STOCKOUT_BEFORE_REPLENISHMENT: "stockout",
  AGEING_STOCK: "ageing",
  STORE_IMBALANCE: "imbalance",
  LATE_PO_GAP: "late-po",
  DEMAND_SPIKE: "demand-spike",
  NEW_LAUNCH_CANNIBALIZATION: "new-launch",
  SUPPLIER_TRADEOFF: "supplier",
};

export const TYPES_IN_ORDER: ProblemType[] = [
  "STOCKOUT_BEFORE_REPLENISHMENT",
  "AGEING_STOCK",
  "STORE_IMBALANCE",
  "LATE_PO_GAP",
  "DEMAND_SPIKE",
  "NEW_LAUNCH_CANNIBALIZATION",
  "SUPPLIER_TRADEOFF",
];

/** Readable labels for evidence keys shown in the review sheet. */
export const EVIDENCE_LABEL: Record<string, string> = {
  stock: "Stock on hand",
  avgDailySales: "Sells per day",
  stockoutInDays: "Days until stock-out",
  fastestLeadDays: "Fastest supplier lead",
  promotionStartingInDays: "Promotion starts in (days)",
  inboundUnits: "Inbound units (valid POs)",
  excludedOverduePos: "Overdue POs, not counted",
  cheapestSupplier: "Cheapest supplier",
  cheapestPrice: "Cheapest price",
  cheapestLeadDays: "Cheapest supplier lead",
  onTimeSupplier: "On-time supplier",
  onTimePrice: "On-time price",
  onTimeLeadDays: "On-time supplier lead",
  premiumPerUnit: "Premium per unit",
  premiumPct: "Premium (%)",
  unitsNeeded: "Units needed",
  extraCost: "Extra cost for speed",
  shortStore: "Short store",
  shortStoreDaysOfStock: "Short store, days of stock",
  surplusStore: "Surplus store",
  surplusStoreDaysOfStock: "Surplus store, days of stock",
  spareUnits: "Spare units",
  transferableUnits: "Units that can move",
  ageingDays: "Oldest unit (days)",
  daysOfStock: "Days of stock",
  cashTiedUp: "Cash tied up",
  weeklyValueLoss: "Value lost per week",
  newSku: "Newer SKU",
  newLaunchDate: "Launched",
  oldNetworkDailySales: "Old model, sells per day",
  newNetworkDailySales: "New model, sells per day",
  promotion: "Promotion",
  promotionStart: "Starts",
  promotionEnd: "Ends",
  expectedUplift: "Expected uplift",
  projectedDemand: "Projected demand (14 days)",
  networkStock: "Network stock",
  shortfallUnits: "Shortfall (units)",
  po: "PO",
  supplier: "Supplier",
  qty: "Quantity",
  expectedDate: "Was due",
  promisedDate: "Promised",
  currentEta: "Supplier's latest ETA",
  liveStatus: "Live status",
  lastUpdate: "Supplier note",
  daysLate: "Days late",
  gapUnits: "Units uncovered",
  firstStockoutStore: "Runs out first",
  firstStockoutDate: "Runs out on",
};

/** Evidence keys whose numbers are rupees. */
export const MONEY_KEYS = new Set([
  "cheapestPrice",
  "onTimePrice",
  "premiumPerUnit",
  "extraCost",
  "cashTiedUp",
  "weeklyValueLoss",
]);
