-- Tbilisi Quest :: 0021 :: referrals
--
-- The growth loop. A player shares a card from a claim; the card carries their
-- code; whoever installs and enters it is tied to them.
--
-- The one decision that matters here: the reward pays out on the invitee's
-- FIRST REDEMPTION, not on sign-up. A sign-up bounty is farmable with throwaway
-- email addresses in about four minutes, and the payout would be XP we invented
-- for accounts that never walk anywhere. A redemption means a real person stood
-- inside a real shop and scanned a rotating code that only exists on that
-- counter -- it is the one event in this system that is genuinely expensive to
-- fake.

set search_path = public, extensions;

alter table public.users
  add column referral_code text unique,
  add column referred_by   uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Codes
-- ---------------------------------------------------------------------------
-- Six characters from an alphabet with no 0/O/1/I/L: these get read off a
-- phone screen in a photo and typed by hand, and every ambiguous glyph is a
-- support message.
create or replace function public.generate_referral_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try  int := 0;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(
        v_alphabet,
        1 + floor(random() * length(v_alphabet))::int,
        1
      );
    end loop;

    exit when not exists (
      select 1 from public.users u where u.referral_code = v_code
    );

    v_try := v_try + 1;
    if v_try > 20 then
      raise exception 'COULD_NOT_ALLOCATE_CODE';
    end if;
  end loop;

  return v_code;
end;
$$;

-- Everyone gets one, lazily, the first time they open the invite screen. Doing
-- it on demand rather than in the sign-up trigger keeps the sign-up path
-- (which already does several things) free of one more way to fail.
create or replace function public.my_referral_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select u.referral_code into v_code from public.users u where u.id = auth.uid();
  if v_code is not null then
    return v_code;
  end if;

  v_code := public.generate_referral_code();
  update public.users set referral_code = v_code where id = auth.uid();
  return v_code;
end;
$$;

grant execute on function public.my_referral_code() to authenticated;

-- ---------------------------------------------------------------------------
-- referrals
-- ---------------------------------------------------------------------------
create table public.referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references auth.users(id) on delete cascade,
  invitee_id   uuid not null unique references auth.users(id) on delete cascade,
  code         text not null,
  created_at   timestamptz not null default now(),
  -- Null until the invitee redeems something for the first time.
  rewarded_at  timestamptz
);

create index referrals_referrer_idx on public.referrals (referrer_id);

alter table public.referrals enable row level security;

-- A player sees the invites they sent and the one they were invited by;
-- nothing else. Writes only ever happen inside the functions below.
create policy referrals_select_mine on public.referrals
  for select to authenticated
  using (
    referrer_id = auth.uid()
    or invitee_id = auth.uid()
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- Entering a code
-- ---------------------------------------------------------------------------
create or replace function public.redeem_referral(p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_referrer uuid;
  v_existing uuid;
  v_joined   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select u.referred_by into v_existing from public.users u where u.id = auth.uid();
  if v_existing is not null then
    raise exception 'ALREADY_REFERRED';
  end if;

  select u.id into v_referrer
  from public.users u
  where u.referral_code = upper(trim(p_code));

  if v_referrer is null then
    raise exception 'UNKNOWN_CODE';
  end if;

  if v_referrer = auth.uid() then
    raise exception 'OWN_CODE';
  end if;

  -- A code can only be entered by a genuinely new account. Without this, an
  -- established player could collect a code from every friend in turn.
  select u.created_at into v_joined from public.users u where u.id = auth.uid();
  if v_joined < now() - interval '7 days' then
    raise exception 'ACCOUNT_TOO_OLD';
  end if;

  update public.users set referred_by = v_referrer where id = auth.uid();

  insert into public.referrals (referrer_id, invitee_id, code)
  values (v_referrer, auth.uid(), upper(trim(p_code)));
end;
$$;

grant execute on function public.redeem_referral(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The payout
-- ---------------------------------------------------------------------------
-- Fires on the invitee's first redemption. Both sides are paid, the invitee
-- slightly more: the person who did the walking should feel the better end of
-- it, and it is the invitee who is deciding right now whether this app is
-- worth keeping.
create or replace function public.pay_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ref public.referrals%rowtype;
  v_prior int;
begin
  select * into v_ref
  from public.referrals r
  where r.invitee_id = new.user_id and r.rewarded_at is null;

  if not found then
    return new;
  end if;

  select count(*)::int into v_prior
  from public.redemptions rd
  where rd.user_id = new.user_id and rd.id <> new.id;

  if v_prior > 0 then
    return new;
  end if;

  perform public.award_xp(v_ref.invitee_id, 200, 'referral_joined', v_ref.id);
  perform public.award_xp(v_ref.referrer_id, 150, 'referral_invited', v_ref.id);

  update public.referrals set rewarded_at = now() where id = v_ref.id;
  return new;
end;
$$;

create trigger redemptions_pay_referral
  after insert on public.redemptions
  for each row execute function public.pay_referral_reward();

-- ---------------------------------------------------------------------------
-- What the invite screen shows
-- ---------------------------------------------------------------------------
create or replace function public.my_referral_stats()
returns table (
  code       text,
  invited    int,
  -- Invites that reached a first redemption, i.e. the ones that paid.
  converted  int,
  xp_earned  int
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  return query
  select
    u.referral_code,
    (select count(*)::int from public.referrals r where r.referrer_id = u.id),
    (select count(*)::int from public.referrals r
      where r.referrer_id = u.id and r.rewarded_at is not null),
    (select coalesce(sum(x.amount), 0)::int from public.xp_events x
      where x.user_id = u.id and x.reason = 'referral_invited')
  from public.users u
  where u.id = auth.uid();
end;
$$;

grant execute on function public.my_referral_stats() to authenticated;
