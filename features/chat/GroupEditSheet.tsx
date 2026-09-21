import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { GroupAvatar } from '@/components/chat/GroupAvatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useT } from '@/i18n';
import { useImagePicker } from '@/hooks/useImagePicker';
import { groupsService } from '@/services/groups.service';
import { storageService } from '@/services/storage.service';
import { firstEmoji } from '@/utils/emoji';

/** Same shortlist the create sheet offers, so a group's look does not
 *  depend on which door you came in through. */
const QUICK_EMOJI = ['💬', '🎉', '🍕', '⚽', '🎮', '🏔️', '☕', '🎬'];

type Props = {
  open: boolean;
  onClose: () => void;
  group: { id: string; name: string; emoji: string; avatar_url: string | null };
  /** The creator's own id, so this sheet can refuse to open for anyone
   *  else even if a caller forgets to check. */
  canEdit: boolean;
  /** Fired after a successful save so the room can refetch. */
  onSaved: () => void;
  viewerId: string;
};

/** Rename a group, change its emoji, give it a photo.
 *
 *  Creator only. The server enforces that too — this sheet refusing to
 *  render is a courtesy, not the boundary. */
export function GroupEditSheet({
  open,
  onClose,
  group,
  canEdit,
  onSaved,
  viewerId,
}: Props) {
  const t = useT();
  const toast = useToast();
  const { pickFromLibrary } = useImagePicker();

  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);
  const [photo, setPhoto] = useState<string | null>(group.avatar_url);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Re-seed each time it opens, so cancelling really does discard.
  useEffect(() => {
    if (!open) return;
    setName(group.name);
    setEmoji(group.emoji);
    setPhoto(group.avatar_url);
  }, [open, group.name, group.emoji, group.avatar_url]);

  const trimmed = name.trim();
  const dirty =
    trimmed !== group.name || emoji !== group.emoji || photo !== group.avatar_url;
  const valid = trimmed.length > 0 && trimmed.length <= 40;

  const handlePickPhoto = async () => {
    const uri = await pickFromLibrary();
    if (!uri) return;
    setUploading(true);
    try {
      // Into the uploader's own folder in the public avatars bucket. The
      // existing storage policies scope writes to `<uid>/`, so this needs
      // no new rule — and the group id in the filename keeps one person's
      // several groups apart.
      const url = await storageService.uploadGroupPhoto(viewerId, group.id, uri);
      setPhoto(url);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('group.photoFailed'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await groupsService.update(group.id, {
        name: trimmed,
        emoji,
        // undefined would mean "leave alone"; null means "remove".
        avatarUrl: photo,
      });
      toast.show(t('group.updated'), 'success');
      onSaved();
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('group.updateFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit) return null;

  return (
    <BottomSheet open={open} onClose={onClose} heightPct={0.8}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 18, paddingBottom: 20 }}
      >
        <Text className="font-display text-2xl text-text-light dark:text-text-dark">
          {t('group.editTitle')}
        </Text>

        {/* Identity preview + photo controls */}
        <View className="items-center gap-3">
          <Pressable onPress={handlePickPhoto} disabled={uploading}>
            <View>
              <GroupAvatar emoji={emoji} avatarUrl={photo} size={88} />
              <View className="absolute -bottom-1 -right-1 h-8 w-8 items-center justify-center rounded-full border-2 border-panel-light bg-brand-500 dark:border-panel-dark">
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={15} color="#fff" />
                )}
              </View>
            </View>
          </Pressable>

          {photo ? (
            <Pressable onPress={() => setPhoto(null)} hitSlop={8}>
              <Text className="text-[13px] font-semibold text-red-500">
                {t('group.removePhoto')}
              </Text>
            </Pressable>
          ) : (
            <Text className="text-[12px] text-muted-light dark:text-muted-dark">
              {t('group.photoHint')}
            </Text>
          )}
        </View>

        {/* Name */}
        <View className="gap-1.5">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
            {t('group.nameLabel')}
          </Text>
          <View className="h-11 justify-center rounded-xl border border-border-light bg-elevated-light px-3.5 dark:border-border-dark dark:bg-elevated-dark">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('group.namePlaceholder')}
              placeholderTextColor="#8B8880"
              maxLength={40}
              className="text-[15px] text-text-light outline-none dark:text-text-dark"
            />
          </View>
          {trimmed.length === 0 ? (
            <Text className="text-xs text-red-500">{t('group.nameRequired')}</Text>
          ) : null}
        </View>

        {/* Emoji — shown even with a photo set, because it is what comes
            back if the photo is removed, and picking it blind then would
            be a small mystery. */}
        <View className="gap-1.5">
          <Text className="font-mono text-[10px] uppercase tracking-wider text-text-light/70 dark:text-text-dark/70">
            {t('group.emojiLabel')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {QUICK_EMOJI.map((e) => (
              <Pressable
                key={e}
                onPress={() => setEmoji(e)}
                accessibilityLabel={e}
                className={[
                  'h-11 w-11 items-center justify-center rounded-2xl border',
                  e === emoji
                    ? 'border-brand-500 bg-brand-500/15'
                    : 'border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark',
                ].join(' ')}
              >
                <Text style={{ fontSize: 20 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
          <View className="mt-1 h-11 justify-center rounded-xl border border-border-light bg-elevated-light px-3.5 dark:border-border-dark dark:bg-elevated-dark">
            <TextInput
              value={QUICK_EMOJI.includes(emoji) ? '' : emoji}
              onChangeText={(v) => {
                // Same rule as the event emoji field: one emoji, or the
                // keystroke does not take.
                if (v.trim().length === 0) return;
                const one = firstEmoji(v);
                if (one) setEmoji(one);
              }}
              placeholder={t('group.emojiCustom')}
              placeholderTextColor="#8B8880"
              maxLength={64}
              autoCapitalize="none"
              autoCorrect={false}
              className="text-lg text-text-light outline-none dark:text-text-dark"
            />
          </View>
        </View>

        <PrimaryButton
          label={t('common.save')}
          onPress={handleSave}
          loading={busy}
          disabled={!valid || !dirty || uploading}
          fullWidth
        />
      </ScrollView>
    </BottomSheet>
  );
}
