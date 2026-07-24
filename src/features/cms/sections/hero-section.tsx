import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/shared/reveal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { z } from "zod";
import type { heroConfig } from "@/features/cms/schemas/cms.schemas";

export function HeroSection({ config }: { config: z.infer<typeof heroConfig>; index: number }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className={cn(
        "mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:items-center md:py-24 lg:px-8",
        config.imageUrl ? "md:grid-cols-2" : "text-center",
      )}>
        <div className={cn("max-w-xl", !config.imageUrl && "mx-auto")}>
          {config.eyebrow && (
            <Reveal>
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink-soft">{config.eyebrow}</p>
            </Reveal>
          )}
          <Reveal delay={0.06}>
            <h1 className="mt-4 text-5xl font-semibold md:text-6xl">{config.headline}</h1>
          </Reveal>
          {config.subhead && (
            <Reveal delay={0.12}>
              <p className="mt-5 text-lg leading-relaxed text-ink-soft">{config.subhead}</p>
            </Reveal>
          )}
          {(config.ctaLabel || config.secondaryLabel) && (
            <Reveal delay={0.18}>
              <div className={cn("mt-8 flex flex-wrap gap-3", !config.imageUrl && "justify-center")}>
                {config.ctaLabel && config.ctaHref && (
                  <Button asChild size="lg" className="bg-brand text-on-brand hover:bg-brand-hover">
                    <Link href={config.ctaHref}>{config.ctaLabel}</Link>
                  </Button>
                )}
                {config.secondaryLabel && config.secondaryHref && (
                  <Button asChild size="lg" variant="ghost">
                    <Link href={config.secondaryHref}>
                      {config.secondaryLabel} <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </Reveal>
          )}
        </div>

        {config.imageUrl && (
          <Reveal delay={0.1}>
            <div className="relative aspect-4/5 overflow-hidden rounded-2xl bg-surface-sunk md:aspect-square">
              {/* priority: this is the LCP element on the busiest page. */}
              <Image src={config.imageUrl} alt="" fill priority sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
