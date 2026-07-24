// src/app/(storefront)/product/[slug]/opengraph-image.tsx

import { ImageResponse } from "next/og";
import { storefrontService } from "@/features/storefront/services/storefront.service";

export const alt = "Product";
export const size = { width: 1200, height: 630 }; // the standard OG canvas
export const contentType = "image/png";

export default async function Image({ params }: { params: { slug: string } }) {
  const product = await storefrontService.getBySlug(params.slug);

  const inr = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  return new ImageResponse(
    (
      // ImageResponse uses Satori, which supports only a flexbox subset of
      // CSS — no grid, no external stylesheets, inline styles only.
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#FAFAF9",
          fontFamily: "sans-serif",
        }}
      >
        {product?.images[0]?.url && (
          <img
            src={product.images[0].url}
            alt=""
            style={{ width: 520, height: 630, objectFit: "cover" }}
          />
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 64,
            flex: 1,
          }}
        >
          {product?.brand?.name && (
            <div style={{ fontSize: 22, color: "#73726C", letterSpacing: 2, marginBottom: 16 }}>
              {product.brand.name.toUpperCase()}
            </div>
          )}

          <div style={{ fontSize: 56, color: "#1F2328", lineHeight: 1.1, fontWeight: 600 }}>
            {product?.name ?? "Storefront"}
          </div>

          {product && (
            <div style={{ fontSize: 40, color: "#8A6420", marginTop: 28, fontWeight: 600 }}>
              {inr.format(product.salePrice ?? product.basePrice)}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
