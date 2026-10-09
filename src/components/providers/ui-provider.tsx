"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** Open/close state for the global overlays: command palette, Ask, guided tour. */
interface UiContextValue {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  askOpen: boolean;
  setAskOpen: (open: boolean) => void;
  /** Index of the current tour step, or null when the tour isn't running. */
  tourStep: number | null;
  setTourStep: (step: number | null) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const value = useMemo(
    () => ({ paletteOpen, setPaletteOpen, askOpen, setAskOpen, tourStep, setTourStep }),
    [paletteOpen, askOpen, tourStep],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used inside <UiProvider>");
  return ctx;
}
