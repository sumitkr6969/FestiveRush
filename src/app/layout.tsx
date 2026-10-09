import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProviders } from "@/components/providers/app-providers";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { AppToaster } from "@/components/shell/app-toaster";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { THEME_INIT_SCRIPT } from "@/components/shell/theme-script";
import { TopBar } from "@/components/shell/top-bar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "VoltKart Supply Intelligence", template: "%s · VoltKart Supply Intelligence" },
  description: "The Festival Rush: supply intelligence for VoltKart Electronics.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The theme script edits <html> before hydration, so React must not flag it.
    <html lang="en-IN" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>
            <AppProviders>
              <a
                href="#main"
                className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
              >
                Skip to content
              </a>
              <div className="flex min-h-screen">
                <AppSidebar />
                <div className="flex min-w-0 flex-1 flex-col">
                  <TopBar />
                  <main id="main" tabIndex={-1} className="flex-1 p-4 focus:outline-none md:p-6 lg:p-8">
                    {children}
                  </main>
                </div>
              </div>
              <AppToaster />
            </AppProviders>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
