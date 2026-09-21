-- Tbilisi Quest :: 0007 :: correct the hmac() call signature
--
-- pgcrypto exposes hmac() as either (bytea, bytea, text) or (text, text, text).
-- 0004 passed (text, bytea, text) -- a text window counter against a bytea
-- secret -- which matches neither overload and failed at runtime with
-- "function hmac(text, bytea, unknown) does not exist".
--
-- The fix is to convert the window counter to bytea with convert_to() so both
-- arguments are bytea. Casting the secret down to text instead would work too,
-- but would mean hashing a hex rendering of the key rather than the key itself.

set search_path = public, extensions;

create or replace function public.current_counter_code(p_venue_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_secret bytea;
  v_window bigint := floor(extract(epoch from now()) / 30);
begin
  select counter_secret into v_secret from public.venues where id = p_venue_id;
  if v_secret is null then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  return substr(
    encode(hmac(convert_to(v_window::text, 'utf8'), v_secret, 'sha256'), 'hex'),
    1, 10
  );
end;
$$;

create or replace function public.redeem_voucher(
  p_redemption_code text,
  p_counter_code    text,
  p_lat             double precision,
  p_lng             double precision
)
returns table (
  redemption_id uuid,
  venue_name_ka text,
  venue_name_en text,
  title_ka      text,
  title_en      text,
  xp_awarded    int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id  uuid := auth.uid();
  v_voucher  public.vouchers%rowtype;
  v_drop     public.drops%rowtype;
  v_venue    public.venues%rowtype;
  v_point    geography;
  v_distance double precision;
  v_window   bigint := floor(extract(epoch from now()) / 30);
  v_expected text;
  v_prev     text;
  v_id       uuid;
  v_xp       int;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_voucher
  from public.vouchers
  where redemption_code = p_redemption_code
  for update;

  if not found then
    raise exception 'VOUCHER_NOT_FOUND';
  end if;
  if v_voucher.user_id <> v_user_id then
    raise exception 'NOT_YOUR_VOUCHER';
  end if;
  if v_voucher.status = 'redeemed' then
    raise exception 'ALREADY_REDEEMED';
  end if;
  if v_voucher.status <> 'held' then
    raise exception 'VOUCHER_NOT_ACTIVE';
  end if;
  if v_voucher.hold_expires_at < now() then
    raise exception 'HOLD_EXPIRED';
  end if;

  select * into v_drop  from public.drops  where id = v_voucher.drop_id;
  select * into v_venue from public.venues where id = v_drop.venue_id;

  -- Accept the current window or the previous one, so a scan that lands just
  -- after a rollover still succeeds.
  v_expected := substr(
    encode(hmac(convert_to(v_window::text, 'utf8'),
                v_venue.counter_secret, 'sha256'), 'hex'), 1, 10);
  v_prev := substr(
    encode(hmac(convert_to((v_window - 1)::text, 'utf8'),
                v_venue.counter_secret, 'sha256'), 'hex'), 1, 10);

  if p_counter_code not in (v_expected, v_prev) then
    raise exception 'BAD_COUNTER_CODE';
  end if;

  v_point    := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_distance := st_distance(v_venue.location, v_point);

  if v_distance > greatest(v_drop.claim_radius_m, 50) then
    raise exception 'OUT_OF_RANGE:%', round(v_distance::numeric);
  end if;

  update public.vouchers set status = 'redeemed' where id = v_voucher.id;

  insert into public.redemptions (
    voucher_id, venue_id, user_id, redeemed_point, distance_m, face_value_gel
  ) values (
    v_voucher.id, v_venue.id, v_user_id, v_point, v_distance, v_drop.face_value_gel
  )
  returning id into v_id;

  v_xp := case v_drop.rarity
            when 'common'    then 25
            when 'rare'      then 75
            when 'legendary' then 250
          end;

  perform public.award_xp(v_user_id, v_xp, 'redeem', v_voucher.id);

  return query select v_id, v_venue.name_ka, v_venue.name_en,
                      v_drop.title_ka, v_drop.title_en, v_xp;
end;
$$;

grant execute on function public.current_counter_code(uuid) to authenticated;
grant execute on function public.redeem_voucher(text, text, double precision, double precision) to authenticated;
