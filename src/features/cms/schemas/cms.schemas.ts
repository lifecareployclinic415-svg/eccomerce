import { z } from "zod";

/**
 * THE CONTRACT.
 *
 * Section config is stored as jsonb, which means the database cannot
 * validate its shape. These schemas are what make that safe: the admin
 * form validates against them on write, and the renderer parses against
 * them on read. A malformed section is skipped rather than crashing the
 * homepage — a CMS must never be able to take the storefront down.
 */

/* ------------------------------------------------------------- sections */

export const heroConfig = z.object({
  headline: z.string().min(1).max(120),
  subhead: z.string().max(300).optional().or(z.literal("")),
  eyebrow: z.string().max(60).optional().or(z.literal("")),
  ctaLabel: z.string().max(40).optional().or(z.literal("")),
  ctaHref: z.string().max(200).optional().or(z.literal("")),
  secondaryLabel: z.string().max(40).optional().or(z.literal("")),
  secondaryHref: z.string().max(200).optional().or(z.literal("")),
  imageUrl: z.string().optional().or(z.literal("")),
  align: z.enum(["left", "center"]).default("left"),
});

export const productRailConfig = z.object({
  heading: z.string().min(1).max(80),
  source: z.enum(["featured", "trending", "newest", "category"]).default("featured"),
  categorySlug: z.string().max(80).optional().or(z.literal("")),
  limit: z.coerce.number().int().min(2).max(12).default(8),
  href: z.string().max(200).optional().or(z.literal("")),
  linkLabel: z.string().max(40).default("See all"),
});

export const categoryStripConfig = z.object({
  heading: z.string().min(1).max(80),
  limit: z.coerce.number().int().min(2).max(8).default(4),
});

export const bannerConfig = z.object({
  position: z.string().max(60).default("home_promo"),
  fullWidth: z.coerce.boolean().default(true),
});

export const testimonialsConfig = z.object({
  heading: z.string().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(9).default(3),
});

export const richTextConfig = z.object({
  heading: z.string().max(80).optional().or(z.literal("")),
  body: z.string().min(1).max(6000),
  maxWidth: z.enum(["prose", "wide"]).default("prose"),
});

export const trustBadgesConfig = z.object({
  items: z
    .array(z.object({ title: z.string().min(1).max(80), body: z.string().max(200) }))
    .min(1)
    .max(6),
});

export const newsletterConfig = z.object({
  heading: z.string().min(1).max(80),
  body: z.string().max(240).optional().or(z.literal("")),
  buttonLabel: z.string().max(30).default("Subscribe"),
});

/**
 * Discriminated union keyed on `type`. Adding a section type means adding
 * one member here and one component to the registry — TypeScript then
 * fails the build until the registry is updated, so the two cannot drift.
 */
export const sectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hero"), config: heroConfig }),
  z.object({ type: z.literal("product_rail"), config: productRailConfig }),
  z.object({ type: z.literal("category_strip"), config: categoryStripConfig }),
  z.object({ type: z.literal("banner"), config: bannerConfig }),
  z.object({ type: z.literal("testimonials"), config: testimonialsConfig }),
  z.object({ type: z.literal("rich_text"), config: richTextConfig }),
  z.object({ type: z.literal("trust_badges"), config: trustBadgesConfig }),
  z.object({ type: z.literal("newsletter"), config: newsletterConfig }),
]);

export type SectionType = z.infer<typeof sectionSchema>["type"];
export type ParsedSection = z.infer<typeof sectionSchema> & {
  id: string;
  name: string;
  sortOrder: number;
};

/* ------------------------------------------------------------- settings */

export const brandSettings = z.object({
  name: z.string().min(1).max(60),
  tagline: z.string().max(140).nullish(),
  logoLightUrl: z.string().nullish(),
  logoDarkUrl: z.string().nullish(),
  faviconUrl: z.string().nullish(),
});

export const announcementSettings = z.object({
  enabled: z.coerce.boolean().default(false),
  message: z.string().max(160).default(""),
  href: z.string().max(200).nullish(),
  linkLabel: z.string().max(40).nullish(),
  variant: z.enum(["brand", "ink", "price"]).default("brand"),
});

export const socialSettings = z.object({
  instagram: z.string().url().nullish().or(z.literal("")),
  facebook: z.string().url().nullish().or(z.literal("")),
  x: z.string().url().nullish().or(z.literal("")),
  youtube: z.string().url().nullish().or(z.literal("")),
  linkedin: z.string().url().nullish().or(z.literal("")),
  whatsapp: z.string().nullish().or(z.literal("")),
});

export const contactSettings = z.object({
  email: z.string().email(),
  phone: z.string().nullish(),
  addressLines: z.array(z.string().max(120)).max(5).default([]),
  supportHours: z.string().max(120).nullish(),
  mapEmbedUrl: z.string().nullish(),
});

export const footerSettings = z.object({
  blurb: z.string().max(300).nullish(),
  showNewsletter: z.coerce.boolean().default(true),
  newsletterHeading: z.string().max(80).nullish(),
  copyright: z.string().max(160).nullish(),
});

export const SETTINGS_SCHEMAS = {
  brand: brandSettings,
  announcement: announcementSettings,
  social: socialSettings,
  contact: contactSettings,
  footer: footerSettings,
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

/** Cache tags. Kept here so readers and writers cannot disagree. */
export const CMS_TAGS = {
  settings: "cms:settings",
  sections: "cms:sections",
  navigation: "cms:navigation",
  testimonials: "cms:testimonials",
  pages: "cms:pages",
} as const;
