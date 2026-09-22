-- Tbilisi Quest :: 0026 :: squad drops
--
-- A drop that will not open until several players are standing at it at the
-- same time. It is the one mechanic here that a teenager cannot do alone, which
-- is the point twice over: it gives them a reason to drag three friends across
-- town, and it turns one coffee into three for the merchant.
--
-- The rule it has to survive is obvious and has to be enforced server-side: a
-- player claiming a squad drop while their "friends" are at home. So presence
-- is a row written by each player from their own position, checked against the
-- drop's geofence at the moment it is written, and it goes stale on a timer.
-- Nobody can check in on anybody else's behalf, and nobody's presence lasts
-- longer than the walk to the counter.
--
-- Group play is 16+ (see 0025). A 14-year-old is not asked to meet strangers at
-- a location this app chose.

set search_path = public, extensions;

alter table public.drops
  -- 1 means an ordinary drop. Anything above means this many distinct players
  -- must be inside claim_radius_m within the presence window.
  add column if not exists squad_size int not null default 1
    check (squad_size between 1 and 8);

-- How long a check-in counts for. Long enough that three people arriving a
-- minute apart still form a squad; short enough that presence cannot be banked
-- an hour in advance.
create or replace function public.squad_window()
returns interval language sql immutable as $$ select interval '4 minutes' $$;

create table if not exists public.squad_checkins (
  drop_id    uuid not null references public.drops(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  at         timestamptz not null default now(),
  -- Kept for fraud review: three check-ins from one rooftop at identical
  -- coordinates is a pattern worth being able to see after the fact.
  point      geography(point, 4326),
  primary key (drop_id, user_id)
);

create index if not exists squad_checkins_fresh_idx
  on public.squad_checkins (drop_id, at desc);

alter table public.squad_checkins enable row level security;

-- Whether the caller is currently present at a drop.
--
-- A security-definer function rather than a subquery inside the policy: a
-- policy on squad_checkins that itself selects from squad_checkins re-enters
-- the same policy and recurses. Definer context bypasses RLS for this one
-- narrow question, which is the standard way out of that trap.
create or replace function public.is_present_at(p_drop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.squad_checkins sc
    where sc.drop_id = p_drop_id
      and sc.user_id = auth.uid()
      and sc.at > now() - public.squad_window()
  );
$$;

grant execute on function public.is_present_at(uuid) to authenticated;

-- A player sees who is present at a drop they are also standing at. The client
-- only renders a count, but the policy is what makes that true rather than a
-- promise.
create policy squad_checkins_select on public.squad_checkins
  for select to authenticated
  using (
    public.is_platform_admin()
    or user_id = auth.uid()
    or public.is_present_at(drop_id)
  );

-- ---------------------------------------------------------------------------
-- Checking in
-- ---------------------------------------------------------------------------
create or replace function public.squad_checkin(
  p_drop_id uuid,
  p_lat     double precision,
  p_lng     double precision
)
returns table (present int, needed int, ready boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_point  geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_drop   public.drops%rowtype;
  v_count  int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform public.assert_player_active();
  perform public.assert_age_known();

  if not public.can_group_play(auth.uid()) then
    raise exception 'AGE_RESTRICTED';
  end if;

  select * into v_drop from public.drops d where d.id = p_drop_id;
  if not found then
    raise exception 'NO_SUCH_DROP';
  end if;

  if v_drop.squad_size <= 1 then
    raise exception 'NOT_A_SQUAD_DROP';
  end if;

  -- Presence is only ever recorded for someone actually standing there. This
  -- is the check that makes the whole mechanic honest.
  if st_distance(v_drop.location, v_point) > v_drop.claim_radius_m then
    raise exception 'OUT_OF_RANGE';
  end if;

  insert into public.squad_checkins (drop_id, user_id, at, point)
  values (p_drop_id, auth.uid(), now(), v_point)
  on conflict (drop_id, user_id) do update
    set at = now(), point = excluded.point;

  select count(*)::int into v_count
  from public.squad_checkins sc
  where sc.drop_id = p_drop_id
    and sc.at > now() - public.squad_window();

  return query select v_count, v_drop.squad_size, (v_count >= v_drop.squad_size);
end;
$$;

grant execute on function public.squad_checkin(uuid, double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The gate on claiming
-- ---------------------------------------------------------------------------
create or replace function public.squad_ready(p_drop_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    coalesce(
      (select count(*) from public.squad_checkins sc
        where sc.drop_id = p_drop_id
          and sc.at > now() - public.squad_window()), 0
    ) >= (select d.squad_size from public.drops d where d.id = p_drop_id)
    -- And the claimer is one of them. Otherwise a player could wait for three
    -- strangers to gather and claim from the tram.
    and exists (
      select 1 from public.squad_checkins mine
      where mine.drop_id = p_drop_id
        and mine.user_id = p_user_id
        and mine.at > now() - public.squad_window()
    );
$$;

grant execute on function public.squad_ready(uuid, uuid) to authenticated;

-- Enforced on the voucher itself, like the age check in 0025, so it covers
-- every path that could hand someone a voucher rather than just claim_voucher.
create or replace function public.check_squad_before_claim()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_size int;
begin
  if new.status = 'held' and (old.status is distinct from 'held') and new.user_id is not null then
    select d.squad_size into v_size
    from public.drops d where d.id = new.drop_id;

    if coalesce(v_size, 1) > 1 then
      if not public.can_group_play(new.user_id) then
        raise exception 'AGE_RESTRICTED';
      end if;
      if not public.squad_ready(new.drop_id, new.user_id) then
        raise exception 'SQUAD_NOT_READY';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vouchers_check_squad on public.vouchers;
create trigger vouchers_check_squad
  before update on public.vouchers
  for each row execute function public.check_squad_before_claim();

-- Stale check-ins are noise; a daily sweep is plenty since the window is
-- minutes and the table is small.
select cron.schedule(
  'prune-squad-checkins',
  '15 4 * * *',
  $$delete from public.squad_checkins where at < now() - interval '2 days'$$
);

-- ---------------------------------------------------------------------------
-- Surfacing it
-- ---------------------------------------------------------------------------
-- Both readers gain squad columns. drop_detail's OUT row type changes, so it
-- has to be dropped rather than replaced.
drop function if exists public.drop_detail(uuid, double precision, double precision);

create or replace function public.drop_detail(
  p_drop_id uuid,
  p_lat     double precision,
  p_lng     double precision
)
returns table (
  id               uuid,
  rarity           voucher_rarity,
  starts_at        timestamptz,
  ends_at          timestamptz,
  claim_radius_m   int,
  reveal_radius_m  int,
  distance_m       double precision,
  revealed         boolean,
  remaining        int,
  in_claim_range   boolean,
  own_voucher      text,
  venue_name_ka    text,
  venue_name_en    text,
  title_ka         text,
  title_en         text,
  description_ka   text,
  description_en   text,
  offer            offer_type,
  discount_percent int,
  squad_size       int,
  squad_present    int,
  squad_ready      boolean,
  -- False for an under-16 looking at a squad drop, so the screen can explain
  -- rather than simply refuse.
  squad_allowed    boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_point geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
begin
  return query
  select
    d.id,
    d.rarity,
    d.starts_at,
    d.ends_at,
    d.claim_radius_m,
    d.reveal_radius_m,
    st_distance(d.location, v_point),
    true,
    (select count(*)::int from public.vouchers vo
      where vo.drop_id = d.id and vo.status = 'available'),
    (st_distance(d.location, v_point) <= d.claim_radius_m),
    coalesce(
      (select vo.status::text from public.vouchers vo
        where vo.drop_id = d.id and vo.user_id = auth.uid()
        limit 1),
      'none'
    ),
    v.name_ka,
    v.name_en,
    d.title_ka,
    d.title_en,
    d.description_ka,
    d.description_en,
    d.offer,
    d.discount_percent,
    d.squad_size,
    (select count(*)::int from public.squad_checkins sc
      where sc.drop_id = d.id and sc.at > now() - public.squad_window()),
    public.squad_ready(d.id, auth.uid()),
    public.can_group_play(auth.uid())
  from public.drops d
  join public.venues v on v.id = d.venue_id
  where d.id = p_drop_id
    and v.status = 'approved'
    and v.is_active;
end;
$$;

grant execute on function public.drop_detail(uuid, double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The map needs to know, so it can mark a squad drop before anyone walks there
-- ---------------------------------------------------------------------------
drop function if exists public.nearby_drops(double precision, double precision, int);

create or replace function public.nearby_drops(
  p_lat    double precision,
  p_lng    double precision,
  p_radius int default 30000
)
returns table (
  id               uuid,
  lat              double precision,
  lng              double precision,
  uncertainty_m    int,
  rarity           voucher_rarity,
  is_boss_chest    boolean,
  distance_m       double precision,
  revealed         boolean,
  starts_at        timestamptz,
  ends_at          timestamptz,
  remaining        int,
  venue_name_ka    text,
  venue_name_en    text,
  title_ka         text,
  title_en         text,
  offer            offer_type,
  discount_percent int,
  squad_size       int
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_point geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_cfg   public.safety_config%rowtype;
  v_local time;
begin
  select * into v_cfg from public.safety_config sc where sc.id;

  v_local := (now() at time zone 'Asia/Tbilisi')::time;
  if v_local < v_cfg.play_opens_at or v_local >= v_cfg.play_closes_at then
    return;
  end if;

  return query
  select
    d.id,
    st_y(d.location::geometry),
    st_x(d.location::geometry),
    0,
    d.rarity,
    d.is_boss_chest,
    st_distance(d.location, v_point),
    true,
    d.starts_at,
    d.ends_at,
    (select count(*)::int from public.vouchers vo
      where vo.drop_id = d.id and vo.status = 'available'),
    v.name_ka,
    v.name_en,
    d.title_ka,
    d.title_en,
    d.offer,
    d.discount_percent,
    d.squad_size
  from public.drops d
  join public.venues v on v.id = d.venue_id
  where d.status in ('scheduled', 'live')
    and v.is_active
    and v.status = 'approved'
    and d.ends_at > now()
    and (not v_cfg.require_manual_review or d.safety_reviewed_at is not null)
    and st_dwithin(d.location, v_point, p_radius)
  order by st_distance(d.location, v_point)
  limit 500;
end;
$$;

grant execute on function public.nearby_drops(double precision, double precision, int)
  to authenticated;
