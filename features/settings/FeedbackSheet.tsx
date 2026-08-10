import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useT } from '@/i18n';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useImagePicker, type PickedMedia } from '@/hooks/useImagePicker';
import { FEEDBACK_EMAIL, feedbackService } from '@/services/feedback.service';

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string | null;
};

const MAX_ATTACHMENTS = 5;
/** Keep uploads sane — a 25MB screen recording is plenty for a bug report. */
const MAX_BYTES = 25 * 1024 * 1024;

/** "Send feedback" composer: a message plus optional photo/video evidence.
 *  Submissions are stored server-side and forwarded on by email. */
export function FeedbackSheet({ open, onClose, userId }: Props) {
  const t = useT();
  const toast = useToast();
  const { pickMedia } = useImagePicker();
  const [message, setMessage] = useState('');
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setMessage('');
      setMedia([]);
      setSending(false);
    }
  }, [open]);

  const handleAttach = async () => {
    const remaining = MAX_ATTACHMENTS - media.length;
    if (remaining <= 0) {
      toast.show(`Up to ${MAX_ATTACHMENTS} attachments.`, 'info');
      return;
    }
    try {
      const picked = await pickMedia(remaining);
      if (picked.length === 0) return;
      const tooBig = picked.filter((p) => (p.size ?? 0) > MAX_BYTES);
      const ok = picked.filter((p) => (p.size ?? 0) <= MAX_BYTES);
      if (tooBig.length > 0) {
        toast.show(t('feedback.tooBig'), 'info');
      }
      setMedia((prev) => [...prev, ...ok].slice(0, MAX_ATTACHMENTS));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('feedback.libraryFailed'), 'error');
    }
  };

  const handleSend = async () => {
    const body = message.trim();
    if (!body || sending) return;
    if (!userId) {
      toast.show(t('feedback.signIn'), 'error');
      return;
    }
    setSending(true);
    try {
      await feedbackService.submit(userId, body, media);
      toast.show(t('feedback.sent'), 'success');
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('feedback.failed'), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.9} autoHeight>
      <View className="gap-4 pb-2">
        <View className="gap-0.5">
          <View className="flex-row items-center gap-2">
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#4B5FE0" />
            <Text className="text-lg font-bold text-text-light dark:text-text-dark">
              {t('feedback.title')}
            </Text>
          </View>
          <Text className="text-xs text-muted-light dark:text-muted-dark">
            Found a bug or have an idea? This goes straight to {FEEDBACK_EMAIL}.
          </Text>
        </View>

        {/* Message */}
        <View className="rounded-2xl border border-border-light bg-elevated-light px-4 py-3 dark:border-border-dark dark:bg-elevated-dark">
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={t('feedback.placeholder')}
            placeholderTextColor="#8B8880"
            multiline
            maxLength={4000}
            className="min-h-[110px] text-[15px] text-text-light outline-none dark:text-text-dark"
            style={{ textAlignVertical: 'top' }}
          />
        </View>

        {/* Attachments */}
        <View className="gap-2">
          <View className="flex-row items-baseline justify-between">
            <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-light">
              {t('feedback.attachments')}
            </Text>
            <Text className="text-[11px] text-muted-light">
              {media.length}/{MAX_ATTACHMENTS}
            </Text>
          </View>

          {media.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2 pr-2">
                {media.map((item, i) => (
                  <View key={`${item.uri}-${i}`} className="relative">
                    {item.kind === 'image' ? (
                      <Image
                        source={{ uri: item.uri }}
                        style={{ width: 76, height: 76, borderRadius: 12 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        className="items-center justify-center rounded-xl bg-elevated-light dark:bg-elevated-dark"
                        style={{ width: 76, height: 76 }}
                      >
                        <Ionicons name="videocam" size={22} color="#8B8880" />
                        <Text className="mt-1 font-mono text-[9px] uppercase text-muted-light">
                          {t('feedback.video')}
                        </Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => setMedia((prev) => prev.filter((_, idx) => idx !== i))}
                      accessibilityLabel={t('feedback.removeAttachment')}
                      hitSlop={6}
                      className="absolute -right-1.5 -top-1.5 h-6 w-6 items-center justify-center rounded-full bg-surface-light dark:bg-surface-dark"
                    >
                      <Ionicons name="close-circle" size={20} color="#8B8880" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}

          <Pressable
            onPress={handleAttach}
            className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-border-light bg-panel-light py-3 active:opacity-70 dark:border-border-dark dark:bg-panel-dark"
          >
            <Ionicons name="images-outline" size={16} color="#4B5FE0" />
            <Text className="text-[13px] font-semibold text-brand-500">
              {t('feedback.addMedia')}
            </Text>
          </Pressable>
        </View>

        {/* No leftIcon: the primary button inverts with the theme, so a
            fixed-colour glyph would vanish in one of the two modes. */}
        <PrimaryButton
          label={t('feedback.title')}
          loading={sending}
          disabled={!message.trim()}
          onPress={handleSend}
          fullWidth
        />
      </View>
    </BottomSheet>
  );
}
