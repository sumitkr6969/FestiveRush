import type { Metadata } from "next";
import { VaultView } from "@/components/vault/vault-view";

export const metadata: Metadata = { title: "Product vault" };

export default function ProductVaultPage() {
  return <VaultView />;
}
