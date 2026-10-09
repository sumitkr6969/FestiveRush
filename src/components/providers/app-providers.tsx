"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { AskAgent } from "@/components/shell/ask-agent";
import { CommandPalette } from "@/components/shell/command-palette";
import { GuidedTour } from "@/components/shell/guided-tour";
import { DecisionsProvider } from "./decisions-provider";
import { UiProvider } from "./ui-provider";

/** Client-side app state plus the overlays available on every page. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    // "user" follows prefers-reduced-motion: transforms are skipped, fades stay.
    <MotionConfig reducedMotion="user">
      <UiProvider>
        <DecisionsProvider>
          {children}
          <CommandPalette />
          <AskAgent />
          <GuidedTour />
        </DecisionsProvider>
      </UiProvider>
    </MotionConfig>
  );
}
