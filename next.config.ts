import type { NextConfig } from "next";

const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // remotePatterns is an allowlist. Without it, next/image refuses the
    // URL; with a wildcard, you become an open image-resizing proxy for
    // anyone who can craft a URL.
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/render/image/public/**" },
    ],
    // Serve modern formats when the browser accepts them.
    formats: ["image/avif", "image/webp"],
    // Match these to the `sizes` values actually used in the app; every
    // extra breakpoint is another cached variant to generate and store.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [88, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
