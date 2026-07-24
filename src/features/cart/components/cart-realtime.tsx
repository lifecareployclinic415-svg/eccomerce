"use client";

import { useCartRealtime } from "@/features/cart/hooks/use-cart-realtime";

/** Renders nothing; exists so a Server Component can mount the hook. */
export function CartRealtime({ cartId }: { cartId: string | null }) {
  useCartRealtime(cartId);
  return null;
}
