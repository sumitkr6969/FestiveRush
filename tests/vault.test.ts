import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY } from "@/lib/config";
import { addDays } from "@/lib/dates";
import { applyFilters, parseFilters } from "@/lib/client/signalFilters";
import { runEngine } from "@/lib/engine";
import { detectProblems } from "@/lib/problemDetector";
import { loadSnapshot } from "@/lib/snapshot";
import { flatDiscountRate, offerLabel } from "@/lib/promotions";
import type { PromotionRow } from "@/lib/types";
import { counterPrice, defaultSupplierTerms, nextVaultSku, validateProduct } from "@/lib/vault";
import { addStock, createOrder, createProduct, listSold, listVault, sell, VaultError } from "@/lib/vaultStore";
import { openSeededDb } from "./helpers/seededDb";

let db: Database.Database;
let cleanup: () => void;

beforeAll(() => {
  ({ db, cleanup } = openSeededDb());
});
afterAll(() => cleanup());

const listPromotions = () =>
  db.prepare('SELECT sku_or_category, promotion, "start" AS start, "end" AS end, discount, expected_uplift FROM promotions').all() as PromotionRow[];

const product = (overrides: Record<string, unknown>) => {
  const sellingPrice = (overrides.sellingPrice as number | undefined) ?? 50000;
  const category = (overrides.category as string | undefined) ?? "Laptops";
  return {
    name: "Test Laptop",
    company: "Testco",
    category,
    sellingPrice,
    store: "Koramangala",
    quantity: 10,
    ageDays: 0,
    suppliers: defaultSupplierTerms(category, sellingPrice),
    ...overrides,
  };
};

describe("vault rules", () => {
  it("prices default suppliers below retail, faster costs more", () => {
    // Laptops cost 81% of retail in suppliers.csv.
    const [a, b, c] = defaultSupplierTerms("Laptops", 50000);
    expect(a).toMatchObject({ supplier: "Brand Direct", purchasePrice: 40500, leadDays: 7 });
    expect(b?.purchasePrice).toBeGreaterThan(a?.purchasePrice ?? 0);
    expect(c?.purchasePrice).toBeLessThan(a?.purchasePrice ?? 0);
  });

  it("numbers SKUs per category code across all vault products", () => {
    expect(nextVaultSku("Laptops", [])).toBe("V-LAP-001");
    expect(nextVaultSku("Smartwatches", ["V-LAP-001", "V-TEL-007"])).toBe("V-SWT-008");
    expect(nextVaultSku("Drones", ["V-LAP-001"])).toBe("V-DR-002");
  });

  it("reports every invalid field", () => {
    const r = validateProduct({ name: "x", sellingPrice: -1, quantity: 0, ageDays: -2, suppliers: [] }, ["Koramangala"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["ageDays", "category", "company", "name", "quantity", "sellingPrice", "store", "suppliers"]);
  });
});

describe("product vault, billing counter and sold vault", () => {
  it("adds a product, then sells it at the counter", () => {
    const { sku } = createProduct(db, product({ name: "Counter Laptop", quantity: 6 }), TODAY);
    expect(sku).toMatch(/^V-LAP-\d{3}$/);
    const before = listVault(db, TODAY).products.find((p) => p.sku === sku);
    expect(before).toMatchObject({ category: "Laptops", brand: "Testco", totalStock: 6, launchDate: TODAY });
    expect(before?.suppliers).toHaveLength(3);

    const bill = sell(db, { store: "Koramangala", lines: [{ sku, quantity: 2 }, { sku, quantity: 1 }] }, TODAY);
    expect(bill).toMatchObject({ units: 3, total: 150000, date: TODAY });
    expect(listVault(db, TODAY).products.find((p) => p.sku === sku)?.totalStock).toBe(3);
    expect(listSold(db)[0]).toMatchObject({ sku, qty: 3, unitPrice: 50000, store: "Koramangala", date: TODAY });
  });

  it("refuses to sell more than the store holds, leaving nothing half-written", () => {
    const { sku } = createProduct(db, product({ name: "Scarce Laptop", quantity: 2 }), TODAY);
    const soldBefore = listSold(db).length;
    expect(() => sell(db, { store: "Koramangala", lines: [{ sku, quantity: 3 }] }, TODAY)).toThrow(VaultError);
    expect(listSold(db)).toHaveLength(soldBefore);
  });

  it("charges a flat promotion at the counter, but leaves basket offers to the cashier", () => {
    const promos = listPromotions();
    const tv = { sku: "V-TEL-001", category: "Televisions", sellingPrice: 50000 };
    const cable = { sku: "V-ACC-001", category: "Accessories", sellingPrice: 2000 };
    // Wedding Season TV Fest, "10%", 19 to 26 Nov.
    expect(counterPrice(tv, promos, "2026-11-20")).toMatchObject({ price: 45000, promotion: { promotion: "Wedding Season TV Fest" } });
    expect(counterPrice(tv, promos, TODAY).price).toBe(50000);
    // Combo Offer, "Buy 2 Get 10% off": shown, not applied to a single line.
    expect(counterPrice(cable, promos, "2026-11-01")).toMatchObject({ price: 2000, promotion: { discount: "Buy 2 Get 10% off" } });
  });

  it("reads only flat percentages as a price cut", () => {
    expect(flatDiscountRate("10%")).toBe(0.1);
    expect(flatDiscountRate("15% off")).toBe(0.15);
    expect(flatDiscountRate("Buy 2 Get 10% off")).toBe(0);
    expect(flatDiscountRate("100%")).toBe(0);
    expect(offerLabel("10%")).toBe("10% off");
    expect(offerLabel("Buy 2 Get 10% off")).toBe("Buy 2 Get 10% off");
  });
});

describe("the engine sees vault products and counter sales", () => {
  it("raises all 7 problem types from entered products and sales", () => {
    // Stock-out risk + store imbalance: sells 5 a day at Store E, 40 idle at Store F.
    const fast = createProduct(db, product({ name: "Fast Laptop", company: "Swiftco", store: "Whitefield", quantity: 6 }), TODAY).sku;
    sell(db, { store: "Whitefield", lines: [{ sku: fast, quantity: 5 }] }, TODAY);
    addStock(db, { sku: fast, store: "Jayanagar", quantity: 40, ageDays: 30 });

    // Ageing stock: 40 units in stock for 150 days, one sale.
    const old = createProduct(db, product({ name: "Dusty Washer", company: "Agedco", category: "Washing Machines", sellingPrice: 30000, quantity: 40, ageDays: 150 }), TODAY).sku;
    sell(db, { store: "Koramangala", lines: [{ sku: old, quantity: 1 }] }, TODAY);

    // New launch: the next Zentro generation (same model line ZB) outsells the older one.
    const v1 = createProduct(db, product({ name: "Zentro Book 14", company: "Zentro", model: "ZB-G14", quantity: 50, ageDays: 100 }), TODAY).sku;
    const v2 = createProduct(db, product({ name: "Zentro Book 15", company: "Zentro", model: "ZB-G15", quantity: 10, ageDays: 5 }), TODAY).sku;
    sell(db, { store: "Koramangala", lines: [{ sku: v1, quantity: 1 }, { sku: v2, quantity: 5 }] }, TODAY);

    // Supplier trade-off: 2 days of stock, Supertron cheapest but 12 days away, Redington on time.
    const tight = createProduct(db, product({ name: "Tight Laptop", company: "Tightco", store: "Indiranagar", quantity: 12, ageDays: 10 }), TODAY).sku;
    sell(db, { store: "Indiranagar", lines: [{ sku: tight, quantity: 10 }] }, TODAY);

    // Late PO: an order that was due three days ago. Stored as Open; lateness comes from the date.
    expect(createOrder(db, { sku: tight, supplier: "Brand Direct", quantity: 20, expectedDate: addDays(TODAY, -3) })).toMatchObject({ po: "PO-8863", status: "open" });

    // Demand spike: a TV selling 8 a day with the +40% Wedding Season TV Fest starting in 3 days.
    const buds = createProduct(db, product({ name: "Spike TV", company: "Budco", category: "Televisions", sellingPrice: 30000, quantity: 10 }), TODAY).sku;
    sell(db, { store: "Koramangala", lines: [{ sku: buds, quantity: 8 }] }, TODAY);

    // The "vault products only" filter keeps these and drops imported SKUs such as TV-55Q7.
    const recs = runEngine(loadSnapshot(db, TODAY)).recommendations;
    const vaultOnly = applyFilters(recs, { ...parseFilters(new URLSearchParams("vault=1")) });
    expect(vaultOnly.length).toBeGreaterThan(0);
    expect(vaultOnly.every((r) => r.problem.sku.startsWith("V-"))).toBe(true);

    const types = (sku: string) => detectProblems(db, TODAY).filter((p) => p.sku === sku).map((p) => p.type);
    expect(types(fast)).toEqual(expect.arrayContaining(["STOCKOUT_BEFORE_REPLENISHMENT", "STORE_IMBALANCE"]));
    expect(types(old)).toContain("AGEING_STOCK");
    expect(types(v1)).toContain("NEW_LAUNCH_CANNIBALIZATION");
    expect(types(tight)).toEqual(expect.arrayContaining(["SUPPLIER_TRADEOFF", "LATE_PO_GAP"]));
    expect(types(buds)).toContain("DEMAND_SPIKE");
  });
});
