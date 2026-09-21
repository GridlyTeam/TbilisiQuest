-- Tbilisi Quest :: 0017 :: rarity has to mean something
--
-- Rarity and offer were independent columns, so a merchant could publish
-- "Legendary -- 10% off". Rarity is the app's core signal: a glowing amber
-- marker promises a major deal, and players only keep walking toward them
-- while that promise holds. One disappointing Legendary teaches a player to
-- ignore the brightest thing on the map.
--
-- The rules, from the product spec:
--   Common    -- a small percentage off
--   Rare      -- buy one get one, or a substantial percentage
--   Legendary -- a free item, or a percentage close to free
--
-- NOT VALID so existing rows are left alone; it is enforced on everything
-- written from now on. The seed data predates the rule and has a Common at
-- 50% and a Rare at 30%, which is exactly the confusion this prevents.

set search_path = public, extensions;

alter table public.drops
  add constraint drops_rarity_matches_offer check (
    case rarity
      when 'common' then
        offer = 'percent_off' and discount_percent between 5 and 40
      when 'rare' then
        offer = 'bogo'
        or (offer = 'percent_off' and discount_percent between 41 and 69)
      when 'legendary' then
        offer = 'free_item'
        or (offer = 'percent_off' and discount_percent between 70 and 100)
    end
  ) not valid;
