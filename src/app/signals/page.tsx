import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { getNavItem } from "@/components/shell/nav";

const item = getNavItem("/signals");

export const metadata: Metadata = { title: item.label };

export default function StockSignalsPage() {
  return <PlaceholderPage item={item} />;
}
