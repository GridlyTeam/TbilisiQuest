-- Tbilisi Quest :: 0041 :: backgrounds are a kind of cosmetic
--
-- The walkthrough asks for backgrounds a player stands in front of -- Mtatsminda
-- Park and the like -- and they are the thing worth showing off, so they get a
-- slot of their own rather than being squeezed into card_theme, which colours a
-- card and is not a place.
--
-- Alone in its own migration because Postgres will not let a transaction use an
-- enum value it added itself.

set search_path = public, extensions;

alter type public.cosmetic_kind add value if not exists 'background';
alter type public.cosmetic_kind add value if not exists 'shape';
