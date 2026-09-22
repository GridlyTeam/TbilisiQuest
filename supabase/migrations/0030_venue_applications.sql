-- Tbilisi Quest :: 0030 :: merchants can apply, operators decide
--
-- Until now a venue could only exist because an operator typed it in, and a
-- merchant could only get an account because someone attached them by hand.
-- That does not scale past the first dozen shops and it gives a café owner who
-- hears about this no way in.
--
-- What it must NOT become is self-serve venue creation. Migration 0027 made
-- the pin and the voucher allowance operator-set on purpose: the map decides
-- where the app sends a teenager, and the allowance is the commercial lever.
-- So a merchant registers an account and submits an application; an operator
-- reads it, places the pin, sets the allowance and approves. Approval is what
-- creates the venue.

set search_path = public, extensions;

create type application_status as enum ('pending', 'approved', 'rejected');

create table public.venue_applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  business_name text not null,
  category      text not null,
  address       text not null,
  phone         text,
  -- What they say they want to offer. Not binding; it starts the conversation
  -- and tells an operator whether this is a café or a car dealership.
  note          text check (note is null or length(note) <= 800),

  status        application_status not null default 'pending',
  admin_notes   text,
  -- Set when approved, so the application points at what it became.
  venue_id      uuid references public.venues(id) on delete set null,
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- One open application per account. A shop that applies four times is a queue
-- problem, not four shops.
create unique index venue_applications_one_open_idx
  on public.venue_applications (user_id)
  where status = 'pending';

create index venue_applications_pending_idx
  on public.venue_applications (created_at)
  where status = 'pending';

alter table public.venue_applications enable row level security;

create policy venue_applications_select on public.venue_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

create policy venue_applications_admin_update on public.venue_applications
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Applying
-- ---------------------------------------------------------------------------
create or replace function public.submit_venue_application(
  p_business_name text,
  p_category      text,
  p_address       text,
  p_phone         text default null,
  p_note          text default null
)
returns uuid
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

  if exists (
    select 1 from public.venue_applications a
    where a.user_id = auth.uid() and a.status = 'pending'
  ) then
    raise exception 'ALREADY_APPLIED';
  end if;

  -- Someone who already runs a venue does not need to apply for another this
  -- way; that is an operator action, so the two paths cannot be confused.
  if exists (select 1 from public.merchant_users m where m.user_id = auth.uid()) then
    raise exception 'ALREADY_A_MERCHANT';
  end if;

  insert into public.venue_applications
    (user_id, business_name, category, address, phone, note)
  values (
    auth.uid(),
    trim(p_business_name),
    trim(p_category),
    trim(p_address),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_venue_application(text, text, text, text, text)
  to authenticated;

-- What the applicant sees while they wait.
create or replace function public.my_application()
returns table (
  id          uuid,
  status      application_status,
  business_name text,
  admin_notes text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select a.id, a.status, a.business_name, a.admin_notes, a.created_at
  from public.venue_applications a
  where a.user_id = auth.uid()
  order by a.created_at desc
  limit 1;
$$;

grant execute on function public.my_application() to authenticated;

-- ---------------------------------------------------------------------------
-- The operator queue
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_applications(
  p_status application_status default null
)
returns table (
  id            uuid,
  user_id       uuid,
  email         text,
  business_name text,
  category      text,
  address       text,
  phone         text,
  note          text,
  app_status    application_status,
  admin_notes   text,
  venue_id      uuid,
  created_at    timestamptz
)
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
    a.id, a.user_id, au.email::text, a.business_name, a.category, a.address,
    a.phone, a.note, a.status, a.admin_notes, a.venue_id, a.created_at
  from public.venue_applications a
  join auth.users au on au.id = a.user_id
  where p_status is null or a.status = p_status
  order by (a.status = 'pending') desc, a.created_at desc
  limit 200;
end;
$$;

grant execute on function public.admin_list_applications(application_status)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Approving
-- ---------------------------------------------------------------------------
-- One transaction creates the venue, attaches the applicant as its owner and
-- closes the application. Doing it in three calls from the client would leave
-- an orphan venue every time one of them failed.
create or replace function public.admin_approve_application(
  p_application_id uuid,
  p_name_ka        text,
  p_name_en        text,
  p_category       text,
  p_lat            double precision,
  p_lng            double precision,
  p_address_ka     text default null,
  p_address_en     text default null,
  p_tier           subscription_tier default 'basic',
  p_max_per_drop   int default 20,
  p_monthly        int default 400
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_app   public.venue_applications%rowtype;
  v_venue uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_app
  from public.venue_applications a
  where a.id = p_application_id
  for update;

  if not found then
    raise exception 'NO_SUCH_APPLICATION';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'ALREADY_REVIEWED';
  end if;

  v_venue := public.admin_upsert_venue(
    null, p_name_ka, p_name_en, p_category, p_lat, p_lng,
    p_address_ka, p_address_en, p_tier, p_max_per_drop, p_monthly
  );

  insert into public.merchant_users (user_id, venue_id, role)
  values (v_app.user_id, v_venue, 'owner')
  on conflict (user_id, venue_id) do update set role = 'owner';

  update public.venue_applications
  set status = 'approved',
      venue_id = v_venue,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_application_id;

  return v_venue;
end;
$$;

grant execute on function public.admin_approve_application(
  uuid, text, text, text, double precision, double precision, text, text,
  subscription_tier, int, int
) to authenticated;

create or replace function public.admin_reject_application(
  p_application_id uuid,
  p_notes          text default null
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

  update public.venue_applications
  set status = 'rejected',
      admin_notes = nullif(trim(coalesce(p_notes, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_application_id and status = 'pending';
end;
$$;

grant execute on function public.admin_reject_application(uuid, text)
  to authenticated;
