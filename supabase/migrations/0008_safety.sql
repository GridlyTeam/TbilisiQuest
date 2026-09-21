-- Tbilisi Quest :: 0008 :: player safety
--
-- This migration exists because location games have killed people. Players
-- have walked into traffic, off embankments and onto rail lines while looking
-- at a phone. Every control here is a response to something that has actually
-- happened somewhere.
--
-- The split that matters: the SPEED lock can only live on the client, because
-- the server never sees velocity. Everything else -- play hours, exclusion
-- zones, manual review -- is enforced in the database, where a patched APK
-- cannot reach it. Treat the client controls as ergonomics and the server
-- controls as the actual guarantee.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- safety_config
-- ---------------------------------------------------------------------------
-- One row. Kept as data rather than constants so limits can be tightened
-- without a deploy -- which is what you want the day something goes wrong.
create table public.safety_config (
  id                     boolean primary key default true check (id),

  -- Play window in venue-local time. The spec's first-year rule is 11:00-19:00:
  -- no dawn, no dark, no drunk-hours hunting.
  play_opens_at          time not null default '11:00',
  play_closes_at         time not null default '19:00',

  -- Above this the app locks. 10 km/h clears a brisk walk and blocks cycling
  -- and driving. Hysteresis is applied client-side so a single noisy GPS
  -- sample cannot flap the lock.
  max_speed_kmh          numeric(5,2) not null default 10.0,

  -- Minimum age to play unaccompanied.
  min_age_unaccompanied  int not null default 16,

  -- Every drop needs a human to confirm its surroundings before it can go
  -- live. Turning this off is a deliberate, auditable act.
  require_manual_review  boolean not null default true,

  updated_at             timestamptz not null default now()
);

insert into public.safety_config (id) values (true);

-- ---------------------------------------------------------------------------
-- safety_zones
-- ---------------------------------------------------------------------------
-- Polygons where a drop may never be placed and a claim may never complete.
-- `buffer_m` widens the polygon at query time: a road centreline needs ~15 m
-- of margin, a rail line more.
create type safety_zone_kind as enum (
  'roadway',        -- carriageways and junctions
  'rail',           -- track and level crossings
  'embankment',     -- river walls, retaining walls, drops
  'construction',   -- active building sites
  'private',        -- courtyards, private land
  'religious',      -- churches, monasteries
  'cemetery',
  'school',
  'hospital',
  'water',          -- the Mtkvari, reservoirs
  'steep'           -- slopes and stairs: Sololaki, Mtatsminda
);

create table public.safety_zones (
  id         uuid primary key default gen_random_uuid(),
  kind       safety_zone_kind not null,
  name       text,
  area       geography(polygon, 4326) not null,
  -- Extra clearance in metres beyond the drawn polygon.
  buffer_m   int not null default 0 check (buffer_m >= 0),
  is_active  boolean not null default true,
  notes      text,
  created_at timestamptz not null default now()
);

create index safety_zones_area_idx on public.safety_zones using gist (area);
create index safety_zones_active_idx on public.safety_zones (kind) where is_active;

-- ---------------------------------------------------------------------------
-- Manual review on drops
-- ---------------------------------------------------------------------------
-- "Every search radius is checked by hand before it goes live." A drop with no
-- review is never returned by the map query and never claimable.
alter table public.drops
  add column safety_reviewed_at  timestamptz,
  add column safety_reviewed_by  uuid references auth.users(id) on delete set null,
  add column safety_notes        text;

create index drops_awaiting_review_idx
  on public.drops (venue_id)
  where safety_reviewed_at is null;

-- ---------------------------------------------------------------------------
-- Age acknowledgement on players
-- ---------------------------------------------------------------------------
alter table public.users
  add column date_of_birth        date,
  add column guardian_ack_at      timestamptz,
  -- The traffic warning is shown once per calendar day, before the first hunt.
  add column safety_briefed_on    date;

-- ---------------------------------------------------------------------------
-- check_location_safety
-- ---------------------------------------------------------------------------
-- Returns the zones a point falls inside, nearest first. Empty means clear.
create or replace function public.check_location_safety(
  p_lat double precision,
  p_lng double precision
)
returns table (kind safety_zone_kind, name text, distance_m double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select z.kind, z.name, st_distance(z.area, pt.g) as distance_m
  from public.safety_zones z
  cross join lateral (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  ) pt
  where z.is_active
    and st_dwithin(z.area, pt.g, z.buffer_m)
  order by distance_m;
$$;

-- ---------------------------------------------------------------------------
-- Reject unsafe drops at creation
-- ---------------------------------------------------------------------------
-- Prevention beats detection: a drop inside an exclusion zone never gets
-- written, so no later bug can expose it.
create or replace function public.enforce_drop_safety()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_zone record;
  v_point geography;
begin
  v_point := coalesce(
    new.location,
    (select location from public.venues where id = new.venue_id)
  );

  select z.kind, z.name into v_zone
  from public.safety_zones z
  where z.is_active
    and st_dwithin(z.area, v_point, z.buffer_m)
  limit 1;

  if found then
    raise exception 'UNSAFE_LOCATION:%', v_zone.kind
      using hint = coalesce(v_zone.name, 'exclusion zone');
  end if;

  return new;
end;
$$;

create trigger drops_enforce_safety
  before insert or update of location on public.drops
  for each row execute function public.enforce_drop_safety();

-- ---------------------------------------------------------------------------
-- nearby_drops: hide anything unreviewed or outside the play window
-- ---------------------------------------------------------------------------
create or replace function public.nearby_drops(
  p_lat    double precision,
  p_lng    double precision,
  p_radius int default 2000
)
returns table (
  id              uuid,
  location        geography,
  rarity          voucher_rarity,
  is_boss_chest   boolean,
  distance_m      double precision,
  revealed        boolean,
  starts_at       timestamptz,
  ends_at         timestamptz,
  remaining       int,
  venue_name_ka   text,
  venue_name_en   text,
  title_ka        text,
  title_en        text,
  offer           offer_type,
  discount_percent int
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_point  geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_cfg    public.safety_config%rowtype;
  v_local  time;
begin
  select * into v_cfg from public.safety_config where id;

  -- Venue-local wall clock, not UTC: the rule is "11:00 to 19:00 in Tbilisi".
  v_local := (now() at time zone 'Asia/Tbilisi')::time;

  -- Outside the play window the map is simply empty. No drops, nothing to
  -- walk toward in the dark.
  if v_local < v_cfg.play_opens_at or v_local >= v_cfg.play_closes_at then
    return;
  end if;

  return query
  select
    d.id, d.location, d.rarity, d.is_boss_chest,
    st_distance(d.location, v_point) as distance_m,
    (st_distance(d.location, v_point) <= d.reveal_radius_m) as revealed,
    d.starts_at, d.ends_at,
    (select count(*)::int from public.vouchers vo
      where vo.drop_id = d.id and vo.status = 'available') as remaining,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then v.name_ka end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then v.name_en end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.title_ka end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.title_en end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.offer end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.discount_percent end
  from public.drops d
  join public.venues v on v.id = d.venue_id
  where d.status in ('scheduled', 'live')
    and v.is_active
    and d.ends_at > now()
    -- Unreviewed drops are invisible.
    and (not v_cfg.require_manual_review or d.safety_reviewed_at is not null)
    and st_dwithin(d.location, v_point, p_radius)
  order by distance_m
  limit 200;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_voucher: same guards on the write path
-- ---------------------------------------------------------------------------
-- Hiding a drop from the map is not enough; a client that already holds the id
-- could still call this. The authoritative checks belong here.
create or replace function public.claim_voucher(
  p_drop_id uuid,
  p_lat     double precision,
  p_lng     double precision
)
returns table (
  voucher_id      uuid,
  redemption_code text,
  hold_expires_at timestamptz,
  xp_awarded      int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id  uuid := auth.uid();
  v_drop     public.drops%rowtype;
  v_point    geography;
  v_distance double precision;
  v_level    int;
  v_opens_at timestamptz;
  v_voucher  public.vouchers%rowtype;
  v_hold     interval := interval '30 minutes';
  v_xp       int;
  v_cfg      public.safety_config%rowtype;
  v_local    time;
  v_zone     record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_cfg from public.safety_config where id;

  -- Play window.
  v_local := (now() at time zone 'Asia/Tbilisi')::time;
  if v_local < v_cfg.play_opens_at or v_local >= v_cfg.play_closes_at then
    raise exception 'OUTSIDE_PLAY_HOURS:%-%', v_cfg.play_opens_at, v_cfg.play_closes_at;
  end if;

  select * into v_drop from public.drops where id = p_drop_id;
  if not found then
    raise exception 'DROP_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_cfg.require_manual_review and v_drop.safety_reviewed_at is null then
    raise exception 'DROP_NOT_REVIEWED';
  end if;

  if v_drop.status not in ('scheduled', 'live') then
    raise exception 'DROP_NOT_CLAIMABLE';
  end if;

  -- Where the player is standing right now must also be clear. A drop can sit
  -- safely on a pavement while the player stands in the road beside it.
  select z.kind into v_zone
  from public.safety_zones z
  where z.is_active
    and st_dwithin(z.area, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, z.buffer_m)
  limit 1;

  if found then
    raise exception 'UNSAFE_POSITION:%', v_zone.kind;
  end if;

  v_point    := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_distance := st_distance(v_drop.location, v_point);

  if v_distance > v_drop.claim_radius_m then
    raise exception 'OUT_OF_RANGE:%', round(v_distance::numeric) using errcode = 'P0001';
  end if;

  select coalesce(ux.level, 1) into v_level
  from public.user_xp ux where ux.user_id = v_user_id;
  v_level := coalesce(v_level, 1);

  v_opens_at := v_drop.starts_at;
  if v_drop.early_access_level > 0 and v_level >= v_drop.early_access_level then
    v_opens_at := v_drop.starts_at - make_interval(mins => v_drop.early_access_minutes);
  end if;

  if now() < v_opens_at then
    raise exception 'NOT_YET_OPEN:%', v_opens_at;
  end if;
  if now() > v_drop.ends_at then
    raise exception 'DROP_EXPIRED';
  end if;

  update public.vouchers v
     set user_id         = v_user_id,
         status          = 'held',
         claimed_at      = now(),
         hold_expires_at = now() + v_hold,
         redemption_code = encode(gen_random_bytes(12), 'hex')
   where v.id = (
     select inner_v.id from public.vouchers inner_v
      where inner_v.drop_id = p_drop_id and inner_v.status = 'available'
      order by inner_v.id limit 1
      for update skip locked
   )
  returning v.* into v_voucher;

  if v_voucher.id is null then
    raise exception 'SOLD_OUT';
  end if;

  v_xp := case v_drop.rarity
            when 'common' then 10 when 'rare' then 30 when 'legendary' then 100
          end;

  perform public.award_xp(v_user_id, v_xp, 'claim', v_voucher.id);

  return query select v_voucher.id, v_voucher.redemption_code,
                      v_voucher.hold_expires_at, v_xp;

exception
  when unique_violation then
    raise exception 'ALREADY_CLAIMED';
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.safety_zones  enable row level security;
alter table public.safety_config enable row level security;

-- The client needs the config to show the right countdown and speed limit, and
-- needs zones to warn before a player walks into one.
create policy safety_config_read on public.safety_config
  for select to authenticated using (true);

create policy safety_zones_read on public.safety_zones
  for select to authenticated using (is_active);

grant execute on function public.check_location_safety(double precision, double precision)
  to authenticated;
