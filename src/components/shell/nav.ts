import {
  Activity,
  ClipboardList,
  LayoutDashboard,
  ScrollText,
  Store,
  Tag,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

// One list drives the sidebar, the mobile sheet and the breadcrumb.
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/",
    label: "Overview",
    description: "Today's network health and the one action that matters most.",
    icon: LayoutDashboard,
  },
  {
    href: "/signals",
    label: "Stock signals",
    description: "Low stock, overstock and slow movers, explained.",
    icon: Activity,
  },
  {
    href: "/stores",
    label: "Store network",
    description: "Stock across 12 stores and the central warehouse.",
    icon: Store,
  },
  {
    href: "/purchase-orders",
    label: "Purchase orders",
    description: "Open orders, supplier lead times and late deliveries.",
    icon: ClipboardList,
  },
  {
    href: "/promotions",
    label: "Promotions",
    description: "Upcoming festive promotions and the demand they will pull.",
    icon: Tag,
  },
  {
    href: "/decisions",
    label: "Decisions log",
    description: "Every recommendation you approved or rejected.",
    icon: ScrollText,
  },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function getNavItem(href: string): NavItem {
  const item = NAV_ITEMS.find((candidate) => candidate.href === href);
  if (!item) throw new Error(`No nav item for ${href}`);
  return item;
}

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => isActive(pathname, item.href));
}
