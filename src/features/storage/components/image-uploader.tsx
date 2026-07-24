"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { UploadCloud, X, Star, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { compressImage } from "@/features/storage/utils/compress-image";
import { createUploadUrlAction, attachProductImagesAction } from "@/features/storage/actions/upload.actions";
import { cn } from "@/lib/utils";

type Bucket = "product-images" | "category-images" | "brand-logos" | "cms-assets" | "avatars";

type QueuedFile = {
  id: string;
  name: string;
  previewUrl: string;
  progress: number;
  status: "compressing" | "uploading" | "done" | "error";
  error?: string;
  assetId?: string;
  publicUrl?: string;
  savedPercent?: number;
};

export function ImageUploader({
  bucket = "product-images",
  productId,
  prefix,
  maxFiles = 8,
  onUploaded,
}: {
  bucket?: Bucket;
  productId?: string;
  prefix?: string;
  maxFiles?: number;
  onUploaded?: (images: { assetId: string; url: string }[]) => void;
}) {
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueuedFile[]>([]);

  const update = (id: string, patch: Partial<QueuedFile>) =>
    setQueue((q) => q.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const uploadOne = useCallback(
    async (file: File, id: string) => {
      try {
        // 1. Compress in the browser, before anything crosses the network.
        update(id, { status: "compressing" });
        const compressed = await compressImage(file);
        const saved = Math.round(
          (1 - compressed.compressedBytes / compressed.originalBytes) * 100,
        );

        // 2. Ask our server for a signed URL. This is where authorization
        //    and the size/type rules are enforced.
        update(id, { status: "uploading", progress: 5, savedPercent: saved > 0 ? saved : undefined });

        const result = await createUploadUrlAction({
          bucket,
          fileName: compressed.file.name,
          mimeType: compressed.file.type,
          sizeBytes: compressed.file.size,
          prefix: prefix ?? productId,
        });

        if (!result.ok) throw new Error(result.error);
        const { signedUrl, assetId, publicUrl } = result.data!;

        // 3. PUT straight to storage. XMLHttpRequest rather than fetch
        //    purely because fetch still has no upload progress events.
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", signedUrl);
          xhr.setRequestHeader("Content-Type", compressed.file.type);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              update(id, { progress: Math.round((event.loaded / event.total) * 100) });
            }
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`Upload failed (${xhr.status})`));
          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.send(compressed.file);
        });

        update(id, { status: "done", progress: 100, assetId, publicUrl });
        return { assetId, url: publicUrl };
      } catch (e) {
        update(id, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
        return null;
      }
    },
    [bucket, prefix, productId],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const incoming = Array.from(files).filter((f) => f.type.startsWith("image/"));
      const room = maxFiles - queue.filter((f) => f.status !== "error").length;

      if (room <= 0) return toast.error(`You can add up to ${maxFiles} images`);
      const accepted = incoming.slice(0, room);

      const queued: QueuedFile[] = accepted.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: "compressing",
      }));

      setQueue((q) => [...q, ...queued]);

      // Sequential, not parallel: eight simultaneous uploads on a mobile
      // connection starve each other and every progress bar crawls.
      const uploaded: { assetId: string; url: string }[] = [];
      for (let i = 0; i < accepted.length; i++) {
        const result = await uploadOne(accepted[i]!, queued[i]!.id);
        if (result) uploaded.push(result);
      }

      if (!uploaded.length) return;

      if (productId) {
        const attached = await attachProductImagesAction({
          productId,
          images: uploaded.map((u) => ({ assetId: u.assetId, url: u.url })),
        });
        if (!attached.ok) toast.error(attached.error);
        else toast.success(`Added ${uploaded.length} image${uploaded.length > 1 ? "s" : ""}`);
      }

      onUploaded?.(uploaded);
    },
    [maxFiles, queue, uploadOne, productId, onUploaded],
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
        className={cn(
          "rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-brand bg-brand-tint/30" : "border-line hover:border-ink-soft",
        )}
      >
        <UploadCloud className="mx-auto size-8 text-ink-soft" />
        <p className="mt-3 text-sm font-medium">Drop images here</p>
        <p className="mt-1 text-xs text-ink-soft">
          JPG, PNG or WebP · up to {maxFiles} images · compressed automatically
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-lg border border-line px-4 py-2 text-sm transition-colors hover:bg-surface-sunk"
        >
          Choose files
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="sr-only"
          onChange={(e) => e.target.files && void handleFiles(e.target.files)}
        />
      </div>

      <AnimatePresence>
        {queue.length > 0 && (
          <motion.ul
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {queue.map((file) => (
              <motion.li
                key={file.id}
                layout
                initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-sunk"
              >
                <Image src={file.previewUrl} alt="" fill sizes="200px" className="object-cover" unoptimized />

                {file.status !== "done" && (
                  <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[1px]">
                    {file.status === "error" ? (
                      <div className="px-2 text-center">
                        <AlertCircle className="mx-auto size-5 text-white" />
                        <p className="mt-1 text-[11px] leading-tight text-white">{file.error}</p>
                      </div>
                    ) : (
                      <div className="w-full px-4 text-center">
                        <Loader2 className="mx-auto size-4 animate-spin text-white" />
                        <p className="mt-1.5 text-[11px] text-white">
                          {file.status === "compressing" ? "Compressing" : `${file.progress}%`}
                        </p>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/25">
                          <motion.div
                            className="h-full bg-white"
                            animate={{ width: `${file.progress}%` }}
                            transition={{ duration: 0.2 }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {file.status === "done" && file.savedPercent && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] text-white">
                    {file.savedPercent}% smaller
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setQueue((q) => q.filter((f) => f.id !== file.id))}
                  aria-label={`Remove ${file.name}`}
                  className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                >
                  <X className="size-3.5" />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
