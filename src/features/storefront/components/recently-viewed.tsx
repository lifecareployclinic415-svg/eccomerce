// src/features/storefront/components/recently-viewed.tsx

"use client";

import { useEffect } from "react";
import { recordRecentlyViewed } from "@/features/storefront/actions/recently-viewed.actions";

/**
 * Fire-and-forget. Renders nothing, never blocks paint, and a failure here
 * must never break the product page — hence the swallowed rejection.
 */
export function RecordRecentlyViewed({ productId }: { productId: string }) {
  useEffect(() => {
    void recordRecentlyViewed(productId).catch(() => {});
  }, [productId]);

  return null;
}
