-- Tbilisi Quest :: 0003 :: XP, levels, quests, badges

-- ---------------------------------------------------------------------------
-- user_xp
-- ---------------------------------------------------------------------------
-- Current aggregate state, one row per player. Denormalised on purpose: level
-- is read on every claim (for early access) and must not require a sum over an
-- events table.
create table public.user_xp (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  total_xp            int not null default 0 check (total_xp >= 0),
  level               int not null default 1 check (level >= 1),
  current_streak_days int not null default 0,
  longest_streak_days int not null default 0,
  last_activity_date  date,
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- xp_events
-- ---------------------------------------------------------------------------
-- Append-only ledger. user_xp is the running balance; this is the audit trail
-- that lets you answer "why is this player level 9?" and recompute after a
-- balance change without guessing.
create table public.xp_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      int not null,
  -- 'claim', 'redeem', 'quest_complete', 'streak_bonus', 'badge', 'adjustment'
  reason      text not null,
  -- Whatever the reason points at: a voucher id, quest id, badge id.
  subject_id  uuid,
  occurred_at timestamptz not null default now()
);

create index xp_events_user_time_idx on public.xp_events (user_id, occurred_at desc);

-- Level curve. Kept as a table rather than a formula so game balance can be
-- tuned without a migration, and so the merchant UI can show real thresholds
-- when configuring early access.
create table public.level_thresholds (
  level       int primary key check (level >= 1),
  min_total_xp int not null unique check (min_total_xp >= 0)
);

insert into public.level_thresholds (level, min_total_xp) values
  (1, 0), (2, 100), (3, 250), (4, 450), (5, 700),
  (6, 1000), (7, 1400), (8, 1900), (9, 2500), (10, 3200),
  (11, 4000), (12, 5000), (13, 6200), (14, 7600), (15, 9200);

-- ---------------------------------------------------------------------------
-- quests
-- ---------------------------------------------------------------------------
create table public.quests (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,          -- stable key for client copy
  title_ka         text not null,
  title_en         text not null,
  description_ka   text,
  description_en   text,

  cadence          text not null check (cadence in ('daily', 'weekly', 'special')),

  -- What the player has to do. Kept as type + target + params rather than
  -- hardcoded columns so new quest shapes don't need schema changes.
  --   'claim_count'      -> claim N vouchers
  --   'redeem_count'     -> actually redeem N
  --   'distinct_venues'  -> redeem at N different venues
  --   'category_visit'   -> redeem at N venues where category = params.category
  --   'rarity_hunt'      -> redeem N of params.rarity
  objective_type   text not null,
  objective_target int not null check (objective_target > 0),
  objective_params jsonb not null default '{}'::jsonb,

  xp_reward        int not null check (xp_reward > 0),

  -- Null for evergreen daily/weekly quests; set for limited-time events.
  starts_at        timestamptz,
  ends_at          timestamptz,
  is_active        boolean not null default true
);

create index quests_active_idx on public.quests (cadence) where is_active;

-- ---------------------------------------------------------------------------
-- user_quests
-- ---------------------------------------------------------------------------
-- Progress for one player, one quest, one period. period_start is the date the
-- daily/weekly window opened, which makes the unique constraint do the work of
-- resetting progress: a new day means a new row, not an update.
create table public.user_quests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  quest_id     uuid not null references public.quests(id) on delete cascade,
  period_start date not null,
  progress     int not null default 0 check (progress >= 0),
  completed_at timestamptz,
  claimed_at   timestamptz,          -- when the XP reward was collected
  unique (user_id, quest_id, period_start)
);

create index user_quests_user_period_idx on public.user_quests (user_id, period_start desc);
create index user_quests_open_idx
  on public.user_quests (user_id)
  where completed_at is null;

-- ---------------------------------------------------------------------------
-- badges
-- ---------------------------------------------------------------------------
create table public.badges (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  title_ka       text not null,
  title_en       text not null,
  description_ka text,
  description_en text,
  icon_key       text not null,
  -- Same shape as quest objectives; badges are just permanent quests.
  criteria_type  text not null,
  criteria_target int not null check (criteria_target > 0),
  criteria_params jsonb not null default '{}'::jsonb,
  xp_reward      int not null default 0
);

create table public.user_badges (
  user_id    uuid not null references auth.users(id) on delete cascade,
  badge_id   uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- ---------------------------------------------------------------------------
-- award_xp
-- ---------------------------------------------------------------------------
-- Single entry point for granting XP: writes the ledger row, updates the
-- balance, and recomputes level from the threshold table. Returns the new level
-- so callers can tell the client to play a level-up animation.
create or replace function public.award_xp(
  p_user_id    uuid,
  p_amount     int,
  p_reason     text,
  p_subject_id uuid default null
)
returns table (new_total_xp int, new_level int, leveled_up boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_level int;
  v_total     int;
  v_level     int;
begin
  insert into public.xp_events (user_id, amount, reason, subject_id)
  values (p_user_id, p_amount, p_reason, p_subject_id);

  insert into public.user_xp (user_id, total_xp, level, last_activity_date)
  values (p_user_id, greatest(p_amount, 0), 1, current_date)
  on conflict (user_id) do update
    set total_xp           = public.user_xp.total_xp + p_amount,
        last_activity_date = current_date,
        updated_at         = now()
  returning public.user_xp.total_xp, public.user_xp.level
  into v_total, v_old_level;

  select max(lt.level) into v_level
  from public.level_thresholds lt
  where lt.min_total_xp <= v_total;

  v_level := coalesce(v_level, 1);

  if v_level <> v_old_level then
    update public.user_xp set level = v_level where user_id = p_user_id;
  end if;

  return query select v_total, v_level, (v_level > v_old_level);
end;
$$;
