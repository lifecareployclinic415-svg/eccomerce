import { z } from "zod";

/**
 * Every admin list page reads its state from the URL, not React state.
 * That makes list views shareable, bookmarkable, back-button friendly, and
 * — critically — resolvable on the SERVER, so the first paint already has
 * the right page of data. No loading spinner on navigation.
 */

export const tableSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  perPage: z.coerce.number().int().min(10).max(100).catch(20),
  q: z.string().trim().max(120).catch(""),
  sort: z.string().catch("created_at"),
  order: z.enum(["asc", "desc"]).catch("desc"),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
});

export type TableSearch = z.infer<typeof tableSearchSchema>;

export type TableQuery = TableSearch & {
  /** Arbitrary column filters, e.g. { is_published: "true", brand_id: "..." } */
  filters: Record<string, string | string[]>;
};

const RESERVED = new Set(["page", "perPage", "q", "sort", "order", "from", "to"]);

/**
 * `.catch()` on every field means a malformed or hostile query string
 * degrades to a safe default instead of throwing a 500.
 */
export function parseTableSearch(
  searchParams: Record<string, string | string[] | undefined>,
): TableQuery {
  const base = tableSearchSchema.parse(searchParams);

  const filters: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (RESERVED.has(key) || value === undefined) continue;
    filters[key] = value;
  }

  return { ...base, filters };
}

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
};
