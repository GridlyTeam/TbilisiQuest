-- Tbilisi Quest :: 0005 :: Row Level Security
--
-- With Supabase the mobile client talks to PostgREST using the user's JWT, so
-- the database is effectively public API surface. RLS is not defence in depth
-- here -- it is the only thing standing between a curious user and every other
-- user's data. Every table gets it, and anything without a policy is denied.

alter table public.users             enable row level security;
alter table public.venues            enable row level security;
alter table public.merchant_users    enable row level security;
alter table public.drops             enable row level security;
alter table public.vouchers          enable row level security;
alter table public.redemptions       enable row level security;
alter table public.drop_impressions  enable row level security;
alter table public.user_xp           enable row level security;
alter table public.xp_events         enable row level security;
alter table public.quests            enable row level security;
alter table public.user_quests       enable row level security;
alter table public.badges            enable row level security;
alter table public.user_badges       enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Marked stable + security definer so policies can call them without recursing
-- back through merchant_users' own RLS.
create or replace function public.has_venue_role(
  p_venue_id uuid,
  p_roles    merchant_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.merchant_users mu
    where mu.user_id  = auth.uid()
      and mu.venue_id = p_venue_id
      and mu.role     = any (p_roles)
  );
$$;

create or replace function public.my_venue_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select venue_id from public.merchant_users where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create policy users_select_self on public.users
  for select using (id = auth.uid());

create policy users_update_self on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy users_insert_self on public.users
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- venues
-- ---------------------------------------------------------------------------
-- Venue rows are public to signed-in players -- the map needs them. Note that
-- counter_secret lives on this table, so the anon/authenticated roles must have
-- column-level SELECT revoked on it.
create policy venues_select_active on public.venues
  for select to authenticated
  using (is_active or has_venue_role(id, array['owner', 'manager']::merchant_role[]));

create policy venues_update_by_owner on public.venues
  for update to authenticated
  using (has_venue_role(id, array['owner', 'manager']::merchant_role[]))
  with check (has_venue_role(id, array['owner', 'manager']::merchant_role[]));

revoke select (counter_secret) on public.venues from authenticated, anon;

-- ---------------------------------------------------------------------------
-- merchant_users
-- ---------------------------------------------------------------------------
create policy merchant_users_select on public.merchant_users
  for select to authenticated
  using (
    user_id = auth.uid()
    or has_venue_role(venue_id, array['owner']::merchant_role[])
  );

-- Only owners manage staff, and only at their own venues.
create policy merchant_users_write on public.merchant_users
  for all to authenticated
  using (has_venue_role(venue_id, array['owner']::merchant_role[]))
  with check (has_venue_role(venue_id, array['owner']::merchant_role[]));

-- ---------------------------------------------------------------------------
-- drops
-- ---------------------------------------------------------------------------
-- Players read live drops directly only for detail views they have already
-- revealed; the map itself goes through nearby_drops(), which strips
-- unrevealed fields. Staff read everything for their own venues, including
-- drafts.
create policy drops_select_live on public.drops
  for select to authenticated
  using (
    (status in ('scheduled', 'live', 'exhausted') and ends_at > now() - interval '7 days')
    or venue_id in (select public.my_venue_ids())
  );

create policy drops_write_by_staff on public.drops
  for all to authenticated
  using (has_venue_role(venue_id, array['owner', 'manager']::merchant_role[]))
  with check (has_venue_role(venue_id, array['owner', 'manager']::merchant_role[]));

-- ---------------------------------------------------------------------------
-- vouchers
-- ---------------------------------------------------------------------------
-- A player sees only their own vouchers. Crucially there is no INSERT or UPDATE
-- policy at all: the only way to obtain a voucher is claim_voucher(), which is
-- security definer and therefore bypasses RLS. That closes the door on a client
-- writing itself a voucher directly through PostgREST.
create policy vouchers_select_own on public.vouchers
  for select to authenticated
  using (
    user_id = auth.uid()
    or drop_id in (
      select d.id from public.drops d where d.venue_id in (select public.my_venue_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- redemptions
-- ---------------------------------------------------------------------------
create policy redemptions_select on public.redemptions
  for select to authenticated
  using (
    user_id = auth.uid()
    or venue_id in (select public.my_venue_ids())
  );

-- Written only by redeem_voucher(). No direct insert policy, same reasoning as
-- vouchers.

-- ---------------------------------------------------------------------------
-- drop_impressions
-- ---------------------------------------------------------------------------
-- Players may log their own impressions; only venue staff may read them back.
create policy impressions_insert_self on public.drop_impressions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy impressions_select_staff on public.drop_impressions
  for select to authenticated
  using (
    drop_id in (
      select d.id from public.drops d where d.venue_id in (select public.my_venue_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- Gamification
-- ---------------------------------------------------------------------------
create policy user_xp_select_self on public.user_xp
  for select to authenticated using (user_id = auth.uid());

create policy xp_events_select_self on public.xp_events
  for select to authenticated using (user_id = auth.uid());

-- Quest and badge definitions are shared content.
create policy quests_select_all on public.quests
  for select to authenticated using (is_active);

create policy badges_select_all on public.badges
  for select to authenticated using (true);

create policy user_quests_select_self on public.user_quests
  for select to authenticated using (user_id = auth.uid());

create policy user_badges_select_self on public.user_badges
  for select to authenticated using (user_id = auth.uid());

-- XP and quest progress are mutated only through security-definer functions,
-- so no write policies are granted to authenticated.

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
grant execute on function public.nearby_drops(double precision, double precision, int) to authenticated;
grant execute on function public.claim_voucher(uuid, double precision, double precision) to authenticated;
grant execute on function public.redeem_voucher(text, text, double precision, double precision) to authenticated;
grant execute on function public.current_counter_code(uuid) to authenticated;

-- Internal only -- never callable from a client session.
revoke execute on function public.award_xp(uuid, int, text, uuid) from authenticated, anon;
revoke execute on function public.release_expired_holds() from authenticated, anon;
revoke execute on function public.materialise_drop_inventory(uuid) from anon;
