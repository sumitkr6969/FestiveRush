import { addDays } from "../../src/lib/dates";
import type { IsoDate, ProductRow } from "../../src/lib/types";

export const STORES = [
  "Store A", "Store B", "Store C", "Store D", "Store E", "Store F",
  "Store G", "Store H", "Store I", "Store J", "Store K", "Store L",
] as const;

/** Relative footfall per store; 1.0 = network average. */
export const STORE_POPULARITY: Readonly<Record<string, number>> = {
  "Store A": 1.4, "Store B": 0.6, "Store C": 1.2, "Store D": 1.0,
  "Store E": 1.1, "Store F": 0.8, "Store G": 0.9, "Store H": 1.0,
  "Store I": 1.3, "Store J": 1.2, "Store K": 0.7, "Store L": 0.9,
};

/** New launch: Veltrix X14 went on sale this many days before asOf. */
export const NEW_LAUNCH_OFFSET = -21;
export const NEW_LAUNCH_SKU = "MB-X14-VX";
/** Older model of the same brand; demand drops to a quarter once the X14 launches. */
export const OLD_MODEL_SKU = "MB-X12-VX";
const OLD_MODEL_FACTOR_AFTER_LAUNCH = 0.25;

export interface ProductSpec {
  row: ProductRow;
  /** Average units per store per day before store, calendar and promo effects. */
  baseDailyPerStore: number;
  /** Demand multiplier for a day `offset` days from asOf (negative = past). */
  demandFactor?: (offset: number) => number;
}

type Item = [sku: string, product: string, brand: string, model: string, price: number, launch: IsoDate, baseDaily: number];

const CATALOG: Readonly<Record<string, readonly Item[]>> = {
  TV: [
    ["TV-32-HD", 'Kestrel 32" HD Ready LED TV', "Kestrel", "K32-HD", 13990, "2025-04-12", 1.0],
    ["TV-43-FH", 'Aurion 43" Full HD Smart TV', "Aurion", "A43-Lite", 24990, "2025-03-10", 1.0],
    ["TV-50-4K", 'Aurion 50" 4K Smart TV', "Aurion", "A50-Ultra", 34990, "2026-02-01", 0.6],
    ["TV-55-SM", "Lumora 55-inch Smart TV", "Lumora", "Q55-Vista", 45000, "2025-08-20", 0.8],
    ["TV-55-OL", 'Lumora 55" OLED TV', "Lumora", "O55-Lux", 119990, "2026-01-20", 0.15],
    ["TV-65-QL", 'Lumora 65" QLED 4K TV', "Lumora", "Q65-Vista", 84990, "2025-08-20", 0.3],
    ["TV-65-SM", 'Kestrel 65" 4K Smart TV', "Kestrel", "K65-Max", 59990, "2025-11-05", 0.35],
    ["TV-75-QL", 'Aurion 75" QLED TV', "Aurion", "A75-Pro", 149990, "2026-03-15", 0.08],
  ],
  Laptop: [
    ["LP-14-KV", "Korvi Book 14 (i5, 16 GB)", "Korvi", "Book14-G3", 58990, "2026-01-15", 0.5],
    ["LP-16-KV", "Korvi Book 16 Pro", "Korvi", "Book16-Pro", 89990, "2026-04-10", 0.2],
    ["LP-14-CB", "Korvi Chromebook 14", "Korvi", "CB14", 22990, "2025-05-14", 0.4],
    ["LP-13-ZN", "Zentra Air 13", "Zentra", "Air13", 46990, "2025-07-01", 0.35],
    ["LP-15-ZN", "Zentra 15 (Ryzen 5)", "Zentra", "Z15-R5", 42990, "2025-09-18", 0.5],
    ["LP-13-PR", "Zentra Pro 13 OLED", "Zentra", "Pro13", 129990, "2026-05-05", 0.06],
    ["LP-14-NB", "Novabook Slim 14", "Novabook", "Slim14", 36990, "2025-06-25", 0.45],
    ["LP-16-GM", "Novabook Gamer 16 (RTX 4060)", "Novabook", "G16", 109990, "2026-02-28", 0.12],
  ],
  Mobile: [
    ["MB-X12-VX", "Veltrix X12 5G (8/128 GB)", "Veltrix", "X12", 21999, "2025-09-10", 1.2],
    ["MB-X14-VX", "Veltrix X14 5G (8/256 GB)", "Veltrix", "X14", 26999, "" /* asOf + NEW_LAUNCH_OFFSET */, 1.8],
    ["MB-F2-VX", "Veltrix Fold 2", "Veltrix", "Fold2", 79999, "2026-06-12", 0.1],
    ["MB-N9-NX", "Nexa N9 Pro", "Nexa", "N9 Pro", 34999, "2026-03-05", 0.7],
    ["MB-N5-NX", "Nexa N5", "Nexa", "N5", 13999, "2025-11-20", 1.6],
    ["MB-A3-NX", "Nexa A3 (4/64 GB)", "Nexa", "A3", 9999, "2025-07-30", 1.8],
    ["MB-P8-PX", "Pixon 8", "Pixon", "P8", 64999, "2026-04-22", 0.35],
    ["MB-P8L-PX", "Pixon 8 Lite", "Pixon", "P8 Lite", 29999, "2026-04-22", 0.8],
    ["MB-M7-PX", "Pixon M7", "Pixon", "M7", 17999, "2025-12-08", 1.1],
  ],
  Earphones: [
    ["EP-TWS-SQ", "Sonique Buds Pro TWS", "Sonique", "BudsPro-2", 4999, "2026-05-20", 2.5],
    ["EP-OVR-SQ", "Sonique Studio Over-Ear", "Sonique", "Studio-X", 24990, "2026-02-14", 0.25],
    ["EP-ANC-OR", "Orbit ANC Headphones", "Orbit", "H700", 9990, "2025-06-15", 0.8],
    ["EP-NB-OR", "Orbit Neckband 3", "Orbit", "NB3", 1499, "2025-04-02", 3.0],
    ["EP-SPT-OR", "Orbit Sport TWS", "Orbit", "Sport-S", 3499, "2025-08-08", 1.5],
    ["EP-WIR-TU", "Tuneo Wired Earphones", "Tuneo", "W1", 999, "2025-01-10", 3.5],
    ["EP-TWS-TU", "Tuneo Air TWS", "Tuneo", "Air2", 2499, "2025-10-11", 2.8],
    ["EP-GAM-TU", "Tuneo Gaming Headset", "Tuneo", "G5", 2999, "2025-11-28", 1.0],
  ],
  AC: [
    ["AC-10-PL", "Polar 1 T Inverter Split AC", "Polar", "AC10-3S", 31990, "2026-02-20", 0.3],
    ["AC-15-PL", "Polar 1.5 T Inverter Split AC", "Polar", "AC15-5S", 39990, "2026-02-20", 0.35],
    ["AC-20-PL", "Polar 2 T Inverter Split AC", "Polar", "AC20-5S", 52990, "2026-02-20", 0.15],
    ["AC-PT-PL", "Polar 1 T Portable AC", "Polar", "PT10", 27990, "2025-04-18", 0.1],
    ["AC-10-FA", "Frostair 1 T 5-Star Split AC", "Frostair", "FA10-5S", 33990, "2026-03-10", 0.2],
    ["AC-15-FA", "Frostair 1.5 T 3-Star Split AC", "Frostair", "FA15-3S", 34990, "2025-03-01", 0.3],
    ["AC-15-WN", "Frostair 1.5 T Window AC", "Frostair", "FW15", 29990, "2025-03-01", 0.2],
  ],
  Refrigerator: [
    ["RF-MINI-GL", "Glacia 50 L Mini Fridge", "Glacia", "M50", 9990, "2025-08-10", 0.3],
    ["RF-190-GL", "Glacia 190 L Single-Door Fridge", "Glacia", "G190", 15990, "2025-05-20", 0.6],
    ["RF-230-GL", "Glacia 230 L Convertible Fridge", "Glacia", "G230C", 23990, "2025-12-15", 0.35],
    ["RF-260-GL", "Glacia 260 L Double-Door Fridge", "Glacia", "G260", 26990, "2025-09-02", 0.45],
    ["RF-340-FL", "Frostline 340 L Double-Door Fridge", "Frostline", "RF340", 32990, "2025-05-05", 0.4],
    ["RF-450-FL", "Frostline 450 L Frost-Free Fridge", "Frostline", "RF450", 44990, "2026-01-12", 0.25],
    ["RF-600-SB", "Frostline 600 L Side-by-Side Fridge", "Frostline", "SBS600", 89990, "2026-03-28", 0.1],
  ],
  "Washing Machine": [
    ["WM-65-AQ", "Aquaspin 6.5 kg Semi-Auto Washer", "Aquaspin", "S65", 11990, "2025-04-20", 0.45],
    ["WM-7-AQ", "Aquaspin 7 kg Top-Load Washer", "Aquaspin", "T7", 17990, "2025-06-01", 0.5],
    ["WM-8-AQ", "Aquaspin 8 kg Top-Load Washer", "Aquaspin", "T8", 21990, "2025-11-11", 0.4],
    ["WM-9-AQ", "Aquaspin 9 kg Front-Load Washer", "Aquaspin", "F9", 42990, "2026-01-25", 0.2],
    ["WM-7-FL", "Frostline 7 kg Front-Load Washer", "Frostline", "FL7", 29990, "2025-10-30", 0.3],
    ["WM-8-FL", "Frostline 8 kg Front-Load Washer", "Frostline", "FL8-Inverter", 36990, "2025-02-10", 0.3],
    ["WM-10-FL", "Frostline 10 kg Washer-Dryer", "Frostline", "WD10", 54990, "2026-04-05", 0.1],
  ],
};

export function productSpecs(asOf: IsoDate): ProductSpec[] {
  const newLaunchDate = addDays(asOf, NEW_LAUNCH_OFFSET);
  return Object.entries(CATALOG).flatMap(([category, items]) =>
    items.map(([sku, product, brand, model, selling_price, launch, baseDailyPerStore]): ProductSpec => ({
      row: {
        sku,
        product,
        brand,
        category,
        model,
        selling_price,
        // Relative to asOf so the launch stays "recent" if TODAY ever moves.
        launch_date: sku === NEW_LAUNCH_SKU ? newLaunchDate : launch,
      },
      baseDailyPerStore,
      demandFactor:
        sku === OLD_MODEL_SKU
          ? (offset) => (offset < NEW_LAUNCH_OFFSET ? 1 : OLD_MODEL_FACTOR_AFTER_LAUNCH)
          : undefined,
    })),
  );
}
