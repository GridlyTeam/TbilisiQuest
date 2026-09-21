-- Tbilisi Quest :: seed data for local development
--
-- Fictional venues placed at real Tbilisi coordinates, spread across
-- neighbourhoods so you can test the fog-of-war reveal by actually walking (or
-- by moving the emulator's mock location).
--
-- Merchant accounts are NOT seeded: they need rows in auth.users, which come
-- from real signups. After signing up in the portal, link yourself with:
--
--   insert into public.merchant_users (user_id, venue_id, role)
--   values ('<your-auth-uid>', '<venue-id>', 'owner');

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------
insert into public.venues (id, name_ka, name_en, description_ka, description_en,
                           category, location, address_ka, address_en,
                           subscription_tier)
values
  ('11111111-1111-1111-1111-111111111101',
   'ყავა ფაბრიკა', 'Fabrika Coffee Room',
   'სპეშელთი ყავა ჩრდილოეთ ეზოში', 'Specialty coffee in the north courtyard',
   'cafe',
   st_setsrid(st_makepoint(44.7975, 41.7060), 4326)::geography,
   'ეგნატე ნინოშვილის 8', '8 Egnate Ninoshvili St',
   'premium'),

  ('11111111-1111-1111-1111-111111111102',
   'რუსთაველის საცხობი', 'Rustaveli Bakery',
   'ცხელი პური და ხაჭაპური', 'Hot bread and khachapuri all afternoon',
   'bakery',
   st_setsrid(st_makepoint(44.7995, 41.6977), 4326)::geography,
   'რუსთაველის გამზირი 24', '24 Rustaveli Ave',
   'basic'),

  ('11111111-1111-1111-1111-111111111103',
   'აბანოთუბნის ჩაიხანა', 'Abanotubani Tea House',
   'ქართული ჩაი გოგირდის აბანოებთან', 'Georgian tea beside the sulphur baths',
   'cafe',
   st_setsrid(st_makepoint(44.8090, 41.6890), 4326)::geography,
   'აბანო ქუჩა 3', '3 Abano St',
   'basic'),

  ('11111111-1111-1111-1111-111111111104',
   'ვაკის ღვინის ბარი', 'Vake Wine Bar',
   'ქვევრის ღვინო და ყველი', 'Qvevri wine and cheese boards',
   'bar',
   st_setsrid(st_makepoint(44.7605, 41.7095), 4326)::geography,
   'ჭავჭავაძის გამზირი 41', '41 Chavchavadze Ave',
   'premium'),

  ('11111111-1111-1111-1111-111111111105',
   'მარჯანიშვილის სალონი', 'Marjanishvili Salon',
   'თმის შეჭრა და სტილი', 'Cuts and styling, walk-ins welcome',
   'salon',
   st_setsrid(st_makepoint(44.7965, 41.7085), 4326)::geography,
   'მარჯანიშვილის 12', '12 Marjanishvili St',
   'basic'),

  ('11111111-1111-1111-1111-111111111106',
   'მშრალი ხიდის ბისტრო', 'Dry Bridge Bistro',
   'სადილი ბაზრობასთან', 'Lunch plates by the flea market',
   'restaurant',
   st_setsrid(st_makepoint(44.8060, 41.6975), 4326)::geography,
   'დამწვარი ბაღი', 'Dry Bridge Park',
   'basic');

-- ---------------------------------------------------------------------------
-- Drops
-- ---------------------------------------------------------------------------
-- Windows are relative to now() so the seed stays useful whenever it is run.
-- The first drop is already live; the others start shortly after.
insert into public.drops (id, venue_id, title_ka, title_en,
                          description_ka, description_en,
                          rarity, offer, discount_percent, face_value_gel,
                          starts_at, ends_at,
                          early_access_level, early_access_minutes,
                          inventory_cap, reveal_radius_m, claim_radius_m,
                          status, is_boss_chest)
values
  -- Live now, Common. The everyday case.
  ('22222222-2222-2222-2222-222222222201',
   '11111111-1111-1111-1111-111111111101',
   'ფილტრის ყავა -40%', '40% off filter coffee',
   'მხოლოდ დღის შუა საათებში', 'Afternoon lull only',
   'common', 'percent_off', 40, 8.00,
   now() - interval '30 minutes', now() + interval '3 hours',
   0, 0, 25, 100, 20, 'live', false),

  -- Live now, Rare, with early access for level 5+.
  ('22222222-2222-2222-2222-222222222202',
   '11111111-1111-1111-1111-111111111102',
   'ხაჭაპური 1+1', 'Khachapuri buy one get one',
   'ორი ერთის ფასად', 'Two for the price of one',
   'rare', 'bogo', null, 12.00,
   now() - interval '10 minutes', now() + interval '2 hours',
   5, 15, 15, 120, 25, 'live', false),

  -- Legendary boss chest, premium venue, starts soon. Tests the countdown.
  ('22222222-2222-2222-2222-222222222203',
   '11111111-1111-1111-1111-111111111104',
   'უფასო ღვინის დეგუსტაცია', 'Free wine tasting flight',
   'სამი ქვევრის ღვინო', 'Three qvevri pours, on the house',
   'legendary', 'free_item', null, 45.00,
   now() + interval '45 minutes', now() + interval '4 hours',
   8, 30, 10, 150, 20, 'scheduled', true),

  -- Small inventory: the one to hammer in a load test.
  ('22222222-2222-2222-2222-222222222204',
   '11111111-1111-1111-1111-111111111103',
   'ჩაი და ნამცხვარი -50%', '50% off tea and pastry',
   null, 'Quiet hours special',
   'common', 'percent_off', 50, 10.00,
   now() - interval '5 minutes', now() + interval '5 hours',
   0, 0, 20, 100, 20, 'live', false),

  -- Rare, salon, tests a non-food category.
  ('22222222-2222-2222-2222-222222222205',
   '11111111-1111-1111-1111-111111111105',
   'შეჭრა -30%', '30% off a haircut',
   null, 'Weekday afternoons',
   'rare', 'percent_off', 30, 40.00,
   now(), now() + interval '6 hours',
   3, 20, 8, 100, 20, 'live', false),

  -- Already expired, so the map correctly hides it.
  ('22222222-2222-2222-2222-222222222206',
   '11111111-1111-1111-1111-111111111106',
   'სადილი -25%', '25% off lunch',
   null, 'Yesterday''s drop, should not appear',
   'common', 'percent_off', 25, 20.00,
   now() - interval '1 day', now() - interval '20 hours',
   0, 0, 30, 100, 20, 'expired', false);

-- Create the voucher rows for every non-draft drop.
select public.materialise_drop_inventory(id) from public.drops;

-- ---------------------------------------------------------------------------
-- Quests
-- ---------------------------------------------------------------------------
insert into public.quests (code, title_ka, title_en, description_ka, description_en,
                           cadence, objective_type, objective_target,
                           objective_params, xp_reward)
values
  ('daily_first_claim',
   'პირველი ნადავლი', 'First catch of the day',
   'მოიპოვე ერთი ვაუჩერი', 'Claim any voucher today',
   'daily', 'claim_count', 1, '{}'::jsonb, 50),

  ('daily_redeem_two',
   'ორმაგი დარტყმა', 'Double up',
   'გამოიყენე ორი ვაუჩერი', 'Redeem two vouchers today',
   'daily', 'redeem_count', 2, '{}'::jsonb, 120),

  ('weekly_explorer',
   'მკვლევარი', 'Explorer',
   'ეწვიე ხუთ სხვადასხვა ადგილს', 'Redeem at five different venues this week',
   'weekly', 'distinct_venues', 5, '{}'::jsonb, 400),

  ('weekly_legendary',
   'ლეგენდარული ნადირობა', 'Legendary hunt',
   'მოიპოვე ლეგენდარული ვაუჩერი', 'Claim a Legendary voucher this week',
   'weekly', 'rarity_hunt', 1, '{"rarity":"legendary"}'::jsonb, 500),

  ('weekly_caffeine',
   'კოფეინის რუტინა', 'Caffeine circuit',
   'ეწვიე სამ კაფეს', 'Redeem at three cafes this week',
   'weekly', 'category_visit', 3, '{"category":"cafe"}'::jsonb, 250);

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------
insert into public.badges (code, title_ka, title_en, description_ka, description_en,
                           icon_key, criteria_type, criteria_target,
                           criteria_params, xp_reward)
values
  ('first_steps', 'პირველი ნაბიჯები', 'First Steps',
   null, 'Redeem your first voucher',
   'boot', 'redeem_count', 1, '{}'::jsonb, 100),

  ('regular', 'მუდმივი სტუმარი', 'Regular',
   null, 'Redeem 25 vouchers',
   'star', 'redeem_count', 25, '{}'::jsonb, 500),

  ('cartographer', 'კარტოგრაფი', 'Cartographer',
   null, 'Redeem at 20 different venues',
   'map', 'distinct_venues', 20, '{}'::jsonb, 1000),

  ('treasure_hunter', 'განძის მაძიებელი', 'Treasure Hunter',
   null, 'Claim 5 Legendary vouchers',
   'chest', 'rarity_hunt', 5, '{"rarity":"legendary"}'::jsonb, 1500);
