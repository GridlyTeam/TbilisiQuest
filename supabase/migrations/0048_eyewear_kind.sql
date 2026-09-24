-- Tbilisi Quest :: 0048 :: eyewear is its own slot
--
-- Glasses are not an outfit. You wear them with one, so they cannot share a
-- slot with the hoodie -- putting them in the same slot would mean choosing
-- between a jacket and sunglasses, which is not a choice anybody wants.
--
-- Alone in its own migration because Postgres will not let a transaction use
-- an enum value it added itself.

set search_path = public, extensions;

alter type public.cosmetic_kind add value if not exists 'eyewear';
