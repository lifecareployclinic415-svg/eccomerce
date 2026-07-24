import { Reveal } from "@/components/shared/reveal";
import { sanitizeRichText } from "@/lib/security/sanitize";
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
          className="prose prose-neutral max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(config.body) }}
        />
      </Reveal>
    </section>
  );
}
