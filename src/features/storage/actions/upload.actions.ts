"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { storageService, type BucketName } from "@/features/storage/services/storage.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, getCurrentUser } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rate-limit";
import type { ActionResult } from "@/features/auth/schemas/auth.schema";

const uploadUrlSchema = z.object({
  bucket: z.enum(["product-images", "category-images", "brand-logos", "avatars", "cms-assets"]),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  prefix: z.string().max(120).optional(),
});

/**
 * Mints a signed upload URL. This is the authorization checkpoint — once
 * the URL is issued, the browser uploads without further checks, so every
 * rule has to be enforced here and by the bucket's own constraints.
 */
export async function createUploadUrlAction(input: unknown): Promise<ActionResult<{
  assetId: string;
  path: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
}>> {
  const parsed = uploadUrlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That file isn't valid" };

  // Avatars are self-service; every other bucket is admin-only.
  const user =
    parsed.data.bucket === "avatars" ? await getCurrentUser() : await requireAdmin();

  if (!user) return { ok: false, error: "Sign in to upload" };

  // A signed URL is a write capability. Rate limit how many we hand out.
  if (!(await rateLimit(`upload:${user.id}`, { limit: 60, windowSec: 600 }))) {
    return { ok: false, error: "Too many uploads. Please wait a moment." };
  }

  // Users may only write into their own avatar folder.
  const prefix =
    parsed.data.bucket === "avatars" ? user.id : parsed.data.prefix;

  try {
    const result = await storageService.createUploadUrl({
      bucket: parsed.data.bucket as BucketName,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      uploadedBy: user.id,
      prefix,
    });
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

const attachSchema = z.object({
  productId: z.string().uuid(),
  images: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        url: z.string().url(),
        alt: z.string().max(200).optional(),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
      }),
    )
    .min(1)
    .max(12),
});

/** Links uploaded files to a product and writes the product_images rows. */
export async function attachProductImagesAction(input: unknown): Promise<ActionResult<{ count: number }>> {
  await requireAdmin();

  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid image data" };

  const db = createAdminClient();

  const { count: existing } = await db
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", parsed.data.productId);

  const startPosition = existing ?? 0;

  const { error } = await db.from("product_images").insert(
    parsed.data.images.map((image, i) => ({
      product_id: parsed.data.productId,
      url: image.url,
      alt: image.alt ?? null,
      position: startPosition + i,
      // First image on an empty product becomes the primary one.
      is_primary: startPosition === 0 && i === 0,
    })),
  );

  if (error) return { ok: false, error: "Could not save those images" };

  await storageService.attach(
    parsed.data.images.map((i) => i.assetId),
    "product",
    parsed.data.productId,
  );

  revalidatePath(`/admin/products/${parsed.data.productId}`);
  return { ok: true, data: { count: parsed.data.images.length } };
}

export async function deleteProductImageAction(imageId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(imageId).success) return { ok: false, error: "Invalid image" };

  const db = createAdminClient();
  const { data: image } = await db
    .from("product_images")
    .select("id, url, product_id, is_primary")
    .eq("id", imageId)
    .maybeSingle();

  if (!image) return { ok: false, error: "Image not found" };

  await db.from("product_images").delete().eq("id", imageId);

  // Never leave a product without a primary image.
  if (image.is_primary) {
    const { data: next } = await db
      .from("product_images")
      .select("id")
      .eq("product_id", image.product_id)
      .order("position")
      .limit(1)
      .maybeSingle();

    if (next) await db.from("product_images").update({ is_primary: true }).eq("id", next.id);
  }

  const path = pathFromPublicUrl(image.url, "product-images");
  if (path) {
    // A storage failure must not leave a dangling row, so the DB delete
    // already happened. Worst case the file is swept later.
    await storageService.remove("product-images", [path]).catch((e) =>
      console.error("[storage] orphaned file", path, e),
    );
  }

  revalidatePath(`/admin/products/${image.product_id}`);
  return { ok: true };
}

export async function reorderProductImagesAction(
  productId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  await requireAdmin();

  const db = createAdminClient();
  await Promise.all(
    orderedIds.map((id, index) =>
      db.from("product_images").update({ position: index }).eq("id", id).eq("product_id", productId),
    ),
  );

  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

/** ".../object/public/product-images/<path>" → "<path>" */
function pathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : "Upload failed";
}
