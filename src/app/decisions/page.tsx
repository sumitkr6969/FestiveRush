import type { Metadata } from "next";
import { DecisionsView } from "@/components/decisions/decisions-view";

export const metadata: Metadata = { title: "Decisions log" };

export default function DecisionsLogPage() {
  return <DecisionsView />;
}
