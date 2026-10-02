-- HudHud Health core schema
-- Apply to the Supabase project used by HudHud.
-- Health data is user-owned and protected by RLS.
create table if not exists public.hudhud_health_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'planned',
  permissions jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);
create table if not exists public.hudhud_health_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text,
  name text not null,
  date date not null default current_date,
  calories numeric(10,2) default 0,
  protein_g numeric(10,2) default 0,
  carbs_g numeric(10,2),
  fat_g numeric(10,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.hudhud_health_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text,
  merchant text not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  category text not null default 'other',
  date date not null default current_date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.hudhud_health_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  sample_type text not null,
  external_id text,
  value numeric,
  unit text,
  started_at timestamptz not null,
  ended_at timestamptz,
  source_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, provider, sample_type, external_id)
);
alter table public.hudhud_health_sources enable row level security;
alter table public.hudhud_health_meals enable row level security;
alter table public.hudhud_health_transactions enable row level security;
alter table public.hudhud_health_samples enable row level security;

drop policy if exists "health_sources_owner" on public.hudhud_health_sources;
create policy "health_sources_owner" on public.hudhud_health_sources for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists "health_meals_owner" on public.hudhud_health_meals;
create policy "health_meals_owner" on public.hudhud_health_meals for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists "health_transactions_owner" on public.hudhud_health_transactions;
create policy "health_transactions_owner" on public.hudhud_health_transactions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists "health_samples_owner" on public.hudhud_health_samples;
create policy "health_samples_owner" on public.hudhud_health_samples for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists hudhud_health_meals_user_date_idx on public.hudhud_health_meals(user_id,date desc);
create index if not exists hudhud_health_transactions_user_date_idx on public.hudhud_health_transactions(user_id,date desc);
create index if not exists hudhud_health_samples_user_time_idx on public.hudhud_health_samples(user_id,started_at desc);
