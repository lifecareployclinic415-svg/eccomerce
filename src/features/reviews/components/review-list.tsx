import { Star } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

/** Approved reviews only — moderation happens in the admin. */
export async function ReviewList({ productId }: { productId: string }) {
  const { data } = await createAdminClient()
    .from("reviews")
    .select("id, rating, title, body, created_at, order_id, profiles(full_name)")
    .eq("product_id", productId)
    .eq("is_approved", true)
    .order("created_at", { ascending: false })
    .limit(20);

  const reviews = data ?? [];

  if (!reviews.length) {
    return <p className="mt-6 text-sm text-ink-soft">No reviews yet. Be the first.</p>;
  }

  return (
    <ul className="mt-8 space-y-8">
      {reviews.map((review) => (
        <li key={review.id} className="border-b border-line pb-8 last:border-0">
          <div className="flex items-center gap-3">
            <div className="flex" aria-label={`${review.rating} out of 5`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={i < review.rating ? "size-4 fill-price text-price" : "size-4 text-line"} />
              ))}
            </div>
            {/* Only shown when the review is linked to a real order. */}
            {review.order_id && (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success">
                Verified purchase
              </span>
            )}
          </div>

          {review.title && <h3 className="mt-3 font-sans text-sm font-medium">{review.title}</h3>}
          {review.body && <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{review.body}</p>}

          <p className="mt-3 text-xs text-ink-soft">
            {(review.profiles as { full_name: string } | null)?.full_name ?? "Anonymous"}
            {" · "}
            {new Date(review.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long" })}
          </p>
        </li>
      ))}
    </ul>
  );
}
