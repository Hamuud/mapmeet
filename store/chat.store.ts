import { create } from 'zustand';

import { dmsService, type DmRoom } from '@/services/dms.service';
import { groupsService, type GroupRoom } from '@/services/groups.service';
import { messagesService, type ChatPreview } from '@/services/messages.service';

type ChatState = {
  /** eventId → preview (last message + unread count). */
  previews: Map<string, ChatPreview>;
  /** 1:1 rooms and friend group rooms — the Direct folder's data.
   *
   *  They live here rather than in the Chat screen's own state because
   *  the tab badge has to see them too, and a screen that is not
   *  mounted cannot tell the badge anything. */
  dms: DmRoom[];
  groups: GroupRoom[];
  /** Whether the direct rooms have come back at least once. Lets the
   *  list tell "still loading" apart from "you have none", which a bare
   *  empty array cannot. */
  directLoaded: boolean;
  /** Whether the last attempt failed. Same distinction, other end: an
   *  empty list because the network is down is not an empty inbox. */
  directFailed: boolean;
  /** Unread across everything the badge speaks for — event chats, DMs
   *  and group chats together. */
  unreadTotal: number;
  /** Recompute previews for the given chats from one bounded query. */
  refresh: (eventIds: string[], viewerId: string) => Promise<void>;
  /** Reload the direct rooms. Safe to call often; `useChatSync`
   *  debounces the realtime firehose before it gets here. */
  refreshDirect: (viewerId: string) => Promise<void>;
  reset: () => void;
};

/** One badge, every kind of chat.
 *
 *  This used to be the sum of the event previews alone, because that is
 *  all the store held — so a direct message never reached the tab badge
 *  at all, and the only way to discover one was to open Chat and switch
 *  to Direct on the off-chance. */
function totalUnread(
  previews: Map<string, ChatPreview>,
  dms: DmRoom[],
  groups: GroupRoom[],
): number {
  let n = 0;
  previews.forEach((p) => {
    n += p.unreadCount;
  });
  for (const d of dms) n += d.unreadCount;
  for (const g of groups) n += g.unreadCount;
  return n;
}

/** Single source of truth for chat previews + the aggregate unread
 *  count. Kept fresh by `useChatSync` (mounted in the tabs layout, so
 *  it runs anywhere in the authed app); both the Chat list and the
 *  tab-bar badge read from here, so they can never disagree. */
export const useChatStore = create<ChatState>((set, get) => ({
  previews: new Map(),
  dms: [],
  groups: [],
  directLoaded: false,
  directFailed: false,
  unreadTotal: 0,

  refresh: async (eventIds, viewerId) => {
    if (eventIds.length === 0) {
      const { dms, groups } = get();
      set({ previews: new Map(), unreadTotal: totalUnread(new Map(), dms, groups) });
      return;
    }
    try {
      const previews = await messagesService.previews(eventIds, viewerId);
      const { dms, groups } = get();
      set({ previews, unreadTotal: totalUnread(previews, dms, groups) });
    } catch {
      // messages table unreachable (migration not applied yet / offline)
      // — leave the last good state rather than zeroing the badge.
    }
  },

  refreshDirect: async (viewerId) => {
    try {
      // Settled, not all: one of the two failing should not throw away
      // the other's rooms. A rejected half keeps whatever it had.
      const [d, g] = await Promise.allSettled([
        dmsService.listRooms(viewerId),
        groupsService.listRooms(viewerId),
      ]);
      const prev = get();
      const dms = d.status === 'fulfilled' ? d.value : prev.dms;
      const groups = g.status === 'fulfilled' ? g.value : prev.groups;
      set({
        dms,
        groups,
        directLoaded: true,
        // Only a total failure counts as failed; a half-loaded list is
        // still worth showing.
        directFailed: d.status === 'rejected' && g.status === 'rejected',
        unreadTotal: totalUnread(prev.previews, dms, groups),
      });
    } catch {
      set({ directLoaded: true, directFailed: true });
    }
  },

  reset: () =>
    set({
      previews: new Map(),
      dms: [],
      groups: [],
      directLoaded: false,
      directFailed: false,
      unreadTotal: 0,
    }),
}));
