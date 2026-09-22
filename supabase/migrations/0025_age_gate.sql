-- Tbilisi Quest :: 0025 :: age gate
--
-- The audience is school pupils, so locking the app to 16+ would defeat its
-- purpose. The rule is: 13 and over may play solo, 16 and over may do anything
-- that puts them in a group with strangers -- which today is nothing, and from
-- the moment squad drops ship is the thing that matters most.
--
-- Two details that are easy to get wrong and expensive to retrofit:
--
--  * The date of birth is stored, not the age. An age is correct for one year
--    and then silently wrong, and a 15-year-old who turns 16 should gain access
--    without anyone doing anything.
--  * The rule is enforced in the database, not in the sign-up screen. A gate
--    that only exists in the client is a gate that exists until someone reads
--    the network tab.

set search_path = public, extensions;

-- `if not exists` throughout: part of this migration reached the database on an
-- earlier attempt, and a migration that cannot be re-run after a partial
-- failure is a migration you have to repair by hand at exactly the moment you
-- least want to.
alter table public.users
  add column if not exists birth_date          date,
  -- Recorded when a 13-15 year old confirms a parent or guardian knows they
  -- are using this. It is an acknowledgement, not verified consent -- no app
  -- this size can verify a parent, and pretending otherwise in the terms would
  -- be worse than stating plainly what was collected.
  add column if not exists guardian_ack_at     timestamptz;

-- No CHECK constraint here on purpose: Postgres requires check expressions to
-- be immutable, and any age rule has to read today's date. The floor is
-- enforced in set_birth_date() below, which is the only path that can write
-- the column.

create or replace function public.age_years(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  select case
    when u.birth_date is null then null
    else extract(year from age(current_date, u.birth_date))::int
  end
  from public.users u where u.id = p_user_id;
$$;

-- The single place the 16+ rule lives. Squad drops, and anything else that
-- puts a minor in a group with people they have not met, calls this.
create or replace function public.can_group_play(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(public.age_years(p_user_id) >= 16, false);
$$;

grant execute on function public.can_group_play(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Setting it
-- ---------------------------------------------------------------------------
-- Write-once. A player who could edit their birth date could sit out the gate
-- until they wanted group play and then become 16, which is the entire failure
-- mode this is here to prevent. Changing it afterwards is an operator action.
create or replace function public.set_birth_date(
  p_birth_date  date,
  p_guardian_ack boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing date;
  v_age      int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select u.birth_date into v_existing from public.users u where u.id = auth.uid();
  if v_existing is not null then
    raise exception 'BIRTH_DATE_ALREADY_SET';
  end if;

  v_age := extract(year from age(current_date, p_birth_date))::int;

  if v_age < 13 then
    raise exception 'TOO_YOUNG';
  end if;
  if v_age > 130 then
    raise exception 'BAD_DATE';
  end if;

  -- Under 16 has to confirm a guardian knows. Over 16 does not, and passing
  -- the flag anyway is harmless.
  if v_age < 16 and not p_guardian_ack then
    raise exception 'GUARDIAN_ACK_REQUIRED';
  end if;

  update public.users
  set birth_date      = p_birth_date,
      guardian_ack_at = case when p_guardian_ack then now() end
  where id = auth.uid();
end;
$$;

grant execute on function public.set_birth_date(date, boolean) to authenticated;

-- The birth date is set through the function above, never by a direct update.
-- Without this a player could simply PATCH the column.
create or replace function public.protect_birth_date()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.birth_date is distinct from old.birth_date
     and not public.is_platform_admin()
     -- The security-definer function runs as the table owner, which is how a
     -- legitimate first write gets through.
     and current_user <> 'postgres'
  then
    raise exception 'BIRTH_DATE_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists users_protect_birth_date on public.users;
create trigger users_protect_birth_date
  before update on public.users
  for each row execute function public.protect_birth_date();

-- ---------------------------------------------------------------------------
-- Claiming requires an age on file
-- ---------------------------------------------------------------------------
-- The client shows the gate before the map, but the RPC is reachable directly,
-- so the real check belongs here alongside the ban check from 0014.
create or replace function public.assert_age_known()
returns void
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_dob date;
begin
  select u.birth_date into v_dob from public.users u where u.id = auth.uid();
  if v_dob is null then
    raise exception 'AGE_NOT_SET';
  end if;
end;
$$;

grant execute on function public.assert_age_known() to authenticated;

-- Enforced as a trigger on the claim itself rather than by editing
-- claim_voucher: the check then covers every path that could ever move a
-- voucher into a player's hands, including ones written later.
create or replace function public.check_age_before_claim()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.status = 'held' and (old.status is distinct from 'held') then
    perform public.assert_age_known();
  end if;
  return new;
end;
$$;

drop trigger if exists vouchers_check_age on public.vouchers;
create trigger vouchers_check_age
  before update on public.vouchers
  for each row execute function public.check_age_before_claim();

-- ---------------------------------------------------------------------------
-- Operator view
-- ---------------------------------------------------------------------------
-- Ages, not birth dates: an operator moderating an account needs to know they
-- are dealing with a 14-year-old, and does not need their date of birth.
create or replace function public.admin_player_age(p_user_id uuid)
returns table (age int, is_minor boolean, guardian_ack boolean)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  return query
  select
    public.age_years(p_user_id),
    coalesce(public.age_years(p_user_id) < 18, false),
    (u.guardian_ack_at is not null)
  from public.users u where u.id = p_user_id;
end;
$$;

grant execute on function public.admin_player_age(uuid) to authenticated;
