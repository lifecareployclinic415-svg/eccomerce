/**
 * Client-side compression, run BEFORE the file leaves the browser.
 *
 * Why bother when Supabase can transform on the fly? Because transformation
 * happens on read, not on write. Without this you still store the original
 * 8MB phone photo forever, pay for that storage, and pay per distinct
 * origin image transformed. Compressing first cuts a typical 6MB JPEG to
 * roughly 200–400KB with no visible quality loss at web sizes, which also
 * makes uploads far faster on a mobile connection.
 *
 * Uses canvas + createImageBitmap — no dependency, works in every modern
 * browser, and runs off the network path entirely.
 */

export type CompressOptions = {
  /** Longest edge, in CSS pixels. 2000 is ample for zoomable product shots. */
  maxDimension?: number;
  /** 0–1. 0.82 is the usual sweet spot for WebP photographs. */
  quality?: number;
  /** Skip compression below this size; small files often get larger. */
  skipUnderBytes?: number;
};

export type CompressedImage = {
  file: File;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
};

const SKIP_TYPES = new Set(["image/svg+xml", "image/gif", "application/pdf"]);

export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressedImage> {
  const { maxDimension = 2000, quality = 0.82, skipUnderBytes = 120_000 } = options;

  // Vector and animated formats must pass through untouched — rasterising
  // an SVG destroys it, and canvas would flatten a GIF to one frame.
  if (SKIP_TYPES.has(file.type) || file.size < skipUnderBytes) {
    const dims = await readDimensions(file).catch(() => ({ width: 0, height: 0 }));
    return { file, ...dims, originalBytes: file.size, compressedBytes: file.size };
  }

  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  // OffscreenCanvas keeps the work off the main thread where supported,
  // so a large image does not freeze the admin UI mid-upload.
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });

  const ctx = canvas.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;

  if (!ctx) {
    bitmap.close();
    return { file, width: bitmap.width, height: bitmap.height, originalBytes: file.size, compressedBytes: file.size };
  }

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await toBlob(canvas, quality);

  // If compression made it bigger (already-optimised images sometimes do),
  // keep the original.
  if (blob.size >= file.size) {
    return { file, width, height, originalBytes: file.size, compressedBytes: file.size };
  }

  const compressed = new File([blob], replaceExtension(file.name, ".webp"), {
    type: "image/webp",
    lastModified: Date.now(),
  });

  return {
    file: compressed,
    width,
    height,
    originalBytes: file.size,
    compressedBytes: compressed.size,
  };
}

async function toBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/webp", quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas encoding failed"))),
      "image/webp",
      quality,
    );
  });
}

async function readDimensions(file: File) {
  const bitmap = await createImageBitmap(file);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

function replaceExtension(name: string, extension: string) {
  return name.replace(/\.[^.]+$/, "") + extension;
}
