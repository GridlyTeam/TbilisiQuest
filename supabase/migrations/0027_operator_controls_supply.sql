-- Tbilisi Quest :: 0027 :: the operator owns the pin and the supply
--
-- Two things merchants could do that they should not be able to:
--
--  1. Move their own venue. 0012 softened this -- a moved pin reset the venue
--     to 'pending' so it left the map until re-approved -- but soft is the
--     wrong shape for the one field that decides where the app sends a
--     teenager. It is now refused outright.
--
--  2. Choose how many vouchers to put into circulation. inventory_cap was
--     whatever the merchant typed. Supply is the product: it decides what a
--     drop is worth, whether the map feels scarce, and what the platform is
--     charging for. The operator sets the ceiling; the merchant works inside
--     it.
--
-- Both are enforced in the database. The merchant portal's inputs are a
-- courtesy so the numbers are visible before someone hits a wall.

set search_path = public, extensions;

alter table public.venues
  -- The most a single drop may put out.
  add column if not exists max_vouchers_per_drop int not null default 20
    check (max_vouchers_per_drop between 1 and 500),
  -- And the most across a calendar month, so a venue cannot run twenty
  -- maximum-size drops in a week.
  add column if not exists monthly_voucher_allowance int not null default 400
    check (monthly_voucher_allowance between 1 and 20000);

-- ---------------------------------------------------------------------------
-- 1. The pin belongs to the operator
-- ---------------------------------------------------------------------------
create or replace function public.protect_venue_location()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.location is distinct from old.location and not public.is_platform_admin() then
    raise exception 'LOCATION_IS_OPERATOR_SET';
  end if;
  return new;
end;
$$;

-- Replaces the approval-reset trigger from 0012: there is nothing left to
-- reset if the change cannot happen.
drop trigger if exists venues_reset_approval on public.venues;
drop trigger if exists venues_protect_location on public.venues;
create trigger venues_protect_location
  before update of location on public.venues
  for each row execute function public.protect_venue_location();

-- Allowances are operator-set too, and they sit on a table merchants may
-- otherwise update. Same treatment.
create or replace function public.protect_venue_allowance()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if not public.is_platform_admin()
     and (new.max_vouchers_per_drop is distinct from old.max_vouchers_per_drop
          or new.monthly_voucher_allowance is distinct from old.monthly_voucher_allowance
          or new.subscription_tier is distinct from old.subscription_tier)
  then
    raise exception 'ALLOWANCE_IS_OPERATOR_SET';
  end if;
  return new;
end;
$$;

drop trigger if exists venues_protect_allowance on public.venues;
create trigger venues_protect_allowance
  before update on public.venues
  for each row execute function public.protect_venue_allowance();

-- ---------------------------------------------------------------------------
-- 2. Supply ceiling on every drop
-- ---------------------------------------------------------------------------
-- Counted against the drop's own start date rather than when it was created,
-- because a merchant scheduling next month's drops today is spending next
-- month's allowance.
create or replace function public.venue_allowance(p_venue_id uuid)
returns table (
  max_per_drop int,
  monthly      int,
  used         int,
  remaining    int
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    v.max_vouchers_per_drop,
    v.monthly_voucher_allowance,
    coalesce((
      select sum(d.inventory_cap)::int
      from public.drops d
      where d.venue_id = v.id
        and d.status <> 'cancelled'
        and date_trunc('month', d.starts_at at time zone 'Asia/Tbilisi')
            = date_trunc('month', now() at time zone 'Asia/Tbilisi')
    ), 0),
    greatest(
      0,
      v.monthly_voucher_allowance - coalesce((
        select sum(d.inventory_cap)::int
        from public.drops d
        where d.venue_id = v.id
          and d.status <> 'cancelled'
          and date_trunc('month', d.starts_at at time zone 'Asia/Tbilisi')
              = date_trunc('month', now() at time zone 'Asia/Tbilisi')
      ), 0)
    )
  from public.venues v
  where v.id = p_venue_id;
$$;

grant execute on function public.venue_allowance(uuid) to authenticated;

create or replace function public.enforce_voucher_allowance()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_max     int;
  v_monthly int;
  v_used    int;
begin
  -- An operator setting up a launch offer is not subject to the ceiling they
  -- themselves set.
  if public.is_platform_admin() then
    return new;
  end if;

  select v.max_vouchers_per_drop, v.monthly_voucher_allowance
    into v_max, v_monthly
  from public.venues v where v.id = new.venue_id;

  if new.inventory_cap > v_max then
    raise exception 'OVER_PER_DROP_LIMIT:%', v_max;
  end if;

  select coalesce(sum(d.inventory_cap), 0)::int into v_used
  from public.drops d
  where d.venue_id = new.venue_id
    and d.status <> 'cancelled'
    and (tg_op = 'INSERT' or d.id <> new.id)
    and date_trunc('month', d.starts_at at time zone 'Asia/Tbilisi')
        = date_trunc('month', new.starts_at at time zone 'Asia/Tbilisi');

  if v_used + new.inventory_cap > v_monthly then
    raise exception 'OVER_MONTHLY_ALLOWANCE:%', v_monthly - v_used;
  end if;

  return new;
end;
$$;

drop trigger if exists drops_enforce_allowance on public.drops;
create trigger drops_enforce_allowance
  before insert or update of inventory_cap, starts_at on public.drops
  for each row execute function public.enforce_voucher_allowance();

-- ---------------------------------------------------------------------------
-- Operator upsert, extended
-- ---------------------------------------------------------------------------
-- Adding parameters changes the signature, so the old one is dropped rather
-- than left behind as a second overload nothing calls.
drop function if exists public.admin_upsert_venue(
  uuid, text, text, text, double precision, double precision, text, text, subscription_tier
);

create or replace function public.admin_upsert_venue(
  p_id         uuid,
  p_name_ka    text,
  p_name_en    text,
  p_category   text,
  p_lat        double precision,
  p_lng        double precision,
  p_address_ka text default null,
  p_address_en text default null,
  p_tier       subscription_tier default 'basic',
  p_max_per_drop int default 20,
  p_monthly    int default 400
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if p_id is null then
    insert into public.venues (
      name_ka, name_en, category, location, address_ka, address_en,
      subscription_tier, max_vouchers_per_drop, monthly_voucher_allowance,
      status, created_by, approved_at, approved_by
    ) values (
      p_name_ka, p_name_en, p_category,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_address_ka, p_address_en, p_tier, p_max_per_drop, p_monthly,
      -- An admin placing the pin IS the verification, so it lands approved.
      'approved', auth.uid(), now(), auth.uid()
    )
    returning id into v_id;
  else
    update public.venues v
       set name_ka = p_name_ka,
           name_en = p_name_en,
           category = p_category,
           location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
           address_ka = p_address_ka,
           address_en = p_address_en,
           subscription_tier = p_tier,
           max_vouchers_per_drop = p_max_per_drop,
           monthly_voucher_allowance = p_monthly
     where v.id = p_id
    returning v.id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.admin_upsert_venue(
  uuid, text, text, text, double precision, double precision, text, text,
  subscription_tier, int, int
) to authenticated;
