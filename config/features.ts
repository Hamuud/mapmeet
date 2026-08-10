/** MapMeet — build-time feature flags.
 *
 *  WHY THIS FILE EXISTS
 *    App Store Review Guideline 2.1 rejects builds that show controls for
 *    things the app can't actually do — a button that answers "coming in
 *    the next update" reads to a reviewer as an unfinished app, not as a
 *    roadmap. Anything half-built is switched off here rather than
 *    deleted, so turning it back on is a one-line change once the
 *    implementation lands.
 *
 *  HOW TO TURN SOMETHING ON
 *    Flip the flag to `true` — but only once the feature works end to
 *    end, because that's the whole point of the flag.
 *
 *  These are plain consts, not runtime config: the bundler drops the
 *  disabled branches, so a disabled feature ships no dead UI at all. */

/** Google / Apple sign-in buttons on the login screen.
 *  Blocked on: no OAuth provider configured in Supabase Auth, no Apple
 *  Services ID / key. Note that shipping Google sign-in on iOS also
 *  obliges us to offer Sign in with Apple (guideline 4.8). */
export const OAUTH_SIGN_IN = false;

/** Sending photos and video in chat (the [+] → "Photo or video" item).
 *  Blocked on: upload + rendering path for chat images/video. Voice
 *  messages and polls are done and stay enabled. */
export const CHAT_MEDIA_ATTACHMENTS = false;
