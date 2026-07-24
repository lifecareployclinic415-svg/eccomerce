"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type GalleryImage = { url: string; alt: string | null };

/**
 * Thumbnails are real buttons in a labelled group, so the gallery is fully
 * operable by keyboard and announced correctly by screen readers — a
 * surprising number of commerce galleries are div-only and unusable without
 * a mouse.
 *
 * Zoom is transform-based (GPU compositor) rather than width/height, so it
 * never triggers layout and never janks.
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: GalleryImage[];
  productName: string;
}) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  if (!images.length) {
    return <div className="aspect-square rounded-2xl bg-surface-sunk" />;
  }

  const active = images[Math.min(index, images.length - 1)]!;

  return (
    <div className="space-y-3">
      <div
        className="relative aspect-square overflow-hidden rounded-2xl bg-surface-sunk"
        onMouseEnter={() => setZoomed(true)}
        onMouseLeave={() => setZoomed(false)}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active.url}
            initial={reduce ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0"
          >
            <Image
              src={active.url}
              alt={active.alt ?? productName}
              fill
              priority={index === 0}
              sizes="(max-width: 1024px) 100vw, 50vw"
              className={cn(
                "object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                zoomed && !reduce && "scale-110",
              )}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {images.length > 1 && (
        <div role="group" aria-label={`${productName} images`} className="grid grid-cols-5 gap-2">
          {images.map((image, i) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`View image ${i + 1} of ${images.length}`}
              aria-current={i === index}
              className={cn(
                "relative aspect-square overflow-hidden rounded-lg bg-surface-sunk ring-offset-2 ring-offset-paper transition",
                i === index ? "ring-2 ring-brand" : "opacity-65 hover:opacity-100",
              )}
            >
              <Image src={image.url} alt="" fill sizes="88px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
