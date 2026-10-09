import { addDays } from "../../src/lib/dates";
import type { IsoDate, PurchaseOrderRow, PurchaseOrderStatus } from "../../src/lib/types";
import { SUPPLIER } from "./suppliers";

const { APEX, CRESTLINE, METRO, ZENITH } = SUPPLIER;

type Order = [po: string, supplier: string, sku: string, qty: number, expectedOffset: number, status: PurchaseOrderStatus];

const ORDERS: readonly Order[] = [
  // Cheap-but-slow TV order lands 2 days AFTER the TV promotion starts (offset +7).
  ["PO-1041", CRESTLINE, "TV-LUM-55Q", 40, 9, "in_transit"],
  ["PO-1042", METRO, "PH-VEL-X14", 60, 2, "in_transit"],
  // Late: Zenith is out of stock on this laptop.
  ["PO-1036", ZENITH, "LP-KOR-14", 20, -3, "delayed"],
  ["PO-1029", APEX, "AU-SON-TWS", 100, -6, "received"],
  // More ACs ordered while the network is already sitting on months of AC stock.
  ["PO-1044", CRESTLINE, "HA-POL-AC15", 30, 5, "placed"],
  ["PO-1045", APEX, "AU-SON-SB", 15, 3, "placed"],
  ["PO-1038", METRO, "HA-FRO-RF3", 25, 1, "in_transit"],
  ["PO-1030", CRESTLINE, "HA-FRO-WM8", 10, -20, "received"],
  ["PO-1046", ZENITH, "PH-NEX-N9", 30, 7, "placed"],
  ["PO-1033", METRO, "PH-NEX-N5", 80, -10, "received"],
  ["PO-1027", CRESTLINE, "TV-LUM-65Q", 30, -15, "cancelled"],
];

export function buildPurchaseOrders(asOf: IsoDate): PurchaseOrderRow[] {
  return ORDERS.map(([po, supplier, sku, qty, offset, status]) => ({
    po,
    supplier,
    sku,
    qty,
    expected_date: addDays(asOf, offset),
    status,
  }));
}
