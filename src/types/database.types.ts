/**
 * PLACEHOLDER — replace by running:
 *
 *   npm run db:types
 *
 * That regenerates this file from your live schema, which is what makes
 * every Supabase query in the app type-checked against real columns.
 * Until then `any` keeps the build passing but gives you no safety.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, { Row: any; Insert: any; Update: any; Relationships: [] }>;
    Views: Record<string, { Row: any }>;
    Functions: Record<string, { Args: any; Returns: any }>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
