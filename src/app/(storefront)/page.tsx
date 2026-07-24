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
