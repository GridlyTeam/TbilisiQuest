-- Tbilisi Quest :: 0012 :: platform administration
--
-- A third role above merchants: the operator. Venues are created and approved
-- here, not self-served, because a venue's coordinates decide where players
-- physically walk. A merchant who could move their own pin toward Rustaveli
-- would have every incentive to, and the drop-level safety review would not
-- catch it.
--
-- Note every function below aliases its tables. The 42702 ambiguity that broke
-- nearby_drops came from an unaliased `where id` against an OUT parameter of
-- the same name; aliasing from the start makes that impossible.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- platform_admins
-- ---------------------------------------------------------------------------
-- Deliberately a table rather than a flag on users: membership is an explicit,
-- auditable grant, and a stray UPDATE on a profile row cannot make someone an
-- operator.
create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  note       text
);

-- security definer so RLS policies can call it without recursing through
-- platform_admins' own policy.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Venue lifecycle
-- ---------------------------------------------------------------------------
create type venue_status as enum ('pending', 'approved', 'suspended');

alter table public.venues
  add column status       venue_status not null default 'pending',
  add column created_by   uuid references auth.users(id) on delete set null,
  add column approved_at  timestamptz,
  add column approved_by  uuid references auth.users(id) on delete set null,
  add column admin_notes  text;

-- Everything that exists today was placed deliberately, so it starts approved.
update public.venues set status = 'approved', approved_at = now();

create index venues_status_idx on public.venues (status);

-- Moving a venue invalidates its approval: the pin is the safety-critical
-- field, so a change has to be looked at again rather than silently trusted.
create or replace function public.reset_venue_approval()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.location is distinct from old.location and not public.is_platform_admin() then
    new.status      := 'pending';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end;
$$;

create trigger venues_reset_approval
  before update of location on public.venues
  for each row execute function public.reset_venue_approval();

-- ---------------------------------------------------------------------------
-- Only approved venues reach players
-- ---------------------------------------------------------------------------
create or replace function public.nearby_drops(
  p_lat    double precision,
  p_lng    double precision,
  p_radius int default 30000
)
returns table (
  id               uuid,
  lat              double precision,
  lng              double precision,
  rarity           voucher_rarity,
  is_boss_chest    boolean,
  distance_m       double precision,
  revealed         boolean,
  starts_at        timestamptz,
  ends_at          timestamptz,
  remaining        int,
  venue_name_ka    text,
  venue_name_en    text,
  title_ka         text,
  title_en         text,
  offer            offer_type,
  discount_percent int
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_point geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_cfg   public.safety_config%rowtype;
  v_local time;
begin
  select * into v_cfg from public.safety_config sc where sc.id;

  v_local := (now() at time zone 'Asia/Tbilisi')::time;
  if v_local < v_cfg.play_opens_at or v_local >= v_cfg.play_closes_at then
    return;
  end if;

  return query
  select
    d.id,
    st_y(d.location::geometry) as lat,
    st_x(d.location::geometry) as lng,
    d.rarity,
    d.is_boss_chest,
    st_distance(d.location, v_point) as distance_m,
    (st_distance(d.location, v_point) <= d.reveal_radius_m) as revealed,
    d.starts_at,
    d.ends_at,
    (select count(*)::int from public.vouchers vo
      where vo.drop_id = d.id and vo.status = 'available') as remaining,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then v.name_ka end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then v.name_en end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.title_ka end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.title_en end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.offer end,
    case when st_distance(d.location, v_point) <= d.reveal_radius_m then d.discount_percent end
  from public.drops d
  join public.venues v on v.id = d.venue_id
  where d.status in ('scheduled', 'live')
    and v.is_active
    and v.status = 'approved'
    and d.ends_at > now()
    and (not v_cfg.require_manual_review or d.safety_reviewed_at is not null)
    and st_dwithin(d.location, v_point, p_radius)
  order by distance_m
  limit 500;
end;
$$;

grant execute on function public.nearby_drops(double precision, double precision, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin-facing helpers
-- ---------------------------------------------------------------------------
-- Creating a venue takes coordinates as plain numbers; the client never has to
-- construct PostGIS literals.
create or replace function public.admin_upsert_venue(
  p_id        uuid,
  p_name_ka   text,
  p_name_en   text,
  p_category  text,
  p_lat       double precision,
  p_lng       double precision,
  p_address_ka text default null,
  p_address_en text default null,
  p_tier      subscription_tier default 'basic'
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
      subscription_tier, status, created_by, approved_at, approved_by
    ) values (
      p_name_ka, p_name_en, p_category,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_address_ka, p_address_en, p_tier,
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
           subscription_tier = p_tier
     where v.id = p_id
    returning v.id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.admin_upsert_venue(
  uuid, text, text, text, double precision, double precision, text, text, subscription_tier
) to authenticated;

-- Polygons arrive as WKT from the map editor.
create or replace function public.admin_create_safety_zone(
  p_kind     safety_zone_kind,
  p_name     text,
  p_wkt      text,
  p_buffer_m int default 0,
  p_notes    text default null
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

  insert into public.safety_zones (kind, name, area, buffer_m, notes)
  values (p_kind, p_name, st_geogfromtext(p_wkt), p_buffer_m, p_notes)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.admin_create_safety_zone(
  safety_zone_kind, text, text, int, text
) to authenticated;

-- Zones as plain GeoJSON so the editor can draw existing ones.
create or replace view public.safety_zone_shapes
with (security_invoker = true) as
select
  z.id,
  z.kind,
  z.name,
  z.buffer_m,
  z.is_active,
  z.notes,
  st_asgeojson(z.area::geometry) as geojson
from public.safety_zones z;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.platform_admins enable row level security;

create policy platform_admins_self on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- Admins see and manage every venue, whatever its status.
create policy venues_admin_all on public.venues
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy safety_zones_admin_all on public.safety_zones
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy safety_config_admin_write on public.safety_config
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy merchant_users_admin_all on public.merchant_users
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy drops_admin_all on public.drops
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Merchants keep seeing their own venues, approved or not, so a pending venue
-- is visible to its owner rather than silently missing.
drop policy if exists venues_select_active on public.venues;
create policy venues_select_visible on public.venues
  for select to authenticated
  using (
    (is_active and status = 'approved')
    or has_venue_role(id, array['owner', 'manager', 'cashier']::merchant_role[])
    or public.is_platform_admin()
  );
