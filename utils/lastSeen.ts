/** Treat someone as "Online" if their last heartbeat was within this
 *  window. The heartbeat fires ~every 45s, so 90s tolerates one miss. */
export const ONLINE_WINDOW_MS = 90_000;

function timeOfDay(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Telegram-style presence label from a `last_seen_at` ISO timestamp:
 *  "Online", "last seen just now", "last seen 12 minutes ago",
 *  "last seen at 14:30", "last seen yesterday at 22:10", or a date. */
export function formatLastSeen(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'last seen recently';
  const seen = new Date(iso);
  if (Number.isNaN(seen.getTime())) return 'last seen recently';

  const diff = now.getTime() - seen.getTime();
  if (diff < ONLINE_WINDOW_MS) return 'Online';
  if (diff < 60_000) return 'last seen just now';

  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `last seen ${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;

  if (sameDay(seen, now)) return `last seen at ${timeOfDay(seen)}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(seen, yesterday)) return `last seen yesterday at ${timeOfDay(seen)}`;

  return `last seen ${seen.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** True when the timestamp counts as currently online. */
export function isOnline(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && now.getTime() - t < ONLINE_WINDOW_MS;
}
