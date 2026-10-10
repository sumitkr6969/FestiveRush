/**
 * Single source of "now" for the whole app. Business logic takes `asOf: string`
 * (YYYY-MM-DD) instead of calling `new Date()`, so every result is reproducible.
 */
// The dataset is a stock count taken the morning of 16 Nov 2026, with sales up to 15 Nov.
export const TODAY = "2026-11-16";

// --- Demand ---------------------------------------------------------------
/** avgDailySales looks at this many days of sales (fewer for SKUs launched since). */
export const SALES_WINDOW_DAYS = 30;
/** History used to learn the weekend multiplier. */
export const HISTORY_DAYS = 90;
/** Forward horizon for projected demand, surplus and shortfalls (two weeks). */
export const PROJECTION_DAYS = 14;
/** daysOfStock when nothing sold in the window (avoids dividing by zero). */
export const NO_SALES_DAYS_OF_STOCK = 999;

// --- Classification -------------------------------------------------------
/** More than this many days of stock is overstocked. */
export const OVERSTOCK_DAYS = 20;
/** Stock older than this is "aged"... */
export const AGED_DAYS = 90;
/** ...and counts as overstocked once it also has more than this many days of stock. */
export const AGED_MIN_DAYS_OF_STOCK = 10;
/**
 * A newer SKU in the same brand, category and model line (see modelLine in stockAnalyzer.ts),
 * launched within this window, can cannibalise older ones.
 */
export const CANNIBALIZATION_WINDOW_DAYS = 120;

// --- Money ----------------------------------------------------------------
/** Electronics lose resale value as they age: ~1% of cost per week sitting idle. */
export const WEEKLY_DEPRECIATION = 0.01;
/** Store-to-store transfer cost per unit, as a share of selling price (freight + handling). */
export const TRANSFER_COST_RATE = 0.01;
export const MIN_TRANSFER_COST_PER_UNIT = 50;
/** Expected price cut to clear excess stock, as a share of its cost. */
export const MARKDOWN_RATE = 0.1;
/** Weekly value loss at or above this (INR) makes an ageing problem HIGH. */
export const AGEING_HIGH_WEEKLY_LOSS = 5000;

// --- Logistics ------------------------------------------------------------
/** Days for a store-to-store or warehouse-to-store transfer to arrive. */
export const TRANSFER_LEAD_DAYS = 1;
/**
 * The inventory location that feeds the stores. It sells nothing itself, so it is judged
 * against the whole network's sales, never as a store (see metrics.ts).
 */
export const WAREHOUSE = "Central WH";
/**
 * Warehouse stock is overstocked when the SKU's whole network (stores + warehouse)
 * holds more than this many days of sales. Higher than OVERSTOCK_DAYS because holding
 * buffer stock centrally is the warehouse's job.
 */
export const WAREHOUSE_OVERSTOCK_DAYS = 60;
/** Label for network-level needs that aren't tied to one store. */
export const NETWORK = "Network";
/** Heatmap: fewer days of stock than this is shown as low. */
export const LOW_STOCK_DAYS = 7;
/** A running promotion ending within this many days is "ending soon". */
export const PROMO_ENDING_SOON_DAYS = 3;
/** A promotion starting within this many days is "starting soon". */
export const PROMO_STARTING_SOON_DAYS = 7;
// --- Product vault & billing counter -------------------------------------
/** SKUs created in the Product vault start with this, so the vault pages can tell them apart. */
export const VAULT_SKU_PREFIX = "V-";
/**
 * Default supplier terms for vault products, named after distributors in the source data:
 * faster costs more.
 * priceFactor is relative to the standard cost (selling price x category cost share).
 */
export const VAULT_SUPPLIER_DEFAULTS = [
  { supplier: "Brand Direct", priceFactor: 1.0, leadDays: 7, moq: 10 },
  { supplier: "Redington India", priceFactor: 1.05, leadDays: 2, moq: 5 },
  { supplier: "Supertron Electronics", priceFactor: 0.96, leadDays: 12, moq: 25 },
] as const;
/** Upper bounds that keep typos (an extra zero) out of the data. */
export const VAULT_MAX_PRICE = 10_000_000;
export const VAULT_MAX_UNITS = 10_000;
export const VAULT_MAX_AGE_DAYS = 3650;
/** The options engine returns at most this many options per problem. */
export const MAX_OPTIONS = 4;
