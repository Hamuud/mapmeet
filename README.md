# MapMeet

A cross-platform live community map. Every registered user can pin an event —
🎉 Party at Tony's, ☕ Coffee Meetup, 🎮 LAN Party — and every other user sees
it appear on the map in real time.

Single codebase → iOS + Android + Web.

---

## Stack

| Layer         | Choice                                                     |
| ------------- | ---------------------------------------------------------- |
| Frontend      | React Native · Expo · Expo Router · TypeScript             |
| Web           | React Native Web · MapLibre GL JS                          |
| Backend       | Supabase (Auth · Postgres · Storage · Realtime)            |
| State         | Zustand                                                    |
| Forms         | React Hook Form · Zod                                      |
| Styling       | NativeWind (Tailwind)                                      |
| Animations    | Reanimated                                                 |
| Maps (native) | `react-native-maps` — Apple Maps on iOS, Google on Android |
| Icons         | `@expo/vector-icons`                                       |
| Deployment    | EAS Build · Vercel (Web)                                   |

---

## Installation

### 1. Prerequisites

- Node.js 20+
- pnpm / npm / yarn
- Expo CLI (`npm i -g expo`)
- Xcode + iOS Simulator (for iOS)
- Android Studio + emulator (for Android)
- A Supabase project

### 2. Install dependencies

```sh
npm install
```

### 3. Configure environment

```sh
cp .env.example .env
```

Fill in:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

For Android native Google Maps, also mirror your key into
`app.base.json → expo.android.config.googleMaps.apiKey`.

### 4. Run the Postgres migrations

Run both migrations from `supabase/migrations/` in order (either via the
Supabase SQL editor or the CLI). The first creates schema + RLS + realtime;
the second creates the `avatars` storage bucket and its scoped policies.

```sh
supabase db reset      # applies every migration in order
```

The reset callback also expects deep-linking to be wired: in your Supabase
project's Auth → URL Configuration, add both `mapmeet://reset` and your web
origin's `/reset` path to the allowed redirect URLs.

### 5. Start the app

```sh
npm run web       # web
npm run ios       # iOS simulator
npm run android   # Android emulator
```

---

## Folder structure

```
app/                    # Expo Router file-based routes
  _layout.tsx           # Root layout: providers + StatusBar + Stack + deep-link listener
  index.tsx             # Session-aware entry redirect
  +not-found.tsx        # 404
  reset.tsx             # /reset — password reset callback (deep-linkable)
  (auth)/               # Public stack
    _layout.tsx
    login.tsx
    signup.tsx
    forgot-password.tsx
  (tabs)/               # Authenticated tabs
    _layout.tsx         # Wires useEventsBootstrap for fetch + realtime
    map.tsx             # Home map — real events + clustering + FABs
    events.tsx          # My events — created / joined + edit / delete
    profile.tsx         # Profile — avatar upload + display name edit + sign out
components/
  ui/                   # PrimaryButton, Input, Avatar, Badge, BottomSheet,
                        # DateTimeField (native/web), LoadingSpinner,
                        # EmptyState, Toast, ConfirmationDialog
  map/                  # MapMarker + Map.native.tsx + Map.web.tsx + useCluster.ts
  events/               # EventCard, SearchBar, FilterBar, EmojiPicker
  profile/              # ProfileCard
features/
  auth/                 # useDeepLinkSession (native token handoff)
  events/               # EventPreviewSheet, CreateEventSheet, EditEventSheet,
                        # useEventsBootstrap, filterEvents
  map/                  # DEMO_CENTER fallback
  profile/              # AvatarUpload
services/
  supabase.ts           # Typed Supabase client (native + web storage)
  auth.service.ts       # signUp / signIn / signOut / reset / updatePassword
  profiles.service.ts   # profile read + update
  events.service.ts     # events CRUD, join / leave
  storage.service.ts    # avatar upload (native + web binary read)
hooks/
  useAuth.ts            # Zustand selector for auth state
  useLocation.ts        # cross-platform current location + perms
  useImagePicker.ts     # expo-image-picker wrapper
  useThemeColors.ts     # semantic tokens for imperative code paths
store/
  auth.store.ts         # session + profile bootstrap
  events.store.ts       # events feed (Phase 2: realtime subscribers)
  filters.store.ts      # search + filter chips
types/
  database.ts           # Supabase schema (Row/Insert/Update)
  index.ts              # Public model types (EventWithCreator, LatLng…)
utils/
  validators.ts         # Zod schemas
  distance.ts           # Haversine + formatDistance
  format.ts             # date/time helpers
supabase/
  migrations/
    20260704000000_init.sql             # tables + RLS + realtime
    20260705000000_avatars_bucket.sql   # storage bucket + scoped policies
assets/                 # icon / splash / favicon (see assets/README.md)
```

---

## Database schema

See `supabase/migrations/20260704000000_init.sql`. Summary:

**`profiles`** — 1:1 with `auth.users` (populated by trigger)
- `id uuid PK → auth.users(id)`
- `username text UNIQUE`
- `display_name text`
- `avatar_url text`
- `created_at`, `updated_at`

**`events`**
- `id uuid PK`
- `creator_id → profiles(id)`
- `title`, `description`, `emoji`
- `latitude`, `longitude`
- `event_date`, `event_time`
- `max_participants` (nullable)
- `visibility ('public'|'private')`
- `created_at`, `updated_at`

**`participants`**
- `id uuid PK`
- `event_id → events(id)`
- `user_id → profiles(id)`
- `joined_at`
- `UNIQUE(event_id, user_id)`

**RLS**
- Any authenticated user can read public events.
- Only the creator can `UPDATE` / `DELETE`.
- A user can only `INSERT` a participant row where `user_id = auth.uid()`.

**Realtime**
- `events` and `participants` are added to `supabase_realtime`.

---

## Roadmap

### Phase 1 ✅ (this drop)
- Expo + Router + NativeWind + TypeScript scaffolding
- Supabase client, auth service, and RLS-hardened schema
- Auth stack: sign in, sign up, forgot password
- Tabbed authenticated shell
- Cross-platform home map with demo markers, search bar, filter chips,
  current-location dot, and marker preview sheet
- Reusable UI kit (buttons, inputs, avatars, sheets, toasts…)
- My Events + Profile screens (with sign out)

### Phase 2 ✅ — Live data
- `useEventsBootstrap` fetches on sign-in and subscribes to `postgres_changes`
  on `events` + `participants`
- Optimistic patches for join / leave (rolls back on error)
- Create-Event sheet: emoji picker, cross-platform date/time, use-current-location,
  visibility toggle
- Edit-event sheet + delete flow with `ConfirmationDialog`
- Locate FAB re-centers on user coords via the map's imperative ref

### Phase 3 ✅ — Polish
- Marker clustering: `supercluster` on native, MapLibre's built-in
  GeoJSON `cluster` layer on web (tap-to-zoom on both)
- Avatar upload → Supabase Storage (public `avatars` bucket + scoped
  RLS policies in `20260705000000_avatars_bucket.sql`)
- Deep-linking: `mapmeet://reset` recovery flow with a token-restoring
  root-level effect and dedicated `/reset` screen
- Filter execution: Today / Tomorrow / Week / Nearby (5 km) / Joined / By me
- Private events UI: lock badge on cards, chip on marker, visibility toggle
  in Create + Edit sheets (RLS already scopes reads server-side)

### Phase 4 — Delivery
- EAS Build profiles (dev, preview, production)
- Vercel web deploy
- App Store & Play Store submission

---

## Scripts

| Command             | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run start`     | Expo dev server                       |
| `npm run ios`       | iOS simulator                         |
| `npm run android`   | Android emulator                      |
| `npm run web`       | Web dev server                        |
| `npm run typecheck` | `tsc --noEmit`                        |
| `npm run lint`      | ESLint over `.ts` / `.tsx`            |
| `npm run format`    | Prettier over the repo                |
