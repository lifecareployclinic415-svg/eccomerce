"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/features/auth/actions/auth.actions";

/**
 * Reachable only with the short-lived recovery session opened by
 * /auth/confirm. Without it, updateUser() fails and the action says so.
 */
export function ResetPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-surface/70 p-8 shadow-xl backdrop-blur-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>

      <form
        className="mt-6 space-y-4"
        action={(formData) =>
          startTransition(async () => {
            const result = await resetPasswordAction(formData);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" required autoComplete="new-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" />
        </div>

        {error && <p className="text-sm text-danger" role="alert">{error}</p>}

        <Button type="submit" className="w-full bg-brand text-on-brand hover:bg-brand-hover" disabled={pending}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Update password
        </Button>
      </form>
    </div>
  );
}
