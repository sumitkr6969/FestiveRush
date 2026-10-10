import type { Metadata } from "next";
import { SoldView } from "@/components/sold/sold-view";

export const metadata: Metadata = { title: "Sold vault" };

export default function SoldVaultPage() {
  return <SoldView />;
}
