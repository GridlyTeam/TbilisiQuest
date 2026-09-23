-- Tbilisi Quest :: 0039 :: one leaderboard, and everybody is already in it
--
-- 0034 built a campus rivalry: pick TSU or Ilia, and the board ranked
-- universities against each other. It is being removed a day later, before
-- anybody has used it, for a reason worth writing down -- it asked the player
-- to make a choice before they could compete, and a player who skips that
-- choice is in no competition at all. The season board should need no opt-in:
-- you earn XP by claiming and using vouchers, so you are ranked.
--
-- Two boards also forced a question nobody wanted to answer, which is which of
-- them a player is supposed to care about.
--
-- The campus machinery is dropped rather than left dormant. It is in git if it
-- is ever wanted back: `git show 0034` has the table, the column and both
-- functions, and re-adding them is that file minus the parts already here.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. The campus rivalry comes out
-- ---------------------------------------------------------------------------
drop function if exists public.campus_leaderboard(int);
drop function if exists public.my_campus_standing(int);
drop function if exists public.set_my_university(text);

drop index if exists public.users_university_idx;
alter table public.users drop column if exists university_id;
drop table if exists public.universities;

-- ---------------------------------------------------------------------------
-- 2. The season board
-- ---------------------------------------------------------------------------
-- Ranked on XP earned inside the season window, which is the same sum
-- season_xp() and the City Pass read. One number drives the pass, the level and
-- the board, so a player never has to hold two ideas of how well they are
-- doing.
--
-- Banned and erased players are left out: an erased account is called "Deleted
-- player" and has no business sitting in a public list.
create or replace function public.season_leaderboard(p_limit int default 100)
returns table (
  rank         int,
  display_name text,
  xp           int,
  is_me        boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with season as (
    select * from public.current_season()
  ),
  totals as (
    select
      u.id,
      coalesce(u.display_name, 'Player') as display_name,
      coalesce(sum(x.amount) filter (where x.amount > 0), 0)::int as xp
    from public.users u
    cross join season s
    left join public.xp_events x
      on x.user_id = u.id
     and x.occurred_at >= s.starts_at
     and x.occurred_at <  s.ends_at
    where u.status = 'active'
    group by u.id, u.display_name
  )
  select
    dense_rank() over (order by t.xp desc)::int,
    t.display_name,
    t.xp,
    t.id = auth.uid()
  from totals t
  where t.xp > 0
  order by t.xp desc, t.display_name
  limit p_limit;
$$;

grant execute on function public.season_leaderboard(int) to authenticated;

-- Where the player themselves sits, which a list capped at 100 cannot tell
-- somebody in 340th place.
create or replace function public.my_season_rank()
returns table (
  rank    int,
  xp      int,
  players int
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with season as (
    select * from public.current_season()
  ),
  totals as (
    select
      u.id,
      coalesce(sum(x.amount) filter (where x.amount > 0), 0)::int as xp
    from public.users u
    cross join season s
    left join public.xp_events x
      on x.user_id = u.id
     and x.occurred_at >= s.starts_at
     and x.occurred_at <  s.ends_at
    where u.status = 'active'
    group by u.id
  ),
  ranked as (
    select id, xp, dense_rank() over (order by xp desc)::int as rank
    from totals
    where xp > 0
  )
  select
    coalesce((select r.rank from ranked r where r.id = auth.uid()), 0),
    coalesce((select r.xp   from ranked r where r.id = auth.uid()), 0),
    (select count(*)::int from ranked);
$$;

grant execute on function public.my_season_rank() to authenticated;
