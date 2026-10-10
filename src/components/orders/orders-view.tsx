"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ErrorState, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/lib/client/useApi";
import { formatINR, formatShortDate, formatTimestamp } from "@/lib/format";
import { PO_STATUS_LABEL } from "@/lib/poStatus";
import { cn } from "@/lib/utils";
import type { OrdersResponse } from "@/lib/views";
import { LiveBadge } from "./live-status";
import { PoStatusDialog, type PoRef } from "./po-status-dialog";

type Po = OrdersResponse["purchaseOrders"][number];

/** Live status from the supplier: on time / late badge plus the latest update. */
function LiveCell({ po }: { po: Po }) {
  if (!po.live) return null;
  const latest = po.live.latest;
  return (
    <div className="flex flex-col gap-1">
      <LiveBadge live={po.live} />
      <span className="text-xs text-muted-foreground">
        {latest ? `${PO_STATUS_LABEL[latest.status]}, ${formatTimestamp(latest.reportedAt)}` : "No supplier update yet"}
      </span>
      {latest?.note && <span className="max-w-56 truncate text-xs text-muted-foreground" title={latest.note}>&ldquo;{latest.note}&rdquo;</span>}
    </div>
  );
}

function GapLink({ po }: { po: Po }) {
  if (!po.gapProblemId) return null;
  return (
    <Link
      href={`/signals?review=${encodeURIComponent(po.gapProblemId)}`}
      className="w-fit rounded-md border border-critical/30 px-2 py-0.5 text-xs font-medium text-critical-ink hover:bg-critical/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Stock gap
    </Link>
  );
}

function Progressline({ po }: { po: Po }) {
  if (po.overdue) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-critical-ink">{po.daysLate} {po.daysLate === 1 ? "day" : "days"} late</span>
        <GapLink po={po} />
      </div>
    );
  }
  if (po.status === "delivered") return <span className="text-xs text-muted-foreground">Received {formatShortDate(po.expected_date)}</span>;
  // No order date in the data: progress through the supplier's lead time is the honest estimate.
  const lead = po.leadDays ?? Math.max(po.daysUntilDue, 1);
  const pct = Math.min(100, Math.max(0, ((lead - po.daysUntilDue) / lead) * 100));
  return (
    <div className="flex min-w-[140px] flex-col gap-1">
      <Progress value={pct} className="h-1.5" aria-label={`${Math.round(pct)}% of lead time elapsed`} />
      <span className="text-xs text-muted-foreground">ETA {formatShortDate(po.expected_date)}, in {po.daysUntilDue} {po.daysUntilDue === 1 ? "day" : "days"}</span>
      {po.live?.state === "late" && <GapLink po={po} />}
    </div>
  );
}

export function OrdersView() {
  const { data, error, loading, reload } = useApi<OrdersResponse>("/api/orders");
  const highlight = useSearchParams().get("po");
  const [editing, setEditing] = useState<PoRef | null>(null);

  useEffect(() => {
    if (highlight && data) document.getElementById(`po-${highlight}`)?.scrollIntoView({ block: "center" });
  }, [highlight, data]);

  const pos = data?.purchaseOrders ?? [];
  const overdue = pos.filter((p) => p.overdue).length;
  const late = pos.filter((p) => !p.overdue && p.live?.state === "late").length;
  const inTransit = pos.filter((p) => !p.overdue && p.status === "in_transit").length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Purchase orders"
        description={
          data
            ? `${inTransit} in transit (${late} running late), ${overdue} overdue. Suppliers' live updates decide on time or late; overdue orders never count as incoming stock.`
            : "Orders and supplier terms"
        }
      />
      <PoStatusDialog po={editing} onClose={() => setEditing(null)} />
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="suppliers">Supplier terms</TabsTrigger>
          </TabsList>
          <TabsContent value="orders">
            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>PO</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Promised</TableHead>
                    <TableHead>Live status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pos.map((po) => (
                    <TableRow
                      key={po.po}
                      id={`po-${po.po}`}
                      className={cn(
                        po.overdue && "bg-critical/5 hover:bg-critical/10",
                        !po.overdue && po.live?.state === "late" && "bg-warning/10 hover:bg-warning/15",
                        highlight === po.po && "ring-2 ring-inset ring-primary",
                      )}
                    >
                      <TableCell className="font-medium">{po.po}</TableCell>
                      <TableCell>{po.supplier}</TableCell>
                      <TableCell>
                        <span className="block">{po.product}</span>
                        <span className="text-xs text-muted-foreground">{po.sku}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{po.qty}</TableCell>
                      <TableCell className="tabular-nums">{formatShortDate(po.promisedDate)}</TableCell>
                      <TableCell><LiveCell po={po} /></TableCell>
                      <TableCell><Progressline po={po} /></TableCell>
                      <TableCell className="text-right">
                        {po.live?.state !== "delivered" && (
                          <Button size="sm" variant="outline" className="h-8 whitespace-nowrap" onClick={() => setEditing(po)}>
                            Update status
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="suppliers">
            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Lead time</TableHead>
                    <TableHead className="text-right">MOQ</TableHead>
                    <TableHead>Availability</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {data.suppliers.map((s) => (
                    <TableRow key={`${s.sku}-${s.supplier}`}>
                      <TableCell className="font-medium">{s.sku}</TableCell>
                      <TableCell>{s.supplier}</TableCell>
                      <TableCell className="text-right">{formatINR(s.purchase_price)}</TableCell>
                      <TableCell className="text-right">{s.lead_time_days} days</TableCell>
                      <TableCell className="text-right">{s.moq}</TableCell>
                      <TableCell className={cn(s.availability === "backorder" && "text-critical-ink", s.availability === "limited" && "text-warning-ink")}>
                        {s.availability === "in_stock" ? "In stock" : s.availability === "limited" ? "Limited" : "Backorder"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
