# MapMeet — Store Asset Design Brief

Complete art direction for the App Store and Google Play package. Everything
here is derived from the real running app; nothing is invented.

---

## 0. Inputs

| Input | Location / value |
| --- | --- |
| Raw UI screenshots | `store-assets/raw-ios/` — 23 files, 1320 × 2868, iPhone 16 Pro Max |
| Brand mark | In-app monogram: ink `#0E0E10` rounded-square, 18 px radius, paper `#F6F4EE` "M" (see `raw-ios/00-login.png`) |
| Logo file | **None exists.** Icon designed from the monogram; delivered as `app-store/app_icon_1024.png` |
| Typeface | **SF Pro Display** (`/System/Library/Fonts/SFNS.ttf`) — the face the app actually renders on iOS |
| Palette | Paper `#F6F4EE` · Ink `#0E0E10` · Panel `#FDFCF8` · Indigo `#4B5FE0` · Coral `#FE5800` · Muted `#8B8880` · Border `#E4E1D8` |
| Design system | `store-assets/analysis/design-system.md` |
| Product & audience | `store-assets/analysis/product-analysis.md` |
| Campaign narrative | `store-assets/analysis/screenshot-strategy.md` |

---

## 1. Product summary (for anyone composing an asset)

MapMeet puts every event near you — both user-created meetups and real ticketed
city events — on one live map, and drops you into the event's group chat the
moment you join. Audience: 18–34, Kyiv-first, spontaneous, social. Tone: calm,
editorial, confident. Not a party app; a city app.

---

## 2. Universal composition rules

Applies to all 12 promotional screenshots.

- **Safe margins:** 8 % of canvas width left/right, 6 % top, 5 % bottom. No text
  or device edge inside those bands.
- **Headline block:** starts at 9 % of canvas height. Left-aligned to the left
  gutter. SF Pro Display **Bold**, tracking −2 %, line height 1.08. Sentence case
  with a terminal full stop.
- **Subheadline:** 42 % of the headline size, SF Pro Display **Medium**, muted
  `#8B8880` on paper / `#8A8A94` on ink, one line, 0.55 × headline size below it.
- **Device:** thin ink bezel (bezel thickness = 1.1 % of canvas width), corner
  radius scaled from the source screenshot's own 55 px @3× device radius. The
  screenshot is pasted at native aspect and **never stretched** — width is the
  only degree of freedom.
- **Crop, don't shrink:** where the device must be smaller in frame, crop it at
  the bottom canvas edge instead of scaling the whole phone down. Tiny phones
  read as weak.
- **Colour discipline:** exactly one coral element per composition, and only when
  coral is already present in the source UI. Indigo may appear in connective
  graphics. Everything else is paper, ink, panel and muted.
- **No invented UI.** Do not add badges, arrows, counters, cursors or callouts
  that the app does not render. Do not recolour any part of a screenshot.
- **Legibility test:** every headline must survive being scaled to 240 px wide
  (store thumbnail) and remain readable.

---

## 3. Per-asset art direction

### App Store — iPhone · 1320 × 2868 · portrait

| File | Headline | Sub | Source | Background | Notes |
| --- | --- | --- | --- | --- | --- |
| `appstore_iphone_01.png` | Everything happening near you. | On one live map. | `05-map-hero.png` | Paper | Path enters bottom-left; faint −4° pin motif top-right; device cropped at bottom edge |
| `appstore_iphone_02.png` | Tap a pin. Know everything. | Time, place, host, who's going. | `06-event-preview-hosting.png` | Paper | Bottom sheet on optical centre; no extra decoration |
| `appstore_iphone_03.png` | 47 events within 5 km. | Tonight, tomorrow, this weekend. | `10-events-nearby.png` | Paper | Concentric radius ring behind device, indigo @ 8 % |
| `appstore_iphone_04.png` | Join, and you're in the chat. | Every event gets its own group. | `08-chat-thread.png` | **Ink** | Paper headline; device at 80 % width so bubbles read |
| `appstore_iphone_05.png` | Drop a pin. Start a plan. | Hosting takes about a minute. | `22-create-pin-placement.png` | Paper | Path terminates at the coral pending marker |
| `appstore_iphone_06.png` | Real profiles. Real ratings. | See who you're meeting before you go. | `11-profile-you.png` | Paper | Path exits top-right; monogram + "MapMeet" lockup under device |

### Google Play — phone · 1080 × 1920 · portrait

Same narrative, **recomposed** for the shorter canvas — not resized.

| File | Source | Change from App Store version |
| --- | --- | --- |
| `googleplay_phone_01.png` | `05-map-hero.png` | Headline 2 lines; device raised, cropped ~12 % harder at bottom |
| `googleplay_phone_02.png` | `06-event-preview-hosting.png` | Sheet pinned to lower third; headline tightened |
| `googleplay_phone_03.png` | `10-events-nearby.png` | Radius ring reduced; three cards visible instead of four |
| `googleplay_phone_04.png` | `08-chat-thread.png` | Ink background retained; chat cropped to the six most legible bubbles |
| `googleplay_phone_05.png` | `22-create-pin-placement.png` | Coral marker recentred for the new aspect |
| `googleplay_phone_06.png` | `11-profile-you.png` | Monogram lockup moves beside the headline |

Type scale for Play = **78 %** of the App Store scale, so the text-to-device
ratio is preserved.

### App icon — 1024 × 1024

The app has no icon. Design intent, taken directly from the in-app monogram and
the map-marker language:

- Ground: ink `#0E0E10`, full bleed, no rounded corners baked in (Apple masks).
- Mark: the app's own **−4° rounded-square map pin** silhouette in paper
  `#F6F4EE`, centred, occupying ~54 % of the canvas, with the 4 px-equivalent
  bottom-left corner clip scaled up proportionally.
- Inside the pin: a bold **"M"** in ink, set in SF Pro Display Heavy.
- Below the pin: the marker's signature 6 px point dot, scaled, in coral
  `#FE5800` — the single accent, and the one element that ties the icon to the
  create-FAB.
- No gradient, no glow, no bevel, no text.

### Google Play icon — 512 × 512

Same artwork, re-rendered at 512 (not downsampled from a JPEG-ish source), with
stroke weights and the dot re-scaled so they read at 48 px in the Play list.

### Google Play feature graphic — 1024 × 500

- Left 58 %: ink panel carrying the monogram + **MapMeet** wordmark and the line
  `Everything happening near you.` in SF Pro Display Bold.
- Right 42 %: a cropped band of the real map from `05-map-hero.png`, showing
  indigo clusters and one −4° pin, bleeding off the right edge.
- One coral accent: the create FAB visible in the map crop.
- No feature list, no screenshots-within-screenshots, no small type. Nothing
  critical within 12 % of any edge (Play crops this graphic aggressively).

---

## 4. Output manifest

```
store-assets/
  analysis/
    product-analysis.md
    design-system.md
    screenshot-strategy.md
    claude-design-brief.md
  raw-ios/                     23 × 1320 × 2868
  app-store/
    app_icon_1024.png          1024 × 1024
    iphone/
      appstore_iphone_01.png … _06.png    1320 × 2868
  google-play/
    googleplay_icon_512.png              512 × 512
    googleplay_feature_graphic.png      1024 × 500
    phone/
      googleplay_phone_01.png … _06.png  1080 × 1920
```

**iPad:** intentionally omitted. The app does render a genuine tablet layout
(a left event rail beside a full-bleed map), but the product owner confirmed
MapMeet is a phone-first product and iPad store assets are not wanted.

---

## 5. Hard constraints

1. Every output must be PNG at exactly the stated pixel dimensions — verified
   programmatically, not assumed.
2. Source UI is never distorted, recoloured, or edited beyond uniform scaling
   and cropping.
3. No feature is implied that the app does not have.
4. No real user's name, avatar, message or email appears anywhere. All visible
   people are demo accounts created for this shoot (`@mayakov`, `@danylo`,
   `@sofiia`, `@ihor`).
5. Headlines: 4–7 words, sentence case, one full stop, no exclamation marks.
