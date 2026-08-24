-- =========================================================================
-- MapMeet — paid premium: subscription entitlements
-- =========================================================================
-- Premium has only ever been handed out by an admin. This is the store
-- side of it: a monthly auto-renewing subscription grants the entitlement
-- and losing the subscription takes it away, with no human in the loop.
--
-- ⚠ WHY THIS IS NOT JUST `profiles.role = 'premium'`
--   role is ONE column: user | premium | designer | support | admin |
--   owner. Writing 'premium' into it on purchase would demote a designer
--   out of moderation access the moment they subscribed, and the revoke
--   would then write 'user' over a staff role permanently. The owner is
--   worse: assign_role() refuses to restore 'owner', so testing your own
--   purchase would lock you out of your own app.
--
--   So entitlement lives here, and the role is only SYNCED — and only
--   between 'user' and 'premium'. Every staff tier is untouchable by
--   this file. can_style_pin() reads both, so a subscribing designer
--   keeps their role AND gets the perk.
--
-- ⚠ WHY `entitled_until` AND NOT JUST `status`
--   Webhooks get lost. If access hung on a status flag and the EXPIRATION
--   webhook never arrived, a lapsed subscriber would keep premium
--   forever. Access is therefore a TIMESTAMP the store already gave us:
--   miss every future webhook and the entitlement still ends on its own.
--   The failure mode is "a paying customer briefly loses access", which
--   the sync path (subscription-sync, called on launch and on Restore)
--   repairs in one round trip. That is the right way round.
--
-- ⚠ CANCELLING IS NOT EXPIRING
--   RevenueCat's CANCELLATION event means "auto-renew is off", not
--   "access ends now". Somebody who cancels on day 3 of a month has paid
--   for that month, and Apple's own state machine keeps them entitled
--   until the period ends — revoking early would be a refund request and
--   a bad review. `will_renew` goes false; `entitled_until` does not
--   move. EXPIRATION is what ends access.
--
-- STORE-AGNOSTIC ON PURPOSE
--   `store` records where the money came from (app_store, play_store,
--   stripe, promotional…). Nothing else in the schema cares. Adding
--   Google Play or web billing later is a store configuration change in
--   RevenueCat plus a product id — no migration, no new code path.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Current state, one row per account
-- -------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  /** Which RevenueCat entitlement this row grants. One today. */
  entitlement        text not null default 'premium',
  /** app_store | play_store | stripe | rc_billing | promotional | … */
  store              text,
  product_id         text,
  /** RevenueCat's own subscriber id. Equal to user_id because the client
   *  calls Purchases.logIn(session.user.id) — that identity link is what
   *  lets the webhook find the account at all. Kept anyway: a TRANSFER
   *  event is the one case where they can disagree. */
  rc_app_user_id     text,
  /** For display and support, never for access control: active |
   *  in_grace | billing_issue | cancelled | expired | paused. */
  status             text not null default 'expired',
  /** THE access check. Access lasts until this instant, full stop. */
  entitled_until     timestamptz,
  /** False once auto-renew is off. Does not affect access — see header. */
  will_renew         boolean not null default false,
  /** production | sandbox. Sandbox renews absurdly fast and must never
   *  be mistaken for a real subscriber in revenue reporting. */
  environment        text not null default 'production',
  current_period_end timestamptz,
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create index if not exists subscriptions_entitled_until_idx
  on public.subscriptions (entitled_until desc);

alter table public.subscriptions enable row level security;

-- Readable by its owner so the account screen can show "renews on the
-- 14th". Writable by nobody: every write goes through the webhook or the
-- sync function, both of which run with the service-role key. A client
-- that could write here could grant itself premium.
drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.subscriptions from anon, authenticated;

-- -------------------------------------------------------------------------
-- 2. Every webhook delivery, append-only
-- -------------------------------------------------------------------------
-- Two jobs. Idempotency: RevenueCat retries, and `event_id` unique means
-- a redelivery is a no-op instead of a double-grant. And forensics: when
-- somebody swears they paid, this is the tape.
create table if not exists public.subscription_events (
  id         bigint generated by default as identity primary key,
  event_id   text unique,
  user_id    uuid references public.profiles(id) on delete set null,
  type       text not null,
  store      text,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.subscription_events enable row level security;
-- No policies: the service role bypasses RLS, and nobody else has any
-- business reading a raw store payload.
revoke all on public.subscription_events from anon, authenticated;

-- -------------------------------------------------------------------------
-- 3. The entitlement check
-- -------------------------------------------------------------------------
/** Is this account currently paying? Time-based on purpose — see the
 *  header. A NULL entitled_until means "never granted", not "forever". */
create or replace function public.has_active_subscription(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
     where s.user_id = p_user
       and s.entitled_until is not null
       and s.entitled_until > now()
  );
$$;

/** Premium perks = the paid tier, all staff, OR an active subscription.
 *
 *  The subscription arm is what makes this work for a designer or the
 *  owner, whose role must not be rewritten to 'premium' and therefore
 *  would never gain the perk through the role list alone. */
create or replace function public.can_style_pin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
      (select p.role = any(public.pin_style_roles()) from public.profiles p where p.id = p_user),
      false)
    or public.has_active_subscription(p_user);
$$;

-- -------------------------------------------------------------------------
-- 4. Keeping profiles.role in step
-- -------------------------------------------------------------------------
/** Move a plain user in and out of the 'premium' role to match their
 *  subscription. Called by the webhook and the sync function.
 *
 *  THREE THINGS IT REFUSES TO DO, each deliberate:
 *
 *  - It never touches a staff role. designer / support / admin / owner
 *    keep what they have; they get the perks through can_style_pin()
 *    instead. This is the whole reason entitlement is not stored in the
 *    role column.
 *  - It never demotes an account with no subscriptions row. A premium
 *    role handed out by an admin as a comp is not this function's
 *    business, and sweeping it away would be a support ticket.
 *  - It writes nothing when the role is already right, so it does not
 *    churn updated_at or fire triggers on every renewal. */
create or replace function public.sync_premium_role(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_role    text;
  v_active  boolean;
  v_has_row boolean;
begin
  select p.role into v_role from public.profiles p where p.id = p_user;
  if not found then
    return null;
  end if;

  -- Anything above the paid tier is out of scope, in both directions.
  if v_role = any(public.staff_roles()) then
    return v_role;
  end if;

  select exists(select 1 from public.subscriptions s where s.user_id = p_user)
    into v_has_row;
  if not v_has_row then
    return v_role;
  end if;

  v_active := public.has_active_subscription(p_user);

  if v_active and v_role = 'user' then
    update public.profiles set role = 'premium' where id = p_user;
    return 'premium';
  elsif not v_active and v_role = 'premium' then
    update public.profiles set role = 'user' where id = p_user;
    return 'user';
  end if;

  return v_role;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. The sweeper
-- -------------------------------------------------------------------------
/** Demote everyone whose entitlement has run out.
 *
 *  The webhook already handles the ordinary case, and `entitled_until`
 *  means access lapses on time whatever happens. But profiles.role is a
 *  cache of that, and a role nobody updates would leave an ex-subscriber
 *  wearing the premium badge indefinitely. Runs on a schedule; returns
 *  how many it moved. */
create or replace function public.expire_lapsed_subscriptions()
returns integer language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_n integer := 0;
begin
  for v_user in
    select p.id from public.profiles p
      join public.subscriptions s on s.user_id = p.id
     where p.role = 'premium'
       and (s.entitled_until is null or s.entitled_until <= now())
  loop
    perform public.sync_premium_role(v_user);
    v_n := v_n + 1;
  end loop;

  -- Statuses go stale the same way: nothing else moves a row off
  -- 'active' if the EXPIRATION webhook was lost.
  update public.subscriptions
     set status = 'expired', will_renew = false, updated_at = now()
   where status in ('active', 'in_grace', 'billing_issue', 'cancelled')
     and (entitled_until is null or entitled_until <= now());

  return v_n;
end;
$$;

/** What the account screen shows: am I paying, until when, and does it
 *  renew. Returns no rows when signed out or never subscribed. */
create or replace function public.my_subscription()
returns table (
  active boolean, status text, store text, product_id text,
  entitled_until timestamptz, will_renew boolean
)
language sql stable security definer set search_path = public as $$
  select
    (s.entitled_until is not null and s.entitled_until > now()),
    s.status, s.store, s.product_id, s.entitled_until, s.will_renew
  from public.subscriptions s
 where s.user_id = auth.uid();
$$;

grant execute on function public.has_active_subscription(uuid) to authenticated;
grant execute on function public.my_subscription()             to authenticated;
-- sync_premium_role and expire_lapsed_subscriptions are deliberately NOT
-- granted: they are for the service role and pg_cron. A client that
-- could call sync_premium_role could not grant itself anything (it reads
-- the subscriptions table for the answer), but there is no reason to
-- offer it the handle.
