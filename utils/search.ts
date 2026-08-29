/** Turn what someone typed into a safe `ILIKE` pattern.
 *
 *  `%` and `_` are wildcards in LIKE, and a search box is exactly where
 *  someone types a literal one — "50%", "first_name". Unescaped, a lone
 *  "%" matches every row in the table, which is the difference between
 *  a search returning nothing and a search returning everything.
 *
 *  Backslash is PostgreSQL's default LIKE escape character, so escaping
 *  with it needs no ESCAPE clause — which PostgREST gives us no way to
 *  send anyway. The backslash itself has to be escaped first, or it
 *  would eat the character after it. */
export function likePattern(query: string): string {
  return `%${query.trim().replace(/([\\%_])/g, '\\$1')}%`;
}
