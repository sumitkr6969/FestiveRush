import fs from "node:fs";
import path from "node:path";
import type {
  InventoryRow,
  ProductRow,
  PromotionRow,
  PurchaseOrderRow,
  PurchaseOrderStatus,
  SalesRow,
  SupplierAvailability,
  SupplierRow,
} from "../../src/lib/types";
import { parseCsv, type CsvRow } from "./csv";

export interface SeedData {
  products: ProductRow[];
  inventory: InventoryRow[];
  sales: SalesRow[];
  suppliers: SupplierRow[];
  purchaseOrders: PurchaseOrderRow[];
  promotions: PromotionRow[];
}

/** The six input files. Replace one and re-run `npm run seed`; nothing else changes. */
export const SOURCE_DIR = path.join(process.cwd(), "data", "source");

const COLUMNS = {
  "products.csv": ["sku", "product", "brand", "category", "model", "selling_price", "launch_date"],
  "inventory.csv": ["sku", "store", "stock", "ageing_days"],
  "sales.csv": ["date", "sku", "store", "qty_sold", "selling_price"],
  "suppliers.csv": ["supplier", "sku", "purchase_price", "lead_time_days", "moq", "availability"],
  "purchase_orders.csv": ["po", "supplier", "sku", "qty", "expected_date", "status"],
  "promotions.csv": ["sku_or_category", "promotion", "start_date", "end_date", "discount", "expected_uplift"],
} as const;
type FileName = keyof typeof COLUMNS;

// The CSVs use human labels; the database stores the normalised values the engine checks.
const AVAILABILITY: Record<string, SupplierAvailability> = { "in stock": "in_stock", limited: "limited", backorder: "backorder" };
const PO_STATUS: Record<string, PurchaseOrderStatus> = { received: "received", open: "open", confirmed: "confirmed" };

/** Collects every bad value across all files, so one seed run reports them all. */
class Problems {
  private list: string[] = [];
  add(file: FileName, row: CsvRow, message: string) {
    this.list.push(`${file} line ${row.line}: ${message}`);
  }
  throwIfAny() {
    if (this.list.length === 0) return;
    const shown = this.list.slice(0, 25).join("\n  ");
    const more = this.list.length > 25 ? `\n  … and ${this.list.length - 25} more` : "";
    throw new Error(`The source data has ${this.list.length} problem(s):\n  ${shown}${more}`);
  }
}

type Reader = ReturnType<typeof makeReader>;

function makeReader(problems: Problems, file: FileName, row: CsvRow) {
  const raw = (col: string) => row.values[col] ?? "";
  const fail = <T>(message: string, fallback: T): T => {
    problems.add(file, row, message);
    return fallback;
  };
  return {
    text(col: string): string {
      const v = raw(col);
      return v === "" ? fail(`${col} is empty`, v) : v;
    },
    number(col: string, { integer = false, min = 0 } = {}): number {
      const v = raw(col);
      const n = Number(v);
      if (v === "" || !Number.isFinite(n)) return fail(`${col} "${v}" is not a number`, 0);
      if (integer && !Number.isInteger(n)) return fail(`${col} "${v}" is not a whole number`, 0);
      if (n < min) return fail(`${col} ${n} is below ${min}`, 0);
      return n;
    },
    date(col: string): string {
      const v = raw(col);
      // Round-trip through UTC: rejects 2026-02-30 as well as other shapes.
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
      return ok ? v : fail(`${col} "${v}" is not a YYYY-MM-DD date`, "1970-01-01");
    },
    oneOf<T>(col: string, map: Record<string, T>): T {
      const v = raw(col);
      const hit = map[v.toLowerCase()];
      if (hit !== undefined) return hit;
      return fail(`${col} "${v}" is not one of ${Object.keys(map).join(", ")}`, Object.values(map)[0] as T);
    },
    fail: (message: string) => problems.add(file, row, message),
  };
}

function read<T>(dir: string, file: FileName, problems: Problems, toRow: (r: Reader) => T): T[] {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) throw new Error(`Missing source file ${full}`);
  return parseCsv(fs.readFileSync(full, "utf8"), file, COLUMNS[file]).map((row) => toRow(makeReader(problems, file, row)));
}

function checkUnique<T>(problems: string[], file: FileName, rows: readonly T[], key: (r: T) => string) {
  const seen = new Set<string>();
  for (const r of rows) {
    const k = key(r);
    if (seen.has(k)) problems.push(`${file}: duplicate key ${k}`);
    seen.add(k);
  }
}

/** Reads and validates the six CSVs. Throws with every problem found; never guesses a fix. */
export function loadSeedData(dir: string = SOURCE_DIR): SeedData {
  const problems = new Problems();

  const products = read(dir, "products.csv", problems, (r): ProductRow => ({
    sku: r.text("sku"),
    product: r.text("product"),
    brand: r.text("brand"),
    category: r.text("category"),
    model: r.text("model"),
    selling_price: r.number("selling_price"),
    launch_date: r.date("launch_date"),
  }));
  const inventory = read(dir, "inventory.csv", problems, (r): InventoryRow => ({
    sku: r.text("sku"),
    store: r.text("store"),
    stock: r.number("stock", { integer: true }),
    ageing_days: r.number("ageing_days", { integer: true }),
  }));
  const sales = read(dir, "sales.csv", problems, (r): SalesRow => ({
    date: r.date("date"),
    sku: r.text("sku"),
    store: r.text("store"),
    qty_sold: r.number("qty_sold", { integer: true }),
    selling_price: r.number("selling_price"),
  }));
  const suppliers = read(dir, "suppliers.csv", problems, (r): SupplierRow => ({
    supplier: r.text("supplier"),
    sku: r.text("sku"),
    purchase_price: r.number("purchase_price"),
    lead_time_days: r.number("lead_time_days", { integer: true }),
    moq: r.number("moq", { integer: true, min: 1 }),
    availability: r.oneOf("availability", AVAILABILITY),
  }));
  const purchaseOrders = read(dir, "purchase_orders.csv", problems, (r): PurchaseOrderRow => ({
    po: r.text("po"),
    supplier: r.text("supplier"),
    sku: r.text("sku"),
    qty: r.number("qty", { integer: true, min: 1 }),
    expected_date: r.date("expected_date"),
    status: r.oneOf("status", PO_STATUS),
  }));
  const promotions = read(dir, "promotions.csv", problems, (r): PromotionRow => {
    const row: PromotionRow = {
      sku_or_category: r.text("sku_or_category"),
      promotion: r.text("promotion"),
      start: r.date("start_date"),
      end: r.date("end_date"),
      discount: r.text("discount"),
      expected_uplift: r.number("expected_uplift"),
    };
    if (row.end < row.start) r.fail(`end_date ${row.end} is before start_date ${row.start}`);
    return row;
  });
  problems.throwIfAny();

  // Cross-file checks: the database's foreign keys would reject these, but with a worse message.
  const errors: string[] = [];
  checkUnique(errors, "products.csv", products, (p) => p.sku);
  checkUnique(errors, "inventory.csv", inventory, (i) => `${i.sku} @ ${i.store}`);
  checkUnique(errors, "suppliers.csv", suppliers, (s) => `${s.supplier} / ${s.sku}`);
  checkUnique(errors, "purchase_orders.csv", purchaseOrders, (p) => p.po);
  const skus = new Set(products.map((p) => p.sku));
  const categories = new Set(products.map((p) => p.category));
  const offers = new Set(suppliers.map((s) => `${s.supplier}|${s.sku}`));
  const unknown = (file: FileName, list: readonly string[]) => {
    for (const sku of new Set(list)) if (!skus.has(sku)) errors.push(`${file}: unknown sku ${sku}`);
  };
  unknown("inventory.csv", inventory.map((i) => i.sku));
  unknown("sales.csv", sales.map((s) => s.sku));
  unknown("suppliers.csv", suppliers.map((s) => s.sku));
  for (const p of products) if (!suppliers.some((s) => s.sku === p.sku)) errors.push(`suppliers.csv: no supplier for ${p.sku}`);
  for (const po of purchaseOrders) {
    if (!offers.has(`${po.supplier}|${po.sku}`)) errors.push(`purchase_orders.csv: ${po.po} names ${po.supplier} for ${po.sku}, which suppliers.csv doesn't list`);
  }
  for (const p of promotions) {
    if (!skus.has(p.sku_or_category) && !categories.has(p.sku_or_category)) {
      errors.push(`promotions.csv: "${p.sku_or_category}" is neither a SKU nor a category`);
    }
  }
  if (errors.length > 0) throw new Error(`The source data has ${errors.length} problem(s):\n  ${errors.join("\n  ")}`);

  return { products, inventory, sales, suppliers, purchaseOrders, promotions };
}
