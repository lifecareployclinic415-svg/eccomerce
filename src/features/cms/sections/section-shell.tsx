import { Reveal } from "@/components/shared/reveal";

export function SectionShell({
  heading, href, linkLabel, children, muted = false,
}: {
  heading?: string; href?: string; linkLabel?: string;
  children: React.ReactNode; muted?: boolean;
}) {
  return (
    <section className={muted ? "border-t border-line bg-surface-sunk" : ""}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {heading && (
          <Reveal className="mb-8 flex items-end justify-between gap-4">
            <h2 className="text-3xl font-semibold md:text-4xl">{heading}</h2>
            {href && (
              <a href={href} className="shrink-0 text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                {linkLabel ?? "See all"}
              </a>
            )}
          </Reveal>
        )}
        {children}
      </div>
    </section>
  );
}
