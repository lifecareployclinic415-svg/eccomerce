import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCmsPage } from "@/features/cms/services/cms.service";
import { sanitizeRichText } from "@/lib/security/sanitize";
import { SITE_URL } from "@/features/seo/services/seo.service";

/**
 * One route serves every editable page: about, privacy, terms, refund
 * policy, shipping policy. Adding a page is a CMS record, not a deploy.
 */
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCmsPage(slug);
  if (!page) return { title: "Not found", robots: { index: false } };

  return {
    title: page.title,
    alternates: { canonical: `${SITE_URL}/${slug}` },
  };
}

export default async function CmsPage({ params }: Props) {
  const { slug } = await params;
  const page = await getCmsPage(slug);
  if (!page) notFound();

  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold">{page.title}</h1>
      <div
        className="prose prose-neutral mt-8 max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(page.content ?? "") }}
      />
      <p className="mt-12 text-xs text-ink-soft">
        Last updated {new Date(page.updated_at).toLocaleDateString("en-IN")}
      </p>
    </article>
  );
}
