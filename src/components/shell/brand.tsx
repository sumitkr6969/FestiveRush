import Link from "next/link";
import { Zap } from "lucide-react";

export function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Zap className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">VoltKart</span>
        <span className="text-xs text-muted-foreground">Supply Intelligence</span>
      </span>
    </Link>
  );
}
