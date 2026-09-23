-- Tbilisi Quest :: 0038 :: what a player owns, and wearing it
--
-- The catalogue and the grants existed; nothing could read them back in one
-- call. The inventory screen needs every cosmetic in the game with a flag for
-- whether this player has it, because a locker showing only what you own gives
-- no reason to climb -- the empty slots are the point.
--
-- set_avatar_config() also grows a second job. equipped_title and
-- equipped_frame are real foreign keys that other screens will read, so when
-- the config names a title or a frame those columns follow it. Without that
-- the app would have two places recording what someone is wearing and no rule
-- about which wins.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. The locker
-- ---------------------------------------------------------------------------
create or replace function public.my_cosmetics()
returns table (
  code        text,
  kind        text,
  title_ka    text,
  title_en    text,
  style_key   text,
  rarity      text,
  owned       boolean,
  unlocked_at timestamptz,
  source      text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.code,
    c.kind::text,
    c.title_ka,
    c.title_en,
    c.style_key,
    c.rarity::text,
    uc.user_id is not null,
    uc.unlocked_at,
    uc.source
  from public.cosmetics c
  left join public.user_cosmetics uc
    on uc.code = c.code and uc.user_id = auth.uid()
  order by c.kind, (uc.user_id is null), c.code;
$$;

grant execute on function public.my_cosmetics() to authenticated;

-- What the player is wearing now, in one row, so a screen does not have to
-- read the users table directly to find out.
create or replace function public.my_avatar()
returns table (
  avatar_config  jsonb,
  equipped_title text,
  equipped_frame text,
  display_name   text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select u.avatar_config, u.equipped_title, u.equipped_frame, u.display_name
  from public.users u
  where u.id = auth.uid();
$$;

grant execute on function public.my_avatar() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Wearing it
-- ---------------------------------------------------------------------------
-- Unchanged in what it refuses; it now also keeps the two real columns in step
-- with the slots of the same name.
create or replace function public.set_avatar_config(p_config jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code  text;
  v_title text;
  v_frame text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if jsonb_typeof(p_config) <> 'object' then
    raise exception 'AVATAR_NOT_OBJECT';
  end if;

  if length(p_config::text) > 2000 then
    raise exception 'AVATAR_TOO_LARGE';
  end if;

  for v_code in
    select value #>> '{}' from jsonb_each(p_config) where jsonb_typeof(value) = 'string'
  loop
    if exists (select 1 from public.cosmetics c where c.code = v_code)
       and not exists (
         select 1 from public.user_cosmetics uc
         where uc.user_id = auth.uid() and uc.code = v_code
       ) then
      raise exception 'COSMETIC_NOT_OWNED';
    end if;
  end loop;

  -- Only a cosmetic of the right kind may sit in these two columns; anything
  -- else is cleared rather than trusted.
  select c.code into v_title
  from public.cosmetics c
  where c.code = p_config->>'title' and c.kind = 'title';

  select c.code into v_frame
  from public.cosmetics c
  where c.code = p_config->>'frame' and c.kind = 'avatar_frame';

  update public.users
  set avatar_config  = p_config,
      equipped_title = v_title,
      equipped_frame = v_frame
  where id = auth.uid();
end;
$$;
