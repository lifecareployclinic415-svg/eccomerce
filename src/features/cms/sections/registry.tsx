// src/features/cms/sections/registry.tsx

import type { ComponentType } from "react";
import type { ParsedSection, SectionType } from "@/features/cms/schemas/cms.schemas";

import { HeroSection } from "./hero-section";
import { ProductRailSection } from "./product-rail-section";
import { CategoryStripSection } from "./category-strip-section";
import { BannerSection } from "./banner-section";
import { TestimonialsSection } from "./testimonials-section";
import { RichTextSection } from "./rich-text-section";
import { TrustBadgesSection } from "./trust-badges-section";
import { NewsletterSection } from "./newsletter-section";

type SectionOf<T extends SectionType> = Extract<ParsedSection, { type: T }>;

type RegistryEntry<T extends SectionType> = {
  /** Server components are fine here — sections may fetch their own data. */
  component: ComponentType<{ config: SectionOf<T>["config"]; index: number }>;
  label: string;
  description: string;
  /** Sections above the fold get priority image loading. */
  eager?: boolean;
};

export const SECTION_REGISTRY: { [T in SectionType]: RegistryEntry<T> } = {
  hero: {
    component: HeroSection,
    label: "Hero",
    description: "Full-width headline, image and call to action.",
    eager: true,
  },
  product_rail: {
    component: ProductRailSection,
    label: "Product rail",
    description: "A row of products from featured, trending, newest or a category.",
  },
  category_strip: {
    component: CategoryStripSection,
    label: "Category strip",
    description: "Image tiles linking to top categories.",
  },
  banner: {
    component: BannerSection,
    label: "Promotional banner",
    description: "Scheduled promo image pulled from the banners table.",
  },
  testimonials: {
    component: TestimonialsSection,
    label: "Testimonials",
    description: "Customer quotes with optional ratings.",
  },
  rich_text: {
    component: RichTextSection,
    label: "Rich text",
    description: "Free-form copy block, e.g. an about or story section.",
  },
  trust_badges: {
    component: TrustBadgesSection,
    label: "Trust badges",
    description: "Short reassurance points — delivery, returns, payment.",
  },
  newsletter: {
    component: NewsletterSection,
    label: "Newsletter",
    description: "Email capture band.",
  },
};

/** Powers the "add section" picker in the admin. */
export const SECTION_OPTIONS = (Object.keys(SECTION_REGISTRY) as SectionType[]).map((type) => ({
  type,
  label: SECTION_REGISTRY[type].label,
  description: SECTION_REGISTRY[type].description,
}));

// =====================================================================
// src/app/(storefront)/page.tsx  — replaces the Phase 7 hard-coded version
// =====================================================================
import { Suspense } from "react";
import { getHomepageSections } from "@/features/cms/services/cms.service";
import { SECTION_REGISTRY } from "@/features/cms/sections/registry";
import { SectionSkeleton } from "@/features/cms/sections/section-skeleton";

// Revalidation is driven by cache tags from the admin, so a long window is
// safe: editing a section invalidates immediately rather than waiting.
export const revalidate = 3600;

export default async function HomePage() {
  const sections = await getHomepageSections();

  // A homepage with zero configured sections should say so to an admin
  // rather than render a blank white page.
  if (!sections.length) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-32 text-center">
        <h1 className="text-3xl font-semibold">Nothing here yet</h1>
        <p className="mt-3 text-ink-soft">
          Add sections from Admin → Homepage Sections to build this page.
        </p>
      </div>
    );
  }

  return (
    <>
      {sections.map((section, index) => {
        const entry = SECTION_REGISTRY[section.type];
        // Cast is safe: getHomepageSections parsed against the same union.
        const Component = entry.component as React.ComponentType<{
          config: unknown;
          index: number;
        }>;

        return (
          // Each section streams independently, so a slow product query in
          // one rail never blocks the hero from painting.
          <Suspense key={section.id} fallback={<SectionSkeleton />}>
            <Component config={section.config} index={index} />
          </Suspense>
        );
      })}
    </>
  );
}
