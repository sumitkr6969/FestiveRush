import type { Draft, DraftKind, Option } from "./decisionTypes";

// Simulated action drafts. Pure (no I/O) so the browser can preview them live.
// Nothing here executes anything: a draft is what a human approves or rejects.

function draftKind(option: Option): DraftKind {
  switch (option.kind) {
    case "TRANSFER_FROM_STORE":
    case "TRANSFER_FROM_WAREHOUSE":
    case "TRANSFER_TO_STORE":
      return "TRANSFER";
    case "ORDER_FROM_SUPPLIER":
      // A supplier that can't confirm stock gets an enquiry, not a purchase order.
      return option.supplierAvailability === "in_stock" ? "PO_DRAFT" : "SUPPLIER_ENQUIRY";
    case "WAIT_FOR_PO":
    case "CANCEL_INBOUND_PO":
    case "MARKDOWN_REVIEW":
    case "HOLD":
      return "ALERT";
  }
}

export const DRAFT_LABEL: Record<DraftKind, string> = {
  TRANSFER: "Transfer",
  PO_DRAFT: "PO draft",
  SUPPLIER_ENQUIRY: "Supplier enquiry",
  ALERT: "Alert",
};

export function createDraft(option: Option): Draft {
  const kind = draftKind(option);
  return {
    id: `DRAFT:${option.id}`,
    kind,
    optionId: option.id,
    title: `Simulated ${DRAFT_LABEL[kind].toLowerCase()}: ${option.label}`,
    sku: option.sku,
    qty: option.units,
    from: option.from,
    to: option.to,
    cost: option.cost,
    expectedArrival: option.arrivalDate,
    simulated: true,
  };
}
