import type { IsoDate, Severity, SupplierAvailability, SupplierRow } from "./types";

// ---------------------------------------------------------------------------
// Problems (problemDetector.ts)
// ---------------------------------------------------------------------------

export type ProblemType =
  | "STOCKOUT_BEFORE_REPLENISHMENT"
  | "AGEING_STOCK"
  | "DEMAND_SPIKE"
  | "NEW_LAUNCH_CANNIBALIZATION"
  | "SUPPLIER_TRADEOFF"
  | "STORE_IMBALANCE"
  | "LATE_PO_GAP";

export interface Donor {
  store: string;
  /** stock − ceil(avgDailySales × PROJECTION_DAYS), > 0. */
  spare: number;
  overstocked: boolean;
}

export interface InboundPo {
  po: string;
  supplier: string;
  qty: number;
  expectedDate: IsoDate;
}

/** Everything buildOptions needs to cover a shortage, so it stays a pure function. */
export interface ReplenishmentNeed {
  asOf: IsoDate;
  sku: string;
  product: string;
  sellingPrice: number;
  /** A store name, or NETWORK for SKU-wide needs. */
  destination: string;
  unitsNeeded: number;
  stockoutInDays: number;
  stockoutDate: IsoDate;
  donors: Donor[];
  /** Spare units at the warehouse, or null when there is no warehouse row. */
  warehouseSpare: number | null;
  suppliers: SupplierRow[];
  /** Open POs that are NOT overdue. Overdue POs never count as inbound. */
  inbound: InboundPo[];
}

/** Everything buildOptions needs to deal with stock that isn't selling. */
export interface ExcessContext {
  asOf: IsoDate;
  sku: string;
  product: string;
  store: string;
  sellingPrice: number;
  excessUnits: number;
  unitCost: number;
  cashTiedUp: number;
  weeklyValueLoss: number;
  /** Stores short of this SKU over the projection horizon, most short first. */
  recipients: { store: string; units: number }[];
  inbound: InboundPo[];
}

export type ProblemContext =
  | { kind: "replenish"; need: ReplenishmentNeed }
  | { kind: "excess"; excess: ExcessContext };

export interface Problem {
  id: string;
  type: ProblemType;
  severity: Severity;
  sku: string;
  store?: string;
  /** Facts behind the problem, for display. */
  evidence: Record<string, string | number | boolean | null>;
  message: string;
  context: ProblemContext;
}

// ---------------------------------------------------------------------------
// Options (optionsEngine.ts)
// ---------------------------------------------------------------------------

export type OptionKind =
  | "TRANSFER_FROM_STORE"
  | "TRANSFER_FROM_WAREHOUSE"
  | "ORDER_FROM_SUPPLIER"
  | "WAIT_FOR_PO"
  | "TRANSFER_TO_STORE"
  | "CANCEL_INBOUND_PO"
  | "MARKDOWN_REVIEW"
  | "HOLD";

export interface Option {
  id: string;
  kind: OptionKind;
  label: string;
  sku: string;
  from: string;
  to: string;
  units: number;
  /** INR */
  cost: number;
  arrivalDate: IsoDate | null;
  arrivesBeforeStockout: boolean;
  /** Units bought beyond the need only because of the supplier's MOQ. */
  moqOverbuy: number;
  riskNote: string | null;
  recommended: boolean;
  /** One-line reason, set on the recommended option only. */
  reason: string | null;
  supplierAvailability?: SupplierAvailability;
  po?: string;
}

export interface OptionSet {
  problemId: string;
  options: Option[];
  /** Order covering what the recommended option leaves short, if anything. */
  topUp: Option | null;
  doNothing: { label: string; units: number; cost: number };
}

// ---------------------------------------------------------------------------
// Drafts and decisions (actions.ts)
// ---------------------------------------------------------------------------

export type DraftKind = "TRANSFER" | "PO_DRAFT" | "SUPPLIER_ENQUIRY" | "ALERT";

export interface Draft {
  id: string;
  kind: DraftKind;
  optionId: string;
  title: string;
  sku: string;
  qty: number;
  from: string;
  to: string;
  cost: number;
  expectedArrival: IsoDate | null;
  /** Nothing executes: every draft is a simulation awaiting human approval. */
  simulated: true;
}

export type DecisionOutcome = "approved" | "rejected";

export interface DecisionInput {
  problemId: string;
  draftId: string;
  decision: DecisionOutcome;
  reason?: string;
}

export interface DecisionRecord extends DecisionInput {
  id: string;
  /** ISO timestamp of when the human decided (wall-clock, not business time). */
  decidedAt: string;
}
