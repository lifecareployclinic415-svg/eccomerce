"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { authService } from "@/features/auth/services/auth.service";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  signUpSchema,
  signInSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type ActionResult,
} from "@/features/auth/schemas/auth.schema";

/** Same-origin check: mitigates cross-site POSTs to server actions. */
async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("host");
  if (origin && host && new URL(origin).host !== host) {
    throw new Error("Cross-origin request rejected");
  }
}

async function clientKey(prefix: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `${prefix}:${ip}`;
}

export async function signUpAction(formData: FormData): Promise<ActionResult> {
  await assertSameOrigin();

  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  if (!(await rateLimit(await clientKey("signup"), { limit: 5, windowSec: 3600 }))) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const { error } = await authService.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    fullName: parsed.data.fullName,
  });

  // Generic message: never reveal whether an email is already registered.
  if (error) return { ok: false, error: "Could not create account. Please try again." };

  redirect("/verify-email");
}

export async function signInAction(formData: FormData): Promise<ActionResult> {
  await assertSameOrigin();

  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  if (!(await rateLimit(await clientKey("signin"), { limit: 10, windowSec: 900 }))) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const { error } = await authService.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  // Deliberately vague: prevents username enumeration.
  if (error) return { ok: false, error: "Invalid email or password." };

  revalidatePath("/", "layout");
  redirect(safeRedirect(parsed.data.redirectTo));
}

export async function signInWithGoogleAction(formData: FormData) {
  await assertSameOrigin();
  const next = safeRedirect(formData.get("redirectTo")?.toString());

  const { data, error } = await authService.signInWithGoogle(next);
  if (error || !data.url) redirect("/login?error=oauth");

  redirect(data.url);
}

export async function signOutAction() {
  await assertSameOrigin();
  await authService.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function forgotPasswordAction(formData: FormData): Promise<ActionResult> {
  await assertSameOrigin();

  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address" };
  }

  if (!(await rateLimit(await clientKey("forgot"), { limit: 5, windowSec: 3600 }))) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  await authService.requestPasswordReset(parsed.data.email);

  // Always report success, even if the address is unknown — otherwise this
  // endpoint becomes an account-enumeration oracle.
  return { ok: true };
}

export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  await assertSameOrigin();

  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // updateUser only succeeds if the recovery session from verifyOtp is active.
  const { error } = await authService.updatePassword(parsed.data.password);
  if (error) return { ok: false, error: "Reset link expired. Please request a new one." };

  redirect("/login?reset=success");
}

/** Only allow relative in-app paths — blocks open-redirect attacks. */
function safeRedirect(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/account";
  return value;
}
