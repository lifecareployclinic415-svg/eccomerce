import { Reveal } from "@/components/shared/reveal";
import { NewsletterForm } from "@/features/marketing/components/newsletter-form";
import type { z } from "zod";
import type { newsletterConfig } from "@/features/cms/schemas/cms.schemas";

export function NewsletterSection({
  config,
}: { config: z.infer<typeof newsletterConfig>; index: number }) {
  return (
    <section className="border-t border-line bg-surface-sunk">
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <Reveal>
          <h2 className="text-3xl font-semibold md:text-4xl">{config.heading}</h2>
          {config.body && <p className="mt-3 text-ink-soft">{config.body}</p>}
          <NewsletterForm className="mx-auto mt-6 max-w-md" buttonLabel={config.buttonLabel} />
        </Reveal>
      </div>
    </section>
  );
}
