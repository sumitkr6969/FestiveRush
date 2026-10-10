"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOpenSignals } from "@/lib/client/useSignals";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav";

interface SidebarNavProps {
  onNavigate?: () => void;
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const { open, data } = useOpenSignals();

  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map(({ href, label, icon: Icon, group }, i) => {
        const active = isActive(pathname, href);
        const firstOfGroup = group === "counter" && NAV_ITEMS[i - 1]?.group !== "counter";
        return (
          <Fragment key={href}>
          {firstOfGroup && (
            <p className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Store counter</p>
          )}
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            data-tour={href === "/signals" && !onNavigate ? "nav-signals" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-accent text-accent-foreground"
                : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
            {href === "/signals" && data && (
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                {open.length}
                <span className="sr-only"> open</span>
              </span>
            )}
          </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
