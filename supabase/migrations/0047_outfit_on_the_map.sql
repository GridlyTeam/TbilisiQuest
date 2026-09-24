-- Tbilisi Quest :: 0047 :: what someone is wearing, wherever they are drawn
--
-- avatar_config stores cosmetic codes and the app draws from style keys, and
-- the three places a player gets drawn had no way across that gap. The map was
-- holding codes it could not use, so a creature in a hoodie appeared bare in
-- its bubble, bare on another player's screen, and bare on the card you open
-- by tapping it -- which is the one screen whose entire purpose is showing
-- what somebody is wearing.
--
-- Resolving it here rather than shipping the cosmetics catalogue to the map:
-- the join is one row per player and the translation is the database's own
-- business, not the map's.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Your own, for your bubble
-- ---------------------------------------------------------------------------
drop function if exists public.my_avatar();

create or replace function public.my_avatar()
returns table (
  avatar_config  jsonb,
  equipped_title text,
  equipped_frame text,
  display_name   text,
  outfit_key     text,
  background_key text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    u.avatar_config,
    u.equipped_title,
    u.equipped_frame,
    u.display_name,
    outfit.style_key,
    bg.style_key
  from public.users u
  left join public.cosmetics outfit
    on outfit.code = u.avatar_config->>'outfit' and outfit.kind = 'outfit'
  left join public.cosmetics bg
    on bg.code = u.avatar_config->>'background' and bg.kind = 'background'
  where u.id = auth.uid();
$$;

grant execute on function public.my_avatar() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Everybody else's, for their bubbles
-- ---------------------------------------------------------------------------
drop function if exists public.nearby_players(double precision, double precision, int);

create or replace function public.nearby_players(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m int default 3000
)
returns table (
  player_id     uuid,
  display_name  text,
  avatar_config jsonb,
  outfit_key    text,
  lat           double precision,
  lng           double precision,
  approximate   boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with centre as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  ),
  squad as (
    select distinct other.user_id
    from public.squad_checkins mine
    join public.squad_checkins other
      on other.drop_id = mine.drop_id
     and other.user_id <> mine.user_id
     and other.at > now() - public.squad_visibility_window()
    where mine.user_id = auth.uid()
      and mine.at > now() - public.squad_visibility_window()
  ),
  visible as (
    select
      u.id,
      coalesce(u.display_name, 'Player') as display_name,
      u.avatar_config,
      outfit.style_key as outfit_key,
      case
        when s.user_id is not null then u.last_point
        else public.fuzz_point(u.id, u.last_point)
      end as point,
      s.user_id is null as approximate
    from public.users u
    left join squad s on s.user_id = u.id
    left join public.cosmetics outfit
      on outfit.code = u.avatar_config->>'outfit' and outfit.kind = 'outfit'
    where u.id <> auth.uid()
      and u.status = 'active'
      and u.last_point is not null
      -- A position nobody has refreshed in a quarter of an hour is not where
      -- that person is; showing it is worse than showing nothing.
      and u.last_seen_at > now() - interval '15 minutes'
      and (
        u.visibility = 'public'
        or (u.visibility = 'squad' and s.user_id is not null)
      )
  )
  select
    v.id,
    v.display_name,
    v.avatar_config,
    v.outfit_key,
    st_y(v.point::geometry),
    st_x(v.point::geometry),
    v.approximate
  from visible v, centre
  where st_dwithin(v.point, centre.g, p_radius_m)
  limit 60;
$$;

grant execute on function public.nearby_players(double precision, double precision, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. And on the card, which exists to show exactly this
-- ---------------------------------------------------------------------------
drop function if exists public.player_card(uuid);

create or replace function public.player_card(p_user_id uuid)
returns table (
  display_name   text,
  avatar_config  jsonb,
  outfit_key     text,
  background_key text,
  level          int,
  season_xp      int
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with squad as (
    select distinct other.user_id
    from public.squad_checkins mine
    join public.squad_checkins other
      on other.drop_id = mine.drop_id
     and other.user_id <> mine.user_id
     and other.at > now() - public.squad_visibility_window()
    where mine.user_id = auth.uid()
      and mine.at > now() - public.squad_visibility_window()
  )
  select
    coalesce(u.display_name, 'Player'),
    u.avatar_config,
    outfit.style_key,
    bg.style_key,
    coalesce(x.level, 1),
    public.season_xp(u.id, (public.current_season()).id)
  from public.users u
  left join public.user_xp x on x.user_id = u.id
  left join public.cosmetics outfit
    on outfit.code = u.avatar_config->>'outfit' and outfit.kind = 'outfit'
  left join public.cosmetics bg
    on bg.code = u.avatar_config->>'background' and bg.kind = 'background'
  where u.id = p_user_id
    and u.status = 'active'
    and (
      u.id = auth.uid()
      or u.visibility = 'public'
      or (u.visibility = 'squad' and exists (select 1 from squad s where s.user_id = u.id))
    );
$$;

grant execute on function public.player_card(uuid) to authenticated;
