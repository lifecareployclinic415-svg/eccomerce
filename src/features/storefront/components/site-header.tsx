"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from "framer-motion";
import { Search, ShoppingBag, Heart, User, Menu, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/shop", label: "Shop all" },
  { href: "/shop?category=new", label: "New in" },
  { href: "/shop?is_featured=true", label: "Featured" },
  { href: "/blog", label: "Journal" },
];

/**
 * The header condenses on scroll rather than hiding: a store's navigation is
 * how people move, so it stays reachable. Only padding, blur and border
 * animate — all compositor-friendly, so scrolling never drops frames.
 */
export function SiteHeader({ cartCount = 0 }: { cartCount?: number }) {
  const [condensed, setCondensed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => setCondensed(y > 24));

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        condensed
          ? "border-line bg-paper/80 backdrop-blur-xl"
          : "border-transparent bg-paper",
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center gap-4 px-4 transition-[padding] duration-300 sm:px-6 lg:px-8",
          condensed ? "py-3" : "py-5",
        )}
      >
        {/* Mobile nav */}
        <Sheet>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px]">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <nav className="mt-8 flex flex-col gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2.5 text-base transition-colors hover:bg-surface-sunk"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <Link href="/" className="font-display text-xl font-semibold tracking-tight">
          Storefront
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative rounded-lg px-3 py-2 text-sm text-ink-soft transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon" aria-label="Search" onClick={() => setSearchOpen((v) => !v)}>
            <Search className="size-[18px]" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Switch theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="size-[18px] dark:hidden" />
            <Moon className="hidden size-[18px] dark:block" />
          </Button>

          <Button variant="ghost" size="icon" asChild aria-label="Saved items">
            <Link href="/wishlist"><Heart className="size-[18px]" /></Link>
          </Button>

          <Button variant="ghost" size="icon" asChild aria-label="Account">
            <Link href="/account"><User className="size-[18px]" /></Link>
          </Button>

          <Button variant="ghost" size="icon" asChild className="relative" aria-label={`Bag, ${cartCount} items`}>
            <Link href="/cart">
              <ShoppingBag className="size-[18px]" />
              {cartCount > 0 && (
                <motion.span
                  key={cartCount}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22 }}
                  className="numeric absolute -right-0.5 -top-0.5 grid size-4.5 min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-on-brand"
                >
                  {cartCount}
                </motion.span>
              )}
            </Link>
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line"
          >
            <form action="/search" className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
              <label htmlFor="site-search" className="sr-only">Search products</label>
              <input
                id="site-search"
                name="q"
                autoFocus
                placeholder="Search for products, brands and more"
                className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none placeholder:text-ink-soft focus:border-brand"
              />
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
