import "server-only";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/features/cms/services/cms.service";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!.replace(/\/$/, "");

export type SeoEntity = "product" | "category" | "cms_page" | "blog";

type SeoOverride = {
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
  keywords: string[];
};

/**
 * Per-entity overrides from the `seo` table, cached. An admin can override
 * any product or page's metadata without a deploy; when they haven't, the
 * caller's generated defaults are used instead.
 */
export const getSeoOverride = unstable_cache(
  async (entityType: SeoEntity, entityId: string): Promise<SeoOverride | null> => {
    const db = createAdminClient();
    const { data } = await db
      .from("seo")
      .select("meta_title, meta_description, og_image, canonical_url, keywords")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();

    if (!data) return null;

    return {
      metaTitle: data.meta_title,
      metaDescription: data.meta_description,
      ogImage: data.og_image,
      canonicalUrl: data.canonical_url,
      keywords: data.keywords ?? [],
    };
  },
  ["seo-override"],
  { tags: ["seo"], revalidate: 3600 },
);

/**
 * FACETED NAVIGATION POLICY — the decision that matters most for an
 * eCommerce site's crawl health.
 *
 * A shop page can combine category × brand × price × sort × page, which is
 * a combinatorial explosion of URLs serving near-identical content. Left
 * alone, Google spends its crawl budget on `?sort=price_desc&page=7`
 * instead of your actual products.
 *
 * The rule implemented here: ONE indexable facet dimension (category),
 * everything else noindexed but still followed so link equity flows to the
 * products themselves.
 */
const INDEXABLE_FACETS = new Set(["category"]);
const IGNORED_FOR_CANONICAL = new Set(["sort", "order", "perPage", "utm_source", "utm_medium", "utm_campaign", "ref", "fbclid", "gclid"]);

export function resolveListingSeo(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>,
): { canonical: string; robots: Metadata["robots"] } {
  const entries = Object.entries(searchParams).filter(
    ([key, value]) => value !== undefined && value !== "" && !IGNORED_FOR_CANONICAL.has(key),
  );

  const facets = entries.filter(([key]) => key !== "page" && key !== "q");
  const page = Number(searchParams.page ?? 1);
  const isSearch = Boolean(searchParams.q);

  // Internal search results are never indexable — Google's own guidelines
  // treat them as low-value duplicate content.
  if (isSearch) {
    return {
      canonical: `${SITE_URL}${pathname}`,
      robots: { index: false, follow: true },
    };
  }

  const indexableFacets = facets.filter(([key]) => INDEXABLE_FACETS.has(key));
  const hasNonIndexableFacet = facets.length > indexableFacets.length;
  const hasMultipleFacets = indexableFacets.length > 1;

  // Build the canonical from the indexable facets only, so
  // ?category=lamps&sort=price and ?category=lamps consolidate into one URL.
  const canonicalParams = new URLSearchParams();
  for (const [key, value] of indexableFacets) {
    canonicalParams.set(key, Array.isArray(value) ? value[0]! : value!);
  }

  // PAGINATION: page 2+ gets a SELF-referencing canonical, not a canonical
  // back to page 1. Pointing deep pages at page 1 is a common mistake that
  // hides everything past the first page from the index entirely.
  if (page > 1) canonicalParams.set("page", String(page));

  const query = canonicalParams.toString();
  const canonical = `${SITE_URL}${pathname}${query ? `?${query}` : ""}`;

  return {
    canonical,
    robots:
      hasNonIndexableFacet || hasMultipleFacets
        ? { index: false, follow: true }
        : { index: true, follow: true },
  };
}

/**
 * Shared base for every page's metadata. `metadataBase` must be set once
 * so relative OG image paths resolve to absolute URLs — without it,
 * crawlers and social scrapers silently drop the image.
 */
export async function buildBaseMetadata(): Promise<Metadata> {
  const brand = await getSetting("brand");

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${brand.name}${brand.tagline ? ` — ${brand.tagline}` : ""}`,
      template: `%s · ${brand.name}`,
    },
    description: brand.tagline ?? undefined,
    applicationName: brand.name,
    openGraph: {
      type: "website",
      siteName: brand.name,
      locale: "en_IN",
    },
    twitter: { card: "summary_large_image" },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        // Allows full-size image previews and long text snippets in results.
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

/** Merges generated defaults with any admin override. Overrides win. */
export function applyOverride(base: Metadata, override: SeoOverride | null): Metadata {
  if (!override) return base;

  return {
    ...base,
    title: override.metaTitle ?? base.title,
    description: override.metaDescription ?? base.description,
    keywords: override.keywords.length ? override.keywords : base.keywords,
    alternates: {
      ...base.alternates,
      canonical: override.canonicalUrl ?? base.alternates?.canonical,
    },
    openGraph: {
      ...base.openGraph,
      title: override.metaTitle ?? base.openGraph?.title,
      description: override.metaDescription ?? base.openGraph?.description,
      images: override.ogImage ? [{ url: override.ogImage }] : base.openGraph?.images,
    },
  };
}

/** Descriptions are truncated on a word boundary, never mid-word. */
export function truncate(text: string | null | undefined, max = 155): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, clean.lastIndexOf(" ", max - 1)).trimEnd() + "…";
}
