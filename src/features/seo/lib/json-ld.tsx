import { SITE_URL } from "@/features/seo/services/seo.service";

/**
 * Structured data.
 *
 * Two rules govern everything here:
 *
 *  1. NEVER describe something the page does not show. Google's structured
 *     data policies treat mismatched markup as spam, and a manual action
 *     for fake ratings costs far more than the rich result was worth.
 *     Hence aggregateRating is emitted only when real reviews exist.
 *
 *  2. Serialization must be XSS-safe. JSON-LD goes inside a <script> tag,
 *     and product names or review text are user-supplied. See safeJsonLd.
 */

type Thing = Record<string, unknown>;

export function organizationSchema(params: {
  name: string;
  logoUrl?: string | null;
  social?: (string | null | undefined)[];
  email?: string | null;
  phone?: string | null;
}): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: params.name,
    url: SITE_URL,
    ...(params.logoUrl && { logo: absolute(params.logoUrl) }),
    ...(params.social?.filter(Boolean).length && { sameAs: params.social.filter(Boolean) }),
    ...((params.email || params.phone) && {
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        ...(params.email && { email: params.email }),
        ...(params.phone && { telephone: params.phone }),
        areaServed: "IN",
        availableLanguage: ["en", "hi"],
      },
    }),
  };
}

/**
 * WebSite with SearchAction enables the sitelinks search box in Google.
 * The target must point at a real, working search URL.
 */
export function websiteSchema(name: string): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name,
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function productSchema(product: {
  name: string;
  slug: string;
  description?: string | null;
  images: string[];
  sku?: string | null;
  brandName?: string | null;
  price: number;
  currency: string;
  inStock: boolean;
  ratingAvg: number;
  ratingCount: number;
}): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.description && { description: product.description }),
    image: product.images.map(absolute),
    ...(product.sku && { sku: product.sku }),
    ...(product.brandName && { brand: { "@type": "Brand", name: product.brandName } }),

    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/product/${product.slug}`,
      priceCurrency: product.currency,
      // Schema.org requires a plain decimal string — no currency symbol,
      // no thousands separator, or the offer is rejected.
      price: product.price.toFixed(2),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      // Google warns when this is missing or in the past.
      priceValidUntil: oneYearOut(),
      seller: { "@id": `${SITE_URL}/#organization` },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "IN",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 30,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      },
    },

    // Emitted ONLY with genuine reviews. Inventing this is a policy
    // violation, not a growth hack.
    ...(product.ratingCount > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: product.ratingAvg.toFixed(1),
        reviewCount: product.ratingCount,
        bestRating: 5,
        worstRating: 1,
      },
    }),
  };
}

export function breadcrumbSchema(items: { name: string; href: string }[]): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute(item.href),
    })),
  };
}

/** For category and shop listings — helps Google understand the set. */
export function itemListSchema(products: { name: string; slug: string }[]): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/product/${product.slug}`,
      name: product.name,
    })),
  };
}

export function faqSchema(items: { question: string; answer: string }[]): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function articleSchema(post: {
  title: string;
  slug: string;
  excerpt?: string | null;
  coverImage?: string | null;
  authorName?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
}): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    url: `${SITE_URL}/blog/${post.slug}`,
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    ...(post.excerpt && { description: post.excerpt }),
    ...(post.coverImage && { image: absolute(post.coverImage) }),
    ...(post.authorName && { author: { "@type": "Person", name: post.authorName } }),
    ...(post.publishedAt && { datePublished: post.publishedAt }),
    ...(post.updatedAt && { dateModified: post.updatedAt }),
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

/* ------------------------------------------------------------ component */

/**
 * Injects JSON-LD safely.
 *
 * The `<` escape is not optional: a product named `</script><script>…`
 * would otherwise break out of the script tag and execute. Escaping it as
 * \u003c is still valid JSON, so parsers are unaffected.
 */
export function JsonLd({ data }: { data: Thing | Thing[] }) {
  const payload = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data.map(stripContext) }
    : data;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(payload) }}
    />
  );
}

function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function stripContext(thing: Thing): Thing {
  const { "@context": _drop, ...rest } = thing;
  return rest;
}

function absolute(url: string): string {
  return url.startsWith("http") ? url : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

function oneYearOut(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}
