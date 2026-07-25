import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform, Pressable, Share, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The 24h link to share. When null the sheet shows a minting state. */
  url: string | null;
  /** Human headline that precedes the link, e.g. `🎉 Join "Movie night"`. */
  text: string;
  /** Used as the OS-share sheet title on the "More" fallback. */
  title: string;
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
export function ShareSheet({ open, onClose, url, text, title }: Props) {
  const toast = useToast();
  const message = url ? `${text}\n${url}` : text;

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
