-- Tbilisi Quest :: 0032 :: deleting a player must not rewrite a merchant's books
--
-- redemptions.user_id cascaded from auth.users, so removing one account erased
-- every discount that person had ever redeemed. A merchant's "14 redeemed
-- yesterday" would quietly become 9. Their settled business cannot move
-- because a player left, and the number they were shown at the time has to
-- stay true.
--
-- So the money event survives the person: the row stays, its owner becomes
-- null, and nothing in it identifies anybody. That is also what the privacy
-- policy already promises -- profile, location, push token, referrals and
-- progress all go; the fact that a voucher was honoured at a counter remains.
--
-- Vouchers are the second half of the same problem. vouchers.user_id was
-- already `on delete set null`, but status stayed 'held', so stock claimed by
-- a deleted account sat locked out of the pool forever.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Redemptions outlive their player
-- ---------------------------------------------------------------------------
alter table public.redemptions
  alter column user_id drop not null;

alter table public.redemptions
  drop constraint if exists redemptions_user_id_fkey;

alter table public.redemptions
  add constraint redemptions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- The cashier who served them is already `on delete set null`; nothing to do.

-- ---------------------------------------------------------------------------
-- 2. Orphaned holds return to the pool
-- ---------------------------------------------------------------------------
-- A voucher whose owner has gone is not held by anyone. Releasing it is both
-- correct and the difference between a drop looking sold out and being sold
-- out.
create or replace function public.release_orphaned_vouchers()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.vouchers
  set status = 'available',
      user_id = null,
      redemption_code = null,
      claimed_at = null,
      hold_expires_at = null
  where user_id is null
    and status = 'held';
  return null;
end;
$$;

-- Fires after the cascade has nulled the owner, so it sees the finished state.
drop trigger if exists users_release_vouchers on public.users;
create trigger users_release_vouchers
  after delete on public.users
  for each statement execute function public.release_orphaned_vouchers();

-- Clean up anything already stranded by a deletion made before this ran.
update public.vouchers
set status = 'available',
    redemption_code = null,
    claimed_at = null,
    hold_expires_at = null
where user_id is null and status = 'held';

-- ---------------------------------------------------------------------------
-- 3. Ban and erase, as one deliberate action
-- ---------------------------------------------------------------------------
-- Distinct from a plain ban, which keeps everything and is reversible. This is
-- for a player who asks to be erased, or one whose account has to go: their
-- personal data is removed and their account is banned so the same person
-- cannot simply sign in again, while the redemptions a merchant relies on stay
-- where they are, ownerless.
create or replace function public.admin_erase_player(
  p_user_id uuid,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  -- Release anything they were holding before the links are cut.
  update public.vouchers
  set status = 'available',
      user_id = null,
      redemption_code = null,
      claimed_at = null,
      hold_expires_at = null
  where user_id = p_user_id and status = 'held';

  -- Detach the events that must survive.
  update public.redemptions set user_id = null where user_id = p_user_id;
  update public.drop_impressions set user_id = null where user_id = p_user_id;

  -- And remove the person.
  delete from public.referrals where referrer_id = p_user_id or invitee_id = p_user_id;
  delete from public.user_quests where user_id = p_user_id;
  delete from public.user_badges where user_id = p_user_id;
  delete from public.user_cosmetics where user_id = p_user_id;
  delete from public.xp_events where user_id = p_user_id;
  delete from public.user_xp where user_id = p_user_id;
  delete from public.squad_checkins where user_id = p_user_id;
  delete from public.push_outbox where user_id = p_user_id;

  update public.users
  set display_name   = 'Deleted player',
      last_point     = null,
      push_token     = null,
      avatar_url     = null,
      referral_code  = null,
      referred_by    = null,
      status         = 'banned',
      status_reason  = coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'erased'),
      status_changed_at = now(),
      status_changed_by = auth.uid()
  where id = p_user_id;
end;
$$;

grant execute on function public.admin_erase_player(uuid, text) to authenticated;
