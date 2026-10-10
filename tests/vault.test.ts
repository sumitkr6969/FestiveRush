import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TODAY } from "@/lib/config";
import { addDays } from "@/lib/dates";
import { applyFilters, parseFilters } from "@/lib/client/signalFilters";
import { runEngine } from "@/lib/engine";
import { detectProblems } from "@/lib/problemDetector";
import { loadSnapshot } from "@/lib/snapshot";
import { defaultSupplierTerms, nextVaultSku, validateProduct } from "@/lib/vault";
import { addStock, createOrder, createProduct, listSold, listVault, sell, VaultError } from "@/lib/vaultStore";
import { openSeededDb } from "./helpers/seededDb";

let db: Database.Database;
let cleanup: () => void;

beforeAll(() => {
  ({ db, cleanup } = openSeededDb());
});
afterAll(() => cleanup());

const product = (overrides: Record<string, unknown>) => {
  const sellingPrice = (overrides.sellingPrice as number | undefined) ?? 50000;
  const category = (overrides.category as string | undefined) ?? "Laptop";
  return {
    name: "Test Laptop",
    company: "Testco",
    category,
    sellingPrice,
    store: "Store C",
    quantity: 10,
    ageDays: 0,
    suppliers: defaultSupplierTerms(category, sellingPrice),
    ...overrides,
  };
};

describe("vault rules", () => {
  it("prices default suppliers below retail, faster costs more", () => {
    const [a, b, c] = defaultSupplierTerms("Laptop", 50000);
    expect(a).toMatchObject({ supplier: "Supplier A", purchasePrice: 42500, leadDays: 7 });
    expect(b?.purchasePrice).toBeGreaterThan(a?.purchasePrice ?? 0);
    expect(c?.purchasePrice).toBeLessThan(a?.purchasePrice ?? 0);
  });

  it("numbers SKUs per category code across all vault products", () => {
    expect(nextVaultSku("Laptop", [])).toBe("V-LP-001");
    expect(nextVaultSku("Smart Watch", ["V-LP-001", "V-TV-007"])).toBe("V-SM-008");
  });

  it("reports every invalid field", () => {
    const r = validateProduct({ name: "x", sellingPrice: -1, quantity: 0, ageDays: -2, suppliers: [] }, ["Store A"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["ageDays", "category", "company", "name", "quantity", "sellingPrice", "store", "suppliers"]);
  });
});

describe("product vault, billing counter and sold vault", () => {
  it("adds a product, then sells it at the counter", () => {
    const { sku } = createProduct(db, product({ name: "Counter Laptop", quantity: 6 }), TODAY);
    expect(sku).toMatch(/^V-LP-\d{3}$/);
    const before = listVault(db, TODAY).products.find((p) => p.sku === sku);
    expect(before).toMatchObject({ category: "Laptop", brand: "Testco", totalStock: 6, launchDate: TODAY });
    expect(before?.suppliers).toHaveLength(3);

    const bill = sell(db, { store: "Store C", lines: [{ sku, quantity: 2 }, { sku, quantity: 1 }] }, TODAY);
    expect(bill).toMatchObject({ units: 3, total: 150000, date: TODAY });
    expect(listVault(db, TODAY).products.find((p) => p.sku === sku)?.totalStock).toBe(3);
    expect(listSold(db)[0]).toMatchObject({ sku, qty: 3, unitPrice: 50000, store: "Store C", date: TODAY });
  });

  it("refuses to sell more than the store holds, leaving nothing half-written", () => {
    const { sku } = createProduct(db, product({ name: "Scarce Laptop", quantity: 2 }), TODAY);
    const soldBefore = listSold(db).length;
    expect(() => sell(db, { store: "Store C", lines: [{ sku, quantity: 3 }] }, TODAY)).toThrow(VaultError);
    expect(listSold(db)).toHaveLength(soldBefore);
  });

  it("applies a live promotion at the counter (Earphones, 15% off)", () => {
    const { sku } = createProduct(db, product({ name: "Promo Buds", category: "Earphones", sellingPrice: 2000, quantity: 5 }), TODAY);
    expect(sell(db, { store: "Store C", lines: [{ sku, quantity: 1 }] }, TODAY).total).toBe(1700);
  });
});

describe("the engine sees vault products and counter sales", () => {
  it("raises all 7 problem types from entered products and sales", () => {
    // Stock-out risk + store imbalance: sells 5 a day at Store E, 40 idle at Store F.
    const fast = createProduct(db, product({ name: "Fast Laptop", company: "Swiftco", store: "Store E", quantity: 6 }), TODAY).sku;
    sell(db, { store: "Store E", lines: [{ sku: fast, quantity: 5 }] }, TODAY);
    addStock(db, { sku: fast, store: "Store F", quantity: 40, ageDays: 30 });

    // Ageing stock: 40 units in stock for 150 days, one sale.
    const old = createProduct(db, product({ name: "Dusty Washer", company: "Agedco", category: "Washing Machine", sellingPrice: 30000, quantity: 40, ageDays: 150 }), TODAY).sku;
    sell(db, { store: "Store C", lines: [{ sku: old, quantity: 1 }] }, TODAY);

    // New launch: the newer Zentro model outsells the older one, which sits on stock.
    const v1 = createProduct(db, product({ name: "Zentro Book 14", company: "Zentro", quantity: 50, ageDays: 100 }), TODAY).sku;
    const v2 = createProduct(db, product({ name: "Zentro Book 15", company: "Zentro", quantity: 10, ageDays: 5 }), TODAY).sku;
    sell(db, { store: "Store C", lines: [{ sku: v1, quantity: 1 }, { sku: v2, quantity: 5 }] }, TODAY);

    // Supplier trade-off: 2 days of stock, Supplier C cheapest but 12 days away, B on time.
    const tight = createProduct(db, product({ name: "Tight Laptop", company: "Tightco", store: "Store G", quantity: 12, ageDays: 10 }), TODAY).sku;
    sell(db, { store: "Store G", lines: [{ sku: tight, quantity: 10 }] }, TODAY);

    // Late PO: an order that was due three days ago.
    expect(createOrder(db, { sku: tight, supplier: "Supplier A", quantity: 20, expectedDate: addDays(TODAY, -3) }, TODAY).status).toBe("overdue");

    // Demand spike: earphones selling 8 a day while the Earphones promotion runs.
    const buds = createProduct(db, product({ name: "Spike Buds", company: "Budco", category: "Earphones", sellingPrice: 3000, quantity: 10 }), TODAY).sku;
    sell(db, { store: "Store C", lines: [{ sku: buds, quantity: 8 }] }, TODAY);

    // The "vault products only" filter keeps these and drops seeded SKUs such as TV-55-SM.
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
