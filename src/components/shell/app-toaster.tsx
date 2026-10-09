"use client";

import { Toaster } from "sonner";
import { useTheme } from "./theme-provider";

export function AppToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="bottom-right" closeButton richColors />;
}
