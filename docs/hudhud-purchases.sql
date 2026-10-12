-- Apply in HudHud Supabase SQL editor before using /api/purchase-requests.
create table if not exists public.hudhud_purchase_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 merchant text not null,
 item text not null,
 amount_cents integer not null check (amount_cents between 1 and 500),
 currency text not null default 'usd' check (currency='usd'),
 checkout_url text,
 status text not null default 'pending' check (status in ('pending','approved','rejected','completed','failed')),
 created_at timestamptz not null default now(),
 approved_at timestamptz
);
create index if not exists hudhud_purchase_requests_user_created on public.hudhud_purchase_requests(user_id,created_at desc);
alter table public.hudhud_purchase_requests enable row level security;
create policy "Purchase requests visible to owner" on public.hudhud_purchase_requests for select to authenticated using (auth.uid()=user_id);
-- All mutations are server-mediated. Never give clients direct update/delete access.
comment on table public.hudhud_purchase_requests is 'Approval tracking only; approval is NOT a payment or permission to auto-charge.';
