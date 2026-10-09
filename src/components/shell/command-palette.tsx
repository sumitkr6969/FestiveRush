"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CircleHelp, ClipboardList, MessageSquareText, Package, PlayCircle, Store } from "lucide-react";
import { useUi } from "@/components/providers/ui-provider";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useApi } from "@/lib/client/useApi";
import { useOpenSignals } from "@/lib/client/useSignals";
import type { OrdersResponse } from "@/lib/views";
import { NAV_ITEMS } from "./nav";

/** Ctrl/Cmd+K: jump to pages, SKUs, stores or POs, or start reviewing. */
export function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, setPaletteOpen, setAskOpen, setTourStep } = useUi();
  const signals = useOpenSignals();
  // Orders load only once the palette has been opened.
  const orders = useApi<OrdersResponse>(paletteOpen ? "/api/orders" : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPaletteOpen]);

  const skus = useMemo(() => {
    const a = signals.data?.analysis;
    if (!a) return [];
    const map = new Map<string, string>();
    for (const i of [...a.understocked, ...a.overstocked, ...a.balanced]) map.set(i.sku, i.product);
    return [...map.entries()].sort(([x], [y]) => x.localeCompare(y));
  }, [signals.data]);

  const stores = useMemo(() => {
    const a = signals.data?.analysis;
    if (!a) return [];
    return [...new Set([...a.understocked, ...a.overstocked, ...a.balanced].map((i) => i.store))].sort();
  }, [signals.data]);

  const go = (href: string) => {
    setPaletteOpen(false);
    router.push(href);
  };
  const top = signals.open[0];

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <CommandInput placeholder="Search pages, SKUs, stores or POs" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>
        <CommandGroup heading="Actions">
          {top && (
            <CommandItem value="review top signal" onSelect={() => go(`/signals?review=${encodeURIComponent(top.problem.id)}`)}>
              <PlayCircle aria-hidden="true" />
              Review top signal
              <span className="ml-auto truncate text-xs text-muted-foreground">{top.problem.product}</span>
            </CommandItem>
          )}
          <CommandItem value="ask the agent explain" onSelect={() => { setPaletteOpen(false); setAskOpen(true); }}>
            <MessageSquareText aria-hidden="true" />
            Ask the agent
          </CommandItem>
          <CommandItem value="replay guided tour help" onSelect={() => { setPaletteOpen(false); router.push("/"); setTourStep(0); }}>
            <CircleHelp aria-hidden="true" />
            Replay the guided tour
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Pages">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.href} value={`page ${item.label}`} onSelect={() => go(item.href)}>
              <item.icon aria-hidden="true" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="SKUs">
          {skus.map(([sku, product]) => (
            <CommandItem key={sku} value={`${sku} ${product}`} onSelect={() => go(`/signals?q=${encodeURIComponent(sku)}`)}>
              <Package aria-hidden="true" />
              <span className="font-medium">{sku}</span>
              <span className="truncate text-muted-foreground">{product}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Stores">
          {stores.map((s) => (
            <CommandItem key={s} value={`store ${s}`} onSelect={() => go(`/signals?store=${encodeURIComponent(s)}`)}>
              <Store aria-hidden="true" />
              {s}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Purchase orders">
          {(orders.data?.purchaseOrders ?? []).map((po) => (
            <CommandItem key={po.po} value={`${po.po} ${po.supplier} ${po.sku}`} onSelect={() => go(`/purchase-orders?po=${encodeURIComponent(po.po)}`)}>
              <ClipboardList aria-hidden="true" />
              <span className="font-medium">{po.po}</span>
              <span className="truncate text-muted-foreground">{po.supplier} · {po.sku}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
