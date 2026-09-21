-- Tbilisi Quest :: 0016 :: tell the player what they already hold
--
-- The detail screen offered "Claim voucher" even for a drop the player had
-- already claimed or redeemed. Tapping it produced ALREADY_CLAIMED, which is
-- correct but reads as a failure rather than as "you have had this one".
--
-- One voucher per person per drop is enforced by a unique index; the screen
-- should simply say so up front.

set search_path = public, extensions;

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
  -- 'none', 'held' or 'redeemed' for the calling player.
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
    (st_distance(d.location, v_point) <= d.reveal_radius_m),
    (select count(*)::int from public.vouchers vo
      where vo.drop_id = d.id and vo.status = 'available'),
    (st_distance(d.location, v_point) <= d.claim_radius_m),
    coalesce(
      (select vo.status::text from public.vouchers vo
        where vo.drop_id = d.id and vo.user_id = auth.uid()
        limit 1),
      'none'
    ),
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
