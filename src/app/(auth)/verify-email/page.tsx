import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Verify your email" };

export default function VerifyEmailPage() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-surface/70 p-8 text-center">
      <MailCheck className="mx-auto size-8 text-brand" />
      <h1 className="mt-4 text-xl font-semibold">Confirm your email</h1>
      <p className="mt-2 text-sm text-ink-soft">
        We&apos;ve sent you a link. Click it to finish setting up your account.
      </p>
      <Button asChild variant="ghost" className="mt-6"><Link href="/login">Back to sign in</Link></Button>
    </div>
  );
}
