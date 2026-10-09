"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertOctagon, CheckCircle2, Truck } from "lucide-react";
import { ErrorState, PageHeader } from "@/components/common/states";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/lib/client/useApi";
import { formatINR, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrdersResponse } from "@/lib/views";

type Po = OrdersResponse["purchaseOrders"][number];

function StatusBadge({ po }: { po: Po }) {
  if (po.overdue) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-critical/10 px-2 py-0.5 text-xs font-medium text-critical-ink ring-1 ring-inset ring-critical/25">
        <AlertOctagon className="h-3.5 w-3.5" aria-hidden="true" />Overdue
      </span>
    );
  }
  if (po.status === "delivered") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-healthy/10 px-2 py-0.5 text-xs font-medium text-healthy-ink ring-1 ring-inset ring-healthy/25">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Delivered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-info/10 px-2 py-0.5 text-xs font-medium text-info-ink ring-1 ring-inset ring-info/25">
      <Truck className="h-3.5 w-3.5" aria-hidden="true" />In transit
    </span>
  );
}

function Progressline({ po }: { po: Po }) {
  if (po.overdue) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-critical-ink">{po.daysLate} {po.daysLate === 1 ? "day" : "days"} late</span>
        {po.gapProblemId && (
          <Link
            href={`/signals?review=${encodeURIComponent(po.gapProblemId)}`}
            className="rounded-md border border-critical/30 px-2 py-0.5 text-xs font-medium text-critical-ink hover:bg-critical/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Stock gap
          </Link>
        )}
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
    </div>
  );
}

export function OrdersView() {
  const { data, error, loading, reload } = useApi<OrdersResponse>("/api/orders");
  const highlight = useSearchParams().get("po");

  useEffect(() => {
    if (highlight && data) document.getElementById(`po-${highlight}`)?.scrollIntoView({ block: "center" });
  }, [highlight, data]);

  const pos = data?.purchaseOrders ?? [];
  const overdue = pos.filter((p) => p.overdue).length;
  const inTransit = pos.filter((p) => !p.overdue && p.status === "in_transit").length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Purchase orders"
        description={data ? `${inTransit} in transit, ${overdue} overdue. Overdue orders never count as incoming stock.` : "Orders and supplier terms"}
      />
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
                    <TableHead>Expected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pos.map((po) => (
                    <TableRow
                      key={po.po}
                      id={`po-${po.po}`}
                      className={cn(po.overdue && "bg-critical/5 hover:bg-critical/10", highlight === po.po && "ring-2 ring-inset ring-primary")}
                    >
                      <TableCell className="font-medium">{po.po}</TableCell>
                      <TableCell>{po.supplier}</TableCell>
                      <TableCell>
                        <span className="block">{po.product}</span>
                        <span className="text-xs text-muted-foreground">{po.sku}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{po.qty}</TableCell>
                      <TableCell className="tabular-nums">{formatShortDate(po.expected_date)}</TableCell>
                      <TableCell><StatusBadge po={po} /></TableCell>
                      <TableCell><Progressline po={po} /></TableCell>
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
