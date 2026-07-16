# Push notifications — deploy runbook

The client already registers each device's Expo push token to
`profiles.push_token` (see `services/push.service.ts`). To actually
deliver pushes you need to deploy the `notify` Edge Function and point
two Database Webhooks at it. This is a one-time manual setup.

## 0. Prerequisites

- Apply migration `20260719000000_notifications_archive.sql`
  (adds `profiles.push_token`).
- Push requires a **physical device** and a **native build that
  includes `expo-notifications`** — it does not work on the iOS
  Simulator or in the pre-notifications dev client. Rebuild with:
  ```
  eas build --profile development --platform ios
  ```
  For iOS you also need Push Notifications enabled on the Apple app id
  and an APNs key uploaded to Expo (`eas credentials`). Expo's managed
  push handles the APNs/FCM hop; you don't run your own push server.

## 1. Deploy the function

```
supabase functions deploy notify --no-verify-jwt
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge
Functions automatically — no extra secrets to set.

## 2. Wire the webhooks

Dashboard → **Database → Webhooks → Create a new hook**, twice:

| Name              | Table          | Events | Type            | URL                                             |
| ----------------- | -------------- | ------ | --------------- | ----------------------------------------------- |
| `notify-message`  | `messages`     | Insert | Supabase Edge Fn | select the `notify` function                    |
| `notify-join`     | `participants` | Insert | Supabase Edge Fn | select the `notify` function                    |

(If you use an HTTP hook instead of the Edge-Function type, point the
URL at `https://<project-ref>.functions.supabase.co/notify` and add an
`Authorization: Bearer <anon-or-service key>` header.)

## 3. What it sends

- **New chat message** → everyone in the chat except the sender gets
  `"<Event title>" / "<Sender>: <message>"`, tapping opens the chat.
  System messages (join/leave/archive-warning) are skipped.
- **Someone joins an event** → members get `"<Sender> joined the event"`.
  The creator's auto-join at creation time is skipped.

Recipients without a saved `push_token` (web users, denied permission,
or the Push-notifications toggle off in Settings — which prevents token
registration) simply receive nothing.

## Not delivered by this function

The **30-minutes-to-archive** notice is an in-chat **system message**,
posted by the `post_archive_warning` RPC when a client sees the event
enter the pre-archive window — it needs no push infrastructure and
works today. (The message insert will *also* trigger `notify-message`,
but it's `type = 'system'` so the push is skipped by design.)
