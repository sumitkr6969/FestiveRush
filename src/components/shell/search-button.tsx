"use client";

import { Search } from "lucide-react";
import { useUi } from "@/components/providers/ui-provider";
import { Button } from "@/components/ui/button";

/** Opens the command palette (also Ctrl/Cmd+K, handled by the palette itself). */
export function SearchButton() {
  const { setPaletteOpen } = useUi();
  return (
    <Button
      variant="outline"
      onClick={() => setPaletteOpen(true)}
      aria-label="Search (Ctrl+K)"
      aria-keyshortcuts="Control+K Meta+K"
      data-tour="search"
      className="h-9 gap-2 px-2.5 text-muted-foreground md:w-56 md:justify-start md:px-3"
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span className="hidden md:inline">Search…</span>
      <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium md:inline">
        Ctrl K
      </kbd>
    </Button>
  );
}
