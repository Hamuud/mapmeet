// MapMeet — feedback mailer (Supabase Edge Function).
//
// Invoked by a Database Webhook on INSERT into public.feedback. Emails
// the report (message, attachment links, reporter, app/platform) to the
// maintainer so in-app bug reports land in a real inbox.
//
// Deploy:  supabase functions deploy notify-feedback --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=re_xxx
//          (optional) FEEDBACK_TO=you@example.com
//                     FEEDBACK_FROM="MapMeet <onboarding@resend.dev>"
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// Without RESEND_API_KEY the function no-ops with 200 — the feedback row
// is already stored, so nothing is lost; it just isn't emailed.

// deno-lint-ignore-file no-explicit-any
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const TO = Deno.env.get('FEEDBACK_TO') ?? 'artem.liaskovets@gmail.com';
const FROM = Deno.env.get('FEEDBACK_FROM') ?? 'MapMeet <onboarding@resend.dev>';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reporter's handle, for context in the email. Best-effort. */
async function reporter(userId: string | null): Promise<string> {
  if (!userId) return 'anonymous';
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=username,display_name`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) return userId;
  const rows = (await res.json()) as any[];
  const p = rows?.[0];
  return p ? `${p.display_name} (@${p.username})` : userId;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const row = body?.record ?? body;
    if (!row?.message) return new Response('ignored', { status: 200 });

    if (!RESEND_API_KEY) {
      // Stored but not emailed — surface it in the function logs.
      console.log('feedback stored, RESEND_API_KEY unset:', row.id);
      return new Response('stored (email disabled)', { status: 200 });
    }

    const who = await reporter(row.user_id ?? null);
    const attachments: { url: string; type: string }[] = Array.isArray(row.attachments)
      ? row.attachments
      : [];

    const links = attachments.length
      ? `<ul>${attachments
          .map(
            (a) =>
              `<li>${escapeHtml(a.type)}: <a href="${escapeHtml(a.url)}">${escapeHtml(a.url)}</a></li>`,
          )
          .join('')}</ul>`
      : '<p><em>No attachments.</em></p>';

    const html = `
      <h2>New MapMeet feedback</h2>
      <p><strong>From:</strong> ${escapeHtml(who)}</p>
      <p><strong>App:</strong> ${escapeHtml(row.app_version ?? '—')} · <strong>Platform:</strong> ${escapeHtml(row.platform ?? '—')}</p>
      <hr />
      <p style="white-space:pre-wrap">${escapeHtml(row.message)}</p>
      <hr />
      <h3>Attachments</h3>
      ${links}
      <p style="color:#888;font-size:12px">Feedback id: ${escapeHtml(row.id ?? '')}</p>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject: `MapMeet feedback from ${who}`,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('resend failed', res.status, detail);
      return new Response(`mail failed: ${res.status}`, { status: 500 });
    }
    return new Response('sent', { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response('error', { status: 500 });
  }
});
