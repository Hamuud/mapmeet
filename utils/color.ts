/** Colour conversions for the pin picker.
 *
 *  HSV rather than HSL because the picker is the Photoshop one: a
 *  saturation/brightness square under a hue strip maps directly onto
 *  H, S and V, and onto nothing in HSL without a change of basis.
 *
 *  `h` is 0–360 and wraps; `s` and `v` are 0–1. Hex is always
 *  `#RRGGBB`, upper case, because that is what the database stores and
 *  what `HEX_RE` in pinStyle matches. */
export type Hsv = { h: number; s: number; v: number };
export type Rgb = { r: number; g: number; b: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 0–1 → two hex digits. */
function byte(n: number): string {
  return clamp(Math.round(n * 255), 0, 255)
    .toString(16)
    .padStart(2, '0');
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  // Wrap rather than clamp: dragging past the end of the hue strip
  // should come round to red again, not stick on magenta.
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const val = clamp(v, 0, 1);

  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;

  const seg = Math.floor(hue / 60) % 6;
  const [r, g, b] =
    seg === 0
      ? [c, x, 0]
      : seg === 1
        ? [x, c, 0]
        : seg === 2
          ? [0, c, x]
          : seg === 3
            ? [0, x, c]
            : seg === 4
              ? [x, 0, c]
              : [c, 0, x];

  return { r: r + m, g: g + m, b: b + m };
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  // Grey has no hue and max === 0 has no saturation. Both fall out as 0,
  // which is why the picker keeps its own `h` rather than round-tripping
  // through the hex: dragging brightness to black would otherwise reset
  // the hue strip to red and lose where the user was.
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex(hsv: Hsv): string {
  const { r, g, b } = hsvToRgb(hsv);
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
}

/** Parse `#RGB` or `#RRGGBB`, with or without the hash. Null when it is
 *  not a colour — callers use that to leave a half-typed field alone. */
export function hexToRgb(hex: string): Rgb | null {
  const raw = hex.trim().replace(/^#/, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function hexToHsv(hex: string): Hsv | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsv(rgb) : null;
}

/** Rough perceptual lightness, 0–1. Enough to decide whether a knob or a
 *  tick drawn on this colour should be black or white. */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  return rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
}
