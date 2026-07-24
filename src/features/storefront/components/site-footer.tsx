// src/features/storefront/components/site-footer.tsx

import Link from "next/link";
import Image from "next/image";
import { Instagram, Facebook, Youtube, Linkedin } from "lucide-react";

import { getSetting, getNavigation } from "@/features/cms/services/cms.service";
import { NewsletterForm } from "@/features/marketing/components/newsletter-form";

export async function SiteFooter() {
  // Parallel: four cached reads, one await. Sequential awaits here would
  // add latency to every single page on the site.
  const [brand, social, contact, footer, footerNav, legalNav] = await Promise.all([
    getSetting("brand"),
    getSetting("social"),
    getSetting("contact"),
    getSetting("footer"),
    getNavigation("footer"),
    getNavigation("legal"),
  ]);

  // Group footer links by their column label.
  const columns = footerNav.reduce<Record<string, typeof footerNav>>((acc, item) => {
    const key = item.groupLabel ?? "More";
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});

  const socialLinks = [
    { href: social.instagram, Icon: Instagram, label: "Instagram" },
    { href: social.facebook, Icon: Facebook, label: "Facebook" },
    { href: social.youtube, Icon: Youtube, label: "YouTube" },
    { href: social.linkedin, Icon: Linkedin, label: "LinkedIn" },
  ].filter((s): s is { href: string; Icon: typeof Instagram; label: string } => Boolean(s.href));

  return (
    <footer className="border-t border-line bg-surface-sunk">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_2fr]">
          <div className="max-w-sm">
            {brand.logoLightUrl ? (
              <Image
                src={brand.logoLightUrl}
                alt={brand.name}
                width={120}
                height={32}
                className="h-8 w-auto dark:hidden"
              />
            ) : (
              <span className="font-display text-xl font-semibold">{brand.name}</span>
            )}

            {footer.blurb && (
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">{footer.blurb}</p>
            )}

            {socialLinks.length > 0 && (
              <ul className="mt-6 flex gap-2">
                {socialLinks.map(({ href, Icon, label }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="grid size-9 place-items-center rounded-lg border border-line text-ink-soft transition-colors hover:text-ink"
                    >
                      <Icon className="size-4" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {Object.entries(columns).map(([groupLabel, items]) => (
              <nav key={groupLabel} aria-label={groupLabel}>
                <h2 className="font-sans text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                  {groupLabel}
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        target={item.opensNewTab ? "_blank" : undefined}
                        rel={item.opensNewTab ? "noopener noreferrer" : undefined}
                        className="text-sm text-ink-soft transition-colors hover:text-ink"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}

            {footer.showNewsletter && (
              <div>
                <h2 className="font-sans text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                  Newsletter
                </h2>
                <p className="mt-4 text-sm text-ink-soft">
                  {footer.newsletterHeading ?? "Occasional letters, no noise"}
                </p>
                <NewsletterForm className="mt-3" />
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-soft">
            {footer.copyright ?? `© ${new Date().getFullYear()} ${brand.name}. All rights reserved.`}
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {legalNav.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="text-xs text-ink-soft transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="text-xs text-ink-soft transition-colors hover:text-ink"
              >
                {contact.email}
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
