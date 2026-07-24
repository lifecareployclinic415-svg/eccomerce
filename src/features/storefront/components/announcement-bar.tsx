// src/features/storefront/components/announcement-bar.tsx

import Link from "next/link";
import { getSetting } from "@/features/cms/services/cms.service";
import { cn } from "@/lib/utils";

/**
 * Server component reading cached settings — no client JavaScript, no
 * layout shift, and the copy is editable without a deploy.
 */
export async function AnnouncementBar() {
  const announcement = await getSetting("announcement");

  if (!announcement.enabled || !announcement.message) return null;

  return (
    <div
      className={cn(
        "px-4 py-2 text-center text-[13px]",
        announcement.variant === "brand" && "bg-brand text-on-brand",
        announcement.variant === "ink" && "bg-ink text-paper",
        announcement.variant === "price" && "bg-price-tint text-price",
      )}
    >
      <span>{announcement.message}</span>
      {announcement.href && announcement.linkLabel && (
        <Link href={announcement.href} className="ml-2 font-medium underline underline-offset-4">
          {announcement.linkLabel}
        </Link>
      )}
    </div>
  );
}
