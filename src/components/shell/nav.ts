import {
  Activity,
  ClipboardList,
  LayoutDashboard,
  PackagePlus,
  ReceiptText,
  ScrollText,
  ShoppingCart,
  Store,
  Tag,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Pages that change data (vault, billing) are grouped apart from the insight pages. */
  group?: "counter";
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
    description: "Stock across the 6 stores and Central WH.",
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
  {
    href: "/vault",
    label: "Product vault",
    description: "Add products and stock, grouped by category.",
    icon: PackagePlus,
    group: "counter",
  },
  {
    href: "/billing",
    label: "Billing counter",
    description: "Sell products from the vault.",
    icon: ShoppingCart,
    group: "counter",
  },
  {
    href: "/sold",
    label: "Sold vault",
    description: "Every product sold at the counter.",
    icon: ReceiptText,
    group: "counter",
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
