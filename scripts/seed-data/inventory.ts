import { WAREHOUSE } from "../../src/lib/config";
import { addDays } from "../../src/lib/dates";
import type { InventoryRow, IsoDate, PromotionRow } from "../../src/lib/types";
import { STORES, type ProductSpec, type Range } from "./catalog";
import { expectedDemand } from "./demand";
import { intBetween, type Rng } from "./random";

const RECENT_DAYS = 28;
const DEFAULT_COVER_DAYS: Range = [18, 40];
const DEFAULT_AGEING_DAYS: Range = [5, 45];
const WAREHOUSE_STOCK: Range = [15, 60];
const WAREHOUSE_AGEING: Range = [10, 40];

/** Hand-placed cells that set up the demo scenarios. They replace generated values. */
const STORY_STOCK: readonly InventoryRow[] = [
  // Hero TV: about 1 day left at the busiest store, 2-3 days at the next...
  { sku: "TV-LUM-55Q", store: "Koramangala", stock: 3, ageing_days: 4 },
  { sku: "TV-LUM-55Q", store: "Indiranagar", stock: 6, ageing_days: 9 },
  // ...while the same model gathers dust across town.
  { sku: "TV-LUM-55Q", store: "Whitefield", stock: 38, ageing_days: 118 },
  { sku: "TV-LUM-55Q", store: "Yelahanka", stock: 14, ageing_days: 75 },
  { sku: "TV-LUM-55Q", store: WAREHOUSE, stock: 8, ageing_days: 15 },
  // The X14 launch PO hasn't landed yet, so the warehouse is empty.
  { sku: "PH-VEL-X14", store: WAREHOUSE, stock: 0, ageing_days: 0 },
  { sku: "PH-VEL-X12", store: WAREHOUSE, stock: 40, ageing_days: 100 },
  // Washers bought for last year's festive season, still unsold.
  { sku: "HA-FRO-WM8", store: "Electronic City", stock: 22, ageing_days: 210 },
  { sku: "HA-POL-AC15", store: WAREHOUSE, stock: 45, ageing_days: 120 },
  // Fast laptop store whose replenishment PO is delayed.
  { sku: "LP-KOR-14", store: "Hebbal", stock: 2, ageing_days: 6 },
  // Fast earbuds store, three weeks before the audio promotion.
  { sku: "AU-SON-TWS", store: "Marathahalli", stock: 5, ageing_days: 3 },
];

function recentDailyRate(spec: ProductSpec, store: string, asOf: IsoDate, promotions: readonly PromotionRow[]): number {
  let total = 0;
  for (let offset = -RECENT_DAYS; offset <= -1; offset += 1) {
    total += expectedDemand(spec, store, addDays(asOf, offset), asOf, promotions);
  }
  return total / RECENT_DAYS;
}

export function generateInventory(
  specs: readonly ProductSpec[],
  promotions: readonly PromotionRow[],
  asOf: IsoDate,
  rng: Rng,
): InventoryRow[] {
  const rows: InventoryRow[] = [];
  for (const spec of specs) {
    const sku = spec.row.sku;
    const [minCover, maxCover] = spec.coverDays ?? DEFAULT_COVER_DAYS;
    const [minAge, maxAge] = spec.ageingDays ?? DEFAULT_AGEING_DAYS;
    for (const store of STORES) {
      const cover = intBetween(rng, minCover, maxCover);
      const stock = Math.round(recentDailyRate(spec, store, asOf, promotions) * cover);
      rows.push({ sku, store, stock, ageing_days: stock === 0 ? 0 : intBetween(rng, minAge, maxAge) });
    }
    rows.push({
      sku,
      store: WAREHOUSE,
      stock: intBetween(rng, ...WAREHOUSE_STOCK),
      ageing_days: intBetween(rng, ...WAREHOUSE_AGEING),
    });
  }

  const overrides = new Map(STORY_STOCK.map((row) => [`${row.sku}|${row.store}`, row]));
  return rows.map((row) => overrides.get(`${row.sku}|${row.store}`) ?? row);
}
