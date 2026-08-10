# MapMeet — Design System

Derived from `tailwind.config.js`, `global.css`, the component library under
`components/`, and verified against live iOS Simulator captures
(iPhone 16 Pro Max, iOS 18.3, Expo Go / SDK 52).

> Status note: sections marked **[verified]** were confirmed against real
> on-device screenshots. Sections marked **[source]** are read from the
> codebase and still to be confirmed on the signed-in screens.

---

## 1. Visual personality

MapMeet is **ink-on-paper, not neon-on-black.**

The palette is a warm off-white "paper" surface (`#F6F4EE`) with near-black
"ink" text (`#0E0E10`) — closer to a printed city guide or a well-set
editorial app than to a typical social/party product. Colour is used with
real discipline:

- **Ink** carries every default action (the primary button is black, not blue).
- **Indigo** `#4B5FE0` is the informational accent — date pills, tags, link
  affordances, the small navigate chip on event cards.
- **Coral/orange** `#FE5800` is a *single, reserved* accent. The codebase is
  explicit about this: it is used **only** for the create-event CTA, the
  "you're hosting this" map pin, the pending-marker state, and the unread
  chat badge. Nothing else.

The result reads as: **modern · editorial · calm · community-driven · quietly
premium.** It is deliberately *not* playful-neon, not glassmorphic, not
gradient-heavy. Marketing assets must respect that restraint — one warm accent
against paper and ink, generous whitespace, large confident type.

Emoji do a lot of the expressive work (event pins, category tiles, interest
chips), which keeps the chrome monochrome while the *content* supplies colour.

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

### Accent — coral/orange (reserved for "create")

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
| App background (`surface`) | `#F6F4EE` (warm paper) | `#0E0E10` |
| Cards / sheets / rails (`panel`) | `#FDFCF8` | `#16161C` |
| Elevated tiles (`elevated`) | `#EDEAE1` | `#1C1C24` |
| Hairline border (`border`) | `#E4E1D8` | `#2A2A32` |
| Muted text (`muted`) | `#8B8880` | `#8A8A94` |
| Primary text (`text` / ink) | `#0E0E10` | `#F5F5F2` |
| Secondary text (`ink2`) | `#2A2A2E` | `#D6D6D0` |

Destructive actions use Tailwind `red-600` / `red-700`, with an outlined
`red-300` border variant for "Delete".

**Splash / adaptive-icon background:** `#0E0E10` (from `app.json`).

### Gradients

**There are none.** The app uses flat fills, hairline borders and soft
shadows exclusively. Marketing art direction should therefore keep gradients
minimal — at most a very subtle paper-toned wash. Do not introduce vivid
multi-stop gradients; they would misrepresent the product.

---

## 3. Typography

**[verified]** The rendered iOS app uses the **system font (San Francisco)**.

This is worth stating precisely, because the config is misleading:
`tailwind.config.js` declares `Manrope` (sans), `Instrument Serif` (display)
and `JetBrains Mono` (mono), and `global.css` imports them from Google Fonts —
but that CSS import only applies to **React Native Web**. There is no
`expo-font` / `useFonts` call anywhere in the native app, so on iOS every
`font-sans` class resolves to the system face.

| Context | Web | iOS (actual) |
| --- | --- | --- |
| Body / UI | Manrope 400–700 | SF Pro |
| Display | Instrument Serif | SF Pro |
| Mono (hints, small meta) | JetBrains Mono | SF Mono |

### Observed type scale **[verified on auth screens]**

| Role | Size | Weight | Example |
| --- | --- | --- | --- |
| Screen title | ~40–44 pt | Bold, tight leading | "Welcome back." / "Set up your profile." |
| Section title | ~28 pt | Bold | "Reset password" |
| Subtitle / lede | ~15–16 pt | Regular, muted | "Sign in to meet friends on the map today." |
| Field label | ~11–12 pt | Semibold, **uppercase, letter-spaced** | `EMAIL`, `PASSWORD`, `DISPLAY NAME` |
| Card title | 16 pt (`text-base`) | Bold | Event title |
| Body | 15 pt (`text-[15px]`) | Regular/Semibold | Button labels (md) |
| Meta / caption | 12 pt (`text-xs`) | Regular, muted | "Alex · 6 going · 1.2 km" |
| Micro / tag | 10 pt (`text-[10px]`) | Semibold | `#coffee`, pin titles |
| Tab bar label | 11 pt | 600, `letterSpacing: 0.1` | Map · Events · Chat · You |

**Marketing recommendation:** set store headlines in **Manrope Bold/ExtraBold**
— it is the declared brand face, it is what the web product ships, and it sits
very close to the SF used on device. Avoid Instrument Serif for headlines; the
serif is not visible anywhere in the shipped mobile UI.

---

## 4. Shape, spacing, elevation

### Border radius (Tailwind overrides)

| Token | Value | Used for |
| --- | --- | --- |
| `rounded-lg` | 10 px | Small pills, hint chips |
| `rounded-xl` | 14 px | Buttons (sm/md), map controls, banners |
| `rounded-2xl` | 18 px | Emoji tiles, map pins, create FAB, lg buttons |
| `rounded-3xl` | 24 px | **Event cards**, bottom sheets |
| `rounded-full` | — | Avatars, tags, badges, unread dots |

The signature shape is the **24 px card** and the **18 px rounded-square tile**.

### Spacing

Standard Tailwind 4 px scale, plus a custom `spacing.18 = 4.5rem`.
Screen gutter is `px-4` (16 pt). Card padding `p-4`. Intra-row gaps `gap-3`
(12 pt) and `gap-1.5` (6 pt) for meta rows.

### Elevation

Soft, low-opacity black shadows only — no coloured glows except one:
the create FAB uses `shadow-lg shadow-accent-400/50`, a subtle coral halo.

| Level | Class |
| --- | --- |
| Card / control | `shadow-md shadow-black/20` |
| Selected pin, FAB, banner | `shadow-lg shadow-black/30–40` |
| Desktop rail chip | `shadow-sm shadow-black/10` |

---

## 5. Components

### Buttons (`components/ui/PrimaryButton.tsx`)

Six variants, explicitly documented in-source as the design system:

| Variant | Fill | Label | Purpose |
| --- | --- | --- | --- |
| `primary` | **Ink** (`#0E0E10`) | Paper | Default action — "Sign in", "Continue" |
| `accent` | **Coral** (`#FE5800`) | White | *Create event only* |
| `secondary` | Panel + hairline border | Ink | Subtle/chip action |
| `ghost` | Transparent | Ink | Text button |
| `destructive` | `red-600` | White | Filled danger |
| `destructive-outline` | Panel + `red-300` border | `red-700` | "Delete" |

Sizes: `sm` h-36/`rounded-xl`, `md` h-44/`rounded-xl`, `lg` h-56/`rounded-2xl`.

### Event card **[source]**

24 px radius, panel fill, hairline border. Left: 56×56 `rounded-2xl` elevated
tile holding a 28 pt **emoji**. Right column: indigo date pill (+ optional
coral "Private" badge) → bold title → xs avatar + "host · N going · distance"
→ up to 4 indigo `#tag` chips on a 10 %-alpha indigo wash. Trailing: 36 px
circular indigo-wash chip with a `navigate` glyph.

### Map markers (`components/map/MapMarker.tsx`) **[source]**

A distinctive, ownable shape — **not** a classic teardrop pin:

- 44×44 rounded-square (`rounded-2xl`) **rotated −4°**, with the
  bottom-left corner clipped to 4 px so it reads as a tag/pin hybrid.
- Panel fill + hairline border by default; **ink** fill when selected
  (and un-rotated to 0°, growing to 48×48); **coral** fill when you host it.
- A 6 px dot sits 4 px below, anchored to the true map point.
- Optional title in a small ink pill (85 % alpha) beneath.
- Private events get a 16 px ink circle badge with a lock glyph.
- Pending placement uses a coral tile with a `+` and a "New event here" pill.
- Clusters render deterministic emoji groups (`clusterEmojis.ts`).

### Tab bar **[source]**

Four tabs — **Map · Events · Chat · You** — Ionicons, filled when active.
64 pt + bottom safe-area inset, panel background, 1 px hairline top border,
zero elevation/shadow. Active tint = ink, inactive = muted.
Chat carries a **coral** unread badge (`#FE5800`, white, 10 pt, weight 700,
capped at "99+").

### Other primitives

`Avatar`, `Badge` (primary/accent tones), `BottomSheet`, `ConfirmationDialog`,
`EmptyState` (emoji + title + description), `Input`, `LoadingSpinner`,
`ShareSheet`, `Toast`, `VerifiedBadge` (blue check for staff).

---

## 6. Iconography & imagery

- **Icons:** `@expo/vector-icons` → **Ionicons**, outline when inactive,
  filled when active. Consistently 14–26 px.
- **Emoji as a design element:** every event carries an emoji that appears in
  the map pin, the card tile, and cluster groupings. There are 16 fixed
  profile interests, each emoji-tagged (🎬 Films, ☕ Coffee, 🏃 Running,
  📚 Books, 🎧 Music, 🍜 Food, ✈️ Travel, 📷 Photography, 🎨 Art, 🎮 Games,
  💪 Fitness, 🧘 Yoga, 💻 Tech, 🌲 Outdoors, 🌃 Nightlife, ⚡ Spontaneous).
- **Illustration:** none. The app ships zero illustration assets — empty
  states use a single large emoji.
- **Photography:** only user/imported event posters and user avatars.
- **App icon:** ⚠️ **does not exist yet.** `assets/images/` is empty and
  `app.json` declares no `icon` / `splash.image` / `adaptiveIcon.foregroundImage`.
  Only the splash background colour (`#0E0E10`) is defined. The in-app auth
  screen shows a placeholder: a 56 px **ink rounded-square with a white "M"**.
  A master icon must therefore be *designed*, not extracted.

---

## 7. Map styling

Native iOS uses **Apple Maps** via `react-native-maps`; web uses MapLibre GL.
A `MapStyleSwitcher` offers multiple styles (default `streets`). Markers are
clustered with `supercluster`. The map is full-bleed, with floating overlays:
search bar + filter row pinned to the top safe area, style switcher on the
right, and a bottom-right stack of a recenter control above the coral create
FAB. Event details arrive as a **bottom peek sheet** on mobile.

---

## 8. Art-direction rules for store assets

**Do**
- Keep paper `#F6F4EE` / ink `#0E0E10` as the dominant relationship.
- Use coral `#FE5800` sparingly — as the single point of energy, ideally on
  the same element it means in-product (create/host).
- Use indigo `#4B5FE0` for secondary highlights and connective graphics.
- Use the −4° rounded-square pin as a repeatable brand motif.
- Set headlines in Manrope Bold, large, tight leading, sentence case with a
  full stop — matching "Welcome back." and "Set up your profile."
- Keep generous whitespace and let the real UI be the hero.

**Don't**
- No neon glows, no 3D blobs, no glassmorphism, no multi-stop gradients.
- Don't recolour the UI or invent controls.
- Don't put coral on everything — it breaks the product's one-accent rule.
- Don't set headlines in a serif; the mobile product has no serif.
