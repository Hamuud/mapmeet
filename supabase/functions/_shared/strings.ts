// MapMeet — push notification copy, in both app languages.
//
// Kept apart from the app's i18n dictionary on purpose: Edge Functions
// are Deno and cannot import the React Native bundle. The trade is a
// second place to add a string; the alternative was English pushes for
// Ukrainian users, which is worse.
//
// Style rules, so pushes read as one voice:
//   · Title = where it happened (event, group, person). Body = what.
//   · No trailing full stops on a one-line body.
//   · Never repeat the app name — the OS already shows it.

import { fill, plural, type Locale } from './push.ts';

type Plural = { one: string; few?: string; other: string };

const COPY = {
  en: {
    joinedEvent: '{name} joined the event',
    joinedGroup: '{name} joined the group',
    newMessage: 'New message',
    friendRequestTitle: 'Friend request',
    friendRequestBody: '{name} wants to be friends',
    friendAcceptedTitle: 'You are now friends',
    friendAcceptedBody: '{name} accepted your friend request',
    eventCancelledBody: 'The host cancelled this event',
    eventMovedTime: 'Moved to {when}',
    eventMovedPlace: 'The location has changed',
    eventEdited: 'The host updated the details',
    remindTitle: '{emoji} {title}',
    remindSoon: 'Starts in {minutes} min — see you there',
    remindNow: 'Starting now',
    digestTitle: 'New events near you',
    digestBody: {
      one: '{count} new event has been pinned in your area — go and have a look',
      other: '{count} new events have been pinned in your area — go and have a look',
    } as Plural,
    photo: '📷 Photo',
    video: '🎥 Video',
    location: '📍 Location',
    audio: '🎤 Voice message',
    invite: '🎟 Event invite',
  },
  uk: {
    joinedEvent: '{name} приєднується до події',
    joinedGroup: '{name} у групі',
    newMessage: 'Нове повідомлення',
    friendRequestTitle: 'Запит у друзі',
    friendRequestBody: '{name} хоче додати вас у друзі',
    friendAcceptedTitle: 'Ви тепер друзі',
    friendAcceptedBody: '{name} прийняв(ла) ваш запит',
    eventCancelledBody: 'Організатор скасував подію',
    eventMovedTime: 'Перенесено на {when}',
    eventMovedPlace: 'Місце проведення змінилося',
    eventEdited: 'Організатор оновив деталі',
    remindTitle: '{emoji} {title}',
    remindSoon: 'Початок за {minutes} хв — до зустрічі',
    remindNow: 'Починається зараз',
    digestTitle: 'Нові події поруч',
    digestBody: {
      one: 'У вашому районі з’явилася {count} нова подія — гляньте',
      few: 'У вашому районі з’явилося {count} нові події — гляньте',
      other: 'У вашому районі з’явилося {count} нових подій — гляньте',
    } as Plural,
    photo: '📷 Фото',
    video: '🎥 Відео',
    location: '📍 Місце',
    audio: '🎤 Голосове повідомлення',
    invite: '🎟 Запрошення на подію',
  },
} as const;

type Key = keyof typeof COPY.en;

export function t(
  locale: Locale,
  key: Key,
  vars: Record<string, string | number> = {},
): string {
  const phrase = COPY[locale][key] ?? COPY.en[key];
  if (typeof phrase === 'string') return fill(phrase, vars);
  const count = typeof vars.count === 'number' ? vars.count : 0;
  const cat = plural(locale, count);
  const form =
    (cat === 'few' ? (phrase as Plural).few : undefined) ??
    (phrase as Plural)[cat === 'one' ? 'one' : 'other'];
  return fill(form, vars);
}

/** One-line stand-in for a message whose body isn't plain text. */
export function preview(locale: Locale, record: { type?: string; text?: string | null }): string {
  switch (record.type) {
    case 'image':
      return t(locale, 'photo');
    case 'video':
      return t(locale, 'video');
    case 'location':
      return t(locale, 'location');
    case 'audio':
      return t(locale, 'audio');
    case 'invite':
      return t(locale, 'invite');
    default:
      return record.text ?? '';
  }
}
