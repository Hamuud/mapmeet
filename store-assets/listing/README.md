# MapMeet — App Store Connect listing

Everything to paste into App Store Connect for the 1.0.0 submission.
Character counts are verified against Apple's limits.

Add **two** localisations under *App Information → Localizable Information*:
**English (U.K.)** as primary and **Ukrainian**. The copy below is written in
British English ("centre") to match that primary language — switching the
primary to English (U.S.) would need a spelling pass. The app itself ships in both,
and Ukraine is the market the imported events come from — a Ukrainian-language
listing is what actually gets found there.

---

## 1. App Information  (applies to all localisations)

| Field | Value |
|---|---|
| Bundle ID | `com.mapmeet.app` |
| SKU | `mapmeet-001` |
| Primary language | **English (U.K.)** |
| Primary category | **Social Networking** — the core loop is meeting people; Meetup is filed the same way |
| Secondary category | **Lifestyle** |
| Content rights | Contains no third-party content *(the karabas.com listings are factual event data with attribution and a link; if a reviewer queries it, see §6)* |
| Age rating | Calculated **13+**, overridden to **16+** to match the EULA. See §5 |
| Copyright | `2026 AlyaskaTeam` |
| Price | Free |

### URLs

| Field | Value |
|---|---|
| Privacy Policy URL | `https://hamuud.github.io/mapmeet/legal/privacy.html` |
| EULA | **Custom** → `https://hamuud.github.io/mapmeet/legal/terms.html` |
| Support URL | `https://hamuud.github.io/mapmeet/legal/` |
| Marketing URL | `https://hamuud.github.io/mapmeet/` *(optional)* |

> The Support URL currently points at the legal hub, which carries the contact
> address. That is acceptable but thin — a short FAQ page would be better.

---

## 2. English (U.K.)

### App Name  (24/30)
```
MapMeet: Events Near You
```

### Subtitle  (25/30)
```
Meet people, chat, go out
```

### Promotional Text  (146/170)
*Editable any time without a new review — use it for seasonal or timely messaging.*
```
Concerts, festivals, theatre and stand-up across Ukraine — on the same map as what your friends are doing tonight. Pin your own in under a minute.
```

### Keywords  (94/100)
*No spaces after commas — spaces waste characters. Deliberately excludes words already in the name and subtitle, which Apple indexes separately.*
```
meetup,nearby,local,friends,social,hangout,concert,festival,standup,theatre,city,tonight,plans
```

### Description  (2320/4000)
```
Your city is full of things happening tonight. MapMeet puts them on one map.

Open the app and look around you: someone's coffee walk on Saturday morning, a five-a-side game one player short, a gig at the venue down the road. Tap a pin, join, and you are in the group chat with everyone else who is going.

MAKE SOMETHING HAPPEN
Pin an event in under a minute. Pick an emoji, drop it on the map, set a time. Make it public, or private and invite-only. Cap the numbers if space is tight. Long-press anywhere on the map to drop a pin without opening a single menu.

EVERY EVENT COMES WITH A CHAT
Join an event and its group chat opens with it. Send a voice message when typing is too slow, and play others back at 1.5x or 2x when you are catching up. Run a poll to settle where and when. An hour before the start, a "Who's coming?" poll appears on its own.

CONCERTS, FESTIVALS, THEATRE, STAND-UP
Alongside what people pin themselves, MapMeet shows public events from karabas.com across Ukraine — the same map, the same Join button, with a link through to tickets when you want them.

FIND YOUR PEOPLE
Add friends, start a group chat, or message anyone directly. Profiles carry a rating and anonymous reviews, so you have some idea who you are meeting before you go.

YOU DECIDE WHO SEES WHAT
Choose who can see the events you are attending: everyone, friends only, or nobody at all. Block someone and they can no longer message you or see where you will be. Report a profile and a person reviews it — we do not leave that to a machine.

UKRAINIAN AND ENGLISH, PROPERLY
Switch language in Settings and the whole app follows, dates and times included. Light and dark themes, both hand-tuned.

MapMeet is free. There are no ads, no tracking, no analytics SDKs, and we never sell your data. Your location is used on your device to centre the map and sort events by distance — it is not uploaded or stored. Events you pin are public because that is the point of them; nothing else about you is.

A NOTE ON SAFETY
Meeting someone you do not know carries real risk, and we do not verify anyone's identity. Meet in a public place the first time, tell a friend where you are going, and trust your instincts. If something is wrong, block and report — both take one tap.

Questions, bugs, anything at all: artem.liaskovets@gmail.com
```

### What's New in This Version  (299/4000)
```
First release.

Pin an event anywhere on the map and get a group chat with everyone who joins. Voice messages with 1.5x and 2x playback, polls, direct messages and friends. Public concerts, festivals, theatre and stand-up from karabas.com appear on the same map.

Available in Ukrainian and English.
```

---

## 3. Ukrainian

### App Name  (20/30)
```
MapMeet: події поруч
```

### Subtitle  (26/30)
```
Знайомтесь і гуляйте разом
```

### Promotional Text  (133/170)
*Editable any time without a new review — use it for seasonal or timely messaging.*
```
Концерти, фестивалі, театр і стендап по всій Україні — на одній карті з тим, що роблять ваші друзі сьогодні. Своя подія — за хвилину.
```

### Keywords  (87/100)
*No spaces after commas — spaces waste characters. Deliberately excludes words already in the name and subtitle, which Apple indexes separately.*
```
зустріч,поруч,друзі,тусовка,концерт,фестиваль,стендап,театр,місто,разом,куди піти,афіша
```

### Description  (2349/4000)
```
У вашому місті сьогодні відбувається безліч усього. MapMeet збирає це на одній карті.

Відкрийте застосунок і подивіться навколо: чиясь кавова прогулянка в суботу зранку, футбол, де бракує одного гравця, концерт у клубі за рогом. Торкніться позначки, приєднайтеся — і ви вже в груповому чаті з усіма, хто йде.

СТВОРІТЬ СВОЮ ПОДІЮ
Позначка на карті — це хвилина. Оберіть емодзі, поставте точку, вкажіть час. Подія може бути відкритою або приватною, лише за запрошенням. Обмежте кількість місць, якщо їх небагато. Утримуйте палець на карті, щоб поставити позначку взагалі без меню.

У КОЖНОЇ ПОДІЇ Є ЧАТ
Приєдналися — і чат відкривається разом із подією. Голосове повідомлення, коли друкувати надто довго, і відтворення чужих на 1.5x або 2x, коли треба наздогнати розмову. Опитування, щоб домовитися про час і місце. За годину до початку саме собою з'являється опитування «Хто йде?».

КОНЦЕРТИ, ФЕСТИВАЛІ, ТЕАТР, СТЕНДАП
Поряд із подіями, які створюють люди, MapMeet показує публічні події з karabas.com по всій Україні — та сама карта, та сама кнопка «Приєднатися» і посилання на квитки, коли вони потрібні.

ЗНАЙДІТЬ СВОЇХ
Додавайте друзів, створюйте групові чати, пишіть особисто. У профілях є рейтинг та анонімні відгуки, тож ви приблизно уявляєте, з ким зустрічаєтесь.

ВИ ВИРІШУЄТЕ, ХТО ЩО БАЧИТЬ
Оберіть, хто бачить події, до яких ви приєдналися: усі, лише друзі або ніхто. Заблокуйте людину — і вона більше не напише вам і не побачить, де ви будете. Поскаржтеся на профіль, і його перегляне людина, а не алгоритм.

УКРАЇНСЬКА ТА АНГЛІЙСЬКА
Змініть мову в налаштуваннях — і застосунок перекладеться повністю, разом із датами й часом. Світла й темна теми, обидві доведені до ладу.

MapMeet безкоштовний. Тут немає реклами, стеження й аналітичних SDK, і ми ніколи не продаємо ваші дані. Ваше місцеположення використовується на пристрої, щоб відцентрувати карту й відсортувати події за відстанню — воно нікуди не завантажується. Події, які ви створюєте, публічні, бо в цьому їхній сенс; більше нічого про вас — ні.

ПРО БЕЗПЕКУ
Зустріч із незнайомою людиною — це справжній ризик, і ми не перевіряємо особу нікого з користувачів. Першого разу зустрічайтеся в людному місці, скажіть другові, куди йдете, і довіряйте своїм відчуттям. Якщо щось не так — заблокуйте та поскаржтеся, це один дотик.

Питання, помилки, будь-що: artem.liaskovets@gmail.com
```

### What's New in This Version  (299/4000)
```
Перший реліз.

Створіть подію будь-де на карті й отримайте груповий чат з усіма, хто приєднався. Голосові повідомлення з відтворенням 1.5x і 2x, опитування, особисті повідомлення та друзі. Концерти, фестивалі, театр і стендап з karabas.com — на тій самій карті.

Доступно українською та англійською.
```

---

## 4. Screenshots

`store-assets/app-store/iphone/` — six at 1320 × 2868 (6.9", iPhone 16 Pro Max).
Upload to the 6.9" slot; Apple scales them down for every smaller device, so
this is the only size you need.

Screenshots can be shared across localisations. If you want Ukrainian
screenshots later, regenerate with `python3 store-assets/build_assets.py`
against captures taken with the app set to Ukrainian.

---

## 5. Age rating questionnaire

Apple's 2025 questionnaire. Apple computes a rating from the answers, then
Step 7 lets you override it upwards.

**Outcome for MapMeet: calculated 13+, overridden to 16+.**

The override is not optional housekeeping — the Terms say "you may use MapMeet
only if you are 16 or older", so shipping at the calculated 13+ would have the
App Store advertising the app to an age group our own EULA bars. Apple names
exactly this case on the Step 7 screen: *"if your app ... has a EULA with age
requirements, you can specify an age rating that better represents your app."*

### Step 1 — In-App Controls

| Question | Answer | Why |
|---|---|---|
| Parental Controls | **NO** | No guardian monitoring or restriction tools exist |
| Age Assurance | **NO** | Sign-up collects email, username, display name and password — no date of birth, no ID check, and the Declared Age Range API is not called. The 16+ rule in the Terms is a rule, not a mechanism |

### Step 1 — Capabilities

| Question | Answer | Why |
|---|---|---|
| Unrestricted Web Access | **NO** | There is no in-app browser. Every external link — tickets, legal pages, links posted in chat — goes out through `Linking.openURL` to the system browser. `expo-web-browser` is a transitive dependency and is never called |
| User-Generated Content | **YES** | Events, chat messages, voice notes, polls, profiles and reviews |
| Social Media | **YES** | The public map, Nearby list and tag search are a discovery surface that spreads user-created events to people who never chose to follow their author — Apple's "similar discovery method". Sharing out to Telegram/WhatsApp/Viber is redistribution on top |
| Social Media Disabled for Users Under 13 | **NO** | Nothing is gated by age, and the Declared Age Range API is not called |
| Messaging and Chat | **YES** | Direct messages, group chats and per-event chats |
| Advertising | **NO** | No ads and no ad SDKs. The karabas.com ticket links are aggregated public event data with attribution — there is no commercial or affiliate arrangement, so it is not paid promotion |

### Steps 2–7 — content questions

Answer **None** to every violence, sexual content, nudity, profanity, horror,
alcohol/tobacco/drugs, gambling and contests question. MapMeet ships no such
content of its own.

The one that reads ambiguously: questions about content are asking what **the
app itself** contains, not what a user could theoretically type into a chat.
User-generated risk is already declared by the UGC and Messaging answers above,
and is handled by the report/block/moderation tooling.

> **Do not under-declare to chase a lower rating.** If Apple decides the answers
> don't match the app, they reset the rating and can pull the listing. "Social
> Media = YES" costs a bracket and is easy to defend; "NO" is not.

### Step 7 — Additional Information

| Field | Value |
|---|---|
| Calculated Rating | 13+ |
| Age Categories and Override | **Override to Higher Age Rating → 16+** |
| Age Suitability URL | `https://hamuud.github.io/mapmeet/legal/terms.html#eligibility` |

The URL deep-links to clause 2 of the Terms, which is the document that
justifies the override.

Step 7 also warns the app will not be sold in **Afghanistan** while a category
is Entertainment, Lifestyle or Games. That is local law, not a defect, and is
not worth distorting the categories to avoid.

### Content answers, evidenced against the live feed

Each of these was checked against the 158 imported karabas.com listings rather
than assumed — the feed refreshes weekly, so re-check if the imported
categories are ever broadened.

| Question | Answer | Evidence |
|---|---|---|
| Profanity or Crude Humor | Infrequent | 4 listings contain profanity in descriptions (3 stand-up, 1 theatre) |
| Horror/Fear Themes | None | — |
| Alcohol, Tobacco, Drug references | Infrequent | 20 listings mention a bar, wine, beer or cocktails |
| Medical or Treatment Information | None | The app gives no guidance; it lists events |
| Health or Wellness Topics | No | Listing a yoga class is not *providing* self-care advice |
| Mature or Suggestive Themes | Infrequent | 5 listings incl. a stand-up show "Сексологія" and 4 marked 18+ |
| Sexual Content or Nudity | None | References, never depictions. 0 nudity matches |
| Graphic Sexual Content | None | — |
| All four Violence questions | None | 0 weapon and 0 violence matches; 9 "war" hits were all false positives ("forget about the war for a few hours") |
| Simulated Gambling / Gambling / Loot Boxes | None / No / No | No purchases, currency or betting anywhere in the app |
| Contests | None | The profile ★ rating is a reputation score, not a leaderboard — no ranking, prize or points mechanic exists in the codebase |

## 6. App Review Information

**Sign-In Required: YES.** Every screen past the login wall needs credentials.

```
Demo account
  Username: <create one>
  Password: <create one>
```

> Populate that account before submitting: join two or three events, leave a
> couple of chat messages, add a friend. A reviewer who lands in empty states
> cannot see the app working.

### Notes

```
MapMeet is a community map for finding and joining local events. Demo
account credentials are provided above; every feature is behind sign-in.

USER-GENERATED CONTENT (guideline 1.2)
- Report: any profile -> Report, with multiple selectable reasons.
- Block: DM -> menu -> Block. Blocked users cannot message the blocker or
  see the events they are attending.
- Moderation: a queue where staff warn, mute (30 min / 60 min / 24 h / 1
  week) or permanently ban an account. Reports are reviewed by a person.
- Contact for content complaints: artem.liaskovets@gmail.com

ACCOUNT DELETION (guideline 5.1.1(v))
Settings -> Account -> Delete account. The user picks a reason, confirms
with their password, and the account and its data are deleted immediately.

IMPORTED EVENTS
Some events are public listings imported from the Ukrainian ticketing site
karabas.com and shown with attribution. We are not the organiser and we do
not sell tickets or process payments; the ticket button opens the seller's
own site.

LOCATION
Requested only in the foreground, used to centre the map and sort events by
distance. It is not uploaded to our servers.

Google and Apple sign-in are intentionally not present in this build.
```

---

## 7. App Privacy (nutrition labels)

**"Do you or your third-party partners use data for tracking?" → NO.**
There are no advertising or analytics SDKs in the app, and it never requests
App Tracking Transparency.

| Data type | Collected | Linked to user | Purpose |
|---|---|---|---|
| Email address | Yes | Yes | App Functionality |
| Name | Yes | Yes | App Functionality |
| Phone number | Yes *(optional)* | Yes | App Functionality |
| User ID | Yes | Yes | App Functionality |
| Photos | Yes *(avatar)* | Yes | App Functionality |
| Audio Data | Yes *(voice messages)* | Yes | App Functionality |
| Other User Content | Yes *(messages, events, reviews)* | Yes | App Functionality |
| Precise Location | Yes | **No** | App Functionality |
| Coarse Location | No | — | — |
| Contacts | No | — | — |
| Identifiers (advertising) | No | — | — |
| Usage Data / Analytics | No | — | — |
| Diagnostics | No | — | — |

Precise Location is marked **not linked** deliberately: the device position
stays on the device, and the coordinates that are stored are the ones the user
deliberately publishes (a pinned event, a location sent in a chat).

---

## 8. Export compliance

`usesNonExemptEncryption` is already `false` in the app config, so App Store
Connect will not ask. The app uses only HTTPS/TLS, which is exempt.
