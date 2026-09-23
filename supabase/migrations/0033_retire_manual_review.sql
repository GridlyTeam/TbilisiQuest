-- Tbilisi Quest :: 0033 :: retire the manual safety review
--
-- 0008 made every drop invisible until a human marked it checked. That was
-- right when a merchant could place their own pin: someone had to look at
-- whether the spot was a pavement or a motorway shoulder before the app sent
-- teenagers to it.
--
-- 0027 removed that possibility. Venue locations are operator-set and refuse
-- to be changed by anyone else, and a drop inherits its venue's position. The
-- pin a reviewer would be looking at is the pin the operator placed when they
-- created the venue, so the review re-checks a decision already made.
--
-- It was also in the wrong hands. The button lived in the merchant's portal,
-- which meant the merchant certified their own drop as safe -- not a check at
-- all -- and a merchant who forgot to press it had a drop that silently never
-- appeared on any map.
--
-- The switch is turned off rather than the machinery torn out. Every gate
-- reads `not require_manual_review or safety_reviewed_at is not null`, so
-- flipping the flag opens them all, and turning it back on restores the
-- review in one statement if drops ever get placed away from venues again.

set search_path = public, extensions;

update public.safety_config set require_manual_review = false where id;

alter table public.safety_config
  alter column require_manual_review set default false;

-- Anything scheduled while the gate was closed should not stay hidden.
update public.drops
set safety_reviewed_at = now()
where safety_reviewed_at is null
  and status in ('draft', 'scheduled', 'live');
