import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { NavItem } from "./nav";

/** Temporary body for routes whose real content arrives in later tasks. */
export function PlaceholderPage({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
          {item.label}
        </h1>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </header>
      <Card className="border-dashed shadow-sm">
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <Construction className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">This view is being built</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            The shell is ready. Data and analysis for {item.label.toLowerCase()} arrive in the next steps.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
