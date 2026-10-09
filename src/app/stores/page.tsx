import type { Metadata } from "next";
import { StoresView } from "@/components/stores/stores-view";

export const metadata: Metadata = { title: "Store network" };

export default function StoreNetworkPage() {
  return <StoresView />;
}
