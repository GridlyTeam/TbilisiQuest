-- Tbilisi Quest :: 0029 :: every account gets a profile row
--
-- public.users rows were created by the app after sign-up. Any account that
-- did not complete that path -- an email confirmed later, a sign-up
-- interrupted, a user made in the dashboard -- ended up authenticated with no
-- profile at all. Two of the three accounts on this project are in that state.
--
-- The damage is quiet and confusing, because the two halves disagree:
--
--   * claim_voucher's age check reads users.birth_date, finds no row, and
--     raises AGE_NOT_SET -- correctly.
--   * The app's age gate reads the same row, finds nothing, and takes that to
--     mean there is nothing to ask for -- so it never asks.
--
-- The player is then permanently unable to claim and is never offered the one
-- screen that would fix it.
--
-- A profile now exists from the moment an account does, created by a trigger
-- on auth.users where nothing can skip it.

set search_path = public, extensions;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.users (id, display_name, locale)
  values (
    new.id,
    -- Whatever the sign-up supplied, else the local part of the email. A
    -- display name is not null, and the app lets them change it later.
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(new.email, '@', 1),
      'Player'
    ),
    coalesce(nullif(new.raw_user_meta_data->>'locale', ''), 'ka')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists auth_user_created on auth.users;
create trigger auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill the accounts that predate the trigger.
insert into public.users (id, display_name, locale)
select
  au.id,
  coalesce(
    nullif(trim(au.raw_user_meta_data->>'display_name'), ''),
    split_part(au.email, '@', 1),
    'Player'
  ),
  coalesce(nullif(au.raw_user_meta_data->>'locale', ''), 'ka')
from auth.users au
left join public.users u on u.id = au.id
where u.id is null
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A belt-and-braces call for the client
-- ---------------------------------------------------------------------------
-- The trigger covers new accounts and the backfill covers old ones, but an app
-- that can repair its own state on launch costs nothing and removes a whole
-- class of support conversation.
create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.users (id, display_name, locale)
  select
    au.id,
    coalesce(
      nullif(trim(au.raw_user_meta_data->>'display_name'), ''),
      split_part(au.email, '@', 1),
      'Player'
    ),
    coalesce(nullif(au.raw_user_meta_data->>'locale', ''), 'ka')
  from auth.users au
  where au.id = auth.uid()
  on conflict (id) do nothing;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;
