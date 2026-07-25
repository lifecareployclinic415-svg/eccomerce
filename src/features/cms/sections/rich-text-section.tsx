import { Reveal } from "@/components/shared/reveal";
import { cn } from "@/lib/utils";
import type { z } from "zod";
import type { richTextConfig } from "@/features/cms/schemas/cms.schemas";

export function RichTextSection({
  config,
}: { config: z.infer<typeof richTextConfig>; index: number }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <Reveal className={cn("mx-auto", config.maxWidth === "prose" ? "max-w-2xl" : "max-w-4xl")}>
        {config.heading && <h2 className="mb-6 text-3xl font-semibold md:text-4xl">{config.heading}</h2>}
        {/* Admin-authored HTML: sanitised because a compromised admin
            account should not become stored XSS on every visitor. */}
        <div
          className="prose-content space-y-4 text-ink [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:leading-relaxed [&_ul]:list-inside [&_ul]:list-disc [&_ol]:list-inside [&_ol]:list-decimal [&_a]:text-brand [&_a]:underline hover:[&_a]:text-brand-hover [&_code]:bg-surface-sunk [&_code]:px-2 [&_code]:py-1 [&_code]:rounded [&_pre]:bg-surface-sunk [&_pre]:p-4 [&_pre]:rounded [&_pre]:overflow-auto"
          dangerouslySetInnerHTML={{ __html: config.body }}
        />
      </Reveal>
    </section>
  );
}
