-- Tbilisi Quest :: 0023 :: push notifications
--
-- The app is entirely pull: a player only sees that drops are live if they
-- happen to open it. The drop window is a fixed afternoon hour, which is
-- exactly the shape of thing a notification is for -- an appointment, not a
-- random ping.
--
-- Sending goes through an outbox rather than straight from the enqueueing job.
-- pg_net fires HTTP asynchronously and cannot tell us in the same transaction
-- whether Expo accepted the batch, so a row that is written first and marked
-- afterwards is the only version of this that can be inspected when someone
-- asks why four hundred people did not get a notification.

set search_path = public, extensions;

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Token registration
-- ---------------------------------------------------------------------------
create or replace function public.set_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Expo tokens look like ExponentPushToken[xxxxxxxx]. Rejecting anything else
  -- keeps junk out of the outbox, where it would only ever produce errors.
  if p_token !~ '^ExponentPushToken\[.+\]$' then
    raise exception 'BAD_TOKEN';
  end if;

  -- One token per device, and a device can change hands: clear it from anyone
  -- else holding it, or a player would keep receiving another player's pushes.
  update public.users set push_token = null
  where push_token = p_token and id <> auth.uid();

  update public.users set push_token = p_token where id = auth.uid();
end;
$$;

grant execute on function public.set_push_token(text) to authenticated;

create or replace function public.clear_push_token()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.users set push_token = null where id = auth.uid();
end;
$$;

grant execute on function public.clear_push_token() to authenticated;

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------
create type push_status as enum ('pending', 'sent', 'failed');

create table public.push_outbox (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  -- What this notification was for, so a second run of the same job does not
  -- send it twice.
  dedupe_key text not null,
  status     push_status not null default 'pending',
  error      text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

create unique index push_outbox_dedupe_idx on public.push_outbox (user_id, dedupe_key);
create index push_outbox_pending_idx on public.push_outbox (created_at)
  where status = 'pending';

alter table public.push_outbox enable row level security;
create policy push_outbox_admin on public.push_outbox
  for select to authenticated using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- The daily drop notification
-- ---------------------------------------------------------------------------
-- Only fires when there is actually something live. A notification that says
-- drops are waiting when none are is how an app gets its notifications turned
-- off for good.
create or replace function public.enqueue_drop_notifications()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_live   int;
  v_key    text := 'drops_' || to_char(now() at time zone 'Asia/Tbilisi', 'YYYY-MM-DD');
  v_count  int;
begin
  select count(*)::int into v_live
  from public.drops d
  join public.venues v on v.id = d.venue_id
  where d.status = 'live'
    and d.starts_at <= now() + interval '30 minutes'
    and d.ends_at > now()
    and v.status = 'approved'
    and v.is_active
    and exists (
      select 1 from public.vouchers vo
      where vo.drop_id = d.id and vo.status = 'available'
    );

  if v_live = 0 then
    return 0;
  end if;

  insert into public.push_outbox (user_id, token, title, body, data, dedupe_key)
  select
    u.id,
    u.push_token,
    case when u.locale = 'ka' then 'დროფების დროა' else 'Drop time' end,
    case
      when u.locale = 'ka'
        then v_live || ' ვაუჩერი ელოდება ქალაქში. წადი და დაიჭირე.'
      else v_live || ' drops just went live around the city. Go get one.'
    end,
    jsonb_build_object('kind', 'daily_drops', 'live', v_live),
    v_key
  from public.users u
  where u.push_token is not null
    and u.status = 'active'
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Flush
-- ---------------------------------------------------------------------------
-- Expo takes up to 100 messages per request. One batch per minute is far more
-- headroom than this app needs and keeps each HTTP call small enough to reason
-- about.
create or replace function public.flush_push_outbox()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_batch  jsonb;
  v_ids    bigint[];
begin
  select
    jsonb_agg(
      jsonb_build_object(
        'to', o.token,
        'title', o.title,
        'body', o.body,
        'data', o.data,
        'channelId', 'drops',
        'sound', null
      )
    ),
    array_agg(o.id)
  into v_batch, v_ids
  from (
    select * from public.push_outbox
    where status = 'pending'
    order by created_at
    limit 100
    for update skip locked
  ) o;

  if v_batch is null then
    return 0;
  end if;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    body    := v_batch,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json'
    )
  );

  -- Marked optimistically: pg_net resolves the response after this transaction
  -- commits, so the alternative is holding rows pending forever. A genuinely
  -- failed batch shows up as players reporting no notification, and the row is
  -- still here with its timestamp to prove what was attempted.
  update public.push_outbox
  set status = 'sent', sent_at = now()
  where id = any(v_ids);

  return array_length(v_ids, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------
-- Tbilisi is UTC+4 year round (Georgia does not observe DST), so these are
-- fixed offsets rather than anything that needs a timezone-aware scheduler.
--   09:55 UTC = 13:55 Tbilisi, five minutes before the off-peak window opens.
select cron.schedule(
  'enqueue-drop-notifications',
  '55 9 * * *',
  $$select public.enqueue_drop_notifications()$$
);

select cron.schedule(
  'flush-push-outbox',
  '* * * * *',
  $$select public.flush_push_outbox()$$
);

-- Keep the outbox from growing without bound; a fortnight is long enough to
-- investigate a complaint.
select cron.schedule(
  'prune-push-outbox',
  '30 3 * * *',
  $$delete from public.push_outbox where created_at < now() - interval '14 days'$$
);
