# MapMeet — Design System

Derived from `tailwind.config.js`, `global.css` and the component library under
`components/` — then **verified screen by screen against a signed-in build
running in iOS Simulator** (iPhone 16 Pro Max, iOS 18.3, custom dev client,
old architecture, `com.mapmeet.app`).

Every claim below marked **[verified]** was read off a real capture in
`store-assets/raw-ios/`. Claims marked **[source]** come from the code and were
not reachable in the session.

---

## 1. Visual personality

MapMeet is **ink-on-paper, not neon-on-black.**

A warm off-white "paper" surface (`#F6F4EE`) carries near-black "ink" text
(`#0E0E10`). It reads closer to a well-set city guide than to a typical
party/social app. Colour is rationed:

- **Ink** carries every default action — the primary button is black, not blue.
- **Indigo `#4B5FE0`** is the informational accent: date pills, `#tags`,
  address links, the navigate chip, chat sender names, **map clusters**, and the
  filled `Join event` button in list contexts.
- **Coral `#FE5800`** is a *single reserved* accent: the create FAB, the pending
  "New event here" marker, the chat unread badge, friend-count badges, and the
  chat system pills. Nothing else.

Net personality: **modern · editorial · calm · community-driven · quietly
premium.** Deliberately *not* neon, glassmorphic or gradient-heavy. Emoji do the
expressive work — every event carries one, so the chrome stays monochrome while
the *content* supplies colour.

---

## 2. Colour palette

### Brand — indigo (informational accent)

| Token | Hex |
| --- | --- |
| `brand.50` | `#EEF0FB` |
| `brand.100` | `#DDE2F7` |
| `brand.200` | `#B8C1EF` |
| `brand.300` | `#8E9BE6` |
| `brand.400` | `#6A78DE` |
| **`brand.500` (primary indigo)** | **`#4B5FE0`** |
| `brand.600` | `#3B4CC4` |
| `brand.700` | `#2E3CA0` |
| `brand.800` | `#25307E` |
| `brand.900` | `#1C2560` |

### Accent — coral (reserved for create / alert)

| Token | Hex |
| --- | --- |
| `accent.50` | `#FFF2EB` |
| `accent.100` | `#FFE3D5` |
| `accent.200` | `#FFC4A5` |
| `accent.300` | `#FE9B66` |
| **`accent.400` (primary coral)** | **`#FE5800`** |
| `accent.500` | `#E54F00` |
| `accent.600` | `#BE4200` |
| `accent.700` | `#933300` |

### Surfaces & structure

| Role | Light | Dark |
| --- | --- | --- |
| App background (`surface`) | `#F6F4EE` warm paper | `#0E0E10` |
| Cards / sheets / rails (`panel`) | `#FDFCF8` | `#16161C` |
| Elevated tiles (`elevated`) | `#EDEAE1` | `#1C1C24` |
| Hairline border (`border`) | `#E4E1D8` | `#2A2A32` |
| Muted text (`muted`) | `#8B8880` | `#8A8A94` |
| Primary text / ink (`text`) | `#0E0E10` | `#F5F5F2` |
| Secondary text (`ink2`) | `#2A2A2E` | `#D6D6D0` |

Destructive uses Tailwind `red-600`/`red-700` with a `red-300` outline variant.
Splash / adaptive-icon background: `#0E0E10` (`app.json`).

### Gradients

**There are none.** Flat fills, hairline borders, soft shadows only.
Store art direction must stay gradient-light — at most a subtle paper wash.

---

## 3. Typography **[verified]**

The shipped iOS app renders in **San Francisco (SF Pro)** — the system face.

This matters because the config is misleading: `tailwind.config.js` declares
Manrope / Instrument Serif / JetBrains Mono and `global.css` imports them from
Google Fonts, but that import only applies to **React Native Web**. There is no
`expo-font` / `useFonts` call in the native app, so every `font-sans`,
`font-display` and `font-mono` class resolves to the system face on device.

| Context | Web | iOS (actual) |
| --- | --- | --- |
| Body / UI | Manrope 400–700 | SF Pro |
| Display | Instrument Serif | SF Pro |
| Mono (hints, meta) | JetBrains Mono | SF Mono |

### Observed type scale **[verified]**

| Role | Size | Weight | Example |
| --- | --- | --- | --- |
| Screen title | ~40–44 pt | Bold, tight leading | "Welcome back." / "My events" |
| Sheet title | ~28 pt | Bold | "Pin an event" / "6 events here" |
| Nav title | 17 pt | Bold, centred | "Settings" / "Friends" |
| Profile name | ~34 pt | Regular/Medium | "Maya Kovalenko" |
| Subtitle / lede | 15–16 pt | Regular, muted | "Sign in to meet friends on the map today." |
| Field label | 11–12 pt | Semibold, **uppercase, letter-spaced** | `EMAIL`, `TITLE`, `RADIUS` |
| Card title | 16 pt | Bold | Event title |
| Body | 15 pt | Regular/Semibold | Button labels, chat text |
| Meta / caption | 12 pt | Regular, muted | "Maya Kovalenko · 4 going" |
| Micro / tag | 10 pt | Semibold | `#coffee`, date pill, marker labels |
| Tab label | 11 pt | 600, `letterSpacing 0.1` | Map · Events · Chat · You |

**Store-asset recommendation:** set headlines in **SF Pro Display Bold/Heavy**.
It is literally what the product renders, so the campaign inherits the product's
voice with zero drift. Sentence case with a full stop matches the in-app
"Welcome back." / "Set up your profile." pattern. Do **not** use a serif — no
serif is visible anywhere in the shipped mobile UI.

---

## 4. Shape, spacing, elevation

### Border radius (Tailwind overrides)

| Token | Value | Used for |
| --- | --- | --- |
| `rounded-lg` | 10 px | Small pills, hint chips |
| `rounded-xl` | 14 px | Buttons (sm/md), map controls, banners |
| `rounded-2xl` | 18 px | Emoji tiles, map pins, create FAB, lg buttons |
| `rounded-3xl` | 24 px | **Event cards**, bottom sheets |
| `rounded-full` | — | Avatars, tags, badges, segmented controls |

Signature shapes: the **24 px card** and the **18 px rounded-square tile**.

### Spacing

Standard 4 px scale plus custom `spacing.18 = 4.5rem`. Screen gutter `px-4`
(16 pt), card padding `p-4`, row gaps `gap-3` (12 pt) / `gap-1.5` (6 pt).

### Elevation

Soft low-opacity black shadows only. One coloured exception: the create FAB uses
`shadow-lg shadow-accent-400/50` — a subtle coral halo. **[verified]**

---

## 5. Components **[verified unless noted]**

### Buttons (`components/ui/PrimaryButton.tsx`)

| Variant | Fill | Label | Purpose |
| --- | --- | --- | --- |
| `primary` | **Ink** `#0E0E10` | Paper | Default — "Sign in", "Continue", "Join event" (sheet) |
| `accent` | **Coral** `#FE5800` | White | Create event only |
| `secondary` | Panel + hairline | Ink | Subtle / chip action |
| `ghost` | Transparent | Ink | Text button |
| `destructive` | `red-600` | White | Filled danger |
| `destructive-outline` | Panel + `red-300` | `red-700` | "Delete" |

Sizes: `sm` h-36 / `md` h-44 (`rounded-xl`), `lg` h-56 (`rounded-2xl`).

Note the one deliberate inconsistency: in the **Events list** the `Join event`
button is **indigo-filled**, while in the **event preview sheet** it is
**ink-filled**. Both were observed; keep whichever appears in the source
screenshot you composite.

### Event card

24 px radius, panel fill, hairline border. Left: 56×56 `rounded-2xl` elevated
tile with a 28 pt **emoji**. Right column: indigo date pill
(`MON, 10 AUG · 19:30`) → bold title → xs circular avatar + "host · N going
[· distance]" → up to 4 indigo `#tag` chips on a 10 %-alpha indigo wash.
Trailing: 36 px circular indigo-wash chip with a `navigate` glyph.

### Map markers

Two distinct treatments — **this is the app's most ownable visual**:

- **Single event pin:** 44×44 rounded-square (`rounded-2xl`) rotated **−4°**,
  bottom-left corner clipped to 4 px, panel fill + hairline, holding the event
  emoji. A 6 px dot sits below on the true map point, and the title rides in a
  small ink pill (85 % alpha, white 10 pt semibold) underneath.
  Selected → ink fill, un-rotated, 48×48.
- **Cluster:** a filled **indigo circle** with a white ring, showing 2–3 member
  emoji, plus an **ink circular count badge** (white numerals) at top-right.
  Sizes scale with member count.
- **Pending placement:** coral 44×44 rounded-square with a white `+`, coral dot,
  and a coral "New event here" pill. Paired with an ink banner across the top:
  "Tap the map to pin the event · Cancel".

> Correction to earlier notes: hosted-by-you events rendered as **normal panel
> pins**, not coral, in the live build. Only the pending marker and the FAB are
> coral on the map.

### Map chrome

Full-bleed map with floating overlays: a panel search field
("Search events, #tags, hosts") pinned under the status bar; a horizontal filter
row (`All · Today · Tomorrow · This week · Nearby · Joined`) where the **active
chip is ink-filled with a leading dot** and inactive chips are panel; an ink
style-switcher pill on the right that expands to `Streets · Satellite · Terrain`;
a bottom-right stack of a recenter control above the **coral create FAB**.

### Bottom sheets

`rounded-3xl` top corners, panel fill, grab handle. The event preview sheet
shows (top → bottom): optional full-width poster image (`rounded-2xl`), indigo
date pill + grey distance pill, emoji tile + bold title + "hosted by …", indigo
address link with a pin glyph, description with a "More ⌄" disclosure, attendee
avatar row + "N going", then actions — `Directions` / `Join event`, plus
`Get tickets` (imported events), `Share`, and for hosts `Chat` / `Edit` /
`Delete` with a "You're hosting" indigo note.

### Chat

- Outgoing: **ink bubble**, white text, right-aligned, 12 pt time + check glyph.
- Incoming: panel bubble + hairline, **indigo sender name**, left-aligned,
  with a circular indigo-wash initials avatar in the gutter.
- System events: centred **coral-wash pill**, coral uppercase 11 pt
  ("MAYA KOVALENKO CREATED THIS EVENT").
- Date separator: centred muted uppercase "TODAY" between hairlines.
- Header: back chip, event emoji avatar, bold title, uppercase meta
  ("MON, 10 AUG · 19:30 · 4 GOING / 12"), indigo address line, chevron +
  members glyph.
- Composer: pill input "Message the group…" flanked by a `+` circle and a mic.

### Profile ("You")

Large circular initials avatar (indigo wash + indigo letters), display name,
`@handle`, then a row of `Edit profile` (ink) / `Friends` / `Settings`
(panel outline). Four stat tiles (`RATING` with a star, `EVENTS`, `ATTENDING`,
`PAST`), bio paragraph, interest chips (panel pill: emoji + uppercase label),
then an underlined tab strip `Hosting · Attending · Past · Reviews` over event
cards.

### Settings

Grouped panel cards with 40 px circular icon wells, section labels in muted
uppercase (`ACCOUNT`, `PREFERENCES`, `SUPPORT`), right-aligned values/chevrons,
an ink toggle, and a segmented `Light · Dark · Auto` control. Sign out in red.

### Other primitives

`Avatar`, `Badge` (primary/accent), `BottomSheet`, `ConfirmationDialog`,
`EmptyState` (large emoji + bold title + muted description + ink CTA),
`Input`, `LoadingSpinner`, `ShareSheet`, `Toast`, `VerifiedBadge`.

---

## 6. Iconography & imagery

- **Icons:** `@expo/vector-icons` → **Ionicons**, outline inactive / filled
  active, 14–26 px.
- **Emoji as a design element:** every event has one, surfaced in the map pin,
  the card tile, cluster groupings and the chat header. 16 fixed profile
  interests, each emoji-tagged (🎬 Films, ☕ Coffee, 🏃 Running, 📚 Books,
  🎧 Music, 🍜 Food, ✈️ Travel, 📷 Photography, 🎨 Art, 🎮 Games, 💪 Fitness,
  🧘 Yoga, 💻 Tech, 🌲 Outdoors, 🌃 Nightlife, ⚡ Spontaneous).
- **Illustration:** none. Empty states use a single large emoji.
- **Photography:** only imported event posters and user avatars.
- **App icon:** ⚠️ **does not exist.** `assets/images/` is empty and `app.json`
  declares no `icon`, `splash.image` or `adaptiveIcon.foregroundImage` — only the
  `#0E0E10` background colour. The auth screen shows the de-facto brand mark: a
  48 px **ink rounded-square (18 px radius) with a paper-coloured "M"**. The
  store icon was therefore *designed* from that mark, not extracted.

---

## 7. Map styling

Native iOS uses **Apple Maps** via `react-native-maps` (web uses MapLibre GL).
`MapStyleSwitcher` offers `Streets · Satellite · Terrain`; markers cluster via
`supercluster`. Dark mode swaps the map to Apple's dark tiles and every overlay
to the dark palette — **verified**, both themes are production-quality.

---

## 8. Art-direction rules for store assets

**Do**
- Keep paper `#F6F4EE` / ink `#0E0E10` as the dominant relationship.
- Use coral `#FE5800` sparingly, ideally on the element that means "create" or
  "new" in-product.
- Use indigo `#4B5FE0` for secondary highlights and connective graphics.
- Reuse the −4° rounded-square pin and the indigo cluster circle as brand motifs.
- Set headlines in SF Pro Display Bold, large, tight leading, sentence case with
  a full stop.
- Keep generous whitespace and let the real UI be the hero.

**Don't**
- No neon glows, 3D blobs, glassmorphism or multi-stop gradients.
- Don't recolour the UI or invent controls.
- Don't put coral on everything — it breaks the one-accent rule.
- Don't set headlines in a serif; the mobile product has no serif.
