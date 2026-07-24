import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/features/seo/services/seo.service";

// Regenerate hourly rather than on every crawl request.
export const revalidate = 3600;

/**
 * NOTE ON <priority> AND <changefreq>: Google ignores both. They are
 * omitted here on purpose. What actually matters is that every URL is
 * canonical, returns 200, and carries an accurate lastModified.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = createAdminClient();

  const [categories, pages, posts] = await Promise.all([
    db.from("categories").select("slug, updated_at").eq("is_active", true),
    db.from("cms_pages").select("slug, updated_at").eq("is_published", true),
    db.from("blogs").select("slug, updated_at").eq("is_published", true),
  ]);

  const staticRoutes = ["", "/shop", "/about", "/contact", "/blog", "/faq"].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
  }));

  return [
    ...staticRoutes,
    ...(categories.data ?? []).map((c) => ({
      url: `${SITE_URL}/shop?category=${c.slug}`,
      lastModified: new Date(c.updated_at),
    })),
    ...(pages.data ?? []).map((p) => ({
      url: `${SITE_URL}/${p.slug}`,
      lastModified: new Date(p.updated_at),
    })),
    ...(posts.data ?? []).map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: new Date(p.updated_at),
    })),
  ];
}

