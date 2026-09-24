-- Tbilisi Quest :: 0049 :: the first pair of glasses, and drawing them
--
-- Adds the cat-eye shades and teaches the three places a player is drawn to
-- resolve an equipped pair, the same way 0047 did for outfits: avatar_config
-- holds a cosmetic code, the app draws from a style key, and the map has no
-- business carrying the catalogue to translate between them.

set search_path = public, extensions;

insert into public.cosmetics (code, kind, title_ka, title_en, style_key, rarity, season_code)
values ('shades_cat', 'eyewear', 'კატის სათვალე', 'Cat-eye shades', 'shades_cat', 'rare', 'S1')
on conflict (code) do update
  set kind      = excluded.kind,
      title_ka  = excluded.title_ka,
      title_en  = excluded.title_en,
      style_key = excluded.style_key,
      rarity    = excluded.rarity;

-- Sold rather than earned: the pass already carries a long tail of gear, and
-- the store had nothing in it but backgrounds. Six redemptions buys them.
insert into public.store_items (code, price, sort_order)
values ('shades_cat', 300, 5)
on conflict (code) do update
  set price = excluded.price, sort_order = excluded.sort_order, is_active = true;

-- ---------------------------------------------------------------------------
-- Resolving what is worn
-- ---------------------------------------------------------------------------
drop function if exists public.my_avatar();

create or replace function public.my_avatar()
returns table (
  avatar_config  jsonb,
  equipped_title text,
  equipped_frame text,
  display_name   text,
  outfit_key     text,
  eyewear_key    text,
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
    eyewear.style_key,
    bg.style_key
  from public.users u
  left join public.cosmetics outfit
    on outfit.code = u.avatar_config->>'outfit' and outfit.kind = 'outfit'
  left join public.cosmetics eyewear
    on eyewear.code = u.avatar_config->>'eyewear' and eyewear.kind = 'eyewear'
  left join public.cosmetics bg
    on bg.code = u.avatar_config->>'background' and bg.kind = 'background'
  where u.id = auth.uid();
$$;

grant execute on function public.my_avatar() to authenticated;

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
  eyewear_key   text,
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
      outfit.style_key  as outfit_key,
      eyewear.style_key as eyewear_key,
      case
        when s.user_id is not null then u.last_point
        else public.fuzz_point(u.id, u.last_point)
      end as point,
      s.user_id is null as approximate
    from public.users u
    left join squad s on s.user_id = u.id
    left join public.cosmetics outfit
      on outfit.code = u.avatar_config->>'outfit' and outfit.kind = 'outfit'
    left join public.cosmetics eyewear
      on eyewear.code = u.avatar_config->>'eyewear' and eyewear.kind = 'eyewear'
    where u.id <> auth.uid()
      and u.status = 'active'
      and u.last_point is not null
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
    v.eyewear_key,
    st_y(v.point::geometry),
    st_x(v.point::geometry),
    v.approximate
  from visible v, centre
  where st_dwithin(v.point, centre.g, p_radius_m)
  limit 60;
$$;

grant execute on function public.nearby_players(double precision, double precision, int) to authenticated;

drop function if exists public.player_card(uuid);

create or replace function public.player_card(p_user_id uuid)
returns table (
  display_name   text,
  avatar_config  jsonb,
  outfit_key     text,
  eyewear_key    text,
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
    eyewear.style_key,
    bg.style_key,
    coalesce(x.level, 1),
    public.season_xp(u.id, (public.current_season()).id)
  from public.users u
  left join public.user_xp x on x.user_id = u.id
  left join public.cosmetics outfit
    on outfit.code = u.avatar_config->>'outfit' and outfit.kind = 'outfit'
  left join public.cosmetics eyewear
    on eyewear.code = u.avatar_config->>'eyewear' and eyewear.kind = 'eyewear'
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
