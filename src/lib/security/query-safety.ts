/**
 * Keeps letters (including Indic scripts), digits, spaces, and a small
 * set of punctuation that genuinely appears in product names. Everything
 * structural to the filter grammar is discarded.
 */
export function safeSearchTerm(raw: string, maxLength = 80): string {
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s\-_'&+/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Column names are never user input — always checked against an allowlist. */
export function safeColumn(candidate: string, allowed: readonly string[], fallback: string): string {
  return allowed.includes(candidate) ? candidate : fallback;
}

/**
 * Drop-in replacement for the search clause in BaseRepository.list:
 *
 *   const clause = buildSearchClause(q, this.config.searchColumns);
 *   if (clause) builder = builder.or(clause);
 */
export function buildSearchClause(raw: string, columns: readonly string[]): string | null {
  const term = safeSearchTerm(raw);
  if (!term || !columns.length) return null;

  // Escape the two PostgREST LIKE wildcards so a search for "50%" means
  // the literal string, not "anything".
  const pattern = term.replace(/[%_]/g, "\\$&");
  return columns.map((column) => `${column}.ilike.%${pattern}%`).join(",");
}
