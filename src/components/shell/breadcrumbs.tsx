"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { findNavItem } from "./nav";

export function Breadcrumbs() {
  const pathname = usePathname();
  const current = findNavItem(pathname);

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm">
        <li className="hidden sm:block">
          <Link
            href="/"
            className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            VoltKart
          </Link>
        </li>
        <li className="hidden sm:block" aria-hidden="true">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </li>
        <li className="truncate font-medium" aria-current="page">
          {current?.label ?? "Not found"}
        </li>
      </ol>
    </nav>
  );
}
