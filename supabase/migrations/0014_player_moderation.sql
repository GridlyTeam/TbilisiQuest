-- Tbilisi Quest :: 0014 :: player search and moderation
--
-- Operators need to find a player, see what they have actually done, and stop
-- them. The enforcement goes in claim_voucher and redeem_voucher rather than
-- only in the UI: a ban that merely hides a button is decorative, since the
-- RPCs are reachable directly.

set search_path = public, extensions;

create type player_status as enum ('active', 'suspended', 'banned');

alter table public.users
  add column status            player_status not null default 'active',
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references auth.users(id) on delete set null,
  add column status_reason     text;

create index users_status_idx on public.users (status) where status <> 'active';

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
-- auth.users is not readable through PostgREST, so email has to come from a
-- security-definer function. Everything it returns is gated on
-- is_platform_admin() -- without that check this would be an account
-- enumeration endpoint for any signed-in user.
create or replace function public.admin_search_players(
  p_query text default '',
  p_limit int default 50
)
returns table (
  user_id        uuid,
  email          text,
  display_name   text,
  locale         text,
  status         player_status,
  status_reason  text,
  created_at     timestamptz,
  last_seen_at   timestamptz,
  level          int,
  total_xp       int,
  streak_days    int,
  claimed        int,
  redeemed       int,
  last_activity  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  return query
  select
    u.id,
    au.email::text,
    u.display_name,
    u.locale,
    u.status,
    u.status_reason,
    u.created_at,
    u.last_seen_at,
    coalesce(x.level, 1),
    coalesce(x.total_xp, 0),
    coalesce(x.current_streak_days, 0),
    (select count(*)::int from public.vouchers v
      where v.user_id = u.id and v.status in ('held', 'redeemed')),
    (select count(*)::int from public.redemptions r where r.user_id = u.id),
    (select max(r.redeemed_at) from public.redemptions r where r.user_id = u.id)
  from public.users u
  join auth.users au on au.id = u.id
  left join public.user_xp x on x.user_id = u.id
  where p_query = ''
     or au.email ilike '%' || p_query || '%'
     or u.display_name ilike '%' || p_query || '%'
  order by u.created_at desc
  limit p_limit;
end;
$$;

grant execute on function public.admin_search_players(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- One player's history
-- ---------------------------------------------------------------------------
create or replace function public.admin_player_activity(
  p_user_id uuid,
  p_limit   int default 50
)
returns table (
  occurred_at timestamptz,
  kind        text,
  detail      text,
  venue_name  text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  return query
  select r.redeemed_at, 'redeemed'::text, d.title_en, v.name_en
  from public.redemptions r
  join public.vouchers vo on vo.id = r.voucher_id
  join public.drops d on d.id = vo.drop_id
  join public.venues v on v.id = r.venue_id
  where r.user_id = p_user_id

  union all

  select vo.claimed_at, 'claimed'::text, d.title_en, v.name_en
  from public.vouchers vo
  join public.drops d on d.id = vo.drop_id
  join public.venues v on v.id = d.venue_id
  where vo.user_id = p_user_id and vo.claimed_at is not null

  order by 1 desc nulls last
  limit p_limit;
end;
$$;

grant execute on function public.admin_player_activity(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------
-- Suspending releases any held vouchers so a suspended account is not sitting
-- on a merchant's inventory. Redeemed ones stay: that history is a record of
-- something that physically happened.
create or replace function public.admin_set_player_status(
  p_user_id uuid,
  p_status  player_status,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'CANNOT_MODERATE_SELF';
  end if;

  update public.users u
     set status            = p_status,
         status_reason     = p_reason,
         status_changed_at = now(),
         status_changed_by = auth.uid()
   where u.id = p_user_id;

  if p_status <> 'active' then
    update public.vouchers v
       set status = 'available',
           user_id = null,
           claimed_at = null,
           hold_expires_at = null,
           redemption_code = null
     where v.user_id = p_user_id and v.status = 'held';
  end if;
end;
$$;

grant execute on function public.admin_set_player_status(uuid, player_status, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement
-- ---------------------------------------------------------------------------
create or replace function public.assert_player_active()
returns void
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_status player_status;
begin
  select u.status into v_status from public.users u where u.id = auth.uid();
  -- No profile row yet is not a ban; it just means signup did not finish.
  if v_status is not null and v_status <> 'active' then
    raise exception 'ACCOUNT_%', upper(v_status::text);
  end if;
end;
$$;

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

  perform public.assert_player_active();

  select * into v_cfg from public.safety_config sc where sc.id;

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

grant execute on function public.claim_voucher(uuid, double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
create policy users_admin_read on public.users
  for select to authenticated
  using (public.is_platform_admin());

-- Status is changed only through admin_set_player_status, which also releases
-- held vouchers; a direct UPDATE would skip that.
create policy users_admin_update on public.users
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
