-- Tbilisi Quest :: 0050 :: tell the player what the voucher is worth
--
-- A merchant enters a face value in GEL when they create a drop, and the
-- number has been going straight into the analytics and nowhere else. The
-- player was shown the shape of the offer -- "-20%", "1+1", "FREE" -- and
-- never what it was worth, which is the first thing anybody wants to know
-- before walking across town for it. "20% off" is not a reason to go
-- anywhere; "20% off, about 12 GEL" is.
--
-- Both list and detail carry it now, so the map, the drop sheet and the
-- voucher wallet can all say the same number.

set search_path = public, extensions;

drop function if exists public.nearby_drops(double precision, double precision, integer);

create or replace function public.nearby_drops(
  p_lat double precision,
  p_lng double precision,
  p_radius integer default 30000
)
returns table (
  id               uuid,
  lat              double precision,
  lng              double precision,
  uncertainty_m    integer,
  rarity           voucher_rarity,
  is_boss_chest    boolean,
  distance_m       double precision,
  revealed         boolean,
  starts_at        timestamptz,
  ends_at          timestamptz,
  remaining        integer,
  venue_name_ka    text,
  venue_name_en    text,
  title_ka         text,
  title_en         text,
  offer            offer_type,
  discount_percent integer,
  face_value_gel   numeric,
  squad_size       integer
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
    d.face_value_gel,
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

grant execute on function public.nearby_drops(double precision, double precision, integer) to authenticated;

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
  claim_radius_m   integer,
  reveal_radius_m  integer,
  distance_m       double precision,
  revealed         boolean,
  remaining        integer,
  in_claim_range   boolean,
  own_voucher      text,
  venue_name_ka    text,
  venue_name_en    text,
  title_ka         text,
  title_en         text,
  description_ka   text,
  description_en   text,
  offer            offer_type,
  discount_percent integer,
  face_value_gel   numeric,
  squad_size       integer,
  squad_present    integer,
  squad_ready      boolean,
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
    d.face_value_gel,
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

grant execute on function public.drop_detail(uuid, double precision, double precision) to authenticated;
