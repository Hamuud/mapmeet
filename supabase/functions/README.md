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

**This is all deployed and live** on `wpcwjjlaoolnqddeqpce` as of
2026-08-14. What follows is how it was done, and how to redo it on a
fresh project.

## 1. Deploy

```
supabase functions deploy notify --no-verify-jwt
supabase functions deploy digest --no-verify-jwt
supabase secrets set NOTIFY_SECRET=<32 random bytes> DIGEST_SECRET=<32 more>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge
Functions automatically.

### Why both functions take a secret

`--no-verify-jwt` means these URLs are open to the internet, and a
forged webhook payload is four lines of JSON:

```
{"type":"INSERT","table":"dm_messages",
 "record":{"sender_id":"…","recipient_id":"<victim>","content":"anything"}}
```

That is push phishing in the app's own voice. Turning JWT verification
back on does **not** fix it — Supabase accepts any correctly signed
token, and the anon key is one, published inside the web bundle. So both
functions require a shared secret header (`x-notify-secret`,
`x-digest-secret`) and both **fail closed**: an unset secret rejects
everything rather than opening the door.

## 2. The webhooks

Eight triggers, created by migration `20260819000000_push_webhooks.sql`,
not by the Dashboard's Database Webhooks UI. The Dashboard writes the
auth header as a literal into the trigger definition, which would put
the secret into a file in git; instead one `public.notify_push()`
trigger function reads it from **Vault** at fire time:

```sql
select vault.create_secret('<NOTIFY_SECRET>', 'notify_secret', '…');
select vault.create_secret('<DIGEST_SECRET>', 'digest_secret', '…');
```

Rotating a secret is then `vault.update_secret()` plus
`supabase secrets set` — no triggers or jobs to rewrite.

| Trigger                 | Table            | Fires on |
| ----------------------- | ---------------- | -------- |
| `notify_event_message`  | `messages`       | Insert, non-system |
| `notify_group_message`  | `group_messages` | Insert, non-system |
| `notify_dm`             | `dm_messages`    | Insert   |
| `notify_event_join`     | `participants`   | Insert   |
| `notify_group_join`     | `group_members`  | Insert   |
| `notify_friend_request` | `friendships`    | Insert where status = pending |
| `notify_friend_accept`  | `friendships`    | Update crossing into accepted |
| `notify_event_change`   | `events`         | Update of date/time/place/title |
| `notify_event_cancel`   | `event_cancellations` | Insert |

The `WHEN` clauses are the reason for owning the trigger. `events` is
updated far more often than it is *changed*: `reminder_sent`,
`archive_warned` and `coming_poll_created` all flip the same row. The
function ignores those anyway, but without the `WHEN` every digest run
would fire one pointless HTTP request per event it just reminded about.

⚠ Cancellation hangs off `event_cancellations`, **not** a Delete hook on
`events`. These are AFTER triggers and `participants` cascades, so a
Delete hook fires with the attendee list already gone and the push
reaches nobody. A BEFORE DELETE trigger stashes the audience and title
first (migration `20260817000000`).

## 3. The schedule

Migration `20260819000001_push_cron.sql`: `mapmeet-reminders` every 15
minutes, `mapmeet-digest` hourly at :07. Both read `digest_secret` from
Vault the same way.

Hourly, not daily, for the round-up: `digest_audience()` only returns
people whose **own** clock reads 10:00–21:00, so the hourly sweep is
what lets each timezone come round in its own daytime. Per person the
20-hour floor still caps it at one a day.

### Checking it works

```sql
-- what the cron job does, verbatim
select net.http_post(
  url     := 'https://wpcwjjlaoolnqddeqpce.supabase.co/functions/v1/digest?job=both',
  headers := jsonb_build_object('Content-Type','application/json','x-digest-secret',
              (select decrypted_secret from vault.decrypted_secrets
                where name = 'digest_secret' limit 1)),
  body    := '{}'::jsonb);

-- then, a few seconds later
select status_code, content from net._http_response order by created desc limit 1;
```

A healthy quiet run is `200 {"reminders":0,"digest":0}`. Webhook
deliveries land in the same `net._http_response` table, and the Edge
Function's own logs are under Dashboard → Functions → notify → Logs.

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

### Dead tokens clean themselves up

Expo answers every send with one ticket per message. A ticket carrying
`details.error === 'DeviceNotRegistered'` means the app was uninstalled
or the token reissued — that device will never receive on it again — so
`sendPush` nulls the token on every profile holding it. Only that error:
`MessageRateExceeded` and `MessageTooBig` describe the *send*, not the
device, and clearing on those would unsubscribe people for being
popular.

Nulling is safe because the client re-registers on the next launch, so a
reinstall gets a fresh token rather than a permanently silent account.

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
