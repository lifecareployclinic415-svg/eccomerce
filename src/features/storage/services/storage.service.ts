import "server-only";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type BucketName =
  | "product-images"
  | "category-images"
  | "brand-logos"
  | "avatars"
  | "cms-assets"
  | "invoices";

/** Mirrors the bucket constraints in migration 0007 so we can fail fast. */
const BUCKET_RULES: Record<BucketName, { maxBytes: number; mime: string[] }> = {
  "product-images":  { maxBytes: 5_242_880, mime: ["image/jpeg", "image/png", "image/webp", "image/avif"] },
  "category-images": { maxBytes: 3_145_728, mime: ["image/jpeg", "image/png", "image/webp"] },
  "brand-logos":     { maxBytes: 1_048_576, mime: ["image/png", "image/webp", "image/svg+xml"] },
  avatars:           { maxBytes: 2_097_152, mime: ["image/jpeg", "image/png", "image/webp"] },
  "cms-assets":      { maxBytes: 8_388_608, mime: ["image/jpeg", "image/png", "image/webp", "image/avif"] },
  invoices:          { maxBytes: 5_242_880, mime: ["application/pdf"] },
};

export const storageService = {
  /**
   * Issues a short-lived signed URL the BROWSER uploads to directly.
   *
   * WHY NOT PROXY THROUGH OUR SERVER: Vercel caps serverless request bodies
   * at 4.5MB. A single product photo from a modern phone can exceed that,
   * so a normal API-route upload fails in production while working fine in
   * development. Signed URLs also keep large files off our compute
   * entirely — no memory pressure, no execution-time cost.
   *
   * Authorization happens HERE, when the URL is minted. The URL itself is
   * the capability, and it is scoped to one path and expires quickly.
   */
  async createUploadUrl(params: {
    bucket: BucketName;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedBy: string;
    /** Groups files, e.g. a product id or a user id. */
    prefix?: string;
  }) {
    const rules = BUCKET_RULES[params.bucket];

    if (!rules.mime.includes(params.mimeType)) {
      throw new Error(`That file type isn't allowed here (${params.mimeType})`);
    }
    if (params.sizeBytes > rules.maxBytes) {
      throw new Error(`Files must be under ${Math.round(rules.maxBytes / 1_048_576)}MB`);
    }

    // Never trust the client's filename in a path: it can contain traversal
    // sequences, control characters, or collide with an existing object.
    const extension = extensionFor(params.mimeType);
    const path = [params.prefix, `${randomUUID()}${extension}`].filter(Boolean).join("/");

    const db = createAdminClient();

    // Record the intent BEFORE the file exists, so an abandoned upload is
    // still identifiable and sweepable.
    const { data: asset, error: assetError } = await db
      .from("media_assets")
      .insert({
        bucket: params.bucket,
        path,
        mime_type: params.mimeType,
        size_bytes: params.sizeBytes,
        uploaded_by: params.uploadedBy,
        status: "pending",
      })
      .select("id")
      .single();

    if (assetError) throw new Error(`Could not register upload: ${assetError.message}`);

    const { data, error } = await db.storage.from(params.bucket).createSignedUploadUrl(path);
    if (error) throw new Error(`Could not create upload URL: ${error.message}`);

    return {
      assetId: asset.id,
      bucket: params.bucket,
      path,
      signedUrl: data.signedUrl,
      token: data.token,
      publicUrl: this.publicUrl(params.bucket, path),
    };
  },

  publicUrl(bucket: BucketName, path: string): string {
    const db = createAdminClient();
    return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },

  /**
   * Deletes the object AND its ledger row. Order matters: remove the file
   * first, because a ledger row without a file is merely untidy, while a
   * file without a ledger row is an orphan nothing will ever clean up.
   */
  async remove(bucket: BucketName, paths: string[]) {
    if (!paths.length) return;
    const db = createAdminClient();

    const { error } = await db.storage.from(bucket).remove(paths);
    if (error) throw new Error(`Could not delete files: ${error.message}`);

    await db.from("media_assets").delete().eq("bucket", bucket).in("path", paths);
  },

  /** Marks uploads as attached so the sweeper leaves them alone. */
  async attach(assetIds: string[], entityType: string, entityId: string) {
    if (!assetIds.length) return 0;
    const db = createAdminClient();

    const { data, error } = await db.rpc("attach_media", {
      p_asset_ids: assetIds,
      p_entity_type: entityType,
      p_entity_id: entityId,
    });

    if (error) throw new Error(`Could not attach media: ${error.message}`);
    return data as number;
  },
};

function extensionFor(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "application/pdf": ".pdf",
  };
  return map[mime] ?? "";
}
