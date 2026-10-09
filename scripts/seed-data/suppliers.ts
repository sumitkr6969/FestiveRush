import type { ProductRow, SupplierAvailability, SupplierRow } from "../../src/lib/types";

const APEX = "Apex Distributors"; // fast, small MOQs, pricier
const CRESTLINE = "Crestline Imports"; // cheapest, slow, big MOQs
const METRO = "Metro Electronics Supply"; // middle of the road
const ZENITH = "Zenith Trade Links"; // laptops and premium phones

type Terms = [supplier: string, sku: string, costRatio: number, leadDays: number, moq: number, availability: SupplierAvailability];

// costRatio = purchase price as a share of selling price.
const TERMS: readonly Terms[] = [
  // The core trade-off for the hero TV: Apex is 9 days faster but ~8% dearer.
  [APEX, "TV-LUM-55Q", 0.84, 3, 5, "in_stock"],
  [CRESTLINE, "TV-LUM-55Q", 0.78, 12, 40, "in_stock"],
  [APEX, "TV-LUM-65Q", 0.85, 3, 5, "in_stock"],
  [CRESTLINE, "TV-LUM-65Q", 0.79, 14, 30, "limited"],
  [METRO, "TV-AUR-43F", 0.82, 5, 20, "in_stock"],
  [METRO, "TV-AUR-50U", 0.83, 5, 15, "in_stock"],
  [CRESTLINE, "TV-AUR-50U", 0.78, 12, 40, "in_stock"],
  [METRO, "PH-VEL-X12", 0.86, 5, 20, "in_stock"],
  [APEX, "PH-VEL-X14", 0.88, 3, 10, "limited"],
  [METRO, "PH-VEL-X14", 0.86, 6, 25, "in_stock"],
  [ZENITH, "PH-NEX-N9", 0.85, 7, 15, "in_stock"],
  [METRO, "PH-NEX-N5", 0.84, 4, 30, "in_stock"],
  [METRO, "LP-KOR-14", 0.87, 6, 5, "limited"],
  [ZENITH, "LP-KOR-14", 0.84, 9, 10, "out_of_stock"],
  [ZENITH, "LP-KOR-16P", 0.85, 9, 5, "in_stock"],
  [ZENITH, "LP-ZEN-13A", 0.84, 8, 5, "in_stock"],
  [APEX, "AU-SON-TWS", 0.7, 2, 50, "in_stock"],
  [CRESTLINE, "AU-SON-TWS", 0.62, 10, 200, "in_stock"],
  [APEX, "AU-SON-SB", 0.78, 3, 10, "in_stock"],
  [METRO, "AU-ORB-HP", 0.74, 5, 20, "in_stock"],
  [CRESTLINE, "HA-FRO-WM8", 0.8, 10, 10, "in_stock"],
  [METRO, "HA-FRO-RF3", 0.82, 4, 10, "in_stock"],
  [CRESTLINE, "HA-POL-AC15", 0.8, 12, 20, "in_stock"],
  [METRO, "HA-POL-AC15", 0.84, 5, 10, "in_stock"],
  [METRO, "HA-POL-MW", 0.8, 4, 15, "in_stock"],
];

export const SUPPLIER = { APEX, CRESTLINE, METRO, ZENITH } as const;

export function buildSuppliers(products: readonly ProductRow[]): SupplierRow[] {
  const priceBySku = new Map(products.map((p) => [p.sku, p.selling_price]));
  return TERMS.map(([supplier, sku, costRatio, lead_time_days, moq, availability]) => {
    const price = priceBySku.get(sku);
    if (price === undefined) throw new Error(`Supplier terms reference unknown SKU ${sku}`);
    // Rounded to ₹10 like real price lists.
    const purchase_price = Math.round((price * costRatio) / 10) * 10;
    return { supplier, sku, purchase_price, lead_time_days, moq, availability };
  });
}
