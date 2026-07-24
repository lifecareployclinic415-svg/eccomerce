// src/features/analytics/services/server-events.ts

import "server-only";
import crypto from "crypto";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID;
const GA_API_SECRET = process.env.GA_API_SECRET;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN;

export type ServerPurchase = {
  orderId: string;
  eventId: string;
  value: number;
  currency: string;
  email?: string | null;
  phone?: string | null;
  clientId?: string | null;
  items: { id: string; name: string; price: number; quantity: number }[];
  /** Whether this shopper consented to marketing. */
  marketingConsent: boolean;
};

export const serverEvents = {
  async purchase(params: ServerPurchase) {
    // Fire and forget, in parallel, never blocking the webhook response.
    // A provider outage must not cause the payment webhook to 500 and be
    // retried — that is a far worse failure than a missing analytics hit.
    await Promise.allSettled([
      sendGa4Purchase(params),
      params.marketingConsent ? sendMetaPurchase(params) : Promise.resolve(),
    ]);
  },
};

async function sendGa4Purchase(params: ServerPurchase) {
  if (!GA_MEASUREMENT_ID || !GA_API_SECRET) return;

  try {
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
      {
        method: "POST",
        body: JSON.stringify({
          // Without a real client_id GA4 cannot stitch this to the session,
          // so capture the _ga cookie at checkout and pass it through.
          client_id: params.clientId ?? `server.${params.orderId}`,
          non_personalized_ads: !params.marketingConsent,
          events: [
            {
              name: "purchase",
              params: {
                transaction_id: params.orderId,
                currency: params.currency,
                value: params.value,
                items: params.items.map((i) => ({
                  item_id: i.id,
                  item_name: i.name,
                  price: i.price,
                  quantity: i.quantity,
                })),
              },
            },
          ],
        }),
      },
    );
  } catch (e) {
    console.error("[analytics] GA4 MP failed", e);
  }
}

async function sendMetaPurchase(params: ServerPurchase) {
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) return;

  try {
    await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: META_CAPI_TOKEN,
        data: [
          {
            event_name: "Purchase",
            event_time: Math.floor(Date.now() / 1000),
            // Shared with the browser event so Meta merges rather than
            // counting the same purchase twice.
            event_id: params.eventId,
            action_source: "website",
            user_data: {
              // Meta requires SHA-256 hashing of all PII. Raw email or
              // phone in this payload is a data-protection incident.
              ...(params.email && { em: [sha256(params.email)] }),
              ...(params.phone && { ph: [sha256(normalizePhone(params.phone))] }),
            },
            custom_data: {
              currency: params.currency,
              value: params.value,
              content_ids: params.items.map((i) => i.id),
              content_type: "product",
            },
          },
        ],
      }),
    });
  } catch (e) {
    console.error("[analytics] Meta CAPI failed", e);
  }
}

/** Meta requires lowercase, trimmed input before hashing. */
function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/** Digits only, with country code, per Meta's normalisation rules. */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}
