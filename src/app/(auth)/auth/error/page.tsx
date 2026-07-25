import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Link problem", robots: { index: false } };

export default function AuthErrorPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">That link didn&apos;t work</h1>
      <p className="mt-3 text-sm text-ink-soft">
        Confirmation and reset links are single-use and expire quickly. Request a new one.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button asChild><Link href="/forgot-password">Get a new link</Link></Button>
        <Button asChild variant="ghost"><Link href="/">Home</Link></Button>
      </div>
    </div>
  );
}
