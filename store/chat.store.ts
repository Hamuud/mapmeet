import { create } from 'zustand';

import { messagesService, type ChatPreview } from '@/services/messages.service';

type ChatState = {
  /** eventId → preview (last message + unread count). */
  previews: Map<string, ChatPreview>;
  /** Sum of unread across every chat the viewer belongs to — powers the
   *  Chat tab-bar badge. */
  unreadTotal: number;
  /** Recompute previews for the given chats from one bounded query. */
  refresh: (eventIds: string[], viewerId: string) => Promise<void>;
};

/** Single source of truth for chat previews + the aggregate unread
 *  count. Kept fresh by `useChatSync` (mounted in the tabs layout, so
 *  it runs anywhere in the authed app); both the Chat list and the
 *  tab-bar badge read from here, so they can never disagree. */
export const useChatStore = create<ChatState>((set) => ({
  previews: new Map(),
  unreadTotal: 0,
  refresh: async (eventIds, viewerId) => {
    if (eventIds.length === 0) {
      set({ previews: new Map(), unreadTotal: 0 });
      return;
    }
    try {
      const map = await messagesService.previews(eventIds, viewerId);
      let total = 0;
      map.forEach((p) => {
        total += p.unreadCount;
      });
      set({ previews: map, unreadTotal: total });
    } catch {
      // messages table unreachable (migration not applied yet / offline)
      // — leave the last good state rather than zeroing the badge.
    }
  },
}));
