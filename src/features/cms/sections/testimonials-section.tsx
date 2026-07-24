import Image from "next/image";
import { Star } from "lucide-react";
import { StaggerGrid } from "@/components/shared/reveal";
import { getTestimonials } from "@/features/cms/services/cms.service";
import { SectionShell } from "./section-shell";
import type { z } from "zod";
import type { testimonialsConfig } from "@/features/cms/schemas/cms.schemas";

export async function TestimonialsSection({
  config,
}: { config: z.infer<typeof testimonialsConfig>; index: number }) {
  const testimonials = await getTestimonials(config.limit);
  if (!testimonials.length) return null;

  return (
    <SectionShell heading={config.heading}>
      <StaggerGrid className="grid gap-6 md:grid-cols-3">
        {testimonials.map((t) => (
          <figure key={t.id} className="rounded-2xl border border-line bg-surface p-6">
            {t.rating && (
              <div className="mb-3 flex" aria-label={`${t.rating} out of 5`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={i < t.rating! ? "size-4 fill-price text-price" : "size-4 text-line"} />
                ))}
              </div>
            )}
            <blockquote className="text-sm leading-relaxed text-ink">{t.quote}</blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              {t.avatar_url && (
                <Image src={t.avatar_url} alt="" width={36} height={36} className="rounded-full object-cover" />
              )}
              <div>
                <p className="text-sm font-medium">{t.author_name}</p>
                {t.author_role && <p className="text-xs text-ink-soft">{t.author_role}</p>}
              </div>
            </figcaption>
          </figure>
        ))}
      </StaggerGrid>
    </SectionShell>
  );
}
