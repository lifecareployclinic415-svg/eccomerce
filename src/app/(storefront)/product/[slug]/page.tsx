import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { storefrontService } from "@/features/storefront/services/storefront.service";
import {
  getSeoOverride,
  applyOverride,
  truncate,
  SITE_URL,
} from "@/features/seo/services/seo.service";
import { JsonLd, productSchema, breadcrumbSchema } from "@/features/seo/lib/json-ld";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await storefrontService.getBySlug(slug);

  // A 404 must still return sensible metadata, not throw during head
  // generation — otherwise the page errors instead of 404ing cleanly.
  if (!product) return { title: "Product not found", robots: { index: false, follow: false } };

  const override = await getSeoOverride("product", product.id);
  const canonical = `${SITE_URL}/product/${product.slug}`;
  const image = product.images[0]?.url;
  const description = truncate(product.description) ?? `Buy ${product.name} online.`;

  const base: Metadata = {
    title: product.name,
    description,
    alternates: { canonical },
    // An unpublished product reachable by direct link must not be indexed.
    robots: product.isPublished ? undefined : { index: false, follow: false },
    openGraph: {
      type: "website", // "product" is not a valid OG type in Next's typing
      title: product.name,
      description,
      url: canonical,
      images: image ? [{ url: image, width: 1200, height: 630, alt: product.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: image ? [image] : undefined,
    },
  };

  return applyOverride(base, override);
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await storefrontService.getBySlug(slug);
  if (!product) notFound();

  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Shop", href: "/shop" },
    ...(product.category
      ? [{ name: product.category.name, href: `/shop?category=${product.category.slug}` }]
      : []),
    { name: product.name, href: `/product/${product.slug}` },
  ];

  return (
    <>
      {/* Both schemas in one @graph node keeps the payload compact and
          lets them cross-reference by @id. */}
      <JsonLd
        data={[
          productSchema({
            name: product.name,
            slug: product.slug,
            description: product.description,
            images: product.images.map((i) => i.url),
            sku: product.variants[0]?.sku,
            brandName: product.brand?.name,
            price: product.salePrice ?? product.basePrice,
            currency: "INR",
            inStock: product.variants.some((v) => v.available > 0),
            ratingAvg: product.ratingAvg,
            ratingCount: product.ratingCount,
          }),
          breadcrumbSchema(crumbs),
        ]}
      />

      {/* …the Phase 7 product page markup… */}
    </>
  );
}

