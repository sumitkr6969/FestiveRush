/**
 * Single source of "now" for the whole app. Business logic takes `asOf: string`
 * (YYYY-MM-DD) instead of calling `new Date()`, so every result is reproducible.
 */
export const TODAY = "2026-10-09";

/** Stored in `inventory.store` like a shop, but it never sells to customers. */
export const WAREHOUSE = "Central Warehouse";

// Named thresholds live below this line (added with the engines that use them).
