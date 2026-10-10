import type { Metadata } from "next";
import { BillingView } from "@/components/billing/billing-view";

export const metadata: Metadata = { title: "Billing counter" };

export default function BillingCounterPage() {
  return <BillingView />;
}
