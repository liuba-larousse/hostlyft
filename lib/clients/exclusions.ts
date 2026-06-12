// Clients intentionally hidden from this dashboard because they are managed in a
// separate app (e.g. larger accounts on their own tooling). Hidden clients are
// excluded from displayed lists AND from data pulls/scrapes — but their rows are
// left intact (we don't flip `active`), so anything that references them by name
// keeps working.
//
// Matched case-insensitively as a substring of `client_name`.
export const EXCLUDED_CLIENT_NAMES = ['marcus'] as const;

/** True if the given client name is one we hide from this dashboard. */
export function isHiddenClientName(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return EXCLUDED_CLIENT_NAMES.some((n) => lower.includes(n));
}

/**
 * Append the hidden-client exclusion to a `pricelabs_clients` Supabase query.
 * Call this before terminal/transform methods like `.order()`.
 */
export function excludeHiddenClients<
  Q extends { not(column: string, operator: string, value: unknown): Q },
>(query: Q): Q {
  return EXCLUDED_CLIENT_NAMES.reduce(
    (q, name) => q.not('client_name', 'ilike', `%${name}%`),
    query
  );
}

/** Read `client_name` from a joined `pricelabs_clients` relation (object or array shape). */
export function joinedClientName(rel: unknown): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return (row as { client_name?: string } | undefined)?.client_name ?? null;
}
