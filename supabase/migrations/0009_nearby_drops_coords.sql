-- Tbilisi Quest :: 0009 :: return plain coordinates from nearby_drops
--
-- The function returned `location geography`, which PostgREST serialises as a
-- WKB hex string ("0101000020E6100000..."), not GeoJSON. The map client was
-- looking for `{ coordinates: [lng, lat] }`, found a string, and skipped every
-- marker -- so drops loaded correctly and nothing was drawn.
--
-- Returning two doubles removes the ambiguity entirely: no client-side WKB
-- parsing, no dependency on how any particular client serialises geography.

set search_path = public, extensions;

drop function if exists public.nearby_drops(double precision, double precision, int);

create or replace function public.nearby_drops(
  p_lat    double precision,
  p_lng    double precision,
  p_radius int default 2000
)
returns table (
  id               uuid,
  lat              double precision,
  lng              double precision,
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
  select * into v_cfg from public.safety_config where id;

  v_local := (now() at time zone 'Asia/Tbilisi')::time;
  if v_local < v_cfg.play_opens_at or v_local >= v_cfg.play_closes_at then
    return;
  end if;

  return query
  select
    d.id,
    st_y(d.location::geometry) as lat,
    st_x(d.location::geometry) as lng,
    d.rarity,
    d.is_boss_chest,
    st_distance(d.location, v_point) as distance_m,
    (st_distance(d.location, v_point) <= d.reveal_radius_m) as revealed,
    d.starts_at,
    d.ends_at,
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
    and (not v_cfg.require_manual_review or d.safety_reviewed_at is not null)
    and st_dwithin(d.location, v_point, p_radius)
  order by distance_m
  limit 200;
end;
$$;

grant execute on function public.nearby_drops(double precision, double precision, int)
  to authenticated;

-- The drop detail screen has the same problem reading venues.location, so give
-- it a purpose-built view with plain coordinates too.
create or replace view public.venue_coords
with (security_invoker = true) as
select
  id,
  name_ka,
  name_en,
  category,
  st_y(location::geometry) as lat,
  st_x(location::geometry) as lng,
  is_active
from public.venues;
