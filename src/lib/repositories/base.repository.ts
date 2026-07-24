import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { TableQuery, Paginated } from "@/lib/data-table/table-search";

type Db = SupabaseClient<Database>;
type TableName = keyof Database["public"]["Tables"] & string;

export type RepositoryConfig = {
  /** Table this repository owns. */
  table: TableName;
  /** Columns scanned by the toolbar search box. */
  searchColumns: string[];
  /** Columns a user is permitted to sort by — an allowlist, not free text. */
  sortableColumns: string[];
  /** Optional embedded relations, e.g. "brands(name), categories(name)". */
  select?: string;
  /** Soft-delete column; when set, deletes become updates. */
  softDeleteColumn?: string;
};

/**
 * BaseRepository is the single place in the codebase that knows how to turn
 * a TableQuery into a Supabase query. Every admin module inherits pagination,
 * search, filtering, sorting and bulk operations from here — write it once,
 * fix a bug once.
 *
 * It deliberately stays "dumb": no business rules live here, only data access.
 * Business rules belong in the service layer above it.
 */
export class BaseRepository<TRow> {
  constructor(
    protected readonly db: Db,
    protected readonly config: RepositoryConfig,
  ) {}

  async list(query: TableQuery): Promise<Paginated<TRow>> {
    const { page, perPage, q, sort, order, filters, from, to } = query;

    let builder = this.db
      .from(this.config.table)
      // head:false + count:'exact' returns rows AND the total in one round trip.
      .select(this.config.select ?? "*", { count: "exact" });

    // Full-text-ish search: OR ilike across the configured columns.
    if (q && this.config.searchColumns.length) {
      const escaped = q.replace(/[%,()]/g, "");
      const clause = this.config.searchColumns
        .map((col) => `${col}.ilike.%${escaped}%`)
        .join(",");
      builder = builder.or(clause);
    }

    // Column filters. Arrays become IN clauses, "true"/"false" become booleans.
    for (const [column, raw] of Object.entries(filters)) {
      if (Array.isArray(raw)) {
        builder = builder.in(column, raw);
      } else if (raw === "true" || raw === "false") {
        builder = builder.eq(column, raw === "true");
      } else if (raw !== "") {
        builder = builder.eq(column, raw);
      }
    }

    if (from) builder = builder.gte("created_at", from);
    if (to) builder = builder.lte("created_at", to);

    // Allowlist the sort column: never interpolate user input into order().
    const sortColumn = this.config.sortableColumns.includes(sort) ? sort : "created_at";

    const start = (page - 1) * perPage;
    const { data, error, count } = await builder
      .order(sortColumn, { ascending: order === "asc" })
      .range(start, start + perPage - 1);

    if (error) throw new Error(`[${this.config.table}] list failed: ${error.message}`);

    const total = count ?? 0;
    return {
      rows: (data ?? []) as TRow[],
      total,
      page,
      perPage,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  async getById(id: string): Promise<TRow | null> {
    const { data, error } = await this.db
      .from(this.config.table)
      .select(this.config.select ?? "*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`[${this.config.table}] getById failed: ${error.message}`);
    return (data as TRow) ?? null;
  }

  async create(values: Record<string, unknown>): Promise<TRow> {
    const { data, error } = await this.db
      .from(this.config.table)
      .insert(values)
      .select()
      .single();

    if (error) throw new Error(`[${this.config.table}] create failed: ${error.message}`);
    return data as TRow;
  }

  async update(id: string, values: Record<string, unknown>): Promise<TRow> {
    const { data, error } = await this.db
      .from(this.config.table)
      .update(values)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`[${this.config.table}] update failed: ${error.message}`);
    return data as TRow;
  }

  /** Bulk edit: apply the same patch to many rows in one statement. */
  async bulkUpdate(ids: string[], values: Record<string, unknown>): Promise<number> {
    if (!ids.length) return 0;
    const { error, count } = await this.db
      .from(this.config.table)
      .update(values, { count: "exact" })
      .in("id", ids);

    if (error) throw new Error(`[${this.config.table}] bulkUpdate failed: ${error.message}`);
    return count ?? 0;
  }

  async remove(id: string): Promise<void> {
    await this.bulkRemove([id]);
  }

  async bulkRemove(ids: string[]): Promise<number> {
    if (!ids.length) return 0;

    const soft = this.config.softDeleteColumn;
    const q = soft
      ? this.db.from(this.config.table).update({ [soft]: new Date().toISOString() }, { count: "exact" })
      : this.db.from(this.config.table).delete({ count: "exact" });

    const { error, count } = await q.in("id", ids);
    if (error) throw new Error(`[${this.config.table}] bulkRemove failed: ${error.message}`);
    return count ?? 0;
  }

  /** Unpaginated fetch honouring current filters — used by CSV/Excel export. */
  async listAllForExport(query: TableQuery, cap = 10_000): Promise<TRow[]> {
    const { rows } = await this.list({ ...query, page: 1, perPage: Math.min(cap, 1000) });
    return rows;
  }
}
