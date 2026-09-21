-- Tbilisi Quest :: 0011 :: fix an ambiguous reference that broke the map
--
-- nearby_drops declares `id uuid` in RETURNS TABLE, which creates a PL/pgSQL
-- variable named `id`. The play-window check added in 0008 then read
--
--   select * into v_cfg from public.safety_config where id;
--
-- and Postgres could not tell whether `id` meant that OUT parameter or the
-- column, so every call raised 42702 and the map came back empty. The error
-- surfaced only on invocation, which is why the migration applied cleanly.
--
-- Aliasing the table removes the ambiguity. claim_voucher uses the same
-- `where id` pattern but has no OUT parameter named `id`, so it resolves to
-- the column and works correctly -- it is deliberately left untouched here
-- rather than redefined for a problem it does not have. Worth knowing if a
-- column named `id` is ever added to its signature.

set search_path = public, extensions;

create or replace function public.nearby_drops(
  p_lat    double precision,
  p_lng    double precision,
  p_radius int default 30000
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
  select * into v_cfg from public.safety_config sc where sc.id;

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
  limit 500;
end;
$$;

-- A small helper so clients can ask whether play is open without pulling the
-- whole config, written with the table aliased from the start.
create or replace function public.check_play_window()
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_cfg   public.safety_config%rowtype;
  v_local time;
begin
  select * into v_cfg from public.safety_config sc where sc.id;
  v_local := (now() at time zone 'Asia/Tbilisi')::time;
  return v_local >= v_cfg.play_opens_at and v_local < v_cfg.play_closes_at;
end;
$$;

grant execute on function public.nearby_drops(double precision, double precision, int) to authenticated;
grant execute on function public.check_play_window() to authenticated;
