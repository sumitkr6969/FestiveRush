import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TODAY, WAREHOUSE } from "@/lib/config";
import { addDays, dayOfWeek } from "@/lib/dates";
import { createDb } from "@/lib/db";
import { buildSeedData } from "../scripts/seed-data";
import { writeSeed } from "../scripts/seed-data/write";

const data = buildSeedData(TODAY);

function stockAt(sku: string, store: string): number | undefined {
  return data.inventory.find((r) => r.sku === sku && r.store === store)?.stock;
}

describe("seed data", () => {
  it("is deterministic", () => {
    expect(buildSeedData(TODAY)).toEqual(data);
  });

  it("covers 12 stores plus the warehouse for every SKU", () => {
    const stores = new Set(data.inventory.map((r) => r.store));
    expect(stores.size).toBe(13);
    expect(stores.has(WAREHOUSE)).toBe(true);
    expect(data.inventory).toHaveLength(data.products.length * 13);
  });

  it("never records sales at the warehouse or on/after asOf", () => {
    expect(data.sales.some((r) => r.store === WAREHOUSE)).toBe(false);
    expect(data.sales.every((r) => r.date < TODAY)).toBe(true);
  });

  it("sets up the hero TV story", () => {
    expect(stockAt("TV-LUM-55Q", "Koramangala")).toBe(3);
    expect(stockAt("TV-LUM-55Q", "Whitefield")).toBe(38);

    const tvPromo = data.promotions.find((p) => p.sku_or_category === "Televisions");
    expect(tvPromo?.start).toBe(addDays(TODAY, 7));
    expect(dayOfWeek(tvPromo?.start ?? "")).toBe(5); // Friday

    const tvPo = data.purchaseOrders.find((p) => p.sku === "TV-LUM-55Q");
    expect(tvPo && tvPromo && tvPo.expected_date > tvPromo.start).toBe(true);
  });

  it("writes into the schema without violating any constraint", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voltkart-seed-"));
    const db = createDb(path.join(dir, "seed.db"));
    try {
      writeSeed(db, data);
      const count = db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM sales").get();
      expect(count?.n).toBe(data.sales.length);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
