import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/services/supabase';

/** How long a "still typing" ping keeps someone in the list. Slightly
 *  longer than the send interval below, so a steady typist never
 *  flickers out between pings. */
const EXPIRE_MS = 4500;
/** Don't broadcast on every keystroke. One ping every couple of seconds
 *  is enough to hold the indicator up, and costs a message instead of
 *  thirty. */
const PING_MS = 2000;

type Typer = { id: string; name: string; at: number };

/** Who else is typing in this room, and a way to say that you are.
 *
 *  Broadcast, not a table. Typing is the most disposable state in a
 *  chat app — true for two seconds, worthless after — and writing it to
 *  Postgres would mean a row per keystroke burst, a realtime fanout per
 *  write, and a cleanup job for the ones nobody cleared. Broadcast
 *  reaches exactly the people in the room and leaves nothing behind.
 *
 *  NOTE the plain `supabase.channel` here rather than this project's
 *  `openChannel` helper. That helper appends a unique suffix so
 *  postgres_changes subscriptions cannot collide, which is right for
 *  them and fatal here: broadcast delivers to a topic, so every client
 *  in the room has to name it identically. Hence a shared, derived
 *  name.
 *
 *  Self-pings are dropped on receipt rather than not sent, because
 *  Supabase's own `self: false` only applies to some transports and
 *  seeing "you are typing" is a memorable kind of broken. */
export function useTyping(
  /** Stable room key, e.g. `event:<id>`. Null disables the hook. */
  roomKey: string | null,
  viewerId: string | null,
  displayName: string,
) {
  const [typers, setTypers] = useState<Typer[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastPing = useRef(0);
  const nameRef = useRef(displayName);
  nameRef.current = displayName;

  useEffect(() => {
    if (!roomKey || !viewerId) {
      setTypers([]);
      return;
    }
    const channel = supabase.channel(`typing:${roomKey}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const p = payload.payload as { id?: string; name?: string } | undefined;
        if (!p?.id || p.id === viewerId) return;
        const name = p.name || '';
        setTypers((prev) => {
          const rest = prev.filter((x) => x.id !== p.id);
          return [...rest, { id: p.id!, name, at: Date.now() }];
        });
      })
      .subscribe();
    channelRef.current = channel;

    // Nobody sends a "stopped typing" — they just stop, or close the
    // app, or lose signal. Expiry is what makes the indicator honest.
    const sweep = setInterval(() => {
      const cutoff = Date.now() - EXPIRE_MS;
      setTypers((prev) => {
        const next = prev.filter((x) => x.at > cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 1000);

    return () => {
      clearInterval(sweep);
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setTypers([]);
    };
  }, [roomKey, viewerId]);

  /** Call on every keystroke; throttled internally. */
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (!channelRef.current || !viewerId) return;
    if (now - lastPing.current < PING_MS) return;
    lastPing.current = now;
    void channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { id: viewerId, name: nameRef.current },
    });
  }, [viewerId]);

  return { typers, notifyTyping };
}
