"use client";

import { useState } from "react";
import Link from "next/link";
import { ErrorState, PageHeader } from "@/components/common/states";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useApi } from "@/lib/client/useApi";
import { NO_SALES_DAYS_OF_STOCK } from "@/lib/config";
import { formatNumber } from "@/lib/format";
import type { StoresResponse } from "@/lib/views";
import { HeatLegend, Heatmap, bandOf, type HeatCell } from "./heatmap";
import { TransferMap } from "./transfer-map";

const STATUS_LABEL = { understocked: "Low", overstocked: "Overstock", balanced: "Balanced" } as const;

export function StoresView() {
  const { data, error, loading, reload } = useApi<StoresResponse>("/api/stores");
  const [cell, setCell] = useState<HeatCell | null>(null);
  const [showTransfers, setShowTransfers] = useState(false);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Store network"
        description="Days of stock for every store and category. Select a store for its signals or a cell for its SKUs."
        actions={
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch checked={showTransfers} onCheckedChange={setShowTransfers} />
            Show transfers
          </label>
        }
      />
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <Skeleton className="h-[560px] w-full rounded-xl" />
      ) : (
        <>
          {showTransfers && <TransferMap data={data} />}
          <HeatLegend />
          <Heatmap data={data} onCell={setCell} />
        </>
      )}

      <Dialog open={cell !== null} onOpenChange={(o) => !o && setCell(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {cell && (
            <>
              <DialogHeader>
                <DialogTitle>{cell.category} at {cell.store}</DialogTitle>
                <DialogDescription>
                  {cell.daysOfStock >= NO_SALES_DAYS_OF_STOCK ? "No recent sales." : `${formatNumber(cell.daysOfStock)} days of stock across ${cell.skus.length} SKUs.`}
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-2 font-medium">SKU</th>
                      <th className="p-2 text-right font-medium">Stock</th>
                      <th className="p-2 text-right font-medium">Per day</th>
                      <th className="p-2 text-right font-medium">Days</th>
                      <th className="p-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {cell.skus.map((s) => (
                      <tr key={s.sku} className="border-t">
                        <td className="p-2">
                          <Link href={`/signals?q=${encodeURIComponent(s.sku)}&store=${encodeURIComponent(cell.store)}`} className="rounded font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {s.sku}
                          </Link>
                          <span className="block text-muted-foreground">{s.product}</span>
                        </td>
                        <td className="p-2 text-right">{s.stock}</td>
                        <td className="p-2 text-right">{formatNumber(s.avgDailySales)}</td>
                        <td className="p-2 text-right">{s.daysOfStock >= NO_SALES_DAYS_OF_STOCK ? "No sales" : formatNumber(s.daysOfStock)}</td>
                        <td className="p-2">
                          {STATUS_LABEL[s.status]}
                          {s.status === "balanced" && bandOf(s.daysOfStock) === "over" && " (high cover)"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
