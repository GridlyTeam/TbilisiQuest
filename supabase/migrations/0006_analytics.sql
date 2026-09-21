-- Tbilisi Quest :: 0006 :: merchant analytics
--
-- The funnel the merchant actually cares about:
--   map_view -> revealed (they walked into range) -> claimed -> redeemed (money)
--
-- "Foot traffic conversion" is the revealed -> redeemed step, because crossing
-- the reveal radius is the first point at which a person physically moved
-- toward the venue.

create or replace view public.drop_performance
with (security_invoker = true) as
select
  d.id                 as drop_id,
  d.venue_id,
  d.title_en,
  d.rarity,
  d.starts_at,
  d.ends_at,
  d.inventory_cap,

  coalesce(i.map_views, 0)  as map_views,
  coalesce(i.reveals, 0)    as reveals,
  coalesce(c.claimed, 0)    as claimed,
  coalesce(r.redeemed, 0)   as redeemed,

  -- Share of inventory that actually left the building.
  round(coalesce(r.redeemed, 0)::numeric / nullif(d.inventory_cap, 0) * 100, 1)
    as sell_through_pct,
  -- Of the people who got close enough to see the offer, how many walked in.
  round(coalesce(r.redeemed, 0)::numeric / nullif(i.reveals, 0) * 100, 1)
    as foot_traffic_conversion_pct,
  -- Claimed but never collected: inventory held hostage by window shoppers.
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

-- ---------------------------------------------------------------------------
-- venue_daily_stats
-- ---------------------------------------------------------------------------
-- Powers the dashboard's trend chart. Materialised because impressions grow
-- fast and owners reload this constantly.
create materialized view public.venue_daily_stats as
select
  d.venue_id,
  date_trunc('day', rd.redeemed_at)::date as day,
  count(*)                                as redemptions,
  count(distinct rd.user_id)              as unique_visitors,
  sum(rd.face_value_gel)                  as discount_value_gel
from public.redemptions rd
join public.vouchers v on v.id = rd.voucher_id
join public.drops    d on d.id = v.drop_id
group by 1, 2;

create unique index venue_daily_stats_pk
  on public.venue_daily_stats (venue_id, day);

select cron.schedule(
  'refresh-venue-daily-stats',
  '*/15 * * * *',
  $$refresh materialized view concurrently public.venue_daily_stats$$
);
