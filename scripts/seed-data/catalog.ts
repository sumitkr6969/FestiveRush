import { addDays } from "../../src/lib/dates";
import type { IsoDate, ProductRow } from "../../src/lib/types";

export const STORES = [
  "Koramangala",
  "Indiranagar",
  "Whitefield",
  "Jayanagar",
  "HSR Layout",
  "Malleshwaram",
  "Electronic City",
  "Hebbal",
  "Marathahalli",
  "JP Nagar",
  "Yelahanka",
  "Banashankari",
] as const;

/** Relative footfall per store; 1.0 = network average. */
export const STORE_TRAFFIC: Readonly<Record<string, number>> = {
  Koramangala: 1.4,
  Indiranagar: 1.3,
  Whitefield: 1.0,
  Jayanagar: 1.1,
  "HSR Layout": 1.2,
  Malleshwaram: 0.9,
  "Electronic City": 0.8,
  Hebbal: 1.0,
  Marathahalli: 1.1,
  "JP Nagar": 1.0,
  Yelahanka: 0.7,
  Banashankari: 0.9,
};

/** The Veltrix X14 launched this many days before asOf; X12 demand collapses from then. */
export const X14_LAUNCH_OFFSET = -24;

export type Range = readonly [min: number, max: number];

export interface ProductSpec {
  row: ProductRow;
  /** Average units per store per day before store, calendar and promo effects. */
  baseDailyPerStore: number;
  /** Demand multiplier for a day `offset` days from asOf (negative = past). */
  demandFactor?: (offset: number) => number;
  /** Generated store stock covers this many days of recent demand. */
  coverDays?: Range;
  ageingDays?: Range;
}

interface Extra {
  demandFactor?: ProductSpec["demandFactor"];
  coverDays?: Range;
  ageingDays?: Range;
}

function spec(
  sku: string,
  product: string,
  brand: string,
  category: string,
  model: string,
  selling_price: number,
  launch_date: IsoDate,
  baseDailyPerStore: number,
  extra: Extra = {},
): ProductSpec {
  return {
    row: { sku, product, brand, category, model, selling_price, launch_date },
    baseDailyPerStore,
    ...extra,
  };
}

export function productSpecs(asOf: IsoDate): ProductSpec[] {
  return [
    // Televisions: the hero SKU is TV-LUM-55Q (see inventory story overrides).
    spec("TV-LUM-55Q", 'Lumora 55" QLED 4K TV', "Lumora", "Televisions", "Q55-Vista", 54990, "2025-08-20", 0.9),
    spec("TV-LUM-65Q", 'Lumora 65" QLED 4K TV', "Lumora", "Televisions", "Q65-Vista", 84990, "2025-08-20", 0.35),
    spec("TV-AUR-43F", 'Aurion 43" Full HD Smart TV', "Aurion", "Televisions", "A43-Lite", 24990, "2025-03-10", 1.1),
    spec("TV-AUR-50U", 'Aurion 50" 4K Smart TV', "Aurion", "Televisions", "A50-Ultra", 36990, "2026-02-01", 0.6),

    // Smartphones: X14 launch cannibalises X12, which was stocked for pre-launch demand.
    spec("PH-VEL-X12", "Veltrix X12 5G (8/128 GB)", "Veltrix", "Smartphones", "X12", 21999, "2025-09-10", 1.2, {
      demandFactor: (offset) => (offset < X14_LAUNCH_OFFSET ? 1 : 0.25),
      coverDays: [70, 100],
      ageingDays: [85, 115],
    }),
    spec("PH-VEL-X14", "Veltrix X14 5G (8/256 GB)", "Veltrix", "Smartphones", "X14", 26999,
      addDays(asOf, X14_LAUNCH_OFFSET), 1.6, { coverDays: [2, 6], ageingDays: [3, 20] }),
    spec("PH-NEX-N9", "Nexa N9 Pro", "Nexa", "Smartphones", "N9 Pro", 34999, "2026-03-05", 0.7),
    spec("PH-NEX-N5", "Nexa N5", "Nexa", "Smartphones", "N5", 13999, "2025-11-20", 1.5),

    // Laptops
    spec("LP-KOR-14", "Korvi Book 14 (i5, 16 GB)", "Korvi", "Laptops", "Book14-G3", 58990, "2026-01-15", 0.6),
    spec("LP-KOR-16P", "Korvi Book 16 Pro", "Korvi", "Laptops", "Book16-Pro", 89990, "2026-04-10", 0.25),
    spec("LP-ZEN-13A", "Zentra Air 13", "Zentra", "Laptops", "Air13", 46990, "2025-07-01", 0.4),

    // Audio
    spec("AU-SON-TWS", "Sonique Buds Pro TWS", "Sonique", "Audio", "BudsPro-2", 4999, "2026-05-20", 2.5),
    spec("AU-SON-SB", "Sonique 3.1 Soundbar", "Sonique", "Audio", "SB31", 18990, "2025-10-01", 0.4),
    spec("AU-ORB-HP", "Orbit ANC Headphones", "Orbit", "Audio", "H700", 9990, "2025-06-15", 0.8),

    // Home appliances: the AC was bought for summer and demand fell away after it.
    spec("HA-FRO-WM8", "Frostline 8 kg Front-Load Washer", "Frostline", "Home Appliances", "FL8-Inverter", 36990, "2025-02-10", 0.3),
    spec("HA-FRO-RF3", "Frostline 340 L Double-Door Fridge", "Frostline", "Home Appliances", "RF340", 32990, "2025-05-05", 0.35),
    spec("HA-POL-AC15", "Polar 1.5 T Inverter Split AC", "Polar", "Home Appliances", "AC15-5S", 39990, "2026-02-20", 0.8, {
      // Linear seasonal decline: full summer demand 90 days ago, ~20% of it today.
      demandFactor: (offset) => 0.2 + 0.8 * (-offset / 90),
      coverDays: [90, 140],
      ageingDays: [95, 130],
    }),
    spec("HA-POL-MW", "Polar 28 L Convection Microwave", "Polar", "Home Appliances", "MW28C", 12490, "2025-09-01", 0.5),
  ];
}
