"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { describedBy, Field, selectClass } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { postAndRefresh } from "@/lib/client/vaultClient";
import { TODAY } from "@/lib/config";
import { formatShortDate } from "@/lib/format";
import { PO_STATUS_LABEL, type PoLive, type SupplierPoStatus } from "@/lib/poStatus";
import type { FieldErrors } from "@/lib/vault";

export interface PoRef {
  po: string;
  supplier: string;
  sku: string;
  product: string;
  promisedDate: string;
  live: PoLive | null;
}

/** "Late by 3 days" style summary of a live status. */
export function liveSummary(live: PoLive): string {
  if (live.state === "delivered") return live.daysLate > 0 ? `Delivered ${live.daysLate} ${live.daysLate === 1 ? "day" : "days"} late` : "Delivered on time";
  if (live.state === "on_time") return "On time";
  return live.overdue ? `Overdue ${live.daysLate} ${live.daysLate === 1 ? "day" : "days"}, no new date` : `Late by ${live.daysLate} ${live.daysLate === 1 ? "day" : "days"}`;
}

/** Records the supplier's live status for a PO: a new ETA, dispatched, delayed or delivered. */
export function PoStatusDialog({ po, onClose }: { po: PoRef | null; onClose: () => void }) {
  const [status, setStatus] = useState<SupplierPoStatus>("in_transit");
  const [eta, setEta] = useState(TODAY);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!po) return;
    const current = po.live?.currentEta ?? po.promisedDate;
    setStatus(po.live?.latest?.status && po.live.latest.status !== "delivered" ? po.live.latest.status : "in_transit");
    setEta(current >= TODAY ? current : TODAY);
    setLocation("");
    setNote("");
    setErrors({});
  }, [po]);

  // Delivered is reported for today by default; other statuses need a future date.
  const pickStatus = (next: SupplierPoStatus) => {
    setStatus(next);
    if (next === "delivered") setEta(TODAY);
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!po) return;
    setSaving(true);
    const res = await postAndRefresh<{ live: PoLive }>(`/api/purchase-orders/${encodeURIComponent(po.po)}/status`, { status, eta, location, note });
    setSaving(false);
    if (!res.ok) {
      setErrors(res.fieldErrors);
      if (Object.keys(res.fieldErrors).length === 0) toast.error("Status not saved", { description: res.error });
      return;
    }
    toast.success(`${po.po}: ${liveSummary(res.data.live)}`, {
      description: `${PO_STATUS_LABEL[status]} reported by ${po.supplier}. Signals and suggestions are updated.`,
    });
    onClose();
  };

  return (
    <Dialog open={po !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {po && (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Supplier update: {po.po}</DialogTitle>
              <DialogDescription>
                {po.supplier}, {po.product}. Promised for {formatShortDate(po.promisedDate)}
                {po.live && po.live.state !== "on_time" ? `; now ${liveSummary(po.live).toLowerCase()}` : ""}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field id="ps-status" label="Status" error={errors.status}>
                <select {...describedBy("ps-status", errors.status)} className={selectClass} value={status} onChange={(e) => pickStatus(e.target.value as SupplierPoStatus)}>
                  {(Object.keys(PO_STATUS_LABEL) as SupplierPoStatus[]).map((s) => <option key={s} value={s}>{PO_STATUS_LABEL[s]}</option>)}
                </select>
              </Field>
              <Field id="ps-eta" label={status === "delivered" ? "Delivered on" : "Expected arrival"} error={errors.eta}>
                <Input {...describedBy("ps-eta", errors.eta)} type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
              </Field>
            </div>
            <Field id="ps-location" label="Current location (optional)" error={errors.location}>
              <Input {...describedBy("ps-location", errors.location)} value={location} maxLength={60} onChange={(e) => setLocation(e.target.value)} placeholder="Hosur hub" />
            </Field>
            <Field id="ps-note" label="Note from supplier (optional)" error={errors.note}>
              <Input {...describedBy("ps-note", errors.note)} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Truck breakdown, reloading tomorrow" />
            </Field>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving" : "Save update"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
