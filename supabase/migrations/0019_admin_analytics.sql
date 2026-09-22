-- Tbilisi Quest :: 0019 :: platform-wide analytics for operators
--
-- The merchant analytics page reads `drop_performance`, a security_invoker
-- view. That is correct for a merchant -- RLS scopes it to their own venue --
-- but it is useless to an operator: the funnel's numbers come from vouchers,
-- redemptions and drop_impressions, and those policies grant reads to venue
-- STAFF only. `drops_admin_all` lets an admin see the drop rows, so the view
-- would return a row per drop with every count sitting at zero. Worse than no
-- page, because the zeros look like data.
--
-- So the operator numbers come from security-definer functions gated on
-- is_platform_admin(), exactly as player search does. The alternative --
-- adding admin clauses to the policies on three high-volume tables -- would
-- put is_platform_admin() into the hot path of every impression insert.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- One row per venue
-- ---------------------------------------------------------------------------
-- The window is bounded because "all time" stops being a useful comparison
-- the moment venues join at different dates. Impressions and claims are dated
-- by their own timestamps rather than the drop's window, so a long-running
-- drop still lands in the right period.
create or replace function public.admin_venue_analytics(
  p_days int default 30
)
returns table (
  venue_id           uuid,
  name_ka            text,
  name_en            text,
  category           text,
  venue_state        venue_status,
  tier               subscription_tier,
  is_active          boolean,
  drops_total        int,
  drops_live         int,
  map_views          int,
  reveals            int,
  claimed            int,
  redeemed           int,
  unique_visitors    int,
  discount_value_gel numeric,
  conversion_pct     numeric,
  abandonment_pct    numeric,
  last_redeemed_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  return query
  select
    v.id,
    v.name_ka,
    v.name_en,
    v.category,
    v.status,
    v.subscription_tier,
    v.is_active,
    coalesce(d.total, 0),
    coalesce(d.live, 0),
    coalesce(i.views, 0),
    coalesce(i.reveals, 0),
    coalesce(c.claimed, 0),
    coalesce(r.redeemed, 0),
    coalesce(r.visitors, 0),
    coalesce(r.value_gel, 0),
    -- Of the players who got close enough to see an offer, how many walked in.
    round(coalesce(r.redeemed, 0)::numeric / nullif(i.reveals, 0) * 100, 1),
    -- Claimed and never collected: inventory held by window shoppers.
    round(
      (coalesce(c.claimed, 0) - coalesce(r.redeemed, 0))::numeric
        / nullif(c.claimed, 0) * 100, 1),
    r.last_at
  from public.venues v

  left join lateral (
    select
      count(*)::int                                          as total,
      count(*) filter (where dr.status = 'live')::int         as live
    from public.drops dr
    where dr.venue_id = v.id
      and dr.created_at >= v_since
  ) d on true

  left join lateral (
    select
      count(*) filter (where di.kind = 'map_view')::int as views,
      count(*) filter (where di.kind = 'revealed')::int as reveals
    from public.drop_impressions di
    join public.drops dr2 on dr2.id = di.drop_id
    where dr2.venue_id = v.id
      and di.occurred_at >= v_since
  ) i on true

  left join lateral (
    select count(*)::int as claimed
    from public.vouchers vo
    join public.drops dr3 on dr3.id = vo.drop_id
    where dr3.venue_id = v.id
      and vo.status in ('held', 'redeemed')
      and vo.claimed_at >= v_since
  ) c on true

  left join lateral (
    select
      count(*)::int                    as redeemed,
      count(distinct rd.user_id)::int  as visitors,
      sum(rd.face_value_gel)           as value_gel,
      max(rd.redeemed_at)              as last_at
    from public.redemptions rd
    where rd.venue_id = v.id
      and rd.redeemed_at >= v_since
  ) r on true

  order by coalesce(r.redeemed, 0) desc, v.name_en;
end;
$$;

grant execute on function public.admin_venue_analytics(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Drill-down: the drops behind one venue's numbers
-- ---------------------------------------------------------------------------
-- Same shape the merchant sees, so the operator is looking at the merchant's
-- own report rather than a parallel set of figures that can disagree with it.
create or replace function public.admin_venue_drops(
  p_venue_id uuid,
  p_limit    int default 25
)
returns table (
  drop_id                     uuid,
  title_ka                    text,
  title_en                    text,
  rarity                      voucher_rarity,
  starts_at                   timestamptz,
  ends_at                     timestamptz,
  drop_state                  drop_status,
  inventory_cap               int,
  map_views                   int,
  reveals                     int,
  claimed                     int,
  redeemed                    int,
  foot_traffic_conversion_pct numeric,
  discount_value_gel          numeric
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
    dr.id,
    dr.title_ka,
    dr.title_en,
    dr.rarity,
    dr.starts_at,
    dr.ends_at,
    dr.status,
    dr.inventory_cap,
    coalesce(i.views, 0),
    coalesce(i.reveals, 0),
    coalesce(c.cnt, 0),
    coalesce(r.cnt, 0),
    round(coalesce(r.cnt, 0)::numeric / nullif(i.reveals, 0) * 100, 1),
    coalesce(r.value_gel, 0)
  from public.drops dr

  left join lateral (
    select
      count(*) filter (where di.kind = 'map_view')::int as views,
      count(*) filter (where di.kind = 'revealed')::int as reveals
    from public.drop_impressions di where di.drop_id = dr.id
  ) i on true

  left join lateral (
    select count(*)::int as cnt
    from public.vouchers vo
    where vo.drop_id = dr.id and vo.status in ('held', 'redeemed')
  ) c on true

  left join lateral (
    select count(*)::int as cnt, sum(rd.face_value_gel) as value_gel
    from public.redemptions rd
    join public.vouchers vo2 on vo2.id = rd.voucher_id
    where vo2.drop_id = dr.id
  ) r on true

  where dr.venue_id = p_venue_id
  order by dr.starts_at desc
  limit p_limit;
end;
$$;

grant execute on function public.admin_venue_drops(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Same fix for the merchant's own page
-- ---------------------------------------------------------------------------
-- Dropped rather than replaced: title_ka goes in the middle of the column
-- list, and create or replace can only append.
--
-- AnalyticsView renders the Georgian title, but drop_performance only ever
-- selected title_en, so every row read "—" in the language most merchants use.
drop view if exists public.drop_performance;

create view public.drop_performance
with (security_invoker = true) as
select
  d.id                 as drop_id,
  d.venue_id,
  d.title_ka,
  d.title_en,
  d.rarity,
  d.starts_at,
  d.ends_at,
  d.inventory_cap,

  coalesce(i.map_views, 0)  as map_views,
  coalesce(i.reveals, 0)    as reveals,
  coalesce(c.claimed, 0)    as claimed,
  coalesce(r.redeemed, 0)   as redeemed,

  round(coalesce(r.redeemed, 0)::numeric / nullif(d.inventory_cap, 0) * 100, 1)
    as sell_through_pct,
  round(coalesce(r.redeemed, 0)::numeric / nullif(i.reveals, 0) * 100, 1)
    as foot_traffic_conversion_pct,
  round(
    (coalesce(c.claimed, 0) - coalesce(r.redeemed, 0))::numeric
      / nullif(c.claimed, 0) * 100, 1)
    as claim_abandonment_pct,

  coalesce(r.value_gel, 0) as discount_value_gel

from public.drops d

left join lateral (
  select
    count(*) filter (where kind = 'map_view') as map_views,
    count(*) filter (where kind = 'revealed') as reveals
  from public.drop_impressions di where di.drop_id = d.id
) i on true

left join lateral (
  select count(*) as claimed
  from public.vouchers v
  where v.drop_id = d.id and v.status in ('held', 'redeemed')
) c on true

left join lateral (
  select count(*) as redeemed, sum(rd.face_value_gel) as value_gel
  from public.redemptions rd
  join public.vouchers v2 on v2.id = rd.voucher_id
  where v2.drop_id = d.id
) r on true;
