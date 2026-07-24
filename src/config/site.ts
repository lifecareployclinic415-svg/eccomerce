/** Single source of truth for absolute URLs. Trailing slash stripped so
 *  callers can always concatenate `${siteUrl}/path` safely. */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const siteConfig = {
  name: "Storefront",
  description: "A modern commerce experience.",
  locale: "en_IN",
  currency: "INR",
  country: "IN",
} as const;
