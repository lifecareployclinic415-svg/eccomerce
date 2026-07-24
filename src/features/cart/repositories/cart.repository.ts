import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/guards";

const GUEST_COOKIE = "cart_session";

export type CartLine = {
  itemId: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantLabel: string;
  imageUrl: string | null;
  unitPrice: number;    // minor units
  quantity: number;
  available: number;
  taxRate: number;
};

/**
 * Cart identity has two modes.
 *
 * Signed in  → cart.user_id, protected by RLS. The normal path.
 * Guest      → cart.session_id, an unguessable UUID in an httpOnly cookie.
 *
 * Guest carts cannot be protected by RLS because auth.uid() is null, so the
 * cookie itself IS the capability: httpOnly (JavaScript cannot read or forge
 * it), sameSite lax, and 122 bits of entropy so it cannot be guessed. Guest
 * reads/writes therefore go through the admin client inside server actions,
 * never from the browser.
 */
export const cartRepository = {
  async resolveCartId(create = true): Promise<string | null> {
    const user = await getCurrentUser();
    const store = await cookies();

    if (user) {
      const supabase = await createClient();
      const { data } = await supabase.from("cart").select("id").eq("user_id", user.id).maybeSingle();
      if (data) return data.id;
      if (!create) return null;

      const { data: created } = await supabase
        .from("cart").insert({ user_id: user.id }).select("id").single();
      return created?.id ?? null;
    }

    const admin = createAdminClient();
    let sessionId = store.get(GUEST_COOKIE)?.value;

    if (sessionId) {
      const { data } = await admin
        .from("cart").select("id").eq("session_id", sessionId).is("user_id", null).maybeSingle();
      if (data) return data.id;
    }

    if (!create) return null;

    sessionId ??= randomUUID();
    store.set(GUEST_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    const { data: created } = await admin
      .from("cart").insert({ session_id: sessionId }).select("id").single();
    return created?.id ?? null;
  },

  async getGuestSessionId(): Promise<string | null> {
    return (await cookies()).get(GUEST_COOKIE)?.value ?? null;
  },

  async clearGuestCookie() {
    (await cookies()).delete(GUEST_COOKIE);
  },

  /**
   * Reads lines together with LIVE availability and tax rate. Prices come
   * from the database on every read, so a price change is reflected in an
   * open cart immediately — a cart is a wish list, not a price lock.
   */
  async getLines(cartId: string): Promise<CartLine[]> {
    const db = createAdminClient();

    const { data, error } = await db
      .from("cart_items")
      .select(`
        id, quantity, variant_id,
        product_variants!inner (
          id, sku, price, attributes,
          products!inner (
            id, name, slug,
            categories ( tax_rate ),
            product_images ( url, is_primary, position )
          )
        ),
        variant_availability:variant_id ( available )
      `)
      .eq("cart_id", cartId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`cart getLines failed: ${error.message}`);

    const defaultRate = await this.defaultTaxRate();

    return (data ?? []).map((row) => {
      const variant = row.product_variants;
      const product = variant.products;
      const images = product.product_images ?? [];
      const primary = images.find((i) => i.is_primary) ?? images[0] ?? null;

      return {
        itemId: row.id,
        variantId: row.variant_id,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        variantLabel: formatAttributes(variant.attributes),
        imageUrl: primary?.url ?? null,
        unitPrice: Math.round(Number(variant.price) * 100),
        quantity: row.quantity,
        available: row.variant_availability?.available ?? 0,
        taxRate: Number(product.categories?.tax_rate ?? defaultRate),
      };
    });
  },

  async defaultTaxRate(): Promise<number> {
    const db = createAdminClient();
    const { data } = await db.from("site_settings").select("value").eq("key", "tax").maybeSingle();
    return Number((data?.value as { default_rate?: number } | null)?.default_rate ?? 0);
  },

  async shippingRule() {
    const db = createAdminClient();
    const { data } = await db.from("site_settings").select("value").eq("key", "shipping").maybeSingle();
    const v = (data?.value ?? {}) as { flat_rate?: number; free_over?: number };
    return {
      flatRate: Math.round((v.flat_rate ?? 0) * 100),
      freeOver: Math.round((v.free_over ?? Infinity) * 100),
    };
  },

  /** Delegates to the Postgres function so the merge is one transaction. */
  async mergeGuestCart(userId: string, sessionId: string) {
    const db = createAdminClient();
    const { data, error } = await db.rpc("merge_guest_cart", {
      p_user_id: userId,
      p_session_id: sessionId,
    });
    if (error) throw new Error(`cart merge failed: ${error.message}`);
    return data as string;
  },
};

function formatAttributes(attributes: unknown): string {
  if (!attributes || typeof attributes !== "object") return "";
  return Object.values(attributes as Record<string, string>).filter(Boolean).join(" / ");
}
