"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction, signInWithGoogleAction } from "@/features/auth/actions/auth.actions";
import { signUpSchema, type SignUpInput } from "@/features/auth/schemas/auth.schema";

export function SignupForm() {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } =
    useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = (values: SignUpInput) => {
    setFormError(null);
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => fd.set(k, String(v)));

    startTransition(async () => {
      const result = await signUpAction(fd);
      if (result && !result.ok) setFormError(result.error);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full max-w-md rounded-2xl border border-line bg-surface/70 p-8 shadow-xl backdrop-blur-xl"
    >
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-1 text-sm text-ink-soft">It takes about a minute.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field id="fullName" label="Full name" autoComplete="name" register={register} error={errors.fullName?.message} />
        <Field id="email" label="Email" type="email" autoComplete="email" register={register} error={errors.email?.message} />
        <Field id="password" label="Password" type="password" autoComplete="new-password" register={register} error={errors.password?.message} />
        <Field id="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" register={register} error={errors.confirmPassword?.message} />

        {formError && (
          <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</div>
        )}

        <Button type="submit" className="w-full bg-brand text-on-brand hover:bg-brand-hover" disabled={pending}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Create account
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-soft">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form action={signInWithGoogleAction}>
        <Button type="submit" variant="outline" className="w-full">Continue with Google</Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-ink underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </motion.div>
  );
}

function Field({ id, label, type = "text", autoComplete, register, error }: any) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} autoComplete={autoComplete} {...register(id)} />
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
