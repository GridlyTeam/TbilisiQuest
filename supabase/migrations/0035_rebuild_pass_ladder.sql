-- Tbilisi Quest :: 0035 :: one curve for the ladder
--
-- 0034 generated levels 1-50 onto a season that already carried seven
-- hand-made tiers, and `on conflict do nothing` kept the old rows. The result
-- climbed and then fell off a cliff: tier 7 asked 7,500 XP and tier 8 asked
-- 1,820. pass_level_for_xp() takes the highest tier whose min_xp is reached,
-- so a player on 2,000 XP was level 8 while level 7 was still locked above
-- them.
--
-- So every level's requirement is restated from pass_level_min_xp(), and the
-- seven rewards that were spread across the old seven tiers are spread across
-- the new fifty instead -- roughly where they used to sit as a fraction of the
-- climb, so nobody who has already earned one loses it (user_cosmetics keeps
-- what it granted) and nobody gets the top frame in an evening.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. One monotonic curve, both tracks
-- ---------------------------------------------------------------------------
update public.season_tiers t
set min_xp = public.pass_level_min_xp(t.tier)
where t.min_xp is distinct from public.pass_level_min_xp(t.tier);

-- ---------------------------------------------------------------------------
-- 2. The rewards, respaced
-- ---------------------------------------------------------------------------
-- Cleared first so a reward cannot end up sitting on two levels if this runs
-- again after the map below changes.
update public.season_tiers
set reward_code = null,
    reward_type = 'nothing',
    title_ka    = 'დონე ' || tier,
    title_en    = 'Level ' || tier
where not is_premium;

with plan(tier, reward_code, reward_type, title_ka, title_en) as (
  values
    (3,  'title_scout',     'title',  'პირველი ნაბიჯი', 'First steps'),
    (8,  'frame_copper',    'frame',  'ნაცნობი სახე',   'Regular'),
    (15, 'title_hunter',    'title',  'მონადირე',       'Hunter'),
    (22, 'frame_violet',    'frame',  'ქუჩის ხალხი',    'Street-wise'),
    (30, 'card_theme_neon', 'cosmetic','ნეონი',         'Neon'),
    (40, 'title_legend',    'title',  'ლეგენდა',        'Legend'),
    (50, 'frame_gold',      'frame',  'ოქროს სტატუსი',  'Gold status')
)
update public.season_tiers t
set reward_code = p.reward_code,
    reward_type = p.reward_type,
    title_ka    = p.title_ka,
    title_en    = p.title_en
from plan p
where t.tier = p.tier
  and not t.is_premium;

-- ---------------------------------------------------------------------------
-- 3. A ladder that only goes up
-- ---------------------------------------------------------------------------
-- The bug this migration fixes was silent: the numbers were wrong but every
-- query still answered. This makes the database refuse the shape instead.
create or replace function public.assert_pass_ladder_climbs()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if exists (
    select 1
    from public.season_tiers a
    join public.season_tiers b
      on b.season_id = a.season_id
     and b.is_premium = a.is_premium
     and b.tier > a.tier
     and b.min_xp < a.min_xp
    where a.season_id = new.season_id
      and a.is_premium = new.is_premium
  ) then
    raise exception 'PASS_LADDER_NOT_MONOTONIC';
  end if;
  return null;
end;
$$;

drop trigger if exists season_tiers_ladder_climbs on public.season_tiers;
create constraint trigger season_tiers_ladder_climbs
  after insert or update on public.season_tiers
  deferrable initially deferred
  for each row execute function public.assert_pass_ladder_climbs();
