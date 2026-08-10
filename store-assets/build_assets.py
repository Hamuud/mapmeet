#!/usr/bin/env python3
"""
MapMeet store-asset compositor.

Builds the App Store and Google Play promotional images from the real iOS
Simulator captures in store-assets/raw-ios/, following
store-assets/analysis/claude-design-brief.md.

Type is SF Pro Display — the face the app actually renders on device.
Palette, radii and the one-accent rule come from analysis/design-system.md.

Run:  python3 store-assets/build_assets.py
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "raw-ios")

# ── palette ───────────────────────────────────────────────────────────────
PAPER = (246, 244, 238)
INK = (14, 14, 16)
PANEL = (253, 252, 248)
INDIGO = (75, 95, 224)
CORAL = (254, 88, 0)
MUTED_ON_PAPER = (139, 136, 128)
MUTED_ON_INK = (138, 138, 148)
PAPER_TEXT = (245, 245, 242)

SF = "/System/Library/Fonts/SFNS.ttf"

# Source device geometry: iPhone 16 Pro Max @3x, 55 pt display corner radius.
SRC_W, SRC_H = 1320, 2868
SRC_RADIUS = 165


def font(size: int, weight: str = "Bold") -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(SF, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


# ── text helpers ──────────────────────────────────────────────────────────
def wrap(draw, text, fnt, max_w):
    """Wrap to max_w. A literal "|" in the copy forces a line break, so
    headlines never leave an orphan word on the last line."""
    out = []
    for segment in text.split("|"):
        out.extend(_wrap_segment(draw, segment.strip(), fnt, max_w))
    return out


def _wrap_segment(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=fnt) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit_headline(draw, text, max_w, start_size, max_lines, weight="Bold"):
    """Shrink until the headline fits max_lines within max_w."""
    size = start_size
    while size > 24:
        fnt = font(size, weight)
        lines = wrap(draw, text, fnt, max_w)
        if len(lines) <= max_lines:
            return fnt, lines, size
        size -= 3
    return font(size, weight), wrap(draw, text, font(size, weight), max_w), size


def draw_lines(draw, lines, fnt, x, y, fill, leading=1.08, tracking=-0.02):
    """Left-aligned block with negative tracking, returns the next baseline y."""
    step = int(fnt.size * leading)
    for line in lines:
        cx = x
        for ch in line:
            draw.text((cx, y), ch, font=fnt, fill=fill)
            cx += draw.textlength(ch, font=fnt) + fnt.size * tracking
        y += step
    return y


# ── shapes ────────────────────────────────────────────────────────────────
def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=255)
    return m


def paste_device(canvas, src_path, dev_w, top, bezel_ratio=0.011, shadow=True):
    """Composite a screenshot inside a thin ink bezel. Never distorts the UI."""
    W = canvas.width
    bezel = max(6, int(W * bezel_ratio))
    screen_w = dev_w - bezel * 2
    screen_h = int(round(screen_w * SRC_H / SRC_W))
    radius = int(round(SRC_RADIUS * screen_w / SRC_W))

    shot = Image.open(src_path).convert("RGB").resize((screen_w, screen_h), Image.LANCZOS)
    shot.putalpha(rounded_mask((screen_w, screen_h), radius))

    dev_h = screen_h + bezel * 2
    device = Image.new("RGBA", (dev_w, dev_h), (0, 0, 0, 0))
    ImageDraw.Draw(device).rounded_rectangle(
        [0, 0, dev_w - 1, dev_h - 1], radius + bezel, fill=INK + (255,)
    )
    device.alpha_composite(shot, (bezel, bezel))

    x = (W - dev_w) // 2
    if shadow:
        pad = int(dev_w * 0.10)
        sh = Image.new("RGBA", (dev_w + pad * 2, dev_h + pad * 2), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle(
            [pad, pad, pad + dev_w, pad + dev_h], radius + bezel, fill=(0, 0, 0, 70)
        )
        sh = sh.filter(ImageFilter.GaussianBlur(pad * 0.42))
        canvas.alpha_composite(sh, (x - pad, top - pad + int(dev_h * 0.012)))

    canvas.alpha_composite(device, (x, top))
    return x, top, dev_w, dev_h


def pin_shape(size, fill, letter=None, letter_fill=INK, rotate=-4, ss=4):
    """The app's own map marker: an 18 px-radius rounded square whose
    bottom-left corner drops to 4 px — `MapMarker.tsx` sets exactly that via
    `borderBottomLeftRadius`. Built as a mask so the tight corner is a real
    corner radius, not a notch cut out of a uniform rounded rect."""
    s = size * ss
    r = int(s * 0.41)          # rounded-2xl at marker scale
    clip = int(s * 0.10)       # the 4 px bottom-left radius, scaled

    mask = Image.new("L", (s, s), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, s - 1, s - 1], r,
                         corners=(True, True, True, False), fill=255)
    # Re-cut the sharp corner to the marker's small bottom-left radius.
    md.rectangle([0, s - 2 * clip, 2 * clip, s - 1], fill=0)
    md.rounded_rectangle([0, s - 2 * clip, 2 * clip, s - 1], clip,
                         corners=(False, False, False, True), fill=255)

    layer = Image.new("RGBA", (s, s), fill + (255,))
    layer.putalpha(mask)
    d = ImageDraw.Draw(layer)

    if letter:
        fnt = font(int(s * 0.62), "Heavy")
        bb = d.textbbox((0, 0), letter, font=fnt)
        d.text(
            ((s - (bb[2] - bb[0])) / 2 - bb[0], (s - (bb[3] - bb[1])) / 2 - bb[1]),
            letter, font=fnt, fill=letter_fill + (255,),
        )

    layer = layer.resize((size, size), Image.LANCZOS)
    if rotate:
        layer = layer.rotate(rotate, resample=Image.BICUBIC, expand=True)
    return layer


def route_path(canvas, points, width, colour, alpha):
    """A soft indigo route line, drawn behind the device."""
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = catmull(points, 60)
    d.line(pts, fill=colour + (alpha,), width=width, joint="curve")
    canvas.alpha_composite(layer)


def catmull(pts, steps):
    """Catmull-Rom through the control points, so the path reads as one stroke."""
    p = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(len(p) - 3):
        p0, p1, p2, p3 = p[i], p[i + 1], p[i + 2], p[i + 3]
        for j in range(steps):
            t = j / steps
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    return out


def monogram(size, bg=INK, fg=PAPER):
    """The in-app auth-screen mark: ink rounded square with a paper M."""
    ss = 4
    s = size * ss
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, s - 1, s - 1], int(s * 0.29), fill=bg + (255,))
    fnt = font(int(s * 0.58), "Bold")
    bb = d.textbbox((0, 0), "M", font=fnt)
    d.text(((s - (bb[2] - bb[0])) / 2 - bb[0], (s - (bb[3] - bb[1])) / 2 - bb[1]),
           "M", font=fnt, fill=fg + (255,))
    return im.resize((size, size), Image.LANCZOS)


# ── the six screens ───────────────────────────────────────────────────────
SCREENS = [
    dict(n=1, src="05-map-hero.png", dark=False,
         head="Everything happening|near you.", sub="On one live map."),
    dict(n=2, src="06-event-preview-hosting.png", dark=False,
         head="Tap a pin.|Know everything.", sub="Time, place, host, who's going."),
    dict(n=3, src="10-events-nearby.png", dark=False,
         head="47 events|within 5 km.", sub="Tonight, tomorrow, this weekend."),
    dict(n=4, src="08-chat-thread.png", dark=True,
         head="Join, and you're|in the chat.", sub="Every event gets its own group.",
         dev_pct=0.84),
    dict(n=5, src="22-create-pin-placement.png", dark=False,
         head="Drop a pin.|Start a plan.", sub="Hosting takes about a minute."),
    dict(n=6, src="11-profile-you.png", dark=False,
         head="Real profiles.|Real ratings.", sub="See who you're meeting before you go.",
         dev_pct=0.66, lockup=True),
]


def build_screen(spec, W, H, scale, out):
    dark = spec["dark"]
    bg = INK if dark else PAPER
    fg = PAPER_TEXT if dark else INK
    muted = MUTED_ON_INK if dark else MUTED_ON_PAPER

    canvas = Image.new("RGBA", (W, H), bg + (255,))
    d = ImageDraw.Draw(canvas)

    margin = int(W * 0.08)
    max_w = W - margin * 2
    max_lines = 2 if scale < 1 else 3

    fnt, lines, size = fit_headline(d, spec["head"], max_w, int(W * 0.088), max_lines)
    head_top = int(H * 0.072)
    y = draw_lines(d, lines, fnt, margin, head_top, fg + (255,))

    sub_f = font(int(size * 0.42), "Medium")
    sub_y = int(y + size * 0.26)
    d.text((margin, sub_y), spec["sub"], font=sub_f, fill=muted + (255,))
    text_bottom = sub_y + int(sub_f.size * 1.35)

    # ── continuity device ────────────────────────────────────────────────
    # A single indigo rule under the copy that grows screen by screen, so the
    # six panels read as one series. Restrained on purpose: the app has no
    # gradients or ornament, and the UI is meant to be the hero.
    rule_w = int(max_w * (0.14 + 0.13 * (spec["n"] - 1)))
    rule_h = max(3, int(W * 0.0055))
    rule_y = text_bottom + int(H * 0.012)
    d.rounded_rectangle([margin, rule_y, margin + rule_w, rule_y + rule_h],
                        rule_h // 2, fill=INDIGO + (255,))
    text_bottom = rule_y + rule_h

    # ── device ───────────────────────────────────────────────────────────
    # 0.84 is the largest width that keeps both device edges outside the
    # 8 % safe margin.
    dev_pct = min(spec.get("dev_pct", 0.84), 0.84)
    dev_w = int(W * dev_pct)
    bezel = max(6, int(W * 0.011))
    screen_h = int(round((dev_w - bezel * 2) * SRC_H / SRC_W))
    dev_h = screen_h + bezel * 2

    if spec.get("lockup"):
        top = text_bottom + int(H * 0.050)
    else:
        # Crop past the tab bar so the UI clearly runs off canvas rather
        # than stopping just short of it.
        crop = int(dev_h * (0.125 if scale >= 1 else 0.125))
        top = max(text_bottom + int(H * 0.045), H - dev_h + crop)

    x, top, dw, dh = paste_device(canvas, os.path.join(RAW, spec["src"]), dev_w, top)

    # ── closing brand lockup (screen 06 only) ────────────────────────────
    if spec.get("lockup"):
        m_size = int(W * 0.072)
        m = monogram(m_size)
        word_f = font(int(W * 0.052), "Bold")
        word = "MapMeet"
        word_w = d.textlength(word, font=word_f)
        gap = int(W * 0.022)
        total = m_size + gap + word_w
        lx = int((W - total) / 2)
        ly = min(top + dh + int(H * 0.045), H - int(H * 0.05) - m_size)
        canvas.alpha_composite(m, (lx, ly))
        d.text((lx + m_size + gap, ly + (m_size - word_f.size) / 2 - int(W * 0.006)),
               word, font=word_f, fill=INK + (255,))

    canvas.convert("RGB").save(out, "PNG")
    return out


# ── icons and feature graphic ─────────────────────────────────────────────
def build_icon(size, out):
    ss = 3
    S = size * ss
    im = Image.new("RGBA", (S, S), INK + (255,))

    pin = pin_shape(int(S * 0.56), PAPER, letter="M", letter_fill=INK, rotate=-4)
    px = (S - pin.width) // 2
    py = int(S * 0.175)
    im.alpha_composite(pin, (px, py))

    d = ImageDraw.Draw(im)
    dot = int(S * 0.072)
    dx = (S - dot) // 2
    dy = py + pin.height + int(S * 0.008)   # small clear gap, as the marker has
    d.ellipse([dx, dy, dx + dot, dy + dot], fill=CORAL + (255,))

    im.resize((size, size), Image.LANCZOS).convert("RGB").save(out, "PNG")
    return out


def build_feature_graphic(out, W=1024, H=500):
    canvas = Image.new("RGBA", (W, H), INK + (255,))
    split = int(W * 0.58)

    # Right: a real crop of the live map, bleeding off the right edge.
    shot = Image.open(os.path.join(RAW, "05-map-hero.png")).convert("RGB")
    band_w, band_h = W - split, H
    src_ratio = band_w / band_h
    ch = int(SRC_W / src_ratio)
    top = int(SRC_H * 0.30)
    crop = shot.crop((0, top, SRC_W, min(SRC_H, top + ch))).resize((band_w, band_h), Image.LANCZOS)
    canvas.paste(crop, (split, 0))

    # Feathered seam so the ink panel reads as one surface with the map.
    fade = Image.new("L", (int(W * 0.09), H), 0)
    fd = ImageDraw.Draw(fade)
    for i in range(fade.width):
        fd.line([(i, 0), (i, H)], fill=int(255 * (1 - i / fade.width)))
    ink_band = Image.new("RGBA", fade.size, INK + (255,))
    ink_band.putalpha(fade)
    canvas.alpha_composite(ink_band, (split, 0))

    d = ImageDraw.Draw(canvas)
    pad = int(W * 0.055)
    m_size = int(H * 0.15)
    m = monogram(m_size, bg=PAPER, fg=INK)
    canvas.alpha_composite(m, (pad, int(H * 0.20)))

    word_f = font(int(H * 0.135), "Bold")
    d.text((pad + m_size + int(W * 0.018), int(H * 0.20) + (m_size - word_f.size) / 2 - 4),
           "MapMeet", font=word_f, fill=PAPER_TEXT + (255,))

    line_f = font(int(H * 0.098), "Medium")
    d.text((pad, int(H * 0.52)), "Everything happening", font=line_f, fill=PAPER_TEXT + (255,))
    d.text((pad, int(H * 0.52) + int(line_f.size * 1.15)), "near you.",
           font=line_f, fill=PAPER_TEXT + (255,))

    canvas.convert("RGB").save(out, "PNG")
    return out


def main():
    ios = os.path.join(ROOT, "app-store", "iphone")
    play = os.path.join(ROOT, "google-play", "phone")
    os.makedirs(ios, exist_ok=True)
    os.makedirs(play, exist_ok=True)

    for s in SCREENS:
        build_screen(s, 1320, 2868, 1.0,
                     os.path.join(ios, f"appstore_iphone_{s['n']:02d}.png"))
        build_screen(s, 1080, 1920, 0.78,
                     os.path.join(play, f"googleplay_phone_{s['n']:02d}.png"))

    build_icon(1024, os.path.join(ROOT, "app-store", "app_icon_1024.png"))
    build_icon(512, os.path.join(ROOT, "google-play", "googleplay_icon_512.png"))
    build_feature_graphic(os.path.join(ROOT, "google-play", "googleplay_feature_graphic.png"))
    print("built")


if __name__ == "__main__":
    main()
