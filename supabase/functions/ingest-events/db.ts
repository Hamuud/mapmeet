// MapMeet — thin PostgREST helpers for the ingest function.
//
// Dependency-free on purpose: same style as supabase/functions/notify,
// so Edge Functions stay a single `deploy` with no import map to drift.
// Runs with the service-role key (injected automatically), which is why
// geocode_cache / event_sources need no client-facing RLS policies.

// deno-lint-ignore-file no-explicit-any
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function restGet<T = any>(path: string): Promise<T | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

export async function restPost(
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal', ...extraHeaders }),
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function restPatch(path: string, body: unknown): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
  return res.ok;
}

/** Call a Postgres function. Throws with the server's message so the
 *  run summary can report which event failed and why. */
export async function rpc<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`rpc ${name} → ${res.status}: ${detail.slice(0, 300)}`);
  }
  const raw = await res.text();
  return (raw ? JSON.parse(raw) : null) as T;
}
