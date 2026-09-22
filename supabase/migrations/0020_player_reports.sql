-- Tbilisi Quest :: 0020 :: player reports
--
-- The app sends teenagers to specific street corners, and until now there was
-- no way for one of them to tell us that a corner is wrong. A drop pinned on a
-- motorway shoulder, a dark courtyard, a merchant behaving badly: all of it was
-- invisible to the operator until something went wrong publicly.
--
-- This is the channel. It is deliberately cheap to use -- one tap, a category,
-- an optional sentence -- because a report form nobody finishes protects
-- nobody. The position is captured server-side from what the client sends, so
-- an operator can see where the player actually was rather than only which
-- drop they were looking at.

set search_path = public, extensions;

create type report_kind as enum (
  'unsafe_location',  -- the drop is somewhere dangerous to stand
  'venue_problem',    -- the shop refused it, was rude, was closed
  'wrong_place',      -- the pin is not where the shop is
  'other'
);

create type report_status as enum ('open', 'reviewed', 'actioned', 'dismissed');

create table public.player_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         report_kind not null,
  note         text check (note is null or length(note) <= 500),

  -- Whatever context the player had open. Both nullable: a report can be about
  -- a place with no drop on it at all.
  drop_id      uuid references public.drops(id) on delete set null,
  venue_id     uuid references public.venues(id) on delete set null,
  reported_at_point geography(point, 4326),

  status       report_status not null default 'open',
  admin_notes  text,
  handled_by   uuid references auth.users(id) on delete set null,
  handled_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index player_reports_open_idx
  on public.player_reports (created_at desc)
  where status = 'open';
create index player_reports_user_idx on public.player_reports (user_id);

alter table public.player_reports enable row level security;

-- Players may read their own reports back (so the app can say "received") and
-- nothing else. Writes go through the function below rather than an INSERT
-- policy, so the row can never claim a different author.
create policy player_reports_select_own on public.player_reports
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

create policy player_reports_admin_write on public.player_reports
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Submit
-- ---------------------------------------------------------------------------
-- Rate limited to 5 open reports per player. Not to protect the database --
-- these are tiny -- but because an operator queue that one angry teenager can
-- fill with sixty rows is a queue nobody reads, and the reports that matter
-- drown.
create or replace function public.submit_report(
  p_kind     report_kind,
  p_note     text default null,
  p_drop_id  uuid default null,
  p_lat      double precision default null,
  p_lng      double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id       uuid;
  v_venue_id uuid;
  v_open     int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select count(*) into v_open
  from public.player_reports r
  where r.user_id = auth.uid() and r.status = 'open';

  if v_open >= 5 then
    raise exception 'TOO_MANY_OPEN_REPORTS';
  end if;

  -- Resolve the venue from the drop rather than trusting a client-supplied
  -- venue id: the player never needs to name a venue, and this cannot be used
  -- to attach a complaint to a shop the player was nowhere near.
  if p_drop_id is not null then
    select d.venue_id into v_venue_id from public.drops d where d.id = p_drop_id;
  end if;

  insert into public.player_reports (
    user_id, kind, note, drop_id, venue_id, reported_at_point
  )
  values (
    auth.uid(),
    p_kind,
    nullif(trim(coalesce(p_note, '')), ''),
    p_drop_id,
    v_venue_id,
    case
      when p_lat is null or p_lng is null then null
      else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    end
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_report(report_kind, text, uuid, double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Operator queue
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_reports(
  p_status report_status default null,
  p_limit  int default 100
)
returns table (
  id            uuid,
  kind          report_kind,
  note          text,
  report_state  report_status,
  created_at    timestamptz,
  reporter_email text,
  reporter_status player_status,
  drop_id       uuid,
  drop_title    text,
  venue_id      uuid,
  venue_name    text,
  lat           double precision,
  lng           double precision,
  -- How far the player was from the drop when they reported. A complaint about
  -- a dangerous spot means something different at 5 m than at 5 km.
  distance_m    double precision,
  admin_notes   text
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
    r.id,
    r.kind,
    r.note,
    r.status,
    r.created_at,
    au.email::text,
    u.status,
    r.drop_id,
    d.title_en,
    r.venue_id,
    v.name_en,
    st_y(r.reported_at_point::geometry),
    st_x(r.reported_at_point::geometry),
    case
      when r.reported_at_point is null or d.location is null then null
      else st_distance(d.location, r.reported_at_point)
    end,
    r.admin_notes
  from public.player_reports r
  join auth.users au on au.id = r.user_id
  join public.users u on u.id = r.user_id
  left join public.drops d on d.id = r.drop_id
  left join public.venues v on v.id = r.venue_id
  where p_status is null or r.status = p_status
  order by
    -- Open first, then newest. An operator opening this wants the queue, not
    -- a history.
    (r.status = 'open') desc,
    r.created_at desc
  limit p_limit;
end;
$$;

grant execute on function public.admin_list_reports(report_status, int) to authenticated;

create or replace function public.admin_set_report_status(
  p_report_id uuid,
  p_status    report_status,
  p_notes     text default null
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

  update public.player_reports r
  set status      = p_status,
      admin_notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), r.admin_notes),
      handled_by  = auth.uid(),
      handled_at  = now()
  where r.id = p_report_id;
end;
$$;

grant execute on function public.admin_set_report_status(uuid, report_status, text)
  to authenticated;
