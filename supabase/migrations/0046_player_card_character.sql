-- Tbilisi Quest :: 0046 :: a player card that can show the character
--
-- player_card() returned a name, a level and an XP total, which is enough for
-- a row in a list and not enough for the thing it is actually for: tapping
-- somebody on the map to see what they are wearing. The flex is the point.
--
-- Two changes. It resolves the equipped background to its style_key, because
-- avatar_config stores a cosmetic code and the app draws a scene from a style
-- key, and the map has no reason to be holding the cosmetics catalogue just to
-- translate between them.
--
-- And it answers for the caller themselves. The visibility rules exist to stop
-- one player finding another; they were never meant to stop somebody looking
-- at their own character, which they can see on the Character tab anyway. A
-- player in ghost mode tapping their own dot got nothing back.

set search_path = public, extensions;

drop function if exists public.player_card(uuid);

create or replace function public.player_card(p_user_id uuid)
returns table (
  display_name   text,
  avatar_config  jsonb,
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
    bg.style_key,
    coalesce(x.level, 1),
    public.season_xp(u.id, (public.current_season()).id)
  from public.users u
  left join public.user_xp x on x.user_id = u.id
  -- The background is stored as a cosmetic code; the app draws from its key.
  left join public.cosmetics bg
    on bg.code = u.avatar_config->>'background'
   and bg.kind = 'background'
  where u.id = p_user_id
    and u.status = 'active'
    and (
      u.id = auth.uid()
      or u.visibility = 'public'
      or (u.visibility = 'squad' and exists (select 1 from squad s where s.user_id = u.id))
    );
$$;

grant execute on function public.player_card(uuid) to authenticated;
