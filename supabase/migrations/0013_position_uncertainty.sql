-- Tbilisi Quest :: 0013 :: stop leaking exact positions through fog of war
--
-- Until now an unrevealed drop still carried its true coordinates in the API
-- response. The client drew a fixed-pixel circle over them, so zooming in
-- narrowed the ground area that circle covered and the exact spot became
-- readable -- and anyone reading the response directly never needed to zoom at
-- all. Hiding the venue name while shipping the coordinates hid nothing.
--
-- Now the server snaps an unrevealed drop to the centre of a grid cell and
-- says how large that cell is. The true position is never sent until the
-- player is close enough to have earned it.
--
-- Grid snapping, not random jitter: a random offset per request can be
-- averaged away by querying repeatedly from one spot. Snapping is
-- deterministic, so repeated queries return the same answer and reveal
-- nothing extra.

set search_path = public, extensions;

-- Cell size by distance. Coarse far away, tighter as you close in, exact once
-- revealed -- so approaching genuinely narrows the search.
create or replace function public.uncertainty_for(p_distance_m double precision)
returns int
language sql
immutable
as $$
  select case
    when p_distance_m <= 500  then 100
    when p_distance_m <= 2000 then 250
    else 500
  end;
$$;

-- Adding uncertainty_m changes the returned row type, which CREATE OR REPLACE
-- refuses. Dropping first is safe: nothing holds a dependency on it.
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
  -- Radius in metres within which the true point lies. Zero means exact.
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
  discount_percent int
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
  with candidate as (
    select
      d.*,
      v.name_ka as venue_ka,
      v.name_en as venue_en,
      st_y(d.location::geometry) as true_lat,
      st_x(d.location::geometry) as true_lng,
      st_distance(d.location, v_point) as dist
    from public.drops d
    join public.venues v on v.id = d.venue_id
    where d.status in ('scheduled', 'live')
      and v.is_active
      and v.status = 'approved'
      and d.ends_at > now()
      and (not v_cfg.require_manual_review or d.safety_reviewed_at is not null)
      and st_dwithin(d.location, v_point, p_radius)
  ),
  shown as (
    select
      c.*,
      (c.dist <= c.reveal_radius_m) as is_revealed,
      case when c.dist <= c.reveal_radius_m
           then 0
           else public.uncertainty_for(c.dist) end as cell_m
    from candidate c
  )
  select
    s.id,
    -- Snap to the centre of the containing cell. One degree of latitude is
    -- ~111,320 m; longitude shrinks with the cosine of latitude.
    case when s.cell_m = 0 then s.true_lat
         else (floor(s.true_lat / (s.cell_m / 111320.0)) + 0.5) * (s.cell_m / 111320.0)
    end as lat,
    case when s.cell_m = 0 then s.true_lng
         else (floor(s.true_lng / (s.cell_m / (111320.0 * cos(radians(s.true_lat))))) + 0.5)
              * (s.cell_m / (111320.0 * cos(radians(s.true_lat))))
    end as lng,
    s.cell_m as uncertainty_m,
    s.rarity,
    s.is_boss_chest,
    s.dist as distance_m,
    s.is_revealed as revealed,
    s.starts_at,
    s.ends_at,
    (select count(*)::int from public.vouchers vo
      where vo.drop_id = s.id and vo.status = 'available') as remaining,
    case when s.is_revealed then s.venue_ka end,
    case when s.is_revealed then s.venue_en end,
    case when s.is_revealed then s.title_ka end,
    case when s.is_revealed then s.title_en end,
    case when s.is_revealed then s.offer end,
    case when s.is_revealed then s.discount_percent end
  from shown s
  order by s.dist
  limit 500;
end;
$$;

grant execute on function public.nearby_drops(double precision, double precision, int) to authenticated;
grant execute on function public.uncertainty_for(double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- The detail screen must not leak it either
-- ---------------------------------------------------------------------------
-- The drop detail view read venue_coords directly, which returns exact
-- coordinates for every venue regardless of distance. This replaces that path
-- for players: it returns a distance and nothing positional.
create or replace function public.drop_distance(
  p_drop_id uuid,
  p_lat     double precision,
  p_lng     double precision
)
returns table (distance_m double precision, revealed boolean, claim_radius_m int)
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
    st_distance(d.location, v_point),
    (st_distance(d.location, v_point) <= d.reveal_radius_m),
    d.claim_radius_m
  from public.drops d
  where d.id = p_drop_id;
end;
$$;

grant execute on function public.drop_distance(uuid, double precision, double precision)
  to authenticated;

-- KNOWN RESIDUAL LEAK, recorded rather than hidden:
--
-- venue_coords still returns exact coordinates for every approved venue, and
-- RLS lets any signed-in account read it. A determined player could match a
-- snapped drop cell against the venue list and infer which venue it belongs
-- to. Venues are public businesses, so their addresses are not secret, but the
-- correlation does weaken fog of war.
--
-- Closing it properly means players never reading the venue table at all,
-- which needs the detail and voucher screens reworked to go through functions
-- that return only what the player has earned. Worth doing before launch;
-- noted here so it is not mistaken for solved.
