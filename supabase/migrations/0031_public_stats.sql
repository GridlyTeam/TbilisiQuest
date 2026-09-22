-- Tbilisi Quest :: 0031 :: numbers the landing page may show
--
-- A marketing page claiming "hundreds of offers" is worth nothing; the same
-- page saying "14 places, 260 vouchers this week" is worth a lot, provided the
-- numbers are true. This returns the three counts the public page uses, and
-- nothing else -- no names, no positions, no identities.
--
-- Granted to anon deliberately: the page is read by people who have not signed
-- up, which is the entire point of it.

set search_path = public, extensions;

create or replace function public.public_stats()
returns table (
  venues          int,
  live_drops      int,
  vouchers_today  int
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    (select count(*)::int
       from public.venues v
      where v.is_active and v.status = 'approved'),
    (select count(*)::int
       from public.drops d
       join public.venues v on v.id = d.venue_id
      where d.status in ('scheduled', 'live')
        and d.ends_at > now()
        and v.is_active and v.status = 'approved'),
    -- Vouchers still available across everything live right now. The honest
    -- version of "hundreds of offers".
    (select count(*)::int
       from public.vouchers vo
       join public.drops d on d.id = vo.drop_id
       join public.venues v on v.id = d.venue_id
      where vo.status = 'available'
        and d.status in ('scheduled', 'live')
        and d.ends_at > now()
        and v.is_active and v.status = 'approved');
$$;

grant execute on function public.public_stats() to anon, authenticated;
