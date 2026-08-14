// MapMeet — push notification dispatcher (Supabase Edge Function).
//
// Fired by Database Webhooks; see supabase/functions/README.md for the
// table this listens to and how to wire each one.
//
//   messages       INSERT  → event chat
//   group_messages INSERT  → group chat
//   dm_messages    INSERT  → direct message
//   participants   INSERT  → someone joined an event
//   group_members  INSERT  → someone joined a group
//   friendships    INSERT  → friend request
//                  UPDATE  → request accepted
//   events         UPDATE  → time or place changed
//   event_cancellations
//                  INSERT  → event cancelled (see the migration for why
//                            this is not a Delete hook on events)
//
// Every branch resolves a recipient set, drops anyone who has that
// category switched off, and renders the copy in each recipient's own
// language. Runs with the service-role key so it can read across RLS.
//
// Deploy:  supabase functions deploy notify --no-verify-jwt

// deno-lint-ignore-file no-explicit-any
import {
  recipientsFor,
  rest,
  sendPush,
  type Recipient,
} from '../_shared/push.ts';
import { preview, t } from '../_shared/strings.ts';

const ok = () => new Response('ok');
const skip = (why: string) => new Response(`skip: ${why}`);

async function displayName(id: string | null | undefined): Promise<string> {
  if (!id) return 'Someone';
  const rows = await rest(`profiles?id=eq.${id}&select=display_name`);
  return rows[0]?.display_name ?? 'Someone';
}

/** Creator + participants of an event, minus the actor. */
async function eventAudience(
  eventId: string,
  exclude: string | null,
  category: Parameters<typeof recipientsFor>[1],
): Promise<Recipient[]> {
  const [events, parts] = await Promise.all([
    rest(`events?id=eq.${eventId}&select=creator_id`),
    rest(`participants?event_id=eq.${eventId}&select=user_id`),
  ]);
  const ids = new Set<string>();
  if (events[0]?.creator_id) ids.add(events[0].creator_id);
  for (const p of parts) ids.add(p.user_id);
  if (exclude) ids.delete(exclude);
  return recipientsFor(ids, category);
}

async function groupAudience(
  groupId: string,
  exclude: string | null,
  category: Parameters<typeof recipientsFor>[1],
): Promise<Recipient[]> {
  const members = await rest(`group_members?group_id=eq.${groupId}&select=user_id`);
  const ids = new Set<string>(members.map((m) => m.user_id));
  if (exclude) ids.delete(exclude);
  return recipientsFor(ids, category);
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const { table, type, record, old_record } = payload;
    const row = record ?? old_record;
    if (!row) return skip('no record');

    // ── Chats ──────────────────────────────────────────────────────────
    if (table === 'messages' && type === 'INSERT') {
      // System messages (joins, the archive warning) are already visible
      // in the chat; pushing them too would double up.
      if (row.type === 'system' || !row.sender_id) return skip('system');
      const [events, name] = await Promise.all([
        rest(`events?id=eq.${row.event_id}&select=title`),
        displayName(row.sender_id),
      ]);
      const to = await eventAudience(row.event_id, row.sender_id, 'push_chat');
      await sendPush(
        to,
        (locale) => ({
          title: events[0]?.title ?? t(locale, 'newMessage'),
          body: `${name}: ${preview(locale, row)}`,
        }),
        { kind: 'event_chat', eventId: row.event_id },
      );
      return ok();
    }

    if (table === 'group_messages' && type === 'INSERT') {
      if (row.type === 'system' || !row.sender_id) return skip('system');
      const [groups, name] = await Promise.all([
        rest(`group_chats?id=eq.${row.group_id}&select=name,emoji`),
        displayName(row.sender_id),
      ]);
      const g = groups[0];
      const to = await groupAudience(row.group_id, row.sender_id, 'push_chat');
      await sendPush(
        to,
        (locale) => ({
          title: g ? `${g.emoji} ${g.name}` : t(locale, 'newMessage'),
          body: `${name}: ${preview(locale, row)}`,
        }),
        { kind: 'group_chat', groupId: row.group_id },
      );
      return ok();
    }

    if (table === 'dm_messages' && type === 'INSERT') {
      const [dms, name] = await Promise.all([
        rest(`dms?id=eq.${row.dm_id}&select=user_a,user_b`),
        displayName(row.sender_id),
      ]);
      const dm = dms[0];
      if (!dm) return skip('no dm');
      // A DM has exactly one other side.
      const other = dm.user_a === row.sender_id ? dm.user_b : dm.user_a;
      const to = await recipientsFor([other], 'push_chat');
      await sendPush(
        to,
        (locale) => ({ title: name, body: preview(locale, row) }),
        { kind: 'dm', username: name, dmId: row.dm_id },
      );
      return ok();
    }

    // ── Joins ──────────────────────────────────────────────────────────
    if (table === 'participants' && type === 'INSERT') {
      const [events, name] = await Promise.all([
        rest(`events?id=eq.${row.event_id}&select=title,creator_id`),
        displayName(row.user_id),
      ]);
      // The creator's auto-join at create time isn't news.
      if (events[0]?.creator_id === row.user_id) return skip('self-join');
      const to = await eventAudience(row.event_id, row.user_id, 'push_joins');
      await sendPush(
        to,
        (locale) => ({
          title: events[0]?.title ?? '',
          body: t(locale, 'joinedEvent', { name }),
        }),
        { kind: 'event_chat', eventId: row.event_id },
      );
      return ok();
    }

    if (table === 'group_members' && type === 'INSERT') {
      const [groups, name] = await Promise.all([
        rest(`group_chats?id=eq.${row.group_id}&select=name,emoji,creator_id`),
        displayName(row.user_id),
      ]);
      if (groups[0]?.creator_id === row.user_id) return skip('self-join');
      const g = groups[0];
      const to = await groupAudience(row.group_id, row.user_id, 'push_joins');
      await sendPush(
        to,
        (locale) => ({
          title: g ? `${g.emoji} ${g.name}` : '',
          body: t(locale, 'joinedGroup', { name }),
        }),
        { kind: 'group_chat', groupId: row.group_id },
      );
      return ok();
    }

    // ── Friendships ────────────────────────────────────────────────────
    if (table === 'friendships') {
      if (type === 'INSERT' && row.status === 'pending') {
        const name = await displayName(row.requester_id);
        const to = await recipientsFor([row.recipient_id], 'push_social');
        await sendPush(
          to,
          (locale) => ({
            title: t(locale, 'friendRequestTitle'),
            body: t(locale, 'friendRequestBody', { name }),
          }),
          { kind: 'friend_request' },
        );
        return ok();
      }
      // Only the transition into 'accepted' is news — the requester is
      // the one waiting to hear.
      if (
        type === 'UPDATE' &&
        row.status === 'accepted' &&
        old_record?.status !== 'accepted'
      ) {
        const name = await displayName(row.recipient_id);
        const to = await recipientsFor([row.requester_id], 'push_social');
        await sendPush(
          to,
          (locale) => ({
            title: t(locale, 'friendAcceptedTitle'),
            body: t(locale, 'friendAcceptedBody', { name }),
          }),
          { kind: 'friend_accepted' },
        );
        return ok();
      }
      return skip('friendship no-op');
    }

    // ── The event itself moved, or went away ───────────────────────────
    // Cancellation listens to event_cancellations, not to a Delete hook
    // on events. Webhooks are AFTER triggers and participants cascade,
    // so by the time a Delete hook fires the attendee list is already
    // gone — the push would reach nobody. A BEFORE DELETE trigger stashes
    // the audience and the title here first; see the migration.
    if (table === 'event_cancellations' && type === 'INSERT') {
      const audience: string[] = Array.isArray(row.audience) ? row.audience : [];
      const to = await recipientsFor(
        audience.filter((id) => id !== row.creator_id),
        'push_events',
      );
      await sendPush(
        to,
        (locale) => ({
          title: row.title ?? '',
          body: t(locale, 'eventCancelledBody'),
        }),
        { kind: 'event_cancelled' },
      );
      return ok();
    }

    if (table === 'events' && type === 'UPDATE') {
      const timeMoved =
        row.event_date !== old_record?.event_date ||
        row.event_time !== old_record?.event_time;
      const placeMoved =
        row.latitude !== old_record?.latitude ||
        row.longitude !== old_record?.longitude;
      const titleChanged = row.title !== old_record?.title;
      // Everything else — a tag, the emoji, the pin colour — is not
      // worth waking a phone for.
      if (!timeMoved && !placeMoved && !titleChanged) return skip('cosmetic edit');

      const to = await eventAudience(row.id, row.creator_id, 'push_events');
      await sendPush(
        to,
        (locale) => ({
          title: row.title ?? '',
          body: timeMoved
            ? t(locale, 'eventMovedTime', {
                when: `${row.event_date} ${String(row.event_time).slice(0, 5)}`,
              })
            : placeMoved
              ? t(locale, 'eventMovedPlace')
              : t(locale, 'eventEdited'),
        }),
        { kind: 'event_chat', eventId: row.id },
      );
      return ok();
    }

    return skip('unhandled table');
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
