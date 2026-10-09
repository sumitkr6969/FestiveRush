/** Calendar date as 'YYYY-MM-DD'. Never a Date object (see CLAUDE.md rule 3). */
export type IsoDate = string;

// ---------------------------------------------------------------------------
// Row types: one per table, field names match the SQL columns exactly.
// ---------------------------------------------------------------------------

export interface ProductRow {
  sku: string;
  product: string;
  brand: string;
  category: string;
  model: string;
  /** INR */
  selling_price: number;
  launch_date: IsoDate;
}

export interface InventoryRow {
  sku: string;
  store: string;
  stock: number;
  /** Days the oldest unit at this store has been sitting in stock. */
  ageing_days: number;
}

/** One row per (date, sku, store) from launch onward; qty_sold may be 0. */
export interface SalesRow {
  date: IsoDate;
  sku: string;
  store: string;
  qty_sold: number;
  /** INR per unit actually charged (may be below list price during a promotion). */
  selling_price: number;
}

// Narrowed to the values schema.sql allows via CHECK ... IN (...).
export type SupplierAvailability = "in_stock" | "limited" | "backorder";
/** `overdue` = not delivered and expected_date is already in the past. */
export type PurchaseOrderStatus = "delivered" | "in_transit" | "overdue";

export interface SupplierRow {
  supplier: string;
  sku: string;
  /** INR per unit */
  purchase_price: number;
  lead_time_days: number;
  /** Minimum order quantity in units. */
  moq: number;
  availability: SupplierAvailability;
}

export interface PurchaseOrderRow {
  po: string;
  supplier: string;
  sku: string;
  qty: number;
  expected_date: IsoDate;
  status: PurchaseOrderStatus;
}

export interface PromotionRow {
  /** Either a product SKU or a category name. */
  sku_or_category: string;
  start: IsoDate;
  end: IsoDate;
  /** Fraction: 0.20 = 20% off. */
  discount: number;
  /** Fraction: 0.40 = +40% demand while the promotion runs. */
  expected_uplift: number;
}

// ---------------------------------------------------------------------------
// Stock analysis output (computed in stockAnalyzer.ts).
// ---------------------------------------------------------------------------

export type OverstockReason = "slow_moving" | "aged" | "new_launch_cannibalized";

export type UnderstockSeverity = "CRITICAL" | "HIGH" | "MEDIUM";

export interface OverstockItem {
  sku: string;
  product: string;
  store: string;
  stock: number;
  avgDailySales: number;
  daysOfStock: number;
  ageingDays: number;
  /** INR value of the excess units at purchase cost. */
  cashTiedUp: number;
  reason: OverstockReason;
  /** Stores short of this SKU that could take the surplus. */
  otherStoresNeeding: string[];
}

export interface UnderstockItem {
  sku: string;
  product: string;
  store: string;
  stock: number;
  avgDailySales: number;
  daysOfStock: number;
  reorderPoint: number;
  stockoutInDays: number;
  /** Days until a promotion covering this SKU starts; null if none is upcoming. */
  promotionStartingInDays: number | null;
  /** Units expected to be needed once promotion uplift is applied. */
  projectedDemandWithPromo: number;
  /** Stores holding surplus of this SKU that could transfer stock here. */
  otherStoresWithSurplus: string[];
  severity: UnderstockSeverity;
}

export interface BalancedItem {
  sku: string;
  product: string;
  store: string;
  stock: number;
  avgDailySales: number;
  daysOfStock: number;
}

export interface StockAnalysisSummary {
  totalSkus: number;
  totalStores: number;
  /** INR tied up in overstocked units. */
  totalOverstockedValue: number;
  /** INR of sales at risk from understocked SKUs. */
  totalUnderstockedRisk: number;
}

export interface StockAnalysis {
  overstocked: OverstockItem[];
  understocked: UnderstockItem[];
  balanced: BalancedItem[];
  summary: StockAnalysisSummary;
}
