-- Tbilisi Quest :: 0018 :: remove fog of war
--
-- Product decision: every drop shows its real venue and offer from any
-- distance. The discovery mechanic is gone, so the machinery that supported it
-- goes with it rather than sitting dormant and misleading the next reader.
--
-- What this removes:
--   * grid snapping of unrevealed positions (0013)
--   * null-ing venue and offer text outside the reveal radius (0004 onward)
--
-- What this deliberately KEEPS:
--   * claim_radius_m -- you must still physically be at the venue to claim.
--     That is the whole point of the product and is unaffected.
--   * reveal_radius_m stays on the table, unused by these functions, because
--     removing the column would be hard to reverse if this is reconsidered.
--
-- `uncertainty_m` and `revealed` stay in the signature so the client keeps
-- compiling; they now report 0 and true always.

set search_path = public, extensions;

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
    d.discount_percent
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

grant execute on function public.nearby_drops(double precision, double precision, int) to authenticated;

-- Detail screen: same change. Claim range is still distance-gated.
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
    d.discount_percent
  from public.drops d
  join public.venues v on v.id = d.venue_id
  where d.id = p_drop_id
    and v.status = 'approved'
    and v.is_active;
end;
$$;

grant execute on function public.drop_detail(uuid, double precision, double precision)
  to authenticated;

drop function if exists public.uncertainty_for(double precision);
