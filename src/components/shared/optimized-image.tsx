// src/components/shared/optimized-image.tsx

"use client";

import NextImage, { type ImageProps } from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps next/image with the two things that are easy to forget and costly
 * to omit:
 *
 *  1. LAZY LOADING is the default. `priority` is opt-in and should be set
 *     on the LCP element only — marking many images priority disables
 *     lazy loading for all of them and makes the page slower, not faster.
 *
 *  2. A blur placeholder plus a fade-in, so a grid does not flash grey
 *     rectangles as it fills. The placeholder is a tiny inline SVG, so it
 *     costs no extra request and no build-time blur generation.
 */
export function OptimizedImage({
  className,
  alt,
  priority = false,
  ...props
}: ImageProps & { alt: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <NextImage
      {...props}
      alt={alt}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      // decoding=async keeps image decode off the main thread, which
      // matters when a shop grid paints 24 images at once.
      decoding="async"
      placeholder="blur"
      blurDataURL={SHIMMER}
      onLoad={() => setLoaded(true)}
      className={cn(
        "transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}

const SHIMMER =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="10">
       <rect width="8" height="10" fill="#e8e8e6"/>
     </svg>`,
  );
