import type {
  InventoryRow,
  IsoDate,
  ProductRow,
  PromotionRow,
  PurchaseOrderRow,
  SalesRow,
  SupplierRow,
} from "../../src/lib/types";
import { productSpecs } from "./catalog";
import { generateInventory } from "./inventory";
import { buildPromotions } from "./promotions";
import { buildPurchaseOrders } from "./purchaseOrders";
import { createRng } from "./random";
import { generateSales } from "./sales";
import { buildSuppliers } from "./suppliers";

export interface SeedData {
  products: ProductRow[];
  inventory: InventoryRow[];
  sales: SalesRow[];
  suppliers: SupplierRow[];
  purchaseOrders: PurchaseOrderRow[];
  promotions: PromotionRow[];
}

// Separate PRNG streams so tweaking one generator doesn't reshuffle the others.
const SALES_SEED = 20261009;
const INVENTORY_SEED = 9102026;
const SUPPLIER_SEED = 4242;

/** Pure: the same asOf always yields the same dataset. Never uses Math.random. */
export function buildSeedData(asOf: IsoDate): SeedData {
  const specs = productSpecs(asOf);
  const products = specs.map((s) => s.row);
  const promotions = buildPromotions(asOf);
  const sales = generateSales(specs, promotions, asOf, createRng(SALES_SEED));
  return {
    products,
    suppliers: buildSuppliers(products, createRng(SUPPLIER_SEED)),
    inventory: generateInventory(products, sales, asOf, createRng(INVENTORY_SEED)),
    sales,
    purchaseOrders: buildPurchaseOrders(asOf),
    promotions,
  };
}
