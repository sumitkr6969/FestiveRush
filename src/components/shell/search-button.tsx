"use client";

import { useEffect } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Placeholder until the cmdk command palette lands.
function openPalette() {
  toast.info("Search is coming soon", {
    description: "The command palette will let you jump to any SKU, store or supplier.",
  });
}

export function SearchButton() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Button
      variant="outline"
      onClick={openPalette}
      aria-label="Search (Ctrl+K)"
      aria-keyshortcuts="Control+K Meta+K"
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
