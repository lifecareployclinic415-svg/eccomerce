"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Heart, ShoppingBag } from "lucide-react";

import { staggerChild } from "@/components/shared/reveal";
import { cn } from "@/lib/utils";

/**
 * THE SIGNATURE COMPONENT.
 *
 * A shopper's whole experience of a store is a grid of these, so this is
 * where the boldness is spent: hovering cross-fades to the second product
 * image and slides an add bar up over it. Everything else on the site stays
 * quiet by comparison.
 *
 * On touch devices there is no hover, so the add bar is always visible —
 * the interaction degrades to something better, not something broken.
 */

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  brand?: string | null;
  basePrice: number;
  salePrice?: number | null;
  images: string[];
  ratingAvg?: number;
  isSoldOut?: boolean;
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function ProductCard({
  product,
  priority = false,
  onQuickAdd,
  onToggleWishlist,
}: {
  product: ProductCardData;
  /** Set on above-the-fold cards only — see the LCP note in the phase text. */
  priority?: boolean;
  onQuickAdd?: (id: string) => void;
  onToggleWishlist?: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  const [primary, secondary] = product.images;
  const hasAlt = Boolean(secondary);
  const price = product.salePrice ?? product.basePrice;
  const discounted = product.salePrice != null && product.salePrice < product.basePrice;
  const off = discounted
    ? Math.round(((product.basePrice - product.salePrice!) / product.basePrice) * 100)
    : 0;

  return (
    <motion.article
      variants={reduce ? undefined : staggerChild}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="group relative"
    >
      <div className="relative aspect-4/5 overflow-hidden rounded-xl bg-surface-sunk">
        <Link href={`/product/${product.slug}`} className="absolute inset-0" tabIndex={-1} aria-hidden />

        {primary && (
          <Image
            src={primary}
            alt=""
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={cn(
              "object-cover transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              hasAlt && hovered ? "opacity-0" : "opacity-100",
              !reduce && "group-hover:scale-[1.03]",
            )}
          />
        )}

        {hasAlt && (
          <Image
            src={secondary!}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={cn(
              "object-cover transition-opacity duration-500",
              hovered ? "opacity-100" : "opacity-0",
            )}
          />
        )}

        {/* Markdown badge uses the commerce colour, never the brand colour. */}
        {discounted && (
          <span className="numeric absolute left-3 top-3 rounded-full bg-price-tint px-2.5 py-1 text-[11px] font-medium text-price">
            {off}% off
          </span>
        )}

        {product.isSoldOut && (
          <div className="absolute inset-0 grid place-items-center bg-surface/70 backdrop-blur-[2px]">
            <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-medium tracking-wide">
              Sold out
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => onToggleWishlist?.(product.id)}
          aria-label={`Save ${product.name}`}
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-surface/85 text-ink-soft opacity-0 backdrop-blur transition hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 md:opacity-0"
        >
          <Heart className="size-4" />
        </button>

        {/* Slide-up add bar: hidden until hover on pointer devices,
            always shown where hover does not exist. */}
        {!product.isSoldOut && (
          <div
            className={cn(
              "absolute inset-x-2 bottom-2 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              "translate-y-0 opacity-100",
              "md:translate-y-3 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100",
              "md:focus-within:translate-y-0 md:focus-within:opacity-100",
            )}
          >
            <button
              type="button"
              onClick={() => onQuickAdd?.(product.id)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-lg transition-colors hover:bg-brand hover:text-on-brand"
            >
              <ShoppingBag className="size-4" />
              Add to bag
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1">
        {product.brand && (
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">{product.brand}</p>
        )}
        <h3 className="font-sans text-sm font-medium leading-snug">
          <Link href={`/product/${product.slug}`} className="after:absolute after:inset-0">
            {product.name}
          </Link>
        </h3>
        <p className="flex items-baseline gap-2">
          <span className="numeric text-sm font-semibold text-price">{inr.format(price)}</span>
          {discounted && (
            <span className="numeric text-xs text-ink-soft line-through">
              {inr.format(product.basePrice)}
            </span>
          )}
        </p>
      </div>
    </motion.article>
  );
}
