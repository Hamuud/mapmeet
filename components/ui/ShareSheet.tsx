import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { friendshipsService, type FriendRow } from '@/services/friendships.service';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The 24h link to share. When null the sheet shows a minting state. */
  url: string | null;
  /** Human headline that precedes the link, e.g. `🎉 Join "Movie night"`. */
  text: string;
  /** Used as the OS-share sheet title on the "More" fallback. */
  title: string;
  /** Enables the in-app friends row. Given a friend's id, deliver the
   *  invite to them (events send it as an acceptable DM card). */
  onSendToFriend?: (friendId: string) => Promise<void>;
  /** Whose friends to list — the signed-in user. */
  viewerId?: string | null;
};

/** Open an http(s) link in a new tab (web) or the system browser
 *  (native); open a custom scheme (viber://) by navigating to it so the
 *  target app can intercept. Failures are swallowed — a missing app just
 *  means nothing happens, same as any share sheet. */
function openExternal(target: string) {
  const isHttp = /^https?:/i.test(target);
  if (Platform.OS === 'web') {
    if (isHttp) {
      const win = window.open(target, '_blank', 'noopener,noreferrer');
      if (!win) window.location.href = target;
    } else {
      window.location.href = target; // custom scheme (viber://)
    }
    return;
  }
  void Linking.openURL(target).catch(() => {});
}

/** Reusable "share this link" sheet used for both event and group invite
 *  links. One-tap forwarding to Telegram / WhatsApp / Viber, a Copy that
 *  puts the raw link on the clipboard (web) or opens the OS sheet
 *  (native), plus a catch-all "More" for every other channel. The caller
 *  mints the token and hands us a ready URL, so this stays presentational
 *  and link-source-agnostic. */
export function ShareSheet({
  open,
  onClose,
  url,
  text,
  title,
  onSendToFriend,
  viewerId,
}: Props) {
  const toast = useToast();
  const message = url ? `${text}\n${url}` : text;

  // In-app friend sharing: avatars on top, names beneath, one tap to send.
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSentTo(new Set());
    setSendingTo(null);
    if (!onSendToFriend || !viewerId) return;
    friendshipsService
      .listFriends(viewerId)
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [open, onSendToFriend, viewerId]);

  const handleSendToFriend = async (friendId: string) => {
    if (!onSendToFriend || sendingTo || sentTo.has(friendId)) return;
    setSendingTo(friendId);
    try {
      await onSendToFriend(friendId);
      setSentTo((prev) => new Set(prev).add(friendId));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not send invite', 'error');
    } finally {
      setSendingTo(null);
    }
  };

  const channels: {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    bg: string;
    href: (u: string) => string;
  }[] = [
    {
      key: 'telegram',
      label: 'Telegram',
      icon: 'paper-plane',
      bg: '#229ED9',
      href: (u) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(text)}`,
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: 'logo-whatsapp',
      bg: '#25D366',
      href: (u) => `https://wa.me/?text=${encodeURIComponent(`${text}\n${u}`)}`,
    },
    {
      key: 'viber',
      label: 'Viber',
      icon: 'chatbubble-ellipses',
      bg: '#7360F2',
      href: (u) => `viber://forward?text=${encodeURIComponent(`${text}\n${u}`)}`,
    },
  ];

  const handleCopy = async () => {
    if (!url) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.show('Link copied. Good for 24 hours.', 'success');
      } else {
        // Native (or a browser without the clipboard API): fall back to
        // the OS share sheet, which offers Copy among other targets.
        await Share.share({ message, url, title });
      }
    } catch {
      toast.show(url, 'info');
    }
    onClose();
  };

  const handleMore = async () => {
    if (!url) return;
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && (navigator as Navigator).share) {
          await (navigator as Navigator).share({ title, text: message, url });
        } else {
          await handleCopy();
          return;
        }
      } else {
        await Share.share({ message, url, title });
      }
    } catch {
      /* user dismissed the share sheet */
    }
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} autoHeight>
      <View className="gap-4 pb-2">
        <View className="gap-0.5">
          <Text className="text-lg font-bold text-text-light dark:text-text-dark">
            Share link
          </Text>
          <Text className="text-xs text-muted-light">
            Anyone with this link can join. It expires in 24 hours.
          </Text>
        </View>

        {/* Friends — avatars on top, names beneath. One tap sends the
            invite straight into their DMs. */}
        {onSendToFriend && friends.length > 0 ? (
          <View className="gap-2">
            <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
              Send to a friend
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-3 pr-2">
                {friends.map((f) => {
                  const sent = sentTo.has(f.other.id);
                  const sending = sendingTo === f.other.id;
                  return (
                    <Pressable
                      key={f.other.id}
                      onPress={() => void handleSendToFriend(f.other.id)}
                      disabled={sent || !!sendingTo || !url}
                      accessibilityLabel={`Send to ${f.other.display_name}`}
                      className="w-[68px] items-center gap-1.5 active:opacity-70"
                      style={{ opacity: url ? 1 : 0.4 }}
                    >
                      <View>
                        <Avatar
                          name={f.other.display_name}
                          uri={f.other.avatar_url}
                          size="lg"
                        />
                        {sent ? (
                          <View className="absolute -bottom-0.5 -right-0.5 h-6 w-6 items-center justify-center rounded-full border-2 border-panel-light bg-green-500 dark:border-panel-dark">
                            <Ionicons name="checkmark" size={13} color="#fff" />
                          </View>
                        ) : sending ? (
                          <View className="absolute -bottom-0.5 -right-0.5 h-6 w-6 items-center justify-center rounded-full border-2 border-panel-light bg-brand-500 dark:border-panel-dark">
                            <Ionicons name="ellipsis-horizontal" size={13} color="#fff" />
                          </View>
                        ) : null}
                      </View>
                      <Text
                        className={[
                          'text-center text-[11px]',
                          sent
                            ? 'font-semibold text-green-600'
                            : 'text-text-light dark:text-text-dark',
                        ].join(' ')}
                        numberOfLines={1}
                      >
                        {sent ? 'Sent' : f.other.display_name.split(/\s+/)[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ) : null}

        {/* Social channels */}
        <View className="flex-row justify-around">
          {channels.map((c) => (
            <Pressable
              key={c.key}
              disabled={!url}
              onPress={() => {
                if (!url) return;
                openExternal(c.href(url));
                onClose();
              }}
              accessibilityLabel={`Share via ${c.label}`}
              className="items-center gap-1.5 active:opacity-70"
              style={{ opacity: url ? 1 : 0.4 }}
            >
              <View
                className="h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: c.bg }}
              >
                <Ionicons name={c.icon} size={26} color="#fff" />
              </View>
              <Text className="text-xs font-medium text-text-light dark:text-text-dark">
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Copy + more */}
        <View className="gap-2">
          <PrimaryButton
            label={url ? 'Copy link' : 'Creating link…'}
            variant="secondary"
            loading={!url}
            leftIcon={<Ionicons name="copy-outline" size={15} color="#4B5FE0" />}
            onPress={handleCopy}
            fullWidth
          />
          <PrimaryButton
            label="More options…"
            variant="ghost"
            disabled={!url}
            leftIcon={<Ionicons name="ellipsis-horizontal" size={15} color="#8B8880" />}
            onPress={handleMore}
            fullWidth
          />
        </View>
      </View>
    </BottomSheet>
  );
}
