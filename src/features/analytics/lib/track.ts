"use client";

type Item = {
  id: string;
  name: string;
  price: number;       // major units, e.g. rupees
  quantity?: number;
  category?: string | null;
  brand?: string | null;
  variant?: string | null;
};

/**
 * One typed layer over dataLayer. Nothing in the app calls window.dataLayer
 * directly, so event names and payload shapes are defined once — which is
 * the difference between analytics you can trust and a pile of ad-hoc
 * pushes that quietly disagree with each other.
 *
 * Names follow GA4's recommended ecommerce events, so GA4 builds its
 * standard reports without custom configuration.
 */
function push(event: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  // Clearing ecommerce first prevents GA4 merging the previous event's
  // items into this one — a classic source of phantom revenue.
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({ event, ...payload });
}

const toGa4Items = (items: Item[]) =>
  items.map((item, index) => ({
    item_id: item.id,
    item_name: item.name,
    price: item.price,
    quantity: item.quantity ?? 1,
    item_category: item.category ?? undefined,
    item_brand: item.brand ?? undefined,
    item_variant: item.variant ?? undefined,
    index,
  }));

export const track = {
  viewItem(item: Item) {
    push("view_item", {
      ecommerce: { currency: "INR", value: item.price, items: toGa4Items([item]) },
    });
    window.fbq?.("track", "ViewContent", {
      content_ids: [item.id],
      content_type: "product",
      value: item.price,
      currency: "INR",
    });
  },

  viewItemList(items: Item[], listName: string) {
    push("view_item_list", {
      ecommerce: { item_list_name: listName, items: toGa4Items(items) },
    });
  },

  addToCart(item: Item) {
    const value = item.price * (item.quantity ?? 1);
    push("add_to_cart", { ecommerce: { currency: "INR", value, items: toGa4Items([item]) } });
    window.fbq?.("track", "AddToCart", {
      content_ids: [item.id],
      content_type: "product",
      value,
      currency: "INR",
    });
  },

  removeFromCart(item: Item) {
    push("remove_from_cart", {
      ecommerce: { currency: "INR", value: item.price * (item.quantity ?? 1), items: toGa4Items([item]) },
    });
  },

  beginCheckout(items: Item[], value: number) {
    push("begin_checkout", { ecommerce: { currency: "INR", value, items: toGa4Items(items) } });
    window.fbq?.("track", "InitiateCheckout", { value, currency: "INR" });
  },

  /**
   * Fired client-side for immediacy, but the SERVER also reports this.
   * See the note on deduplication in server-events.ts — both are sent on
   * purpose, and neither double-counts.
   */
  purchase(params: { orderId: string; value: number; tax: number; shipping: number; coupon?: string | null; items: Item[]; eventId: string }) {
    push("purchase", {
      ecommerce: {
        transaction_id: params.orderId,
        currency: "INR",
        value: params.value,
        tax: params.tax,
        shipping: params.shipping,
        coupon: params.coupon ?? undefined,
        items: toGa4Items(params.items),
      },
    });

    window.fbq?.(
      "track",
      "Purchase",
      { value: params.value, currency: "INR", content_ids: params.items.map((i) => i.id), content_type: "product" },
      // Meta dedupes browser and server events sharing this id.
      { eventID: params.eventId },
    );
  },

  search(term: string) {
    push("search", { search_term: term });
  },
};

