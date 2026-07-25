import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCmsPage } from "@/features/cms/services/cms.service";
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
        className="prose-content mt-8 space-y-4 text-ink [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:leading-relaxed [&_ul]:list-inside [&_ul]:list-disc [&_ol]:list-inside [&_ol]:list-decimal [&_a]:text-brand [&_a]:underline hover:[&_a]:text-brand-hover [&_code]:bg-surface-sunk [&_code]:px-2 [&_code]:py-1 [&_code]:rounded [&_pre]:bg-surface-sunk [&_pre]:p-4 [&_pre]:rounded [&_pre]:overflow-auto"
        dangerouslySetInnerHTML={{ __html: page.content ?? "" }}
      />
      <p className="mt-12 text-xs text-ink-soft">
        Last updated {new Date(page.updated_at).toLocaleDateString("en-IN")}
      </p>
    </article>
  );
}
