// src/features/storefront/actions/recently-viewed.actions.ts

"use server";

import { cookies } from "next/headers";

const KEY = "recently_viewed";
const MAX = 12;

/**
 * Recently-viewed lives in a cookie rather than localStorage on purpose:
 * a cookie is readable by Server Components, so the "Recently viewed" rail
 * renders on the server with real product data on first paint. localStorage
 * would force a client fetch and a flash of empty state.
 *
 * It stores IDs only — no personal data — and is not httpOnly because it is
 * not a credential.
 */
export async function recordRecentlyViewed(productId: string) {
  const store = await cookies();
  const existing = parse(store.get(KEY)?.value);

  const next = [productId, ...existing.filter((id) => id !== productId)].slice(0, MAX);

  store.set(KEY, JSON.stringify(next), {
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    path: "/",
  });
}

export async function getRecentlyViewedIds(): Promise<string[]> {
  const store = await cookies();
  return parse(store.get(KEY)?.value);
}

function parse(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
