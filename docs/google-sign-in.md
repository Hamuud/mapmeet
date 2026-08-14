# Sign in with Google — setup runbook

The code is done and merged. What is left is account configuration in
two dashboards, which needs your Google and Supabase logins. Until it is
finished the button stays hidden behind `GOOGLE_SIGN_IN` in
`config/features.ts` — a button that fails on tap is exactly what that
flag exists to prevent.

Project ref: `wpcwjjlaoolnqddeqpce`

---

## 1. Google Cloud Console

**APIs & Services → OAuth consent screen**

- User type: **External**.
- App name `MapMeet`, support email, developer contact.
- App domain / privacy policy / terms — the pages already deployed:
  - Home: `https://hamuud.github.io/mapmeet/`
  - Privacy: `https://hamuud.github.io/mapmeet/legal/privacy.html`
  - Terms: `https://hamuud.github.io/mapmeet/legal/terms.html`
- Scopes: leave the defaults (`email`, `profile`, `openid`). These are
  non-sensitive, so **no Google verification review is required** — you
  can publish the consent screen immediately. Add a scope beyond these
  and you buy yourself a review; don't, unless you mean to.
- While the screen is in *Testing* only accounts you list can sign in,
  capped at 100. **Publish** it before you ship, or App Review's own
  test account will be refused.

**APIs & Services → Credentials → Create credentials → OAuth client ID**

Create **one Web application** client. Not an iOS or Android client —
the flow goes device → Supabase → Google, so Google only ever sees
Supabase's callback:

| Field | Value |
| ----- | ----- |
| Application type | Web application |
| Authorised redirect URI | `https://wpcwjjlaoolnqddeqpce.supabase.co/auth/v1/callback` |

Keep the **Client ID** and **Client secret**.

## 2. Supabase → Authentication → Providers → Google

Enable it, paste the Client ID and Client secret, save.

## 3. Supabase → Authentication → URL Configuration

Add every URL the app can legitimately come back to. Supabase silently
falls back to the Site URL for anything not listed, which looks exactly
like a broken login:

```
mapmeet://**
https://hamuud.github.io/mapmeet/**
http://localhost:8081/**
```

The first is the native deep link, the second the deployed web app, the
third local `expo start --web`.

## 4. Turn it on

```ts
// config/features.ts
export const GOOGLE_SIGN_IN = true;
```

Commit and push; the web app redeploys itself. For iOS, `expo-web-browser`
is already a dependency and `mapmeet` is already the registered scheme —
the same one password-reset links use — so this should not need a new
native build. Confirm on the device before assuming it.

---

## How the flow actually works

Worth knowing, because the failure modes are all in the seams.

1. `signInWithOAuth` asks Supabase for a Google consent URL.
2. **Native** opens it in `openAuthSessionAsync` — a system browser sheet
   that shares no cookies with the app — and waits for a redirect to
   `mapmeet://auth-callback?code=…`. **Web** just navigates there.
3. Google returns to Supabase, Supabase creates or finds the user and
   redirects back with a one-time `code`.
4. Native swaps the code for a session with `exchangeCodeForSession`.
   Web does the same automatically on load (`detectSessionInUrl`), which
   is what `app/auth-callback.tsx` is holding a spinner for.

### PKCE, and what it changed

The Supabase client now runs `flowType: 'pkce'`. Any app on the phone can
claim the `mapmeet://` scheme and grab the redirect; PKCE makes a stolen
code useless without a verifier that never leaves the device.

It changes the **email** links too — confirm-signup and password-reset
now arrive as `?code=` rather than `#access_token=`, and the verifier
lives in the client storage of whichever install started the flow. The
practical consequence: **a password-reset link must be opened on the
device that requested it.** Requesting on a phone and opening on a
laptop used to work and now will not. `useDeepLinkSession` still accepts
the old shape, so links already sitting in an inbox keep working.

### What a Google signup creates

`handle_new_user()` reads whichever metadata shape it was handed. Google
sends `full_name` / `name`, `avatar_url` / `picture` and `email` but
never a username, so:

| Column | From |
| ------ | ---- |
| `display_name` | `full_name` → `name` → the email's local part |
| `avatar_url` | Google's photo |
| `username` | the email's local part, slugified and de-duplicated (`adriana.kovalenko`, then `adriana.kovalenko1`…) |
| `onboarding_complete` | **false** |

That last flag is what sends them to `/(auth)/welcome` once, to pick a
handle — the generated one is public, it is their profile URL. Skipping
is allowed. Email signups are marked complete immediately and never see
the screen.

A name with no Latin characters at all (`Олекса Ковальський` with a
Cyrillic email) falls back to `user_1a2b3c4d`, and the welcome screen is
how they fix it.

### Same email, both methods

If someone signs up with `a@example.com` and a password, then later uses
Google with the same address, Supabase links the identities onto one
user when the email is verified on both sides. They keep one profile.
Worth testing deliberately once, because the alternative — two accounts,
two profiles, one confused person — is not obvious from the outside.

---

## Before the App Store

Guideline **4.8** requires that an app offering a third-party login also
offers one that limits collection to name and email, lets the user keep
their email private, and does no ad tracking. MapMeet's own
email/password signup is a fair argument that we already do — Apple
exempts apps using their own account system — and plenty of apps ship
Google alongside email and pass review.

It is still the weakest point in the submission. **Sign in with Apple**
is the version of that argument nobody has to make to a reviewer, and on
an iOS-first app it is worth doing: `expo-apple-authentication`, an
Apple Services ID and key, a native rebuild, and flipping
`APPLE_SIGN_IN`. Say the word and I'll build it.
