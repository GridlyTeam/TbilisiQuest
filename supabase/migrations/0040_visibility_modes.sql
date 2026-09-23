-- Tbilisi Quest :: 0040 :: who can see you, and how precisely
--
-- Until now no player appeared on another player's map at all. That changes
-- here, and the rules it changes under are the strictest thing in the codebase,
-- because the people being made visible are teenagers.
--
--   ghost   default for everyone, and the only option under 16. Nobody sees
--           you. You are on the map for yourself.
--   squad   only the people you have just checked into a drop with.
--   public  anybody nearby -- and never your real position.
--
-- Public positions are displaced 300-500 m. Two things make that real rather
-- than decorative, and both are the reason this is done in the database:
--
--   The offset is seeded, not re-rolled. It is derived from the player's id and
--   the current hour, so it holds still for an hour at a time. A re-randomised
--   offset is worse than none: an observer takes twenty samples, averages them,
--   and the mean converges on the true point. A stable one gives the twentieth
--   observation exactly as much as the first.
--
--   The true coordinate never leaves the server for anybody else. nearby_players
--   displaces before returning, so there is no exact position on the wire for a
--   client to read past the UI. It exists for the player themselves, and for the
--   geofence check on their own claims.
--
-- Nothing here tells anyone where a specific person is. That is the point, and
-- the map is expected to be approximate because of it.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. The setting
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'visibility_mode') then
    create type public.visibility_mode as enum ('ghost', 'squad', 'public');
  end if;
end $$;

alter table public.users
  add column if not exists visibility public.visibility_mode not null default 'ghost';

-- age_years() takes a user id and reads their row, which a BEFORE trigger
-- cannot use: inside one, the row being written is `new` and the table still
-- holds the old value. This takes the date itself.
create or replace function public.years_since(p_birth date)
returns int
language sql
immutable
as $$
  select case
    when p_birth is null then null
    else extract(year from age(current_date, p_birth))::int
  end;
$$;

-- The age at which a player may choose to be seen by strangers at all. Sixteen,
-- the same line squad drops already use.
create or replace function public.min_age_visible()
returns int language sql immutable as $$ select 16 $$;

-- How long after checking into a drop together two people still count as a
-- squad for the purposes of seeing each other. Longer than squad_window(),
-- which exists for simultaneous claiming; this is for walking there together.
create or replace function public.squad_visibility_window()
returns interval language sql immutable as $$ select interval '60 minutes' $$;

create or replace function public.set_visibility(p_mode public.visibility_mode)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_age int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select public.years_since(u.birth_date) into v_age
  from public.users u where u.id = auth.uid();

  if p_mode <> 'ghost' and (v_age is null or v_age < public.min_age_visible()) then
    raise exception 'AGE_LOCKED';
  end if;

  update public.users set visibility = p_mode where id = auth.uid();
end;
$$;

grant execute on function public.set_visibility(public.visibility_mode) to authenticated;

-- Defence in depth. set_visibility() is the only intended route, but users has
-- an update-self policy, so a client could write the column directly.
create or replace function public.force_ghost_for_minors()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.visibility <> 'ghost'
     and (new.birth_date is null
          or public.years_since(new.birth_date) < public.min_age_visible()) then
    new.visibility := 'ghost';
  end if;
  return new;
end;
$$;

drop trigger if exists users_force_ghost on public.users;
create trigger users_force_ghost
  before insert or update on public.users
  for each row execute function public.force_ghost_for_minors();

-- Anybody already under 16 who somehow is not ghost, corrected now.
update public.users
set visibility = 'ghost'
where visibility <> 'ghost'
  and (birth_date is null or public.years_since(birth_date) < public.min_age_visible());

-- ---------------------------------------------------------------------------
-- 2. Where the player is
-- ---------------------------------------------------------------------------
-- last_point existed and nothing ever wrote to it. This is what the app calls
-- while the map is open; it is the player's own row, and it is the only place
-- a true coordinate is stored.
create or replace function public.heartbeat_position(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.users
  set last_point   = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      last_seen_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.heartbeat_position(double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The displacement
-- ---------------------------------------------------------------------------
-- Seeded on the player and the hour: the same input gives the same output for
-- an hour, then moves. Hashing rather than random() is the whole mechanism --
-- random() would re-roll on every call and average away to the truth.
create or replace function public.fuzz_point(p_user_id uuid, p_point geography)
returns geography
language sql
stable
set search_path = public, extensions
as $$
  select case
    when p_point is null then null
    else st_project(
      p_point,
      -- 300 to 500 metres.
      300 + (abs(hashtext(p_user_id::text || '|d|' ||
        to_char(now() at time zone 'UTC', 'YYYYMMDDHH24'))) % 201)::double precision,
      -- A bearing anywhere on the circle, in radians.
      radians((abs(hashtext(p_user_id::text || '|b|' ||
        to_char(now() at time zone 'UTC', 'YYYYMMDDHH24'))) % 360)::double precision)
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Who you can see
-- ---------------------------------------------------------------------------
-- Squad members come back at their true position: you are both walking to the
-- same counter, you checked in together minutes ago, and hiding it from each
-- other would defeat the mode. Everyone else is displaced, and says so.
create or replace function public.nearby_players(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m int default 3000
)
returns table (
  player_id     uuid,
  display_name  text,
  avatar_config jsonb,
  lat           double precision,
  lng           double precision,
  approximate   boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with me as (
    select auth.uid() as id
  ),
  centre as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  ),
  squad as (
    -- Anyone checked into the same drop as me inside the window.
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
      case
        when s.user_id is not null then u.last_point
        else public.fuzz_point(u.id, u.last_point)
      end as point,
      s.user_id is null as approximate
    from public.users u
    left join squad s on s.user_id = u.id
    where u.id <> (select id from me)
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
    st_y(v.point::geometry),
    st_x(v.point::geometry),
    v.approximate
  from visible v, centre
  where st_dwithin(v.point, centre.g, p_radius_m)
  limit 60;
$$;

grant execute on function public.nearby_players(double precision, double precision, int) to authenticated;

-- What a head box opens into. Only answers for somebody who is visible to the
-- caller right now, so the id from nearby_players cannot be kept and replayed
-- after they have gone back to ghost.
create or replace function public.player_card(p_user_id uuid)
returns table (
  display_name  text,
  avatar_config jsonb,
  level         int,
  season_xp     int
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
    coalesce(x.level, 1),
    public.season_xp(u.id, (public.current_season()).id)
  from public.users u
  left join public.user_xp x on x.user_id = u.id
  where u.id = p_user_id
    and u.status = 'active'
    and (
      u.visibility = 'public'
      or (u.visibility = 'squad' and exists (select 1 from squad s where s.user_id = u.id))
    );
$$;

grant execute on function public.player_card(uuid) to authenticated;

-- What the settings screen reads back.
create or replace function public.my_visibility()
returns table (
  mode       public.visibility_mode,
  age_locked boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    u.visibility,
    (u.birth_date is null or public.years_since(u.birth_date) < public.min_age_visible())
  from public.users u
  where u.id = auth.uid();
$$;

grant execute on function public.my_visibility() to authenticated;
