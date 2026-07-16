// MapMeet — push notification dispatcher (Supabase Edge Function).
//
// Invoked by two Database Webhooks (see supabase/functions/README.md):
//   * INSERT on public.messages     → "Sender: text" to chat members
//   * INSERT on public.participants → "X joined <event>" to members
//
// Resolves the recipient set (event creator + participants, minus the
// actor), looks up their Expo push tokens, and POSTs to Expo's push
// service. Runs with the service-role key so it can read across RLS.
//
// Deploy:  supabase functions deploy notify --no-verify-jwt
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
//          automatically for Edge Functions.

// deno-lint-ignore-file no-explicit-any
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

async function rest(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

function messagePreview(record: any): string {
  switch (record.type) {
    case 'text':
      return record.text ?? '';
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎥 Video';
    case 'location':
      return '📍 Location';
    case 'audio':
      return '🎤 Voice message';
    default:
      return '';
  }
}

/** Creator + participants of an event, minus `exclude`, with push tokens. */
async function recipients(
  eventId: string,
  exclude: string | null,
): Promise<{ tokens: string[] }> {
  const [events, parts] = await Promise.all([
    rest(`events?id=eq.${eventId}&select=creator_id`),
    rest(`participants?event_id=eq.${eventId}&select=user_id`),
  ]);
  const ids = new Set<string>();
  if (events[0]?.creator_id) ids.add(events[0].creator_id);
  for (const p of parts) ids.add(p.user_id);
  if (exclude) ids.delete(exclude);
  if (ids.size === 0) return { tokens: [] };
  const profiles = await rest(
    `profiles?id=in.(${[...ids].join(',')})&select=push_token`,
  );
  const tokens = profiles
    .map((p) => p.push_token)
    .filter((t: unknown): t is string => typeof t === 'string' && t.startsWith('ExponentPushToken'));
  return { tokens };
}

async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  if (tokens.length === 0) return;
  const messages = tokens.map((to) => ({ to, title, body, data, sound: 'default' }));
  await fetch(EXPO_PUSH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const { table, type, record } = payload;
    if (type !== 'INSERT' || !record) return new Response('ignored');

    if (table === 'messages') {
      if (record.type === 'system' || !record.sender_id) return new Response('skip system');
      const [events, senders] = await Promise.all([
        rest(`events?id=eq.${record.event_id}&select=title`),
        rest(`profiles?id=eq.${record.sender_id}&select=display_name`),
      ]);
      const title = events[0]?.title ?? 'New message';
      const senderName = senders[0]?.display_name ?? 'Someone';
      const { tokens } = await recipients(record.event_id, record.sender_id);
      await sendPush(tokens, title, `${senderName}: ${messagePreview(record)}`, {
        eventId: record.event_id,
      });
      return new Response('ok');
    }

    if (table === 'participants') {
      const [events, joiners] = await Promise.all([
        rest(`events?id=eq.${record.event_id}&select=title,creator_id`),
        rest(`profiles?id=eq.${record.user_id}&select=display_name`),
      ]);
      // The creator's auto-join at create time isn't news — skip it.
      if (events[0]?.creator_id === record.user_id) return new Response('skip self-join');
      const title = events[0]?.title ?? 'Event update';
      const joinerName = joiners[0]?.display_name ?? 'Someone';
      const { tokens } = await recipients(record.event_id, record.user_id);
      await sendPush(tokens, title, `${joinerName} joined the event`, {
        eventId: record.event_id,
      });
      return new Response('ok');
    }

    return new Response('ignored');
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
