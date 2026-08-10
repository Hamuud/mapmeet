# MapMeet — Product Analysis

Written after a full signed-in walkthrough of the real app in iOS Simulator
(iPhone 16 Pro Max, iOS 18.3). Every feature named here was seen working.

---

## 1. What the app does

> **MapMeet helps people in their twenties and thirties turn "we should hang out
> sometime" into an actual plan tonight, by putting every nearby event — the
> ones friends create and the ones the city is already running — on one live map
> they can join in a single tap.**

Concretely, the product is four tabs:

- **Map** — a full-bleed Apple Maps view with clustered, emoji-coded event pins,
  a search field, date/proximity filters, three map styles, and a coral
  create-FAB that drops a pin wherever you tap.
- **Events** — your `Created`, `Joined`, `Nearby` (with a 1/5/10/25/50 km radius
  selector) and `Past` events as rich cards.
- **Chat** — a group chat per event, created automatically the moment the event
  exists, plus direct messages, friend groups, polls and voice notes.
- **You** — a public profile with a taxi-style 5.00 rating, bio, emoji interest
  chips, and hosting/attending history.

The event supply is **hybrid**: users create their own meetups, and the app also
ingests real ticketed city events (in this database, 111 upcoming Kyiv events
from the Karabas source, complete with posters, venues and a "Get tickets"
link). That mix is the product's real trick — the map is never empty on day one,
and a user's small coffee meet sits on the same surface as a sold-out show.

---

## 2. Target audience

| Dimension | Read |
| --- | --- |
| **Age** | 18–34. The interaction language (emoji-first, one-tap join, group chat, ratings) and the content mix (stand-up, theatre, concerts, runs, board games) point squarely at students and young professionals. |
| **Geography** | Launch market is **Ukraine — Kyiv first** (the app ships a full Ukrainian translation, and the entire imported event catalogue is Ukrainian). Lviv, Odesa and Khmelnytskyi also carry events. |
| **Usage context** | Spontaneous and near-term: "what's on tonight / this weekend, within 5 km of me". Used standing up, on the move, often within a few hours of the event. |
| **Motivation** | Two overlapping jobs: *(a)* find something to do nearby without doomscrolling five apps; *(b)* meet people — new arrivals to a city, people rebuilding a social circle, hobbyists looking for others who run/draw/play. |
| **Interests** | The app's own 16-interest taxonomy is the audience portrait: coffee, running, music, films, books, food, travel, photography, art, games, fitness, yoga, tech, outdoors, nightlife, spontaneous. |
| **Category** | Events & Discovery / Social Networking. Competes for attention with Meetup, Facebook Events, Eventbrite and city Telegram channels — but is more local, lighter and map-native than any of them. |

---

## 3. Main value proposition

**One live map of everything happening near you — and one tap to be part of it.**

The supporting promise is that joining is not the end of the interaction: the
moment you join, you are in the event's group chat with everyone else going. Most
event apps hand you a calendar entry; MapMeet hands you a conversation.

---

## 4. Differentiators

1. **Map-first, not feed-first.** Proximity is the primary axis. You see *where*
   something is before you read what it is, which is how people actually decide
   whether they'll go.
2. **Every event has a chat, automatically.** No separate group to create, no
   link to share. Join → you're in the room. Hosts get a channel to post gate
   codes and meeting points; attendees self-organise ("meet at Kontraktova at
   19:00?").
3. **User meetups and real city events share one surface.** A rooftop coffee for
   four and a 500-seat concert are the same object type — searchable, filterable,
   joinable, on the same pin grammar. Imported events keep their poster and a
   "Get tickets" link.
4. **Anyone can host in under a minute.** Tap the coral `+`, drop a pin on the
   map, name it, pick an emoji, done. Creation is a map gesture, not a form
   marathon.
5. **Reputation built in.** A visible 5.00 rating with likes/dislikes and
   anonymous reviews on every profile — unusual for an events app and directly
   aimed at the "should I meet this stranger?" hesitation.
6. **Genuinely bilingual.** Full Ukrainian and English throughout, switchable
   live from Settings, which matters enormously in the launch market.

---

## 5. Marketing-ready features

Ranked by how well they communicate through a single still screenshot.

| # | Feature | Why it sells | Best source capture |
| --- | --- | --- | --- |
| 1 | **Live map of nearby events** | Instantly legible; the emoji clusters make a dense city look alive | `05-map-hero.png` |
| 2 | **Event detail + one-tap join** | Shows the payoff: date, distance, host, who's going, Join | `06-event-preview-hosting.png`, `21-event-preview-poster.png` |
| 3 | **Automatic group chat per event** | The real differentiator, and it photographs beautifully | `08-chat-thread.png` |
| 4 | **Host anything in a tap** | Coral pin-drop state is the most ownable frame in the app | `22-create-pin-placement.png` |
| 5 | **Nearby with radius control** | Concrete proof of the "near you" claim — "47 within 5 km" | `10-events-nearby.png` |
| 6 | **Profiles, interests & ratings** | Answers "who will I actually meet?" | `11-profile-you.png` |
| 7 | **Filters, search & map styles** | Depth signal — the map isn't a gimmick | `19-map-search.png`, `15-map-satellite.png` |
| 8 | **Full dark mode** | Craft signal; cheap to include as a supporting panel | `14-map-dark.png` |

**Deliberately not used in the campaign:** friends list, moderation/reporting,
admin tools, polls, voice notes, invites and settings. All real, none of them a
reason to download.

---

## 6. Honest caveats for the store listing

- The English-language store campaign shows a Kyiv map, so some pins carry
  Ukrainian titles. That is authentic and should stay — but the hero screens were
  composed around English-language events so the primary read is never blocked.
- Screenshot content was produced from a purpose-made demo account
  (`@mayakov`) plus three demo attendees. No real user's name, avatar or message
  appears in any asset.
- The product has no app icon in the repo. The store icon in this package was
  designed from the in-app "M" monogram; it should be adopted into
  `app.json` (`icon`, `splash.image`, `android.adaptiveIcon.foregroundImage`)
  before submission so the shipped app matches its listing.
