-- Tbilisi Quest :: 0004 :: RPC functions
--
-- Everything security-sensitive lives here rather than in application code:
-- geofence checks, inventory allocation, and QR verification. The mobile client
-- can only reach these through PostgREST RPC, and each one re-derives the
-- caller from auth.uid() rather than trusting a parameter.

-- ---------------------------------------------------------------------------
-- Keep drops.location in step with its venue.
-- ---------------------------------------------------------------------------
create or replace function public.sync_drop_location()
returns trigger
language plpgsql
as $$
begin
  if new.location is null then
    select v.location into new.location from public.venues v where v.id = new.venue_id;
  end if;
  return new;
end;
$$;

create trigger drops_sync_location
  before insert on public.drops
  for each row execute function public.sync_drop_location();

-- ---------------------------------------------------------------------------
-- materialise_drop_inventory
-- ---------------------------------------------------------------------------
-- Called when a drop leaves 'draft'. Creates one voucher row per unit so the
-- claim path never has to INSERT under contention -- it only ever UPDATEs a row
-- that already exists.
create or replace function public.materialise_drop_inventory(p_drop_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap      int;
  v_existing int;
begin
  select inventory_cap into v_cap from public.drops where id = p_drop_id;
  if v_cap is null then
    raise exception 'DROP_NOT_FOUND';
  end if;

  select count(*) into v_existing from public.vouchers where drop_id = p_drop_id;

  -- Idempotent: safe to call again after a merchant raises the cap.
  if v_existing >= v_cap then
    return 0;
  end if;

  insert into public.vouchers (drop_id)
  select p_drop_id from generate_series(1, v_cap - v_existing);

  return v_cap - v_existing;
end;
$$;

-- ---------------------------------------------------------------------------
-- nearby_drops  (the map query, with fog of war enforced server-side)
-- ---------------------------------------------------------------------------
-- Fog of war is a security boundary, not a UI effect. If the API returned full
-- venue and offer details for every pin, anyone could read them straight off the
-- wire and skip the walking. So the reveal decision happens here, and undiscovered
-- drops come back with their identifying fields nulled out.
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
  -- Null unless revealed.
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
set search_path = public
as $$
declare
  v_point geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
begin
  return query
  select
    d.id,
    d.location,
    d.rarity,
    d.is_boss_chest,
    st_distance(d.location, v_point) as distance_m,
    (st_distance(d.location, v_point) <= d.reveal_radius_m) as revealed,
    d.starts_at,
    d.ends_at,
    (select count(*)::int from public.vouchers vo
      where vo.drop_id = d.id and vo.status = 'available') as remaining,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m
         then v.name_ka end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m
         then v.name_en end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m
         then d.title_ka end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m
         then d.title_en end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m
         then d.offer end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m
         then d.discount_percent end
  from public.drops d
  join public.venues v on v.id = d.venue_id
  where d.status in ('scheduled', 'live')
    and v.is_active
    and d.ends_at > now()
    -- ST_DWithin on geography uses the GiST index; ST_Distance alone would not.
    and st_dwithin(d.location, v_point, p_radius)
  order by distance_m
  limit 200;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_voucher  -- THE concurrency-critical path
-- ---------------------------------------------------------------------------
-- Scenario: 200 players, 20 vouchers, all arriving in the same second.
--
-- The naive approach (read remaining, check it, then increment) has a
-- read-modify-write race: every one of the 200 reads "20 left" before anyone
-- writes, and you hand out 200 vouchers for 20 items.
--
-- The fix is to never read-then-write. Instead each caller atomically takes
-- ownership of one specific pre-existing row:
--
--   FOR UPDATE SKIP LOCKED  -- if another transaction already holds this row,
--                              don't queue behind it, move to the next one
--
-- SKIP LOCKED is what makes this scale. With a plain FOR UPDATE, or with a
-- counter column, all 200 transactions serialise on one row and the last one
-- waits for 199 others. With SKIP LOCKED the 20 winners each grab a different
-- row concurrently, and the 180 losers find nothing and fail immediately.
--
-- Note there is deliberately NO claimed_count column being incremented here.
-- Maintaining one would reintroduce the single hot row we just designed away.
-- Remaining inventory is counted from the partial index instead, which is cheap
-- because that index only contains still-available rows.
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
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_drop       public.drops%rowtype;
  v_point      geography;
  v_distance   double precision;
  v_level      int;
  v_opens_at   timestamptz;
  v_voucher    public.vouchers%rowtype;
  v_hold       interval := interval '30 minutes';
  v_xp         int;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_drop from public.drops where id = p_drop_id;
  if not found then
    raise exception 'DROP_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_drop.status not in ('scheduled', 'live') then
    raise exception 'DROP_NOT_CLAIMABLE';
  end if;

  -- Geofence, server-side. The client sends raw coordinates and the server
  -- computes the distance; a client-computed "I am 12m away" would be trivially
  -- forged. This still does not defeat a GPS spoofing app -- the QR/NFC step at
  -- the counter is what actually proves physical presence.
  v_point    := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_distance := st_distance(v_drop.location, v_point);

  if v_distance > v_drop.claim_radius_m then
    raise exception 'OUT_OF_RANGE:%', round(v_distance::numeric)
      using errcode = 'P0001';
  end if;

  -- Early access: high-level players may claim before the public window opens.
  select coalesce(ux.level, 1) into v_level
  from public.user_xp ux where ux.user_id = v_user_id;
  v_level := coalesce(v_level, 1);

  v_opens_at := v_drop.starts_at;
  if v_drop.early_access_level > 0 and v_level >= v_drop.early_access_level then
    v_opens_at := v_drop.starts_at
                - make_interval(mins => v_drop.early_access_minutes);
  end if;

  if now() < v_opens_at then
    raise exception 'NOT_YET_OPEN:%', v_opens_at;
  end if;
  if now() > v_drop.ends_at then
    raise exception 'DROP_EXPIRED';
  end if;

  -- The atomic allocation. The inner SELECT picks one available row and locks
  -- it; SKIP LOCKED means a concurrent claimer picks a different one rather
  -- than blocking. If nothing is left, v_voucher stays null.
  update public.vouchers v
     set user_id         = v_user_id,
         status          = 'held',
         claimed_at      = now(),
         hold_expires_at = now() + v_hold,
         redemption_code = encode(gen_random_bytes(12), 'hex')
   where v.id = (
     select inner_v.id
       from public.vouchers inner_v
      where inner_v.drop_id = p_drop_id
        and inner_v.status  = 'available'
      order by inner_v.id
      limit 1
      for update skip locked
   )
  returning v.* into v_voucher;

  if v_voucher.id is null then
    raise exception 'SOLD_OUT';
  end if;

  -- Rarity drives the reward curve.
  v_xp := case v_drop.rarity
            when 'common'    then 10
            when 'rare'      then 30
            when 'legendary' then 100
          end;

  perform public.award_xp(v_user_id, v_xp, 'claim', v_voucher.id);

  return query select v_voucher.id, v_voucher.redemption_code,
                      v_voucher.hold_expires_at, v_xp;

exception
  -- The partial unique index on (drop_id, user_id) is the real guard against
  -- one person claiming twice. Catching it here turns a raw constraint error
  -- into something the client can show a sensible message for.
  when unique_violation then
    raise exception 'ALREADY_CLAIMED';
end;
$$;

-- ---------------------------------------------------------------------------
-- Rotating counter code
-- ---------------------------------------------------------------------------
-- A static printed QR can be photographed once and shared in a group chat,
-- which breaks the "physically present" guarantee entirely. So the cashier
-- display shows a code derived from the venue secret and the current 30-second
-- window -- effectively TOTP rendered as a QR.
create or replace function public.current_counter_code(p_venue_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_secret bytea;
  v_window bigint := floor(extract(epoch from now()) / 30);
begin
  select counter_secret into v_secret from public.venues where id = p_venue_id;
  if v_secret is null then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  return substr(encode(hmac(v_window::text, v_secret, 'sha256'), 'hex'), 1, 10);
end;
$$;

-- ---------------------------------------------------------------------------
-- redeem_voucher  -- second factor of the dual verification
-- ---------------------------------------------------------------------------
-- Called after the phone scans the counter QR. Accepts the current or previous
-- window so a slow scan near a boundary does not fail.
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
set search_path = public
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

  -- Lock the voucher for the duration: prevents the same code being redeemed
  -- twice from two devices at once.
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

  -- Counter code check: accept this window or the one before it.
  v_expected := substr(encode(hmac(v_window::text,       v_venue.counter_secret, 'sha256'), 'hex'), 1, 10);
  v_prev     := substr(encode(hmac((v_window - 1)::text, v_venue.counter_secret, 'sha256'), 'hex'), 1, 10);

  if p_counter_code not in (v_expected, v_prev) then
    raise exception 'BAD_COUNTER_CODE';
  end if;

  -- Geofence again at redemption. Tighter than claim: you are at the till.
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

-- ---------------------------------------------------------------------------
-- Sweep expired holds back into the pool.
-- ---------------------------------------------------------------------------
create or replace function public.release_expired_holds()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with released as (
    update public.vouchers
       set status          = 'available',
           user_id         = null,
           claimed_at      = null,
           hold_expires_at = null,
           redemption_code = null
     where status = 'held'
       and hold_expires_at < now()
    returning 1
  )
  select count(*) into v_count from released;
  return v_count;
end;
$$;

select cron.schedule(
  'release-expired-holds',
  '* * * * *',
  $$select public.release_expired_holds()$$
);
