// src/lib/images/supabase-loader.ts

export default function supabaseImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  if (!src.includes("/storage/v1/object/public/")) return src;

  const rendered = src.replace("/object/public/", "/render/image/public/");
  const params = new URLSearchParams({
    width: String(width),
    quality: String(quality ?? 75),
    resize: "contain",
  });

  return `${rendered}?${params}`;
}
