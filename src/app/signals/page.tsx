import type { Metadata } from "next";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/states";
import { SignalsView } from "@/components/signals/signals-view";

export const metadata: Metadata = { title: "Stock signals" };

export default function StockSignalsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} className="mx-auto max-w-5xl" />}>
      <SignalsView />
    </Suspense>
  );
}
