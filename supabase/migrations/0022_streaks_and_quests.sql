-- Tbilisi Quest :: 0022 :: make streaks and quests real
--
-- Both have existed as tables since 0003 and neither has ever been written to.
-- user_xp.current_streak_days is displayed on the profile screen and has been
-- zero for every player since launch; public.quests has no rows and nothing
-- reads user_quests. This is the engine.
--
-- Everything hangs off two triggers rather than off the client, because the
-- client is the one participant in this system with a reason to lie.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Streak freezes
-- ---------------------------------------------------------------------------
-- One missed day should not destroy a 40-day streak. That is not generosity:
-- the moment a long streak breaks is the moment the habit it represents stops
-- being worth protecting, and the player goes quiet. One freeze a month, spent
-- automatically, keeps the thing they have built alive through a single bad
-- day without making the streak meaningless.
alter table public.user_xp
  add column streak_freezes    int not null default 1 check (streak_freezes >= 0),
  add column freezes_refilled  date,
  add column freeze_used_on    date,
  -- The last date that COUNTED toward the streak. Deliberately not
  -- last_activity_date: award_xp stamps that on every XP event, including the
  -- claim earlier in the same afternoon, so by the time a redemption fires it
  -- already reads today and the streak logic cannot tell "first redemption
  -- today" from "already counted".
  add column streak_date       date;

-- Milestone bonuses. Flat XP per day would just be a slower XP tap; the jumps
-- are what make day 7 worth getting out for.
create table public.streak_rewards (
  days  int primary key check (days > 0),
  xp    int not null check (xp > 0)
);

insert into public.streak_rewards (days, xp) values
  (3, 50), (7, 150), (14, 350), (30, 800), (60, 1800), (100, 4000)
on conflict (days) do nothing;

-- ---------------------------------------------------------------------------
-- bump_streak
-- ---------------------------------------------------------------------------
create or replace function public.bump_streak(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row    public.user_xp%rowtype;
  v_gap    int;
  v_streak int;
  v_bonus  int;
begin
  -- A player who has never earned XP has no row yet; award_xp creates it, and
  -- redeem always awards first, so this is defensive rather than expected.
  insert into public.user_xp (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_row from public.user_xp x where x.user_id = p_user_id for update;

  -- Refill the monthly freeze before spending one.
  if v_row.freezes_refilled is null
     or date_trunc('month', v_row.freezes_refilled) < date_trunc('month', current_date)
  then
    update public.user_xp
    set streak_freezes = 1, freezes_refilled = current_date
    where user_id = p_user_id;
    v_row.streak_freezes := 1;
  end if;

  if v_row.streak_date = current_date then
    return;  -- already counted today
  end if;

  v_gap := case
    when v_row.streak_date is null then null
    else current_date - v_row.streak_date
  end;

  if v_gap = 1 then
    v_streak := greatest(v_row.current_streak_days, 0) + 1;
  elsif v_gap = 2 and v_row.streak_freezes > 0 and v_row.current_streak_days > 0 then
    -- Spend the freeze: the missed day is forgiven, today continues the run.
    v_streak := v_row.current_streak_days + 1;
    update public.user_xp
    set streak_freezes = streak_freezes - 1,
        freeze_used_on = current_date - 1
    where user_id = p_user_id;
  else
    v_streak := 1;
  end if;

  update public.user_xp
  set current_streak_days = v_streak,
      longest_streak_days = greatest(longest_streak_days, v_streak),
      streak_date         = current_date,
      last_activity_date  = current_date,
      updated_at          = now()
  where user_id = p_user_id;

  select sr.xp into v_bonus from public.streak_rewards sr where sr.days = v_streak;
  if v_bonus is not null then
    perform public.award_xp(p_user_id, v_bonus, 'streak_bonus', null);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quest progress
-- ---------------------------------------------------------------------------
-- The period key is what resets progress: a new day or a new week means a new
-- user_quests row, so nothing has to be cleaned up on a schedule.
create or replace function public.quest_period_start(p_cadence text)
returns date
language sql
immutable
as $$
  select case
    when p_cadence = 'weekly' then date_trunc('week', current_date)::date
    when p_cadence = 'daily'  then current_date
    else date '1970-01-01'   -- 'special': one period for the whole run
  end;
$$;

create or replace function public.progress_quests(
  p_user_id  uuid,
  p_event    text,                      -- 'claim' | 'redeem'
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
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.on_voucher_claimed()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'held' and (old.status is distinct from 'held') and new.user_id is not null then
    perform public.progress_quests(new.user_id, 'claim');
  end if;
  return new;
end;
$$;

create trigger vouchers_progress_quests
  after update on public.vouchers
  for each row execute function public.on_voucher_claimed();

create or replace function public.on_redemption()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rarity voucher_rarity;
begin
  select d.rarity into v_rarity
  from public.vouchers vo
  join public.drops d on d.id = vo.drop_id
  where vo.id = new.voucher_id;

  perform public.bump_streak(new.user_id);
  perform public.progress_quests(new.user_id, 'redeem', new.venue_id, v_rarity);
  return new;
end;
$$;

-- Postgres fires AFTER triggers in name order, so "redemptions_pay_referral"
-- runs before "redemptions_progress". That is the order we want in the XP
-- ledger: the referral bonus, then the streak bonus.
create trigger redemptions_progress
  after insert on public.redemptions
  for each row execute function public.on_redemption();

-- ---------------------------------------------------------------------------
-- What the app shows
-- ---------------------------------------------------------------------------
create or replace function public.my_quests()
returns table (
  quest_id    uuid,
  code        text,
  title_ka    text,
  title_en    text,
  description_ka text,
  description_en text,
  cadence     text,
  target      int,
  progress    int,
  xp_reward   int,
  completed   boolean,
  -- When this quest's window closes, so the UI can show "2 days left".
  period_ends timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  return query
  select
    q.id,
    q.code,
    q.title_ka,
    q.title_en,
    q.description_ka,
    q.description_en,
    q.cadence,
    q.objective_target,
    coalesce(uq.progress, 0),
    q.xp_reward,
    (uq.completed_at is not null),
    case
      when q.cadence = 'daily'  then (current_date + 1)::timestamptz
      when q.cadence = 'weekly' then (public.quest_period_start('weekly') + 7)::timestamptz
      else q.ends_at
    end
  from public.quests q
  left join public.user_quests uq
    on uq.quest_id = q.id
   and uq.user_id = auth.uid()
   and uq.period_start = public.quest_period_start(q.cadence)
  where q.is_active
    and (q.starts_at is null or q.starts_at <= now())
    and (q.ends_at   is null or q.ends_at   >= now())
  order by
    (uq.completed_at is not null),          -- unfinished first
    case q.cadence when 'daily' then 0 when 'weekly' then 1 else 2 end,
    q.xp_reward desc;
end;
$$;

grant execute on function public.my_quests() to authenticated;

-- Players read their own progress; writes only ever happen in the functions
-- above, which run as definer.
alter table public.user_quests enable row level security;
create policy user_quests_select_own on public.user_quests
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

alter table public.quests enable row level security;
create policy quests_select_active on public.quests
  for select to authenticated
  using (is_active);

alter table public.streak_rewards enable row level security;
create policy streak_rewards_select on public.streak_rewards
  for select to authenticated using (true);

-- No quests are seeded here. supabase/seed.sql already defines five, and they
-- use exactly the objective vocabulary this engine implements -- claim_count,
-- redeem_count, distinct_venues, rarity_hunt, category_visit. What was missing
-- was never the content; it was anything that moved the progress.
