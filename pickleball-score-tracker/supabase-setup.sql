-- PicklePlay live session storage (run once in Supabase SQL Editor)
create table if not exists public.pickleplay_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.pickleplay_sessions enable row level security;

-- Anyone with the unguessable session URL can read the session.
create policy "public can view shared sessions"
on public.pickleplay_sessions for select
using (true);

-- Only the anonymous/authenticated user who created the row can create/update/delete it.
create policy "owner can create session"
on public.pickleplay_sessions for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "owner can update session"
on public.pickleplay_sessions for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "owner can delete session"
on public.pickleplay_sessions for delete
to authenticated
using (auth.uid() = owner_id);

-- In Supabase Dashboard also enable Authentication > Providers > Anonymous Sign-Ins.
