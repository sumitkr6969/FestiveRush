/**
 * Single source of "now" for the whole app. Business logic takes `asOf: string`
 * (YYYY-MM-DD) instead of calling `new Date()`, so every result is reproducible.
 */
export const TODAY = "2026-10-09";

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
/** A same-brand, same-category SKU launched within this window can cannibalise older ones. */
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
/** Inventory location treated as a warehouse if present in the data. */
export const WAREHOUSE = "Central Warehouse";
/** Label for network-level needs that aren't tied to one store. */
export const NETWORK = "Network";
/** A running promotion ending within this many days is "ending soon". */
export const PROMO_ENDING_SOON_DAYS = 3;
/** The options engine returns at most this many options per problem. */
export const MAX_OPTIONS = 4;
