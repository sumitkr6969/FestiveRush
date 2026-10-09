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

// Separate streams so tweaking inventory doesn't reshuffle every sales row.
const SALES_SEED = 20261009;
const INVENTORY_SEED = 9102026;

/** Pure: the same asOf always yields the same dataset. */
export function buildSeedData(asOf: IsoDate): SeedData {
  const specs = productSpecs(asOf);
  const products = specs.map((s) => s.row);
  const promotions = buildPromotions(asOf);
  return {
    products,
    suppliers: buildSuppliers(products),
    inventory: generateInventory(specs, promotions, asOf, createRng(INVENTORY_SEED)),
    sales: generateSales(specs, promotions, asOf, createRng(SALES_SEED)),
    purchaseOrders: buildPurchaseOrders(asOf),
    promotions,
  };
}
