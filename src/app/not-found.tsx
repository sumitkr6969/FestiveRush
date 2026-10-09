import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">That page doesn&apos;t exist in the control tower.</p>
      <Button asChild>
        <Link href="/">Back to Overview</Link>
      </Button>
    </div>
  );
}
