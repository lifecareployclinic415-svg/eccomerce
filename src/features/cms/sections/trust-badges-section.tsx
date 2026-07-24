import { Reveal } from "@/components/shared/reveal";
import type { z } from "zod";
import type { trustBadgesConfig } from "@/features/cms/schemas/cms.schemas";

export function TrustBadgesSection({
  config,
}: { config: z.infer<typeof trustBadgesConfig>; index: number }) {
  return (
    <section className="border-t border-line bg-surface-sunk">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
        {config.items.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.06}>
            <h3 className="font-sans text-sm font-semibold tracking-tight">{item.title}</h3>
            <p className="mt-1.5 text-sm text-ink-soft">{item.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
