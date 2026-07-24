import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-32 text-center">
      <p className="numeric text-sm text-ink-soft">404</p>
      <h1 className="mt-3 text-3xl font-semibold">We couldn&apos;t find that</h1>
      <p className="mt-3 text-sm text-ink-soft">
        The page may have moved, or the product may no longer be available.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button asChild className="bg-brand text-on-brand hover:bg-brand-hover">
          <Link href="/shop">Browse the shop</Link>
        </Button>
        <Button asChild variant="ghost"><Link href="/">Home</Link></Button>
      </div>
    </div>
  );
}
