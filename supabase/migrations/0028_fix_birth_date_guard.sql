-- Tbilisi Quest :: 0028 :: fix the birth-date guard
--
-- 0025 protected birth_date with a trigger that allowed the write only when
-- current_user was 'postgres', on the assumption that set_birth_date() -- being
-- security definer -- would run as the owner, postgres.
--
-- It does not. `supabase db push` connects under a migration login role of its
-- own ("Initialising login role..." in its output), so the functions it creates
-- are owned by that role, and current_user inside them is that role rather than
-- postgres. The guard therefore rejected the one write it was built to allow:
-- set_birth_date() raised BIRTH_DATE_IMMUTABLE, the app's age gate never saved,
-- and it asked again on every launch.
--
-- Worse, 0025 also made claiming depend on a birth date being on file. So the
-- guard broke claiming for everyone: every claim raised AGE_NOT_SET.
--
-- The lesson is the general one: never gate behaviour on a database role name
-- that something other than your own code chooses. The rule below is about the
-- data instead -- a birth date may be set once, and after that only an operator
-- may change it -- which holds no matter which role is connected.

set search_path = public, extensions;

create or replace function public.protect_birth_date()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_age int;
begin
  if new.birth_date is not distinct from old.birth_date then
    return new;
  end if;

  -- Changing a date already on file stays an operator action: otherwise a
  -- player could wait out the 16+ gate and then become older.
  if old.birth_date is not null and not public.is_platform_admin() then
    raise exception 'BIRTH_DATE_IMMUTABLE';
  end if;

  -- The first write is allowed from any path, so the age floor is enforced
  -- here as well as in set_birth_date(). A direct PATCH to this column cannot
  -- create an under-13 account.
  if new.birth_date is not null and not public.is_platform_admin() then
    v_age := extract(year from age(current_date, new.birth_date))::int;
    if v_age < 13 then
      raise exception 'TOO_YOUNG';
    end if;
    if v_age > 130 then
      raise exception 'BAD_DATE';
    end if;
  end if;

  return new;
end;
$$;

-- Same mistake, same fix: 0025's set_birth_date() is fine, but the trigger it
-- relied on was not. No change needed to the function itself.

-- ---------------------------------------------------------------------------
-- Let anyone already stuck get unstuck
-- ---------------------------------------------------------------------------
-- Players who went through the age gate while the guard was broken have no
-- birth date on file and cannot claim. Nothing to migrate -- the gate will ask
-- once more and now the answer will save.
