/**
 * Single source of "now" for the whole app. Business logic takes `asOf: string`
 * (YYYY-MM-DD) instead of calling `new Date()`, so every result is reproducible.
 */
export const TODAY = "2026-10-09";

// Named thresholds live below this line (added with the engines that use them).
