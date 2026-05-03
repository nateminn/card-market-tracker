-- Migration 005 — user profiles (tier + Stripe linkage).
--
-- Cardex is freemium B2C. The free tier gets the public market data; the
-- paid tier ($19.99/mo) unlocks the Signal Engine pick list, deeper
-- analytics, and watchlist alerts. We store per-user state in `profiles`,
-- one row per auth.users row, joined by id.
--
-- Why a separate table instead of auth.users.user_metadata?
--   - user_metadata is mutable from the client; tier MUST not be.
--   - We need to query users by tier (admin views, billing reconciliation).
--   - Stripe linkage needs a stable shape.
--
-- RLS is on. Users can read their own profile but cannot change `tier`
-- (only the service role / Stripe webhook can). Inserts happen via a
-- trigger when a new auth user is created — see handle_new_user().
--
-- Idempotent.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_tier_idx on profiles (tier);
create index if not exists profiles_stripe_customer_idx
  on profiles (stripe_customer_id) where stripe_customer_id is not null;

-- updated_at trigger
create or replace function profiles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function profiles_set_updated_at();

-- Auto-create a profile when a user signs up.
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, tier) values (new.id, 'free')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill: any existing auth.users without a profile.
insert into profiles (id, tier)
select id, 'free' from auth.users
on conflict (id) do nothing;

-- RLS: users can read their own profile. No client-side updates allowed
-- (tier changes flow through the Stripe webhook using the service role).
alter table profiles enable row level security;

drop policy if exists "profiles_self_select" on profiles;
create policy "profiles_self_select" on profiles
  for select using (auth.uid() = id);
