import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { getNavItem } from "@/components/shell/nav";

const item = getNavItem("/purchase-orders");

export const metadata: Metadata = { title: item.label };

export default function PurchaseOrdersPage() {
  return <PlaceholderPage item={item} />;
}
