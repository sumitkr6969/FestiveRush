import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { getNavItem } from "@/components/shell/nav";

const item = getNavItem("/decisions");

export const metadata: Metadata = { title: item.label };

export default function DecisionsLogPage() {
  return <PlaceholderPage item={item} />;
}
