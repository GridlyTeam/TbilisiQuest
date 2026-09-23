-- Tbilisi Quest :: 0036 :: something to climb towards
--
-- The ladder was fifty levels with seven rewards on it and nothing at all on
-- the premium track, which is a track nobody would pay a partner visit for and
-- a free track that is empty for weeks at a time.
--
-- So: a catalogue, and both tracks filled from it. The cosmetics are named for
-- places these players actually stand in -- Fabrika, Saburtalo, Vake, the
-- Mtkvari, the funicular -- because a "Legendary Hoodie" is a generic reward
-- and a "Fabrika hoodie" is one they can point at.
--
-- Two kinds of gear are added to the enum. `sticker` and `outfit` are what the
-- brief calls stickers and avatar clothing; marker_skin already covered the
-- map pin.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Two more slots
-- ---------------------------------------------------------------------------
-- Postgres cannot add an enum value inside a transaction that then uses it, so
-- these go in first and the rows that reference them follow below.
alter type public.cosmetic_kind add value if not exists 'sticker';
alter type public.cosmetic_kind add value if not exists 'outfit';
