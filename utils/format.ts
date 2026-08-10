/** Locale-aware formatting helpers used across cards & sheets.
 *
 *  These read the chosen language from the store at call time rather
 *  than taking it as an argument: they're called from dozens of render
 *  paths, and every screen that shows a date also shows translated text
 *  next to it, so a language switch repaints them along with everything
 *  else. */

import { currentBcp47, t } from '@/i18n';

export function formatEventDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(currentBcp47(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatEventTime(time: string): string {
  // time comes in as "HH:MM" or "HH:MM:SS"
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString(currentBcp47(), {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.round((then - now) / 1000);
  const abs = Math.abs(diff);

  // Hermes on iOS ships without Intl.RelativeTimeFormat (only part of
  // Intl is compiled in) — constructing it crashes the whole screen.
  // Feature-detect and fall back to compact hand-rolled labels, which
  // is also closer to what a chat list wants ("5m ago" beats
  // "5 minutes ago" in a one-line preview row).
  const RTF = (Intl as { RelativeTimeFormat?: typeof Intl.RelativeTimeFormat })
    .RelativeTimeFormat;
  if (typeof RTF === 'function') {
    const rtf = new RTF(currentBcp47(), { numeric: 'auto' });
    if (abs < 60) return rtf.format(diff, 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86_400), 'day');
  }

  if (abs < 60) return t('time.now');
  const short =
    abs < 3600
      ? t('time.minutesShort', { n: Math.floor(abs / 60) })
      : abs < 86_400
        ? t('time.hoursShort', { n: Math.floor(abs / 3600) })
        : abs < 604_800
          ? t('time.daysShort', { n: Math.floor(abs / 86_400) })
          : null;
  if (short === null) return new Date(iso).toLocaleDateString(currentBcp47());
  return diff <= 0 ? t('time.agoSuffix', { v: short }) : short;
}
