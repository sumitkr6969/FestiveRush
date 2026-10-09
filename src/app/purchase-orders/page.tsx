import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdersView } from "@/components/orders/orders-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Purchase orders" };

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-6xl rounded-xl" />}>
      <OrdersView />
    </Suspense>
  );
}
