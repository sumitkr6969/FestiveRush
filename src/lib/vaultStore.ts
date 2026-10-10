import type Database from "better-sqlite3";
import { VAULT_MAX_AGE_DAYS, VAULT_MAX_UNITS } from "./config";
import { addDays } from "./dates";
import type { InventoryRow, IsoDate, ProductRow, PromotionRow, PurchaseOrderRow, SupplierRow } from "./types";
import { counterPrice, isVaultSku, nextVaultSku, validateProduct, type FieldErrors } from "./vault";

// Server-only reads and writes for the Product vault, Billing counter and Sold vault.
// Everything goes into the existing six tables; vault rows are told apart by SKU prefix.

export class VaultError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
  }
}

export interface VaultProduct {
  sku: string;
  product: string;
  brand: string;
  category: string;
  model: string;
  sellingPrice: number;
  launchDate: IsoDate;
  counterPrice: number;
  /** The running promotion: its name and its offer as worded ("10%", "Buy 2 Get 10% off"). */
  promotion: { name: string; offer: string } | null;
  inventory: { store: string; stock: number; ageingDays: number }[];
  totalStock: number;
  suppliers: SupplierRow[];
}

export interface SoldRow {
  id: number;
  /** Counter sale number, 1 for the first vault sale (rowid also counts seeded history). */
  number: number;
  date: IsoDate;
  sku: string;
  product: string;
  brand: string;
  category: string;
  store: string;
  qty: number;
  unitPrice: number;
  total: number;
}

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
const rec = (v: unknown) => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});

export function listStores(db: Database.Database): string[] {
  return (db.prepare("SELECT DISTINCT store FROM inventory ORDER BY store").all() as { store: string }[]).map((r) => r.store);
}

function promotions(db: Database.Database): PromotionRow[] {
  return db.prepare(`SELECT sku_or_category, promotion, "start" AS start, "end" AS end, discount, expected_uplift FROM promotions`).all() as PromotionRow[];
}

function vaultSkus(db: Database.Database): string[] {
  return (db.prepare("SELECT sku FROM products WHERE sku LIKE 'V-%'").all() as { sku: string }[]).map((r) => r.sku).filter(isVaultSku);
}

export function listVault(db: Database.Database, asOf: IsoDate) {
  const promos = promotions(db);
  const products = (db.prepare("SELECT * FROM products WHERE sku LIKE 'V-%' ORDER BY category, product").all() as ProductRow[]).filter((p) => isVaultSku(p.sku));
  const inventory = db.prepare("SELECT * FROM inventory WHERE sku LIKE 'V-%' ORDER BY store").all() as InventoryRow[];
  const suppliers = db.prepare("SELECT * FROM suppliers WHERE sku LIKE 'V-%' ORDER BY supplier").all() as SupplierRow[];
  const orders = db.prepare("SELECT * FROM purchase_orders WHERE sku LIKE 'V-%' ORDER BY po").all() as PurchaseOrderRow[];
  const categories = (db.prepare("SELECT DISTINCT category FROM products ORDER BY category").all() as { category: string }[]).map((r) => r.category);

  return {
    asOf,
    stores: listStores(db),
    categories,
    products: products.map((p): VaultProduct => {
      const inv = inventory.filter((i) => i.sku === p.sku).map((i) => ({ store: i.store, stock: i.stock, ageingDays: i.ageing_days }));
      const { price, promotion } = counterPrice({ sku: p.sku, category: p.category, sellingPrice: p.selling_price }, promos, asOf);
      return {
        sku: p.sku,
        product: p.product,
        brand: p.brand,
        category: p.category,
        model: p.model,
        sellingPrice: p.selling_price,
        launchDate: p.launch_date,
        counterPrice: price,
        promotion: promotion ? { name: promotion.promotion, offer: promotion.discount } : null,
        inventory: inv,
        totalStock: inv.reduce((s, i) => s + i.stock, 0),
        suppliers: suppliers.filter((s) => s.sku === p.sku),
      };
    }),
    orders,
  };
}

export type VaultResponse = ReturnType<typeof listVault>;

/** Adds a product, its stock at one store and its supplier terms, all or nothing. */
export function createProduct(db: Database.Database, raw: unknown, asOf: IsoDate): { sku: string } {
  const parsed = validateProduct(raw, listStores(db));
  if (!parsed.ok) throw new VaultError("Some fields need attention.", 400, parsed.errors);
  const v = parsed.value;
  const sku = nextVaultSku(v.category, vaultSkus(db));
  db.transaction(() => {
    db.prepare("INSERT INTO products (sku, product, brand, category, model, selling_price, launch_date) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      sku,
      v.name,
      v.company,
      v.category,
      v.model ?? v.name,
      v.sellingPrice,
      // The first units arrived ageDays ago, which is the best launch date we have.
      addDays(asOf, -v.ageDays),
    );
    db.prepare("INSERT INTO inventory (sku, store, stock, ageing_days) VALUES (?, ?, ?, ?)").run(sku, v.store, v.quantity, v.ageDays);
    const insertSupplier = db.prepare(
      "INSERT INTO suppliers (supplier, sku, purchase_price, lead_time_days, moq, availability) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const s of v.suppliers) insertSupplier.run(s.supplier, sku, s.purchasePrice, s.leadDays, s.moq, s.availability);
  })();
  return { sku };
}

function requireVaultProduct(db: Database.Database, sku: unknown): ProductRow {
  const product = typeof sku === "string" && isVaultSku(sku) ? (db.prepare("SELECT * FROM products WHERE sku = ?").get(sku) as ProductRow | undefined) : undefined;
  if (!product) throw new VaultError("That product isn't in the vault.", 404);
  return product;
}

/** Receives more units at a store. The oldest unit's age is kept, since new units are younger. */
export function addStock(db: Database.Database, raw: unknown): { sku: string; store: string; stock: number } {
  const r = rec(raw);
  const product = requireVaultProduct(db, r.sku);
  const store = typeof r.store === "string" ? r.store : "";
  const errors: FieldErrors = {};
  if (!listStores(db).includes(store)) errors.store = "Choose a store.";
  if (!isInt(r.quantity) || r.quantity < 1 || r.quantity > VAULT_MAX_UNITS) errors.quantity = `Enter 1 to ${VAULT_MAX_UNITS} units.`;
  if (!isInt(r.ageDays) || r.ageDays < 0 || r.ageDays > VAULT_MAX_AGE_DAYS) errors.ageDays = "Enter days in stock (0 or more).";
  if (Object.keys(errors).length > 0) throw new VaultError("Some fields need attention.", 400, errors);
  const quantity = r.quantity as number;
  const ageDays = r.ageDays as number;

  db.prepare(
    `INSERT INTO inventory (sku, store, stock, ageing_days) VALUES (?, ?, ?, ?)
     ON CONFLICT (sku, store) DO UPDATE SET stock = stock + excluded.stock, ageing_days = MAX(ageing_days, excluded.ageing_days)`,
  ).run(product.sku, store, quantity, ageDays);
  const row = db.prepare("SELECT stock FROM inventory WHERE sku = ? AND store = ?").get(product.sku, store) as { stock: number };
  return { sku: product.sku, store, stock: row.stock };
}

/** Records an incoming purchase order. A date already past makes it overdue straight away. */
export function createOrder(db: Database.Database, raw: unknown): PurchaseOrderRow {
  const r = rec(raw);
  const product = requireVaultProduct(db, r.sku);
  const supplier = typeof r.supplier === "string" ? r.supplier : "";
  const expected = typeof r.expectedDate === "string" ? r.expectedDate : "";
  const errors: FieldErrors = {};
  if (!db.prepare("SELECT 1 FROM suppliers WHERE supplier = ? AND sku = ?").get(supplier, product.sku)) errors.supplier = "Choose one of this product's suppliers.";
  if (!isInt(r.quantity) || r.quantity < 1 || r.quantity > VAULT_MAX_UNITS) errors.quantity = `Enter 1 to ${VAULT_MAX_UNITS} units.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expected)) errors.expectedDate = "Choose an expected date.";
  if (Object.keys(errors).length > 0) throw new VaultError("Some fields need attention.", 400, errors);

  const highest = (db.prepare("SELECT po FROM purchase_orders").all() as { po: string }[])
    .reduce((max, row) => Math.max(max, Number(/(\d+)$/.exec(row.po)?.[1] ?? 0)), 0);
  const order: PurchaseOrderRow = {
    po: `PO-${String(highest + 1).padStart(3, "0")}`,
    supplier,
    sku: product.sku,
    qty: r.quantity as number,
    expected_date: expected,
    // Placed here, not yet confirmed by the supplier. Lateness is derived from the date.
    status: "open",
  };
  db.prepare("INSERT INTO purchase_orders (po, supplier, sku, qty, expected_date, status) VALUES (?, ?, ?, ?, ?, ?)").run(
    order.po,
    order.supplier,
    order.sku,
    order.qty,
    order.expected_date,
    order.status,
  );
  return order;
}

/**
 * Billing counter checkout: one sales row per line, dated asOf, at today's counter
 * price, and the store's stock reduced. Rejects the whole bill if any line is short.
 */
export function sell(db: Database.Database, raw: unknown, asOf: IsoDate) {
  const r = rec(raw);
  const store = typeof r.store === "string" ? r.store : "";
  if (!listStores(db).includes(store)) throw new VaultError("Choose a store.", 400, { store: "Choose a store." });
  const rawLines = Array.isArray(r.lines) ? (r.lines as unknown[]) : [];
  if (rawLines.length === 0) throw new VaultError("The bill is empty.", 400);

  // Merge repeated SKUs so a split line can't sneak past the stock check.
  const wanted = new Map<string, number>();
  for (const line of rawLines) {
    const l = rec(line);
    if (typeof l.sku !== "string" || !isInt(l.quantity) || l.quantity < 1) throw new VaultError("Each line needs a product and a whole quantity.", 400);
    wanted.set(l.sku, (wanted.get(l.sku) ?? 0) + l.quantity);
  }

  const promos = promotions(db);
  const lines = [...wanted.entries()].map(([sku, quantity]) => {
    const product = requireVaultProduct(db, sku);
    const inv = db.prepare("SELECT stock FROM inventory WHERE sku = ? AND store = ?").get(sku, store) as { stock: number } | undefined;
    if (!inv || inv.stock < quantity) {
      throw new VaultError(`Only ${inv?.stock ?? 0} × ${product.product} in stock at ${store}.`, 409);
    }
    const { price } = counterPrice({ sku, category: product.category, sellingPrice: product.selling_price }, promos, asOf);
    return { sku, product: product.product, quantity, unitPrice: price, total: price * quantity };
  });

  db.transaction(() => {
    const insertSale = db.prepare("INSERT INTO sales (date, sku, store, qty_sold, selling_price) VALUES (?, ?, ?, ?, ?)");
    const reduce = db.prepare("UPDATE inventory SET stock = stock - ? WHERE sku = ? AND store = ? AND stock >= ?");
    for (const l of lines) {
      insertSale.run(asOf, l.sku, store, l.quantity, l.unitPrice);
      // The stock >= guard makes a concurrent sale fail instead of going negative.
      if (reduce.run(l.quantity, l.sku, store, l.quantity).changes !== 1) throw new VaultError(`Stock of ${l.product} changed; try again.`, 409);
    }
  })();

  return {
    date: asOf,
    store,
    lines,
    units: lines.reduce((s, l) => s + l.quantity, 0),
    total: lines.reduce((s, l) => s + l.total, 0),
  };
}

/** Every counter sale of a vault product, newest first (rowid gives the order of entry). */
export function listSold(db: Database.Database): SoldRow[] {
  const rows = (
    db
      .prepare(
        `SELECT s.rowid AS id, s.date, s.sku, p.product, p.brand, p.category, s.store,
                s.qty_sold AS qty, s.selling_price AS unitPrice, s.qty_sold * s.selling_price AS total
           FROM sales s JOIN products p ON p.sku = s.sku
          WHERE s.sku LIKE 'V-%' AND s.qty_sold > 0
          ORDER BY s.rowid DESC`,
      )
      .all() as Omit<SoldRow, "number">[]
  ).filter((r) => isVaultSku(r.sku));
  return rows.map((r, i) => ({ ...r, number: rows.length - i }));
}
