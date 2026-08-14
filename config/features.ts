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

/** "Continue with Google". Implemented end to end — see
 *  docs/google-sign-in.md — but it still needs the Google OAuth client
 *  and the Supabase provider configured for the project, which is a
 *  dashboard job. Leave this false until that is done, or the button
 *  fails on tap, which is exactly what the flag exists to prevent. */
export const GOOGLE_SIGN_IN = false;

/** "Continue with Apple".
 *  Blocked on: expo-apple-authentication, an Apple Services ID and a
 *  Sign in with Apple key, plus a native rebuild.
 *
 *  Guideline 4.8 is the reason to care. It requires that an app offering
 *  a third-party login also offer one that limits collection to name and
 *  email, lets the user keep the email private, and does no ad tracking.
 *  MapMeet's own email/password signup is a reasonable argument that we
 *  already do — Apple exempts apps using their own account system — but
 *  Sign in with Apple is the version of that argument nobody has to
 *  make to a reviewer. */
export const APPLE_SIGN_IN = false;

/** Sending photos and video in chat (the [+] → "Photo or video" item).
 *  Blocked on: upload + rendering path for chat images/video. Voice
 *  messages and polls are done and stay enabled. */
export const CHAT_MEDIA_ATTACHMENTS = false;
