import { CalendarDays } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { TODAY } from "@/lib/config";
import { formatDisplayDate } from "@/lib/format";
import { Breadcrumbs } from "./breadcrumbs";
import { MobileNav } from "./mobile-nav";
import { SearchButton } from "./search-button";
import { ThemeToggle } from "./theme-toggle";
import { TopBarActions } from "./top-bar-actions";
import { UserChip } from "./user-chip";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:gap-4 md:px-6">
      <MobileNav />
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-1 md:gap-3">
        <p className="hidden items-center gap-1.5 text-sm text-muted-foreground lg:flex">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Data as of</span>
          <time dateTime={TODAY} className="tabular-nums">
            {formatDisplayDate(TODAY)}
          </time>
        </p>
        <SearchButton />
        <TopBarActions />
        <ThemeToggle />
        <Separator orientation="vertical" className="hidden h-6 md:block" />
        <UserChip />
      </div>
    </header>
  );
}
