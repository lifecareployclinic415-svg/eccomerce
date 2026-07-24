// src/app/robots.ts

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/features/seo/services/seo.service";

export default function robots(): MetadataRoute.Robots {
  // A staging deployment that gets indexed will outrank and cannibalise
  // production. Block everything unless this is the real site.
  const isProduction = process.env.VERCEL_ENV === "production";

  if (!isProduction) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/account",
          "/checkout",
          "/cart",
          "/order/",
          "/auth/",
          "/search", // internal search results: low-value duplicates
          "/*?sort=",
          "/*?perPage=",
          "/*?q=",
        ],
      },
      // Aggressive SEO crawlers can consume real bandwidth and origin
      // compute on a large catalogue for no commercial return.
      { userAgent: ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot"], disallow: "/" },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/product/sitemap.xml`],
    host: SITE_URL,
  };
}
