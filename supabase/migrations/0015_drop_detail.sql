-- Tbilisi Quest :: 0015 :: one function for the drop detail screen
--
-- Two bugs, one cause: the client was reading tables directly that RLS
-- restricts for good reasons.
--
-- 1. Remaining stock was counted with a direct select on `vouchers`. Players
--    may only see their OWN vouchers, and an available voucher has a null
--    user_id, so the count was always zero and every drop read "Sold out".
--    The map was correct because nearby_drops counts inside a security-definer
--    function.
--
-- 2. Distance came from venue_coords, which exposes exact coordinates for
--    every approved venue -- the residual leak noted in 0013. Correlating a
--    snapped drop cell against that list narrows a drop to its venue without
--    walking anywhere.
--
-- This returns exactly what the screen needs and nothing the player has not
-- earned: a distance, never a position, and venue and offer details only once
-- inside the reveal radius.

set search_path = public, extensions;

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
  -- Null until revealed.
  venue_name_ka    text,
  venue_name_en    text,
  title_ka         text,
  title_en         text,
  description_ka   text,
  description_en   text,
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
begin
  return query
  select
    d.id,
    d.rarity,
    d.starts_at,
    d.ends_at,
    d.claim_radius_m,
    d.reveal_radius_m,
    st_distance(d.location, v_point) as distance_m,
    (st_distance(d.location, v_point) <= d.reveal_radius_m) as revealed,
    (select count(*)::int from public.vouchers vo
      where vo.drop_id = d.id and vo.status = 'available') as remaining,
    (st_distance(d.location, v_point) <= d.claim_radius_m) as in_claim_range,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then v.name_ka end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then v.name_en end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.title_ka end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.title_en end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.description_ka end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.description_en end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.offer end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.discount_percent end
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
-- The scanner needs a venue position, but only for a voucher already held
-- ---------------------------------------------------------------------------
-- Same reasoning: a player who has claimed a voucher has earned that venue's
-- location. One who has not gets nothing. The ownership check is on the
-- voucher, so this cannot be used to look up arbitrary venues.
create or replace function public.voucher_venue(p_voucher_id uuid)
returns table (
  venue_id      uuid,
  venue_name_ka text,
  venue_name_en text,
  lat           double precision,
  lng           double precision,
  claim_radius_m int
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  return query
  select
    v.id,
    v.name_ka,
    v.name_en,
    st_y(v.location::geometry),
    st_x(v.location::geometry),
    d.claim_radius_m
  from public.vouchers vo
  join public.drops d on d.id = vo.drop_id
  join public.venues v on v.id = d.venue_id
  where vo.id = p_voucher_id
    and vo.user_id = auth.uid();
end;
$$;

grant execute on function public.voucher_venue(uuid) to authenticated;

-- Close the residual leak from 0013 without breaking the operator portal,
-- which legitimately needs exact pins. Revoking from `authenticated` would
-- have taken it from admins too, since they hold that role as well; filtering
-- inside the view keeps it working for them and empty for everyone else.
create or replace view public.venue_coords
with (security_invoker = true) as
select
  v.id,
  v.name_ka,
  v.name_en,
  v.category,
  st_y(v.location::geometry) as lat,
  st_x(v.location::geometry) as lng,
  v.is_active
from public.venues v
where public.is_platform_admin();
