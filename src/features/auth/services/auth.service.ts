import "server-only";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/config/site";

/**
 * Service layer: the ONLY place that talks to Supabase Auth.
 * Server actions orchestrate; this holds the actual auth operations.
 * Keeping it isolated means auth logic is testable and swappable.
 */
export const authService = {
  async signUp(params: { email: string; password: string; fullName: string }) {
    const supabase = await createClient();
    return supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        // Consumed by the handle_new_user() trigger to populate profiles.
        data: { full_name: params.fullName },
        emailRedirectTo: `${siteUrl}/auth/confirm?next=/account`,
      },
    });
  },

  async signInWithPassword(params: { email: string; password: string }) {
    const supabase = await createClient();
    return supabase.auth.signInWithPassword(params);
  },

  async signInWithGoogle(redirectTo: string) {
    const supabase = await createClient();
    return supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  },

  async signOut() {
    const supabase = await createClient();
    return supabase.auth.signOut();
  },

  async requestPasswordReset(email: string) {
    const supabase = await createClient();
    return supabase.auth.resetPasswordForEmail(email, {
      // The recovery email must use the {{ .TokenHash }} template so this
      // route can verifyOtp() and open a short-lived recovery session.
      redirectTo: `${siteUrl}/auth/confirm?next=/reset-password`,
    });
  },

  async updatePassword(password: string) {
    const supabase = await createClient();
    return supabase.auth.updateUser({ password });
  },

  /** Verified against the Auth server — safe to trust for authorization. */
  async getUser() {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    return error ? null : data.user;
  },
};
