-- Tbilisi Quest :: 0045 :: fix the beacon's ownership check
--
-- start_beacon() called
--
--   has_venue_role(v_drop.venue_id, 'owner')
--
-- but has_venue_role() takes an array of roles, not one: every other call site
-- in the codebase writes array['owner']::merchant_role[]. Postgres tries to
-- read the bare string 'owner' as an array literal to match the parameter
-- type and fails immediately with
--
--   22P02: malformed array literal: "owner"
--
-- before the function's own logic ever runs. The beacon button shipped in the
-- same session as the store and has been unusable since -- every press failed
-- at the permission check, before it could even refuse a merchant who was not
-- the owner.

set search_path = public, extensions;

create or replace function public.start_beacon(p_drop_id uuid, p_minutes int default 60)
returns timestamptz
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_drop  public.drops%rowtype;
  v_venue public.venues%rowtype;
  v_until timestamptz;
begin
  select * into v_drop from public.drops where id = p_drop_id;
  if v_drop.id is null then
    raise exception 'NO_SUCH_DROP';
  end if;

  if not (
    public.has_venue_role(v_drop.venue_id, array['owner']::merchant_role[])
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_YOURS';
  end if;

  if p_minutes < 15 or p_minutes > 240 then
    raise exception 'BEACON_LENGTH';
  end if;

  if v_drop.status <> 'live' or v_drop.ends_at <= now() then
    raise exception 'DROP_NOT_LIVE';
  end if;

  v_until := least(now() + make_interval(mins => p_minutes), v_drop.ends_at);

  update public.drops set beacon_until = v_until where id = p_drop_id;

  select * into v_venue from public.venues where id = v_drop.venue_id;

  insert into public.push_outbox (user_id, token, title, body, data, dedupe_key)
  select
    u.id,
    u.push_token,
    case when u.locale = 'ka' then 'ფლეშ შეთავაზება' else 'Flash offer' end,
    case
      when u.locale = 'ka'
        then coalesce(v_venue.name_ka, v_venue.name_en) || ' - ' ||
             coalesce(v_drop.title_ka, v_drop.title_en)
      else coalesce(v_venue.name_en, v_venue.name_ka) || ' - ' ||
           coalesce(v_drop.title_en, v_drop.title_ka)
    end,
    jsonb_build_object('kind', 'beacon', 'drop_id', p_drop_id),
    'beacon_' || p_drop_id::text || '_' ||
      to_char(now() at time zone 'Asia/Tbilisi', 'YYYY-MM-DD-HH24')
  from public.users u
  where u.push_token is not null
    and u.status = 'active'
  on conflict (user_id, dedupe_key) do nothing;

  return v_until;
end;
$$;

grant execute on function public.start_beacon(uuid, int) to authenticated;
