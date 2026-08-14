# Push notifications — deploy runbook

Two functions:

| Function | Triggered by | Sends |
| -------- | ------------ | ----- |
| `notify` | Database Webhooks, one per table | Chats, joins, friend requests, event changes |
| `digest` | pg_cron | "Starts in an hour" reminders, and the area round-up |

The client registers each device's Expo push token to
`profiles.push_token` (`services/push.service.ts`) and mirrors the
settings the server needs while the app is closed — language, timezone,
category switches, and the location the digest counts around — through
`sync_push_settings()`.

## 0. Prerequisites

- Apply the migrations, in order:
  - `20260719000000_notifications_archive.sql` (`profiles.push_token`)
  - `20260816000000_notification_prefs.sql` (settings, digest, reminders)
  - `20260817000000_event_cancellations.sql` (cancellation audience capture)
- Push requires a **physical device** and a **native build that includes
  `expo-notifications`** — not the iOS Simulator, not the web build, and
  not a dev client older than the notifications dependency:
  ```
  eas build --profile development --platform ios
  ```
  For iOS you also need Push Notifications enabled on the Apple app id
  and an APNs key uploaded to Expo (`npx eas credentials`). Expo's
  managed push handles the APNs/FCM hop; you don't run a push server.

## 1. Deploy

```
supabase functions deploy notify --no-verify-jwt
supabase functions deploy digest --no-verify-jwt
supabase secrets set DIGEST_SECRET=<a long random string>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge
Functions automatically.

## 2. Wire the webhooks

Dashboard → **Database → Webhooks → Create a new hook**. All of them
point at the `notify` function; the function decides what to do from the
`table` and `type` in the payload.

| Name                    | Table            | Events          |
| ----------------------- | ---------------- | --------------- |
| `notify-event-message`  | `messages`       | Insert          |
| `notify-group-message`  | `group_messages` | Insert          |
| `notify-dm`             | `dm_messages`    | Insert          |
| `notify-event-join`     | `participants`   | Insert          |
| `notify-group-join`     | `group_members`  | Insert          |
| `notify-friendship`     | `friendships`    | Insert, Update  |
| `notify-event-change`   | `events`              | Update  |
| `notify-event-cancel`   | `event_cancellations` | Insert  |

(If you use a plain HTTP hook instead of the Edge-Function type, the URL
is `https://<project-ref>.functions.supabase.co/notify` with an
`Authorization: Bearer <service key>` header.)

⚠ Cancellation is a hook on `event_cancellations`, **not** a Delete hook
on `events`. Webhooks are AFTER triggers and `participants` cascades, so
a Delete hook fires with the attendee list already gone and the push
reaches nobody. A BEFORE DELETE trigger stashes the audience and title
into `event_cancellations` first (migration `20260817000000`).

## 3. Schedule the digest

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reminders: every 15 minutes. due_event_reminders() only returns
-- events inside the next 75 minutes that haven't fired yet, so the
-- frequency only affects how tight "an hour before" lands.
select cron.schedule(
  'mapmeet-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.functions.supabase.co/digest?job=reminders',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'x-digest-secret','<DIGEST_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- Area round-up: hourly, NOT daily. digest_audience() only returns
-- people whose own clock reads 10:00–21:00, so the hourly sweep is what
-- lets each timezone come round in its own daytime. Per person it still
-- fires at most once every 20 hours.
select cron.schedule(
  'mapmeet-digest',
  '7 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.functions.supabase.co/digest?job=digest',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'x-digest-secret','<DIGEST_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
```

## 4. What gets sent

Every push is rendered in the recipient's own saved language and skipped
entirely if they have that category switched off (Settings →
Notifications) or no token.

| Trigger | Title | Body |
| ------- | ----- | ---- |
| Event-chat message | event title | `Alex: see you there` |
| Group message | `💬 Group name` | `Alex: see you there` |
| Direct message | sender name | the message |
| Joined an event | event title | `Alex joined the event` |
| Joined a group | `💬 Group name` | `Alex is in the group` |
| Friend request | `Friend request` | `Alex wants to be friends` |
| Request accepted | `You are now friends` | `Alex accepted your request` |
| Event moved | event title | `Moved to 2026-08-20 19:00` |
| Event cancelled | event title | `The host cancelled this event` |
| Starts soon | `⏰ Rooftop cinema` | `Starts in 40 min — see you there` |
| Area round-up | `New events near you` | `12 new events have been pinned in your area — go and have a look` |

System messages are never pushed: they are already visible in the chat,
and the archive warning would otherwise arrive twice.

## 5. Tuning the round-up

All of it lives in `digest_audience()` — the Edge Function only renders
what the SQL hands it.

- **How many events are worth a notification** — `MIN_EVENTS` in
  `digest/index.ts`, currently 5. Below that the digest is skipped
  entirely, which is what turns "once a day" into "once every day or
  two" in a quiet area without any extra scheduling.
- **How long away counts as away** — the two `20 hours` intervals:
  the first is `last_seen_at` (they haven't opened the app), the second
  is `digest_last_sent_at` (we haven't already told them).
- **Daytime** — the `between 10 and 20` hour window, evaluated in the
  recipient's own `tz_offset_minutes`.
- **Which events count** — public, still upcoming, not their own, not
  city-precision imports (those are hidden from the map, so counting
  them would promise something the user cannot then find), and created
  since their last digest so nothing is ever counted twice.

## Not delivered by these functions

The **30-minutes-to-archive** notice is an in-chat system message posted
by `post_archive_warning()`; it needs no push infrastructure.
