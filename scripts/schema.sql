-- VoltKart Supply Intelligence schema.
-- EXACTLY 6 tables (CLAUDE.md hard rule 2), one per CSV in data/source/.
-- Columns mirror the CSV headers; scripts/seed-data/index.ts maps the few that differ.
--
-- Conventions:
--   * Dates are TEXT 'YYYY-MM-DD'. The CHECK date(x) IS x rejects any other shape,
--     so string comparison and date() arithmetic in queries are always safe.
--     It must be IS, not =: date() returns NULL for junk, and a NULL CHECK passes.
--   * Money is INR (REAL). `store` is a store name ('Koramangala' …) or the
--     warehouse 'Central WH' (WAREHOUSE in src/lib/config.ts).
--   * expected_uplift is a fraction (0.40 = +40% demand). discount is the
--     promotion's own wording ('10%', 'Buy 2 Get 10% off') and is display-only.
--   * sales only lists days with sales: a missing (date, sku, store) row means
--     zero units, so averages divide by days, never by row count.

PRAGMA foreign_keys = ON;

CREATE TABLE products (
  sku           TEXT PRIMARY KEY,
  product       TEXT NOT NULL,
  brand         TEXT NOT NULL,
  category      TEXT NOT NULL,
  model         TEXT NOT NULL,
  selling_price REAL NOT NULL CHECK (selling_price >= 0),
  launch_date   DATE NOT NULL CHECK (date(launch_date) IS launch_date)
);

CREATE TABLE inventory (
  sku         TEXT NOT NULL REFERENCES products (sku),
  store       TEXT NOT NULL,
  stock       INTEGER NOT NULL CHECK (stock >= 0),
  ageing_days INTEGER NOT NULL CHECK (ageing_days >= 0),
  PRIMARY KEY (sku, store)
);

CREATE TABLE sales (
  date          DATE NOT NULL CHECK (date(date) IS date),
  sku           TEXT NOT NULL REFERENCES products (sku),
  store         TEXT NOT NULL,
  qty_sold      INTEGER NOT NULL CHECK (qty_sold >= 0),
  selling_price REAL NOT NULL CHECK (selling_price >= 0)
);

-- availability is normalised from the CSV's 'In stock' / 'Limited' / 'Backorder'.
CREATE TABLE suppliers (
  supplier       TEXT NOT NULL,
  sku            TEXT NOT NULL REFERENCES products (sku),
  purchase_price REAL NOT NULL CHECK (purchase_price >= 0),
  lead_time_days INTEGER NOT NULL CHECK (lead_time_days >= 0),
  moq            INTEGER NOT NULL CHECK (moq >= 1),
  availability   TEXT NOT NULL CHECK (availability IN ('in_stock', 'limited', 'backorder')),
  PRIMARY KEY (supplier, sku)
);

-- status is the CSV's Received / Open / Confirmed, lower-cased. Whether a PO is late
-- is derived from expected_date, never stored.
CREATE TABLE purchase_orders (
  po            TEXT PRIMARY KEY,
  supplier      TEXT NOT NULL,
  sku           TEXT NOT NULL,
  qty           INTEGER NOT NULL CHECK (qty > 0),
  expected_date DATE NOT NULL CHECK (date(expected_date) IS expected_date),
  status        TEXT NOT NULL CHECK (status IN ('received', 'open', 'confirmed')),
  FOREIGN KEY (supplier, sku) REFERENCES suppliers (supplier, sku)
);

-- "start" and "end" (the CSV's start_date / end_date) are quoted because END is an SQL keyword.
CREATE TABLE promotions (
  sku_or_category TEXT NOT NULL,
  promotion       TEXT NOT NULL,
  "start"         DATE NOT NULL CHECK (date("start") IS "start"),
  "end"           DATE NOT NULL CHECK (date("end") IS "end" AND "end" >= "start"),
  discount        TEXT NOT NULL,
  expected_uplift REAL NOT NULL CHECK (expected_uplift >= 0)
);

-- Velocity queries filter sales by sku + store over a date window.
CREATE INDEX idx_sales_sku_store_date ON sales (sku, store, date);
-- Store views list every SKU held at one store.
CREATE INDEX idx_inventory_store ON inventory (store);
