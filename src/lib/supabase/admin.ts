import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * BYPASSES ROW LEVEL SECURITY. Use only in trusted server code, and always
 * pair it with an explicit ownership check — the database guardrail is off.
 *
 * `server-only` makes the build fail if this is ever pulled into a Client
 * Component, which is what keeps the secret key out of the browser bundle.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
