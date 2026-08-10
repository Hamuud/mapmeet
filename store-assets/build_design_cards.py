#!/usr/bin/env python3
"""
Builds the Claude Design card bundle for the MapMeet store campaign.

Each card is a self-contained HTML preview that renders one deliverable
(or one brand foundation) in the app's own palette and type, with the spec
a reviewer needs: canvas size, the real source screenshot, and the copy.

Output: store-assets/design-cards/
Run:    python3 store-assets/build_design_cards.py
"""

from __future__ import annotations

import os
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "design-cards")

PAPER = "#F6F4EE"
INK = "#0E0E10"
PANEL = "#FDFCF8"
INDIGO = "#4B5FE0"
CORAL = "#FE5800"
MUTED = "#8B8880"
BORDER = "#E4E1D8"

BASE_CSS = f"""
  *,*::before,*::after{{box-sizing:border-box}}
  body{{margin:0;background:{PAPER};color:{INK};
    font:400 14px/1.45 -apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;
    -webkit-font-smoothing:antialiased}}
  .wrap{{padding:24px}}
  .eyebrow{{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:{MUTED};margin:0 0 6px}}
  h1{{font-size:20px;font-weight:700;letter-spacing:-.02em;margin:0 0 4px}}
  .sub{{color:{MUTED};margin:0 0 18px;font-size:13px}}
  .shot{{display:block;width:100%;height:auto;border-radius:14px;
    border:1px solid {BORDER};background:{PANEL}}}
  .meta{{margin-top:16px;border-top:1px solid {BORDER};padding-top:12px;
    display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:12px}}
  .meta dt{{color:{MUTED};font-weight:500}}
  .meta dd{{margin:0}}
  code{{font:500 11.5px/1.4 ui-monospace,'SF Mono',monospace;
    background:rgba(75,95,224,.09);color:{INDIGO};padding:1px 5px;border-radius:5px}}
"""


def page(title: str, body: str, extra_css: str = "") -> str:
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{title}</title><style>{BASE_CSS}{extra_css}</style></head>"
        f"<body><div class='wrap'>{body}</div></body></html>"
    )


def screen_card(group, png, title, canvas, headline, sub, source, note):
    marker = f'<!-- @dsCard group="{group}" -->\n'
    body = f"""
      <p class="eyebrow">{group}</p>
      <h1>{title}</h1>
      <p class="sub">{headline} — {sub}</p>
      <img class="shot" src="{png}" alt="{title}">
      <dl class="meta">
        <dt>Canvas</dt><dd><code>{canvas}</code></dd>
        <dt>Headline</dt><dd>{headline}</dd>
        <dt>Sub</dt><dd>{sub}</dd>
        <dt>Source UI</dt><dd><code>{source}</code></dd>
        <dt>Direction</dt><dd>{note}</dd>
      </dl>"""
    return marker + page(title, body)


SCREENS = [
    ("01", "Everything happening near you.", "On one live map.",
     "05-map-hero.png", "Paper ground. Device cropped past the tab bar so the map runs off canvas."),
    ("02", "Tap a pin. Know everything.", "Time, place, host, who's going.",
     "06-event-preview-hosting.png", "Preview sheet on the optical centre; attendee row in the eye line."),
    ("03", "47 events within 5 km.", "Tonight, tomorrow, this weekend.",
     "10-events-nearby.png", "Real count from the live database — specificity over adjectives."),
    ("04", "Join, and you're in the chat.", "Every event gets its own group.",
     "08-chat-thread.png", "The one ink panel in the set: marks the turn from browsing to belonging."),
    ("05", "Drop a pin. Start a plan.", "Hosting takes about a minute.",
     "22-create-pin-placement.png", "Coral pending marker is the only strong colour in the frame."),
    ("06", "Real profiles. Real ratings.", "See who you're meeting before you go.",
     "11-profile-you.png", "Closing panel: smaller device, monogram + wordmark lockup below."),
]


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "assets"), exist_ok=True)

    # ── copy the finished deliverables next to their cards ───────────────
    for n, *_ in SCREENS:
        shutil.copy(os.path.join(ROOT, "app-store", "iphone", f"appstore_iphone_{n}.png"),
                    os.path.join(OUT, "assets", f"appstore_iphone_{n}.png"))
        shutil.copy(os.path.join(ROOT, "google-play", "phone", f"googleplay_phone_{n}.png"),
                    os.path.join(OUT, "assets", f"googleplay_phone_{n}.png"))
    for f in ("app-store/app_icon_1024.png",
              "google-play/googleplay_icon_512.png",
              "google-play/googleplay_feature_graphic.png"):
        shutil.copy(os.path.join(ROOT, f), os.path.join(OUT, "assets", os.path.basename(f)))

    # ── App Store + Google Play screen cards ─────────────────────────────
    for n, head, sub, src, note in SCREENS:
        open(os.path.join(OUT, f"app-store-{n}.html"), "w").write(
            screen_card("App Store · iPhone", f"assets/appstore_iphone_{n}.png",
                        f"Screen {n} — {head}", "1320 × 2868", head, sub, f"raw-ios/{src}", note))
        open(os.path.join(OUT, f"google-play-{n}.html"), "w").write(
            screen_card("Google Play · Phone", f"assets/googleplay_phone_{n}.png",
                        f"Screen {n} — {head}", "1080 × 1920", head, sub, f"raw-ios/{src}",
                        note + " Recomposed for the shorter canvas — type at 78 %, harder bottom crop."))

    # ── icons ────────────────────────────────────────────────────────────
    icon_css = ".icons{display:flex;gap:28px;align-items:flex-end}.icons img{border-radius:22%;width:180px;height:180px;border:1px solid " + BORDER + "}.icons .sm{width:96px;height:96px}"
    open(os.path.join(OUT, "app-icon.html"), "w").write(
        '<!-- @dsCard group="Brand" -->\n' + page("App icon", f"""
          <p class="eyebrow">Brand</p>
          <h1>App icon</h1>
          <p class="sub">Designed, not extracted — the repo ships no icon.</p>
          <div class="icons">
            <img src="assets/app_icon_1024.png" alt="App Store icon 1024">
            <img class="sm" src="assets/googleplay_icon_512.png" alt="Play icon 512">
          </div>
          <dl class="meta">
            <dt>Sizes</dt><dd><code>1024 × 1024</code> App Store · <code>512 × 512</code> Google Play</dd>
            <dt>Ground</dt><dd>Ink <code>#0E0E10</code>, full bleed, corners left unmasked</dd>
            <dt>Mark</dt><dd>The app's own −4° rounded-square map marker in paper, carrying the auth-screen "M"</dd>
            <dt>Accent</dt><dd>The marker's point dot in coral <code>#FE5800</code> — the single accent</dd>
            <dt>Action</dt><dd>Adopt into <code>app.json</code> as <code>icon</code>, <code>splash.image</code> and <code>adaptiveIcon.foregroundImage</code></dd>
          </dl>""", icon_css))

    open(os.path.join(OUT, "feature-graphic.html"), "w").write(
        '<!-- @dsCard group="Google Play · Phone" -->\n' + page("Feature graphic", """
          <p class="eyebrow">Google Play</p>
          <h1>Feature graphic</h1>
          <p class="sub">Everything happening near you.</p>
          <img class="shot" src="assets/googleplay_feature_graphic.png" alt="Feature graphic">
          <dl class="meta">
            <dt>Canvas</dt><dd><code>1024 × 500</code></dd>
            <dt>Left 58 %</dt><dd>Ink panel — monogram, MapMeet wordmark, one-line promise</dd>
            <dt>Right 42 %</dt><dd>Real map crop with indigo clusters, feathered into the panel</dd>
            <dt>Safety</dt><dd>Nothing critical within 12 % of any edge — Play crops this hard</dd>
          </dl>"""))

    # ── foundations ──────────────────────────────────────────────────────
    swatches = [("Paper", PAPER, "App background"), ("Ink", INK, "Text + primary action"),
                ("Panel", PANEL, "Cards, sheets, rails"), ("Indigo", INDIGO, "Info accent, clusters, tags"),
                ("Coral", CORAL, "Create only — one per screen"), ("Muted", MUTED, "Secondary text"),
                ("Border", BORDER, "Hairlines")]
    rows = "".join(
        f"<div class='sw'><span style='background:{hexv};'></span>"
        f"<b>{name}</b><code>{hexv}</code><i>{use}</i></div>" for name, hexv, use in swatches)
    open(os.path.join(OUT, "colour.html"), "w").write(
        '<!-- @dsCard group="Foundations" -->\n' + page("Colour", f"""
          <p class="eyebrow">Foundations</p>
          <h1>Colour</h1>
          <p class="sub">Ink on paper, one informational accent, one reserved accent. No gradients anywhere in the product.</p>
          {rows}""",
          ".sw{display:grid;grid-template-columns:44px 90px 96px 1fr;align-items:center;gap:12px;"
          f"padding:9px 0;border-bottom:1px solid {BORDER}}}"
          f".sw span{{width:44px;height:32px;border-radius:9px;border:1px solid {BORDER};display:block}}"
          ".sw b{font-weight:600}" f".sw i{{font-style:normal;color:{MUTED};font-size:12px}}"))

    open(os.path.join(OUT, "type.html"), "w").write(
        '<!-- @dsCard group="Foundations" -->\n' + page("Type", f"""
          <p class="eyebrow">Foundations</p>
          <h1>Type</h1>
          <p class="sub">SF Pro — the face the app actually renders on iOS. Manrope is declared in Tailwind but only loads on web.</p>
          <p class="d1">Everything happening near you.</p>
          <p class="d2">Store headline — Bold, −2 % tracking, 1.08 leading, sentence case with a full stop.</p>
          <p class="lbl">Field label · 11 px semibold uppercase</p>
          <dl class="meta">
            <dt>Headline</dt><dd>8.8 % of canvas width, shrink-to-fit, max 3 lines (2 on Play)</dd>
            <dt>Subheadline</dt><dd>42 % of headline size, Medium, muted</dd>
            <dt>Never</dt><dd>No serif — the mobile product has none</dd>
          </dl>""",
          ".d1{font-size:32px;font-weight:700;letter-spacing:-.02em;line-height:1.08;margin:18px 0 6px}"
          f".d2{{color:{MUTED};font-size:13px;margin:0 0 18px}}"
          f".lbl{{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:{MUTED}}}"))

    open(os.path.join(OUT, "marks.html"), "w").write(
        '<!-- @dsCard group="Foundations" -->\n' + page("Marks & motifs", f"""
          <p class="eyebrow">Foundations</p>
          <h1>Marks & motifs</h1>
          <p class="sub">Both come straight out of the product — nothing here was invented for the campaign.</p>
          <div class="row">
            <div class="cell"><div class="mono">M</div><b>Monogram</b><i>Auth screen, 18 px radius</i></div>
            <div class="cell"><div class="pin">☕</div><b>Map marker</b><i>−4°, bottom-left clip, point dot</i></div>
            <div class="cell"><div class="clu">6</div><b>Cluster</b><i>Indigo fill, white ring, ink count</i></div>
          </div>
          <dl class="meta">
            <dt>Continuity</dt><dd>An indigo rule under the copy grows across screens 01 → 06</dd>
            <dt>Rule</dt><dd>Exactly one coral element per composition, and only where the source UI already has one</dd>
          </dl>""",
          ".row{display:flex;gap:26px;margin:20px 0 4px}"
          ".cell{text-align:center}.cell b{display:block;margin-top:10px;font-weight:600;font-size:12px}"
          f".cell i{{display:block;font-style:normal;color:{MUTED};font-size:11px;margin-top:2px}}"
          f".mono{{width:64px;height:64px;border-radius:18px;background:{INK};color:{PAPER};"
          "font-size:30px;font-weight:700;display:grid;place-items:center}"
          f".pin{{width:64px;height:64px;border-radius:26px;border-bottom-left-radius:6px;background:{PANEL};"
          f"border:1px solid {BORDER};transform:rotate(-4deg);font-size:28px;display:grid;place-items:center}}"
          f".clu{{width:64px;height:64px;border-radius:50%;background:{INDIGO};color:#fff;border:3px solid #fff;"
          "box-shadow:0 2px 8px rgba(0,0,0,.18);font-size:20px;font-weight:700;display:grid;place-items:center}"))

    print("cards:", len([f for f in os.listdir(OUT) if f.endswith(".html")]),
          "assets:", len(os.listdir(os.path.join(OUT, "assets"))))


if __name__ == "__main__":
    main()
