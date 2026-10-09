import { addDays } from "../../src/lib/dates";
import type { IsoDate, PurchaseOrderRow, PurchaseOrderStatus } from "../../src/lib/types";
import { SCENARIO } from "./scenario";

type Order = [po: string, supplier: string, sku: string, qty: number, expectedOffset: number, status: PurchaseOrderStatus];

const { po } = SCENARIO;

// Offsets from asOf. Overdue = expected in the past and still not delivered.
const ORDERS: readonly Order[] = [
  [po.po, po.supplier, SCENARIO.sku, po.qty, po.expectedOffset, po.status],
  ["PO-002", "Supplier C", "MB-X14-VX", 120, 4, "in_transit"], // new launch restock
  ["PO-003", "Supplier B", "LP-14-KV", 15, -5, "overdue"],
  ["PO-004", "Supplier A", "EP-TWS-SQ", 200, -12, "delivered"],
  ["PO-005", "Supplier C", "AC-15-PL", 40, 6, "in_transit"], // more ACs on top of overstock
  ["PO-006", "Supplier A", "RF-340-FL", 20, -20, "delivered"],
  ["PO-007", "Supplier B", "TV-43-FH", 25, 1, "in_transit"],
  ["PO-008", "Supplier A", "WM-7-AQ", 15, -9, "delivered"],
  ["PO-009", "Supplier C", "MB-N5-NX", 150, -1, "overdue"],
  ["PO-010", "Supplier A", "LP-15-ZN", 12, 8, "in_transit"],
  ["PO-011", "Supplier B", "EP-NB-OR", 100, -15, "delivered"],
  ["PO-012", "Supplier A", "TV-65-QL", 10, -30, "delivered"],
];

export function buildPurchaseOrders(asOf: IsoDate): PurchaseOrderRow[] {
  return ORDERS.map(([poId, supplier, sku, qty, offset, status]) => ({
    po: poId,
    supplier,
    sku,
    qty,
    expected_date: addDays(asOf, offset),
    status,
  }));
}
