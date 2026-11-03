-- Run this in Supabase SQL Editor in the existing DJ WHISTER project.
create table if not exists public.whister_live_broadcasts (
  id uuid primary key default gen_random_uuid(),
  cloudflare_input_id text not null unique,
  title text not null default 'DJ WHISTER LIVE',
  presenter_name text not null default 'DJ WHISTER 256',
  show_title text not null default '',
  lower_third jsonb not null default '{}'::jsonb,
  status text not null default 'starting' check (status in ('starting','live','ended','failed')),
  publish_url text not null,
  playback_url text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists whister_live_status_started_idx
  on public.whister_live_broadcasts (status, started_at desc);
alter table public.whister_live_broadcasts enable row level security;
drop policy if exists "Public can view live broadcast metadata" on public.whister_live_broadcasts;
create policy "Public can view live broadcast metadata"
  on public.whister_live_broadcasts for select using (status = 'live');
grant select on public.whister_live_broadcasts to anon, authenticated;
-- No browser INSERT/UPDATE/DELETE policies. Only the Render service-role backend writes rows.
