"use client";

import { useState, useTransition } from "react";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeNewsletterAction } from "@/features/marketing/actions/newsletter.actions";
import { cn } from "@/lib/utils";

export function NewsletterForm({
  className, buttonLabel = "Subscribe",
}: { className?: string; buttonLabel?: string }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className={cn("flex items-center gap-2 text-sm text-success", className)}>
        <Check className="size-4" /> You&apos;re on the list.
      </p>
    );
  }

  return (
    <form
      className={cn("flex gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await subscribeNewsletterAction(email);
          if (result.ok) setDone(true);
          else toast.error(result.error);
        });
      }}
    >
      <label htmlFor="newsletter-email" className="sr-only">Email address</label>
      <Input
        id="newsletter-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <Button type="submit" disabled={pending} className="bg-brand text-on-brand hover:bg-brand-hover">
        {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
        {buttonLabel}
      </Button>
    </form>
  );
}
