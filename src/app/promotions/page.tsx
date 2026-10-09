import type { Metadata } from "next";
import { PromotionsView } from "@/components/promotions/promotions-view";

export const metadata: Metadata = { title: "Promotions" };

export default function PromotionsPage() {
  return <PromotionsView />;
}
