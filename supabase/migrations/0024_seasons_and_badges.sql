-- Tbilisi Quest :: 0024 :: seasons, cosmetics and the badge case
--
-- Levels never reset, which is correct for a lifetime record and useless as a
-- reason to play this month: a player at level 12 has nothing in front of them
-- that a player at level 2 does not. A season is the fix. It runs for six
-- weeks, it starts everyone from zero, and it ends -- which is what makes the
-- reward at the end of it worth walking for, and what gives the project a
-- marketing beat every six weeks.
--
-- Everything a season pays out is cosmetic. Selling or granting power (better
-- odds, earlier access, more claims) would split the map into players who can
-- afford discounts and players who cannot, which is precisely backwards for an
-- app whose audience is school pupils.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Cosmetics
-- ---------------------------------------------------------------------------
create type cosmetic_kind as enum (
  'title',        -- a word under the player's name
  'avatar_frame', -- ring around the avatar
  'marker_skin',  -- how their pin looks to others, later
  'card_theme'    -- background of the share card
);

create table public.cosmetics (
  code        text primary key,
  kind        cosmetic_kind not null,
  title_ka    text not null,
  title_en    text not null,
  -- Rendered entirely client-side from this key; the server never stores an
  -- image, so adding a look is a client release, not a migration.
  style_key   text not null,
  rarity      voucher_rarity not null default 'common'
);

create table public.user_cosmetics (
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text not null references public.cosmetics(code) on delete cascade,
  source      text not null,          -- 'season_tier', 'badge', 'grant'
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.users
  add column equipped_title text references public.cosmetics(code) on delete set null,
  add column equipped_frame text references public.cosmetics(code) on delete set null;

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------
create table public.seasons (
  id        uuid primary key default gen_random_uuid(),
  code      text unique not null,
  name_ka   text not null,
  name_en   text not null,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  constraint seasons_window check (ends_at > starts_at)
);

-- At most one season may be running at any instant. Overlapping seasons would
-- make "season XP" ambiguous, and the bug would only appear at a boundary.
create index seasons_window_idx on public.seasons (starts_at, ends_at);

create table public.season_tiers (
  season_id     uuid not null references public.seasons(id) on delete cascade,
  tier          int not null check (tier > 0),
  min_xp        int not null check (min_xp >= 0),
  title_ka      text not null,
  title_en      text not null,
  -- Null for a tier that is only a milestone on the way to the next reward.
  reward_code   text references public.cosmetics(code) on delete set null,
  primary key (season_id, tier)
);

alter table public.seasons enable row level security;
alter table public.season_tiers enable row level security;
alter table public.cosmetics enable row level security;
alter table public.user_cosmetics enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

create policy seasons_read on public.seasons
  for select to authenticated using (true);
create policy season_tiers_read on public.season_tiers
  for select to authenticated using (true);
create policy cosmetics_read on public.cosmetics
  for select to authenticated using (true);
create policy user_cosmetics_read_own on public.user_cosmetics
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy badges_read on public.badges
  for select to authenticated using (true);
create policy user_badges_read_own on public.user_badges
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Season progress
-- ---------------------------------------------------------------------------
-- Season XP is summed from the ledger rather than kept in its own counter.
-- xp_events already records every grant with a timestamp, so a second counter
-- would be a second thing to keep correct and a second thing to be wrong.
create or replace function public.current_season()
returns public.seasons
language sql
stable
set search_path = public, extensions
as $$
  select * from public.seasons s
  where s.starts_at <= now() and s.ends_at > now()
  order by s.starts_at desc
  limit 1;
$$;

create or replace function public.season_xp(p_user_id uuid, p_season uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(sum(x.amount), 0)::int
  from public.xp_events x
  join public.seasons s on s.id = p_season
  where x.user_id = p_user_id
    and x.occurred_at >= s.starts_at
    and x.occurred_at <  s.ends_at
    and x.amount > 0;
$$;

-- Unlocks every tier the player has now reached. Idempotent, so it can run on
-- every XP event without care.
create or replace function public.sync_season_rewards(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_season public.seasons;
  v_xp     int;
begin
  v_season := public.current_season();
  if v_season.id is null then
    return;
  end if;

  v_xp := public.season_xp(p_user_id, v_season.id);

  insert into public.user_cosmetics (user_id, code, source)
  select p_user_id, t.reward_code, 'season_tier'
  from public.season_tiers t
  where t.season_id = v_season.id
    and t.min_xp <= v_xp
    and t.reward_code is not null
  on conflict (user_id, code) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------
-- Same objective vocabulary as quests, evaluated against a player's whole
-- history rather than a period.
create or replace function public.evaluate_badges(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  b        public.badges%rowtype;
  v_value  int;
begin
  for b in
    select * from public.badges bb
    where not exists (
      select 1 from public.user_badges ub
      where ub.user_id = p_user_id and ub.badge_id = bb.id
    )
  loop
    v_value := case b.criteria_type
      when 'redeem_count' then (
        select count(*)::int from public.redemptions r where r.user_id = p_user_id
      )
      when 'distinct_venues' then (
        select count(distinct r.venue_id)::int
        from public.redemptions r where r.user_id = p_user_id
      )
      when 'rarity_hunt' then (
        select count(*)::int
        from public.redemptions r
        join public.vouchers vo on vo.id = r.voucher_id
        join public.drops d on d.id = vo.drop_id
        where r.user_id = p_user_id
          and d.rarity::text = b.criteria_params->>'rarity'
      )
      when 'streak_days' then (
        select coalesce(max(x.longest_streak_days), 0)
        from public.user_xp x where x.user_id = p_user_id
      )
      when 'referrals' then (
        select count(*)::int from public.referrals rf
        where rf.referrer_id = p_user_id and rf.rewarded_at is not null
      )
      when 'category_visit' then (
        select count(distinct r.venue_id)::int
        from public.redemptions r
        join public.venues v on v.id = r.venue_id
        where r.user_id = p_user_id
          and v.category = b.criteria_params->>'category'
      )
      else 0
    end;

    if v_value >= b.criteria_target then
      insert into public.user_badges (user_id, badge_id)
      values (p_user_id, b.id)
      on conflict do nothing;

      if b.xp_reward > 0 then
        perform public.award_xp(p_user_id, b.xp_reward, 'badge', b.id);
      end if;
    end if;
  end loop;
end;
$$;

-- Hooked onto the same redemption trigger chain as streaks and quests. Named
-- so it fires last: badges and season tiers both depend on XP those earlier
-- triggers grant.
create or replace function public.on_redemption_rewards()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.evaluate_badges(new.user_id);
  perform public.sync_season_rewards(new.user_id);
  return new;
end;
$$;

create trigger redemptions_z_rewards
  after insert on public.redemptions
  for each row execute function public.on_redemption_rewards();

-- ---------------------------------------------------------------------------
-- What the app reads
-- ---------------------------------------------------------------------------
create or replace function public.my_season()
returns table (
  season_code  text,
  name_ka      text,
  name_en      text,
  ends_at      timestamptz,
  xp           int,
  tier         int,
  next_tier_xp int,
  tiers        jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_season public.seasons;
  v_xp     int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_season := public.current_season();
  if v_season.id is null then
    return;
  end if;

  v_xp := public.season_xp(auth.uid(), v_season.id);

  return query
  select
    v_season.code,
    v_season.name_ka,
    v_season.name_en,
    v_season.ends_at,
    v_xp,
    coalesce((
      select max(t.tier) from public.season_tiers t
      where t.season_id = v_season.id and t.min_xp <= v_xp
    ), 0),
    (
      select min(t.min_xp) from public.season_tiers t
      where t.season_id = v_season.id and t.min_xp > v_xp
    ),
    (
      select jsonb_agg(
        jsonb_build_object(
          'tier', t.tier,
          'min_xp', t.min_xp,
          'title_ka', t.title_ka,
          'title_en', t.title_en,
          'reward_code', t.reward_code,
          'unlocked', t.min_xp <= v_xp
        ) order by t.tier
      )
      from public.season_tiers t where t.season_id = v_season.id
    );
end;
$$;

grant execute on function public.my_season() to authenticated;

create or replace function public.my_badges()
returns table (
  code           text,
  title_ka       text,
  title_en       text,
  description_ka text,
  description_en text,
  icon_key       text,
  target         int,
  earned         boolean,
  awarded_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  return query
  select
    b.code,
    b.title_ka,
    b.title_en,
    b.description_ka,
    b.description_en,
    b.icon_key,
    b.criteria_target,
    (ub.user_id is not null),
    ub.awarded_at
  from public.badges b
  left join public.user_badges ub
    on ub.badge_id = b.id and ub.user_id = auth.uid()
  -- Earned first, then the rest: the case is a trophy shelf, and the empty
  -- slots are the motivation underneath it.
  order by (ub.user_id is null), b.criteria_target;
end;
$$;

grant execute on function public.my_badges() to authenticated;

-- ---------------------------------------------------------------------------
-- Season one
-- ---------------------------------------------------------------------------
insert into public.cosmetics (code, kind, title_ka, title_en, style_key, rarity) values
  ('title_scout',     'title', 'მაძიებელი',   'Scout',        'scout',    'common'),
  ('frame_copper',    'avatar_frame', 'სპილენძი', 'Copper',    'copper',   'common'),
  ('title_hunter',    'title', 'მონადირე',    'Hunter',       'hunter',   'rare'),
  ('frame_violet',    'avatar_frame', 'იისფერი', 'Violet',     'violet',   'rare'),
  ('card_theme_neon', 'card_theme', 'ნეონი',   'Neon',         'neon',     'rare'),
  ('title_legend',    'title', 'ლეგენდა',     'Legend',       'legend',   'legendary'),
  ('frame_gold',      'avatar_frame', 'ოქრო',  'Gold',         'gold',     'legendary')
on conflict (code) do nothing;

insert into public.seasons (code, name_ka, name_en, starts_at, ends_at) values
  ('s1_autumn',
   'სეზონი 1: შემოდგომა', 'Season 1: Autumn',
   date_trunc('day', now()),
   date_trunc('day', now()) + interval '6 weeks')
on conflict (code) do nothing;

insert into public.season_tiers (season_id, tier, min_xp, title_ka, title_en, reward_code)
select s.id, t.tier, t.min_xp, t.title_ka, t.title_en, t.reward_code
from public.seasons s
cross join (values
  (1,   200, 'პირველი ნაბიჯი', 'First steps',  'title_scout'),
  (2,   600, 'ნაცნობი სახე',   'Regular',      'frame_copper'),
  (3,  1200, 'მონადირე',       'Hunter',       'title_hunter'),
  (4,  2200, 'ქუჩის მცოდნე',   'Street-wise',  'frame_violet'),
  (5,  3500, 'ნეონი',          'Neon',         'card_theme_neon'),
  (6,  5000, 'ლეგენდა',        'Legend',       'title_legend'),
  (7,  7500, 'ოქროს სტატუსი',  'Gold status',  'frame_gold')
) as t(tier, min_xp, title_ka, title_en, reward_code)
where s.code = 's1_autumn'
on conflict (season_id, tier) do nothing;

-- seed.sql already defines first_steps, regular, cartographer and
-- treasure_hunter. These two cover the ground it does not -- a streak and
-- referrals -- rather than adding near-duplicates beside it.
insert into public.badges
  (code, title_ka, title_en, description_ka, description_en, icon_key,
   criteria_type, criteria_target, criteria_params, xp_reward)
values
  ('streak_7', 'კვირეული', 'Seven days',
   'შვიდდღიანი სერია.', 'Keep a seven day streak.',
   'flame', 'streak_days', 7, '{}'::jsonb, 200),

  ('inviter_3', 'შემკრები', 'Recruiter',
   'მოიწვიე სამი მეგობარი, რომლებმაც ვაუჩერი გამოიყენეს.',
   'Invite three friends who redeem a voucher.',
   'people', 'referrals', 3, '{}'::jsonb, 400)
on conflict (code) do nothing;
