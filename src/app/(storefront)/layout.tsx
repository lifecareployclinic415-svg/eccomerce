// Place at: src/app/(storefront)/layout.tsx

import type { Metadata } from "next";
import { Fraunces, DM_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import { SiteHeader } from "@/features/storefront/components/site-header";
import { SiteFooter } from "@/features/storefront/components/site-footer";
import { AnnouncementBar } from "@/features/storefront/components/announcement-bar";
import "@/app/globals.css";

/**
 * next/font self-hosts and subsets each face at build time, so there is no
 * render-blocking request to Google and no layout shift. `display: swap`
 * plus a variable axis keeps the payload small.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  // Full dynamic metadata, JSON-LD and Open Graph land in Phase 13.
  title: { default: "Storefront", template: "%s · Storefront" },
  description: "A modern commerce experience.",
};

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${dmSans.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {/* First tab stop on every page — keyboard users skip the nav. */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-on-brand"
          >
            Skip to content
          </a>

          <AnnouncementBar />
          <SiteHeader />

          <main id="main" className="min-h-[60vh]">
            {children}
          </main>

          <SiteFooter />
          <Toaster position="bottom-right" closeButton richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
