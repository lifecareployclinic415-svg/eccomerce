"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/features/auth/actions/auth.actions";

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always shows the same success state, whether or not the address
  // exists — otherwise this page becomes an account-enumeration oracle.
  if (sent) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface/70 p-8 text-center">
        <MailCheck className="mx-auto size-8 text-brand" />
        <h1 className="mt-4 text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-ink-soft">
          If an account exists for that address, we&apos;ve sent a link to reset your password.
        </p>
        <Button asChild variant="ghost" className="mt-6"><Link href="/login">Back to sign in</Link></Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-surface/70 p-8 shadow-xl backdrop-blur-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-ink-soft">We&apos;ll email you a link.</p>

      <form
        className="mt-6 space-y-4"
        action={(formData) =>
          startTransition(async () => {
            const result = await forgotPasswordAction(formData);
            result.ok ? setSent(true) : setError(result.error);
          })
        }
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>

        {error && <p className="text-sm text-danger" role="alert">{error}</p>}

        <Button type="submit" className="w-full bg-brand text-on-brand hover:bg-brand-hover" disabled={pending}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Send reset link
        </Button>
      </form>
    </div>
  );
}
