import { daysBetween } from "./dates";
import type { IsoDate, PurchaseOrderRow } from "./types";

// Live purchase-order status: suppliers post updates (a new ETA, dispatched,
// delivered...). The PO row keeps the date that was PROMISED; the latest update
// gives the CURRENT estimate. Late = current estimate after the promise.
// Pure, so the API, the engine and the browser all agree.

export type SupplierPoStatus = "confirmed" | "dispatched" | "in_transit" | "delayed" | "delivered";

export const PO_STATUS_LABEL: Record<SupplierPoStatus, string> = {
  confirmed: "Confirmed",
  dispatched: "Dispatched",
  in_transit: "In transit",
  delayed: "Delayed",
  delivered: "Delivered",
};

const STATUSES = Object.keys(PO_STATUS_LABEL) as SupplierPoStatus[];
const MAX_NOTE = 200;
const MAX_LOCATION = 60;

export interface PoStatusUpdate {
  id: string;
  po: string;
  status: SupplierPoStatus;
  /** Expected arrival, or the delivery date when status is "delivered". */
  eta: IsoDate;
  location?: string;
  note?: string;
  /** The supplier that reported it. */
  reportedBy: string;
  /** Wall-clock ISO time the update arrived. */
  reportedAt: string;
}

export type PoStatusInput = Pick<PoStatusUpdate, "status" | "eta" | "location" | "note">;

export interface PoLive {
  po: string;
  promisedDate: IsoDate;
  /** Latest estimate (or delivery date). */
  currentEta: IsoDate;
  state: "on_time" | "late" | "delivered";
  /** True when even the latest estimate has passed with no delivery. */
  overdue: boolean;
  /** Days behind the promise: projected from the ETA, or counted to today if overdue. */
  daysLate: number;
  latest: PoStatusUpdate | null;
  history: PoStatusUpdate[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max + 1) : "");

/** Checks a supplier update against the PO and today's date. */
export function validateStatusUpdate(
  raw: unknown,
  po: PurchaseOrderRow,
  asOf: IsoDate,
): { ok: true; value: PoStatusInput } | { ok: false; errors: Partial<Record<string, string>> } {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const errors: Partial<Record<string, string>> = {};
  const status = r.status as SupplierPoStatus;
  const eta = typeof r.eta === "string" ? r.eta : "";
  const location = clean(r.location, MAX_LOCATION);
  const note = clean(r.note, MAX_NOTE);

  if (!STATUSES.includes(status)) errors.status = "Choose a status.";
  if (!ISO.test(eta)) errors.eta = "Choose a date.";
  else if (status === "delivered" && eta > asOf) errors.eta = "A delivery date can't be in the future.";
  else if (status !== "delivered" && eta < asOf) errors.eta = "The expected arrival must be today or later.";
  else if (status === "delayed" && eta <= po.expected_date) errors.eta = `A delay needs a date after the promised ${po.expected_date}.`;
  if (location.length > MAX_LOCATION) errors.location = `Keep the location under ${MAX_LOCATION} characters.`;
  if (note.length > MAX_NOTE) errors.note = `Keep the note under ${MAX_NOTE} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { status, eta, ...(location ? { location } : {}), ...(note ? { note } : {}) } };
}

/** One PO as the engine should see it, given the supplier's updates in arrival order. */
export function livePo(po: PurchaseOrderRow, updates: readonly PoStatusUpdate[], asOf: IsoDate): { effective: PurchaseOrderRow; live: PoLive } {
  const history = updates.filter((u) => u.po === po.po);
  const latest = history[history.length - 1] ?? null;
  const promisedDate = po.expected_date;

  if (po.status === "delivered" || latest?.status === "delivered") {
    const deliveredOn = latest?.status === "delivered" ? latest.eta : promisedDate;
    return {
      effective: { ...po, status: "delivered", expected_date: deliveredOn },
      live: { po: po.po, promisedDate, currentEta: deliveredOn, state: "delivered", overdue: false, daysLate: Math.max(0, daysBetween(promisedDate, deliveredOn)), latest, history },
    };
  }

  const currentEta = latest?.eta ?? promisedDate;
  const overdue = currentEta < asOf;
  // Overdue: late by every day since the promise. Otherwise: by how far the ETA slipped.
  const daysLate = overdue ? daysBetween(promisedDate, asOf) : Math.max(0, daysBetween(promisedDate, currentEta));
  return {
    // A confirmed future ETA counts as inbound at that date; a passed one never does.
    effective: { ...po, expected_date: currentEta, status: overdue ? "overdue" : "in_transit" },
    live: { po: po.po, promisedDate, currentEta, state: daysLate > 0 ? "late" : "on_time", overdue, daysLate, latest, history },
  };
}

export function applyPoUpdates(rows: readonly PurchaseOrderRow[], updates: readonly PoStatusUpdate[], asOf: IsoDate) {
  const results = rows.map((po) => livePo(po, updates, asOf));
  return {
    purchaseOrders: results.map((r) => r.effective),
    poLive: Object.fromEntries(results.map((r) => [r.live.po, r.live])) as Record<string, PoLive>,
  };
}
