import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sectionSchema,
  SETTINGS_SCHEMAS,
  CMS_TAGS,
  type ParsedSection,
  type SettingsKey,
  type SettingsValue,
} from "@/features/cms/schemas/cms.schemas";

/**
 * CACHING DECISION.
 *
 * These reads run on EVERY page view — header, footer, homepage. Uncached,
 * that is several database round trips per request.
 *
 * We use `unstable_cache` rather than the newer `use cache` directive for
 * two concrete reasons, not out of habit:
 *
 *   1. `use cache` requires `cacheComponents: true` in next.config and does
 *      nothing without it. We are on Next 15 with the standard model.
 *   2. `unstable_cache` entries persist ACROSS deployments and serverless
 *      instances. `use cache` defaults to in-memory storage scoped to one
 *      deployment, so entries vanish when an instance is recycled. For
 *      content read on every request, that persistence is the point.
 *
 * MIGRATION PATH: on Next 16 with Cache Components enabled, replace each
 * `unstable_cache(fn, keys, { tags })` with a function carrying the
 * 'use cache' directive plus `cacheTag(...)`. Tag names are already
 * centralised in CMS_TAGS, so writers need no changes.
 *
 * NOTE: nothing in this file may read cookies() or headers(). Request-
 * specific data inside a cache scope is both wrong and, under Cache
 * Components, a build error.
 */

/* ------------------------------------------------------------- settings */

export const getSetting = <K extends SettingsKey>(key: K) =>
  unstable_cache(
    async (): Promise<SettingsValue<K>> => {
      const db = createAdminClient();
      const { data } = await db.from("site_settings").select("value").eq("key", key).maybeSingle();

      // Parsing with the schema means a missing or half-edited row still
      // yields usable defaults instead of undefined property access in a
      // layout — which would white-screen every page on the site.
      const parsed = SETTINGS_SCHEMAS[key].safeParse(data?.value ?? {});
      if (parsed.success) return parsed.data as SettingsValue<K>;

      console.error(`[cms] invalid settings for "${key}"`, parsed.error.flatten());
      return SETTINGS_SCHEMAS[key].parse(
        FALLBACKS[key] ?? {},
      ) as SettingsValue<K>;
    },
    [`cms-setting-${key}`],
    { tags: [CMS_TAGS.settings, `${CMS_TAGS.settings}:${key}`], revalidate: 3600 },
  )();

/** Minimal shapes that always parse, so the site renders even mid-migration. */
const FALLBACKS: Record<string, unknown> = {
  brand: { name: "Storefront" },
  announcement: { enabled: false, message: "" },
  social: {},
  contact: { email: "hello@example.com" },
  footer: {},
};

/* ------------------------------------------------------------- sections */

export const getHomepageSections = unstable_cache(
  async (): Promise<ParsedSection[]> => {
    const db = createAdminClient();
    const now = new Date().toISOString();

    const { data } = await db
      .from("homepage_sections")
      .select("id, type, name, config, sort_order, starts_at, ends_at")
      .eq("is_active", true)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("sort_order", { ascending: true });

    // Parse each section independently. One bad config skips ONE section;
    // it does not take down the homepage. This is the single most important
    // resilience property of a database-driven page builder.
    return (data ?? []).flatMap((row) => {
      const parsed = sectionSchema.safeParse({ type: row.type, config: row.config });

      if (!parsed.success) {
        console.error(`[cms] skipping section "${row.name}" (${row.type})`, parsed.error.flatten());
        return [];
      }

      return [{ ...parsed.data, id: row.id, name: row.name, sortOrder: row.sort_order }];
    });
  },
  ["cms-homepage-sections"],
  { tags: [CMS_TAGS.sections], revalidate: 3600 },
);

/* ----------------------------------------------------------- navigation */

export type NavItem = {
  id: string;
  label: string;
  href: string;
  groupLabel: string | null;
  opensNewTab: boolean;
  children: NavItem[];
};

export const getNavigation = unstable_cache(
  async (location: "header" | "footer" | "legal" | "mobile"): Promise<NavItem[]> => {
    const db = createAdminClient();
    const { data } = await db
      .from("navigation_items")
      .select("id, label, href, group_label, parent_id, opens_new_tab, sort_order")
      .eq("location", location)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const rows = data ?? [];
    const byParent = new Map<string | null, typeof rows>();
    for (const row of rows) {
      const key = row.parent_id;
      byParent.set(key, [...(byParent.get(key) ?? []), row]);
    }

    const build = (parentId: string | null): NavItem[] =>
      (byParent.get(parentId) ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        href: row.href,
        groupLabel: row.group_label,
        opensNewTab: row.opens_new_tab,
        children: build(row.id),
      }));

    return build(null);
  },
  ["cms-navigation"],
  { tags: [CMS_TAGS.navigation], revalidate: 3600 },
);

/* --------------------------------------------------------- testimonials */

export const getTestimonials = unstable_cache(
  async (limit = 3) => {
    const db = createAdminClient();
    const { data } = await db
      .from("testimonials")
      .select("id, author_name, author_role, avatar_url, quote, rating")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(limit);

    return data ?? [];
  },
  ["cms-testimonials"],
  { tags: [CMS_TAGS.testimonials], revalidate: 3600 },
);

/* ------------------------------------------------------------ cms pages */

export const getCmsPage = unstable_cache(
  async (slug: string) => {
    const db = createAdminClient();
    const { data } = await db
      .from("cms_pages")
      .select("slug, title, content, updated_at")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    return data;
  },
  ["cms-page"],
  { tags: [CMS_TAGS.pages], revalidate: 3600 },
);
