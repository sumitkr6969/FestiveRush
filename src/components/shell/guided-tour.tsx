"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useUi } from "@/components/providers/ui-provider";

const STORAGE_KEY = "voltkart-tour-done";

const STEPS = [
  {
    target: "kpis",
    title: "Your network at a glance",
    body: "Stock on hand, signals that need a decision, open purchase orders and live promotions. Select a card to see the signals behind it.",
  },
  {
    target: "next-move",
    title: "Start with the next best move",
    body: "The three most urgent signals, ranked by severity and then by money at stake.",
  },
  {
    target: "nav-signals",
    title: "Every signal, with its evidence",
    body: "Filter, compare options side by side, try a different quantity or supplier, then approve or reject. Every action is simulated.",
  },
  {
    target: "search",
    title: "Jump anywhere",
    body: "Press Ctrl+K (Cmd+K on Mac) to find a SKU, store or PO, or to review the top signal. You can replay this tour from the palette.",
  },
] as const;

const CARD_W = 320;
const GAP = 12;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function markDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage blocked: the tour may show again next visit, which is harmless.
  }
}

/** Short first-run tour. Skippable, replayable from the command palette. */
export function GuidedTour() {
  const pathname = usePathname();
  const { tourStep, setTourStep } = useUi();
  const [rect, setRect] = useState<Rect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = tourStep === null ? null : STEPS[tourStep];

  // First visit to Overview starts the tour once.
  useEffect(() => {
    if (pathname !== "/") return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setTourStep(0);
    } catch {
      // No storage, no auto-start.
    }
  }, [pathname, setTourStep]);

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    const r = el?.getBoundingClientRect();
    setRect(r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ block: "center" });
    measure();
    // Content may still be loading or fonts swapping: follow the target's size.
    const late = window.setTimeout(measure, 350);
    const observer = new ResizeObserver(measure);
    if (el) observer.observe(el);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    nextRef.current?.focus();
    return () => {
      observer.disconnect();
      window.clearTimeout(late);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  const finish = useCallback(() => {
    markDone();
    setTourStep(null);
  }, [setTourStep]);

  useEffect(() => {
    if (tourStep === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourStep, finish]);

  if (tourStep === null || !step) return null;

  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const width = Math.min(CARD_W, vw - 32);
  const below = rect ? rect.top + rect.height + GAP + 180 < vh : true;
  const cardStyle = rect
    ? {
        width,
        left: Math.min(Math.max(16, rect.left), vw - width - 16),
        top: below ? rect.top + rect.height + GAP : undefined,
        bottom: below ? undefined : vh - rect.top + GAP,
      }
    : { width, left: (vw - width) / 2, top: vh / 2 - 90 };
  const last = tourStep === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary transition-all duration-200 ease-out motion-reduce:transition-none"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: "0 0 0 9999px rgb(2 6 23 / 0.55)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/55" />
      )}
      <div className="absolute rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg" style={cardStyle}>
        <p className="text-xs text-muted-foreground">Step {tourStep + 1} of {STEPS.length}</p>
        <h2 id="tour-title" className="mt-1 font-semibold">{step.title}</h2>
        <p id="tour-body" className="mt-1 text-sm text-muted-foreground">
          {step.body}
          {!rect && step.target === "nav-signals" && " On small screens it lives in the menu."}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>Skip tour</Button>
          <div className="flex gap-2">
            {tourStep > 0 && (
              <Button variant="outline" size="sm" onClick={() => setTourStep(tourStep - 1)}>Back</Button>
            )}
            <Button ref={nextRef} size="sm" onClick={() => (last ? finish() : setTourStep(tourStep + 1))}>
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
