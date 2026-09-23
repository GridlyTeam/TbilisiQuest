-- Tbilisi Quest :: 0034 :: the City Pass, campuses, partner quests and beacons
--
-- Written against what is already here rather than beside it. Four of the
-- columns the brief asks for exist under other names, and adding the brief's
-- names would give each one two sources of truth:
--
--   gps_lat / gps_lng  ->  drops.location       (a PostGIS point; the geofence
--                                                and every distance check read
--                                                it, and two loose floats
--                                                cannot carry the same index)
--   geo_radius         ->  drops.claim_radius_m  (beside reveal_radius_m, the
--                                                wider ring a drop is visible
--                                                in before it can be claimed)
--   expires_at         ->  drops.ends_at
--   max_claims         ->  drops.inventory_cap
--
-- Seasonal XP is likewise not a stored counter: season_xp() sums xp_events
-- inside the season window, so a season cannot drift out of step with the
-- events that built it, and a mistaken award is undone by deleting the event.
-- The pass is built on that sum.
--
-- What is genuinely new here: a 50-level dual-track pass with claimable
-- rewards, universities and their leaderboard, avatar configuration, quests
-- that can name a venue, and the venue beacon.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Universities
-- ---------------------------------------------------------------------------
-- A rivalry needs sides. A table rather than an enum so an operator can add a
-- campus without a migration, and so each one carries its own colour for the
-- leaderboard.
create table if not exists public.universities (
  id        uuid primary key default gen_random_uuid(),
  code      text unique not null,
  name_ka   text not null,
  name_en   text not null,
  colour    text,
  is_active boolean not null default true
);

insert into public.universities (code, name_ka, name_en, colour) values
  ('tsu',      'თსუ',        'TSU',                 '#3BD6FF'),
  ('ilia',     'ილიაუნი',    'Ilia State',          '#A855F7'),
  ('caucasus', 'კავკასია',   'Caucasus University', '#FFB020'),
  ('gtu',      'ტექნიკური',  'GTU',                 '#3BE08A'),
  ('btu',      'ბიზნესტექ',  'BTU',                 '#FF5C7A'),
  ('free',     'თავისუფალი', 'Free University',     '#7C5CFF')
on conflict (code) do nothing;

alter table public.universities enable row level security;
drop policy if exists universities_read on public.universities;
create policy universities_read on public.universities
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. The player: a campus, and a face
-- ---------------------------------------------------------------------------
-- avatar_config is a JSON document rather than columns because the slots will
-- change every season: today a hoodie and a pin, next season a board and a
-- trail. equipped_title and equipped_frame stay as they are -- they are
-- foreign keys into cosmetics, which JSON cannot enforce.
alter table public.users
  add column if not exists university_id uuid references public.universities(id) on delete set null,
  add column if not exists avatar_config jsonb not null default '{}'::jsonb;

create index if not exists users_university_idx on public.users (university_id);

-- Choosing a campus is the player's own claim; it is not verified, so it
-- carries no privilege beyond which column of the leaderboard they stand in.
create or replace function public.set_my_university(p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_code is null then
    update public.users set university_id = null where id = auth.uid();
    return;
  end if;

  select id into v_id from public.universities where code = p_code and is_active;
  if v_id is null then
    raise exception 'UNKNOWN_UNIVERSITY';
  end if;

  update public.users set university_id = v_id where id = auth.uid();
end;
$$;

grant execute on function public.set_my_university(text) to authenticated;

-- The avatar is cosmetic, but it is still user input that other people will
-- see, so it is size-capped and every cosmetic it names must be one they own.
create or replace function public.set_avatar_config(p_config jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
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

  update public.users set avatar_config = p_config where id = auth.uid();
end;
$$;

grant execute on function public.set_avatar_config(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The City Pass: two tracks over one ladder
-- ---------------------------------------------------------------------------
-- season_tiers already is the ladder, so it grows a second track rather than
-- being replaced: my_season(), sync_season_rewards() and the season card in
-- the app keep working, and the free track is exactly what they were reading.
alter table public.season_tiers
  add column if not exists is_premium     boolean not null default false,
  add column if not exists reward_type    text    not null default 'cosmetic',
  add column if not exists reward_payload jsonb   not null default '{}'::jsonb;

alter table public.season_tiers drop constraint if exists season_tiers_reward_type_check;
alter table public.season_tiers add constraint season_tiers_reward_type_check
  check (reward_type in ('cosmetic', 'title', 'frame', 'voucher', 'nothing'));

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.season_tiers'::regclass
      and conname = 'season_tiers_pkey'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (season_id, tier)'
  ) then
    alter table public.season_tiers drop constraint season_tiers_pkey;
    alter table public.season_tiers add constraint season_tiers_pkey
      primary key (season_id, tier, is_premium);
  end if;
end $$;

-- The name the brief uses, over the table that holds it.
create or replace view public.pass_rewards as
  select
    t.season_id,
    t.tier as level,
    t.is_premium,
    t.min_xp,
    t.reward_type,
    t.reward_payload,
    t.reward_code,
    t.title_ka,
    t.title_en
  from public.season_tiers t;

grant select on public.pass_rewards to authenticated;

-- Who holds the premium track. No payment provider is wired up yet, so it
-- arrives by the other route the brief describes: a partner perk an operator
-- grants. When payments land they insert the same row.
create table if not exists public.season_passes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  season_id  uuid not null references public.seasons(id) on delete cascade,
  is_premium boolean not null default true,
  source     text,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, season_id)
);

alter table public.season_passes enable row level security;
drop policy if exists season_passes_read_own on public.season_passes;
create policy season_passes_read_own on public.season_passes
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- A reward is taken, not merely reached. The row is the receipt, and its
-- primary key is what stops a level paying out twice.
create table if not exists public.pass_claims (
  user_id     uuid not null references auth.users(id) on delete cascade,
  season_id   uuid not null references public.seasons(id) on delete cascade,
  tier        int  not null,
  is_premium  boolean not null,
  reward_type text not null,
  payload     jsonb not null default '{}'::jsonb,
  claimed_at  timestamptz not null default now(),
  primary key (user_id, season_id, tier, is_premium)
);

alter table public.pass_claims enable row level security;
drop policy if exists pass_claims_read_own on public.pass_claims;
create policy pass_claims_read_own on public.pass_claims
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. The ladder itself
-- ---------------------------------------------------------------------------
-- Quadratic rather than linear: the first levels have to land on the first
-- evening or nobody comes back, and level 50 has to be worth sixty days. 200
-- XP for the first step, widening by 20 each level, so the whole pass is
-- 33,320 XP -- around 550 a day, which two daily quests and a couple of claims
-- cover.
create or replace function public.pass_level_min_xp(p_level int)
returns int
language sql
immutable
as $$
  select case
    when p_level <= 1 then 0
    else (200 * (p_level - 1) + 10 * (p_level - 1) * (p_level - 2))::int
  end;
$$;

-- Fills a season's ladder without touching a level someone has already
-- designed: existing rows keep their titles and rewards.
create or replace function public.generate_city_pass(
  p_season uuid,
  p_levels int default 50
)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  insert into public.season_tiers (
    season_id, tier, min_xp, title_ka, title_en, is_premium, reward_type, reward_payload
  )
  select
    p_season,
    lvl,
    public.pass_level_min_xp(lvl),
    'დონე ' || lvl,
    'Level ' || lvl,
    prem,
    'nothing',
    '{}'::jsonb
  from generate_series(1, p_levels) as lvl
  cross join (values (false), (true)) as v(prem)
  on conflict (season_id, tier, is_premium) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.generate_city_pass(uuid, int) to authenticated;

-- The XP-to-level calculator. Reads the ladder rather than the formula, so a
-- season with a hand-tuned curve still resolves correctly.
create or replace function public.pass_level_for_xp(p_season uuid, p_xp int)
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(max(t.tier), 0)
  from public.season_tiers t
  where t.season_id = p_season
    and not t.is_premium
    and t.min_xp <= p_xp;
$$;

-- ---------------------------------------------------------------------------
-- 5. What the app asks for
-- ---------------------------------------------------------------------------
create or replace function public.my_city_pass()
returns table (
  season_code  text,
  name_ka      text,
  name_en      text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  xp           int,
  level        int,
  max_level    int,
  level_min_xp int,
  next_min_xp  int,
  has_premium  boolean,
  levels       jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_season public.seasons;
  v_xp     int;
  v_level  int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_season := public.current_season();
  if v_season.id is null then
    return;
  end if;

  v_xp    := public.season_xp(auth.uid(), v_season.id);
  v_level := public.pass_level_for_xp(v_season.id, v_xp);

  return query
  select
    v_season.code,
    v_season.name_ka,
    v_season.name_en,
    v_season.starts_at,
    v_season.ends_at,
    v_xp,
    v_level,
    (select coalesce(max(t.tier), 0) from public.season_tiers t where t.season_id = v_season.id),
    public.pass_level_min_xp(greatest(v_level, 1)),
    (
      select min(t.min_xp) from public.season_tiers t
      where t.season_id = v_season.id and not t.is_premium and t.min_xp > v_xp
    ),
    exists (
      select 1 from public.season_passes sp
      where sp.user_id = auth.uid() and sp.season_id = v_season.id and sp.is_premium
    ),
    (
      -- Both tracks in one list, which is how the track is drawn: free
      -- underneath, premium above, locked and claimed states included.
      select jsonb_agg(r.x)
      from (
        select jsonb_build_object(
          'level', t.tier,
          'min_xp', t.min_xp,
          'is_premium', t.is_premium,
          'reward_type', t.reward_type,
          'reward_payload', t.reward_payload,
          'reward_code', t.reward_code,
          'title_ka', t.title_ka,
          'title_en', t.title_en,
          'unlocked', t.min_xp <= v_xp,
          'claimed', exists (
            select 1 from public.pass_claims pc
            where pc.user_id = auth.uid()
              and pc.season_id = v_season.id
              and pc.tier = t.tier
              and pc.is_premium = t.is_premium
          )
        ) as x
        from public.season_tiers t
        where t.season_id = v_season.id
        order by t.tier, t.is_premium
      ) r
    );
end;
$$;

grant execute on function public.my_city_pass() to authenticated;

-- Taking a reward. Every refusal is named, because the app shows the reason on
-- the button rather than a generic failure.
create or replace function public.claim_pass_reward(
  p_level   int,
  p_premium boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_season public.seasons;
  v_tier   public.season_tiers;
  v_xp     int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform public.assert_player_active();

  v_season := public.current_season();
  if v_season.id is null then
    raise exception 'NO_SEASON';
  end if;

  select * into v_tier
  from public.season_tiers t
  where t.season_id = v_season.id and t.tier = p_level and t.is_premium = p_premium;

  if v_tier.season_id is null then
    raise exception 'NO_SUCH_LEVEL';
  end if;

  v_xp := public.season_xp(auth.uid(), v_season.id);
  if v_xp < v_tier.min_xp then
    raise exception 'LEVEL_LOCKED';
  end if;

  if p_premium and not exists (
    select 1 from public.season_passes sp
    where sp.user_id = auth.uid() and sp.season_id = v_season.id and sp.is_premium
  ) then
    raise exception 'PREMIUM_REQUIRED';
  end if;

  insert into public.pass_claims (user_id, season_id, tier, is_premium, reward_type, payload)
  values (auth.uid(), v_season.id, p_level, p_premium, v_tier.reward_type, v_tier.reward_payload)
  on conflict (user_id, season_id, tier, is_premium) do nothing;

  if not found then
    raise exception 'ALREADY_CLAIMED';
  end if;

  -- Digital rewards are granted here. A voucher reward is a code the merchant
  -- honours, so it lives in the claim row and nowhere else.
  if v_tier.reward_type in ('cosmetic', 'title', 'frame') and v_tier.reward_code is not null then
    insert into public.user_cosmetics (user_id, code, source)
    values (auth.uid(), v_tier.reward_code, 'city_pass')
    on conflict (user_id, code) do nothing;
  end if;

  return jsonb_build_object(
    'level', p_level,
    'is_premium', p_premium,
    'reward_type', v_tier.reward_type,
    'reward_code', v_tier.reward_code,
    'payload', v_tier.reward_payload
  );
end;
$$;

grant execute on function public.claim_pass_reward(int, boolean) to authenticated;

-- The partner route onto the premium track.
create or replace function public.grant_premium_pass(
  p_user_id uuid,
  p_source  text default 'partner'
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_season public.seasons;
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  v_season := public.current_season();
  if v_season.id is null then
    raise exception 'NO_SEASON';
  end if;

  insert into public.season_passes (user_id, season_id, is_premium, source, granted_by)
  values (p_user_id, v_season.id, true, p_source, auth.uid())
  on conflict (user_id, season_id) do update
    set is_premium = true,
        source     = excluded.source,
        granted_by = excluded.granted_by,
        granted_at = now();
end;
$$;

grant execute on function public.grant_premium_pass(uuid, text) to authenticated;

-- The free track still grants on reaching a tier, as it did before. The
-- premium track never does, or claiming would be pointless.
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
    and not t.is_premium
    and t.min_xp <= v_xp
    and t.reward_code is not null
  on conflict (user_id, code) do nothing;
end;
$$;

-- my_season() reads the same ladder and must not see each level twice now.
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
      where t.season_id = v_season.id and not t.is_premium and t.min_xp <= v_xp
    ), 0),
    (
      select min(t.min_xp) from public.season_tiers t
      where t.season_id = v_season.id and not t.is_premium and t.min_xp > v_xp
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
      from public.season_tiers t
      where t.season_id = v_season.id and not t.is_premium
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Partner quests
-- ---------------------------------------------------------------------------
-- A quest that names a venue: "visit Dunkin four times this month". The
-- objective types stay as they are and the venue is a filter over them, so a
-- partner quest is redeem_count that only counts at one shop.
alter table public.quests
  add column if not exists target_venue_id uuid references public.venues(id) on delete cascade;

create or replace function public.progress_quests(
  p_user_id  uuid,
  p_event    text,
  p_venue_id uuid default null,
  p_rarity   voucher_rarity default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  q          public.quests%rowtype;
  v_period   date;
  v_progress int;
  v_uq       public.user_quests%rowtype;
  v_category text;
begin
  if p_venue_id is not null then
    select v.category into v_category from public.venues v where v.id = p_venue_id;
  end if;

  for q in
    select * from public.quests
    where is_active
      and (starts_at is null or starts_at <= now())
      and (ends_at   is null or ends_at   >= now())
  loop
    -- A quest pinned to a venue only moves at that venue.
    continue when q.target_venue_id is not null
      and (p_venue_id is null or p_venue_id <> q.target_venue_id);

    -- Does this event move this quest at all?
    continue when not (
      (q.objective_type = 'claim_count'     and p_event = 'claim')
      or (q.objective_type = 'redeem_count' and p_event = 'redeem')
      or (q.objective_type = 'distinct_venues' and p_event = 'redeem')
      or (q.objective_type = 'category_visit'  and p_event = 'redeem'
          and v_category is not null
          and v_category = q.objective_params->>'category')
      or (q.objective_type = 'rarity_hunt'     and p_event = 'redeem'
          and p_rarity is not null
          and p_rarity::text = q.objective_params->>'rarity')
    );

    v_period := public.quest_period_start(q.cadence);

    insert into public.user_quests (user_id, quest_id, period_start, progress)
    values (p_user_id, q.id, v_period, 0)
    on conflict (user_id, quest_id, period_start) do nothing;

    select * into v_uq
    from public.user_quests uq
    where uq.user_id = p_user_id
      and uq.quest_id = q.id
      and uq.period_start = v_period
    for update;

    continue when v_uq.completed_at is not null;

    if q.objective_type = 'distinct_venues' then
      -- Recomputed rather than incremented: the same shop twice is one venue,
      -- and an incrementing counter cannot know that.
      select count(distinct rd.venue_id)::int into v_progress
      from public.redemptions rd
      where rd.user_id = p_user_id
        and rd.redeemed_at >= v_period;
    else
      v_progress := v_uq.progress + 1;
    end if;

    update public.user_quests
    set progress     = v_progress,
        completed_at = case when v_progress >= q.objective_target then now() end
    where id = v_uq.id;

    if v_progress >= q.objective_target then
      perform public.award_xp(p_user_id, q.xp_reward, 'quest_complete', q.id);
      update public.user_quests set claimed_at = now() where id = v_uq.id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Venue beacons
-- ---------------------------------------------------------------------------
-- A beacon is a drop shouting for a while: it lights the venue on the map and
-- pushes once to players who have a token. Time-boxed rather than a boolean a
-- merchant can leave switched on, because a beacon that never ends is just a
-- brighter pin.
alter table public.drops
  add column if not exists beacon_until timestamptz;

create or replace function public.beacon_is_live(p_drop_id uuid)
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(
    (select d.beacon_until > now() from public.drops d where d.id = p_drop_id),
    false
  );
$$;

create or replace function public.start_beacon(p_drop_id uuid, p_minutes int default 60)
returns timestamptz
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_drop  public.drops%rowtype;
  v_venue public.venues%rowtype;
  v_until timestamptz;
begin
  select * into v_drop from public.drops where id = p_drop_id;
  if v_drop.id is null then
    raise exception 'NO_SUCH_DROP';
  end if;

  if not (public.has_venue_role(v_drop.venue_id, 'owner') or public.is_platform_admin()) then
    raise exception 'NOT_YOURS';
  end if;

  if p_minutes < 15 or p_minutes > 240 then
    raise exception 'BEACON_LENGTH';
  end if;

  if v_drop.status <> 'live' or v_drop.ends_at <= now() then
    raise exception 'DROP_NOT_LIVE';
  end if;

  -- Never past the drop's own end: a beacon pointing at nothing is worse than
  -- no beacon at all.
  v_until := least(now() + make_interval(mins => p_minutes), v_drop.ends_at);

  update public.drops set beacon_until = v_until where id = p_drop_id;

  select * into v_venue from public.venues where id = v_drop.venue_id;

  -- One push per beacon per hour, whatever else happens.
  insert into public.push_outbox (user_id, token, title, body, data, dedupe_key)
  select
    u.id,
    u.push_token,
    case when u.locale = 'ka' then 'ფლეშ შეთავაზება' else 'Flash offer' end,
    case
      when u.locale = 'ka'
        then coalesce(v_venue.name_ka, v_venue.name_en) || ' - ' ||
             coalesce(v_drop.title_ka, v_drop.title_en)
      else coalesce(v_venue.name_en, v_venue.name_ka) || ' - ' ||
           coalesce(v_drop.title_en, v_drop.title_ka)
    end,
    jsonb_build_object('kind', 'beacon', 'drop_id', p_drop_id),
    'beacon_' || p_drop_id::text || '_' ||
      to_char(now() at time zone 'Asia/Tbilisi', 'YYYY-MM-DD-HH24')
  from public.users u
  where u.push_token is not null
    and u.status = 'active'
  on conflict (user_id, dedupe_key) do nothing;

  return v_until;
end;
$$;

grant execute on function public.start_beacon(uuid, int) to authenticated;
grant execute on function public.beacon_is_live(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Campus leaderboard
-- ---------------------------------------------------------------------------
-- Counts redemptions, not claims: a claim is a tap, a redemption is somebody
-- who walked in and stood at a counter. That is the number venues pay for, and
-- the one a rivalry should be settled on.
create or replace function public.campus_leaderboard(p_days int default 30)
returns table (
  code        text,
  name_ka     text,
  name_en     text,
  colour      text,
  players     int,
  redemptions int,
  xp          int
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    un.code,
    un.name_ka,
    un.name_en,
    un.colour,
    count(distinct u.id)::int as players,
    coalesce((
      select count(*)::int from public.redemptions r
      join public.users ru on ru.id = r.user_id
      where ru.university_id = un.id
        and r.redeemed_at >= now() - make_interval(days => p_days)
    ), 0) as redemptions,
    coalesce((
      select sum(x.amount)::int from public.xp_events x
      join public.users xu on xu.id = x.user_id
      where xu.university_id = un.id
        and x.amount > 0
        and x.occurred_at >= now() - make_interval(days => p_days)
    ), 0) as xp
  from public.universities un
  left join public.users u on u.university_id = un.id and u.status = 'active'
  where un.is_active
  group by un.id, un.code, un.name_ka, un.name_en, un.colour
  order by redemptions desc, xp desc;
$$;

grant execute on function public.campus_leaderboard(int) to authenticated;

-- Where the player's own campus stands, which is the part they look at first.
create or replace function public.my_campus_standing(p_days int default 30)
returns table (
  code               text,
  name_ka            text,
  name_en            text,
  colour             text,
  campus_rank        int,
  my_redemptions     int,
  campus_redemptions int
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with board as (
    select
      b.*,
      row_number() over (order by b.redemptions desc, b.xp desc)::int as rank
    from public.campus_leaderboard(p_days) b
  ),
  me as (
    select un.code as my_code
    from public.users u
    join public.universities un on un.id = u.university_id
    where u.id = auth.uid()
  )
  select
    board.code,
    board.name_ka,
    board.name_en,
    board.colour,
    board.rank,
    coalesce((
      select count(*)::int from public.redemptions r
      where r.user_id = auth.uid()
        and r.redeemed_at >= now() - make_interval(days => p_days)
    ), 0),
    board.redemptions
  from board
  join me on me.my_code = board.code;
$$;

grant execute on function public.my_campus_standing(int) to authenticated;
