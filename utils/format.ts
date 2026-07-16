/** Best-effort locale-aware formatting helpers used across cards & sheets. */

export function formatEventDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
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
  return date.toLocaleTimeString(undefined, {
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
    const rtf = new RTF(undefined, { numeric: 'auto' });
    if (abs < 60) return rtf.format(diff, 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86_400), 'day');
  }

  const suffix = diff <= 0 ? ' ago' : '';
  if (abs < 60) return 'now';
  if (abs < 3600) return `${Math.floor(abs / 60)}m${suffix}`;
  if (abs < 86_400) return `${Math.floor(abs / 3600)}h${suffix}`;
  if (abs < 604_800) return `${Math.floor(abs / 86_400)}d${suffix}`;
  return new Date(iso).toLocaleDateString();
}
