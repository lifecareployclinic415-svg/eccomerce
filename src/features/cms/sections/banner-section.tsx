import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import type { z } from "zod";
import type { bannerConfig } from "@/features/cms/schemas/cms.schemas";

export async function BannerSection({
  config,
}: { config: z.infer<typeof bannerConfig>; index: number }) {
  const now = new Date().toISOString();
  const { data } = await createAdminClient()
    .from("banners")
    .select("id, title, image_url, link")
    .eq("position", config.position)
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("sort_order")
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const image = (
    <div className={cn("relative overflow-hidden", config.fullWidth ? "aspect-[3/1]" : "aspect-[4/1] rounded-2xl")}>
      <Image src={data.image_url} alt={data.title ?? ""} fill sizes="100vw" className="object-cover" />
    </div>
  );

  return (
    <section className={config.fullWidth ? "" : "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"}>
      {data.link ? <Link href={data.link}>{image}</Link> : image}
    </section>
  );
}
