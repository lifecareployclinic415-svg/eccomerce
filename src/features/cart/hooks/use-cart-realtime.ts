"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Multi-tab and multi-device cart sync.
 *
 * WHY Postgres Changes and not Broadcast: Supabase recommends Broadcast when
 * many clients subscribe to the same changes, because Postgres Changes
 * re-runs authorization per subscriber per event. A cart channel is scoped to
 * ONE person's open tabs — typically one or two subscribers — so the simple
 * mechanism is correct here and the extra trigger plumbing would be
 * unjustified complexity.
 *
 * If you later want a live "12 people are viewing this" counter or a shared
 * admin order board, THOSE should use Broadcast. This should not.
 *
 * The filter means the server only sends events for this cart, which keeps
 * the per-event authorization work small.
 */
export function useCartRealtime(cartId: string | null) {
  const router = useRouter();

  useEffect(() => {
    if (!cartId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`cart:${cartId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cart_items",
          filter: `cart_id=eq.${cartId}`,
        },
        () => {
          // Re-fetch the server-rendered cart rather than patching client
          // state. The server recomputes stock, tax and totals — trying to
          // mirror that math on the client is how the two drift apart.
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cartId, router]);
}
