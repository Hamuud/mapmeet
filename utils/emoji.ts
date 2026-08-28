/** Pull the first single emoji out of arbitrary input.
 *
 *  Written by hand rather than with `\p{Extended_Pictographic}` or
 *  `Intl.Segmenter`: Hermes' support for both varies by version, and a
 *  field that silently stops accepting emoji on some devices is worse
 *  than a table that is a little approximate at the edges.
 *
 *  "One emoji" is not one character. A rainbow flag is four code points
 *  (🏳 + VS16 + ZWJ + 🌈), a family is seven, and a skin-toned wave is
 *  two — so this walks the cluster rather than slicing, and returns the
 *  whole of it or nothing. Nothing is the important half: typing a
 *  letter has to be rejected, not accepted-and-trimmed. */

const ZWJ = 0x200d;
const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const KEYCAP = 0x20e3;

const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;
const isRegional = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
/** Tag characters, used to spell out subdivision flags like 🏴󠁧󠁢󠁳󠁣󠁴󠁿. */
const isTag = (cp: number) => cp >= 0xe0020 && cp <= 0xe007f;
/** 0–9, # and *, the only bases a keycap can sit on. */
const isKeycapBase = (cp: number) =>
  cp === 0x23 || cp === 0x2a || (cp >= 0x30 && cp <= 0x39);

/** Approximates Unicode's Extended_Pictographic property.
 *
 *  Deliberately generous inside the emoji blocks and deliberately silent
 *  about everything else: the job is to separate "an emoji" from "the
 *  letter a", not to police which pictographs exist. Unassigned code
 *  points inside these ranges render as tofu, which the user can see and
 *  fix; letters getting through would be the actual bug. */
function isPictographic(cp: number): boolean {
  return (
    cp === 0xa9 || // ©
    cp === 0xae || // ®
    cp === 0x203c ||
    cp === 0x2049 ||
    cp === 0x2122 ||
    cp === 0x2139 ||
    (cp >= 0x2194 && cp <= 0x21aa) ||
    (cp >= 0x231a && cp <= 0x23fa) ||
    cp === 0x24c2 ||
    (cp >= 0x25aa && cp <= 0x25fe) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x2934 && cp <= 0x2935) ||
    (cp >= 0x2b00 && cp <= 0x2bff) ||
    cp === 0x3030 ||
    cp === 0x303d ||
    cp === 0x3297 ||
    cp === 0x3299 ||
    (cp >= 0x1f000 && cp <= 0x1faff)
  );
}

/** The first complete emoji in `input`, or null if it does not start
 *  with one. Anything after that first emoji is dropped — pasting a
 *  sentence full of them keeps the first and discards the rest. */
export function firstEmoji(input: string): string | null {
  // Array.from splits on code points, so surrogate pairs stay whole.
  const cps = Array.from(input.trim());
  if (cps.length === 0) return null;
  const at = (i: number) => cps[i]!.codePointAt(0)!;

  // Flags come in pairs of regional indicators. A lone one is a letter
  // in a box, not a flag, so it is rejected rather than kept.
  if (isRegional(at(0))) {
    return cps.length >= 2 && isRegional(at(1)) ? cps[0]! + cps[1]! : null;
  }

  // Keycaps: 1️⃣ is the digit, an optional variation selector, and the
  // enclosing keycap. Without the keycap it is just the digit 1.
  if (isKeycapBase(at(0))) {
    let k = 1;
    if (k < cps.length && at(k) === VS16) k += 1;
    return k < cps.length && at(k) === KEYCAP ? cps.slice(0, k + 1).join('') : null;
  }

  if (!isPictographic(at(0))) return null;

  let i = 1;
  for (;;) {
    // Modifiers that attach to the pictograph just consumed.
    while (
      i < cps.length &&
      (at(i) === VS16 || at(i) === VS15 || isSkinTone(at(i)) || isTag(at(i)))
    ) {
      i += 1;
    }
    // A ZWJ only continues the cluster if something joinable follows it.
    // A trailing ZWJ is left out, so "👨‍" yields "👨".
    if (
      i + 1 < cps.length &&
      at(i) === ZWJ &&
      (isPictographic(at(i + 1)) || isRegional(at(i + 1)))
    ) {
      i += 2;
      continue;
    }
    break;
  }

  return cps.slice(0, i).join('');
}

/** True when `input` is exactly one emoji and nothing else. */
export function isSingleEmoji(input: string): boolean {
  const first = firstEmoji(input);
  return first !== null && first === input.trim();
}
