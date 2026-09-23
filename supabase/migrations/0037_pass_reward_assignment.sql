-- Tbilisi Quest :: 0037 :: the catalogue, and both tracks filled from it
--
-- Separate from 0036 because Postgres will not let a transaction use an enum
-- value it added itself; 0036 adds `sticker` and `outfit`, this uses them.
--
-- The gear is named for places these players actually stand in -- Fabrika,
-- Saburtalo, Abanotubani, the funicular, the Dry Bridge -- because "Legendary
-- Hoodie" is a reward from any game and "Fabrika hoodie" is one they can point
-- at on the way home.
--
-- Forty rewards over fifty levels, twenty on each track, so neither track has
-- a stretch longer than three levels with nothing in it. Physical rewards --
-- the free coffees and the BOGOs in the brief -- are deliberately absent: a
-- voucher reward is a promise a real venue has to honour, and none of those
-- deals are signed. `reward_type = 'voucher'` is there for the day they are,
-- and an operator sets it per level.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. The catalogue
-- ---------------------------------------------------------------------------
insert into public.cosmetics (code, kind, title_ka, title_en, style_key, rarity) values
  -- Stickers: the cheap, frequent rewards that keep a track moving.
  ('sticker_khachapuri',  'sticker', 'ოქროს ხაჭაპური',   'Golden khachapuri',  'khachapuri', 'common'),
  ('sticker_funicular',   'sticker', 'ფუნიკულიორი',      'Funicular',          'funicular',  'common'),
  ('sticker_mtkvari',     'sticker', 'მტკვარი',          'Mtkvari',            'river',      'common'),
  ('sticker_boba',        'sticker', 'ბობა',             'Boba',               'boba',       'common'),
  ('sticker_grape',       'sticker', 'მარანი',           'Grapevine',          'grape',      'common'),
  ('sticker_metro',       'sticker', 'მეტრო',            'Metro',              'metro',      'rare'),
  ('sticker_abano',       'sticker', 'აბანოთუბანი',      'Abanotubani',        'sulfur',     'rare'),
  ('sticker_balcony',     'sticker', 'ძველი აივანი',     'Old balcony',        'balcony',    'rare'),

  -- Outfits: the flex layer, worn on the map avatar.
  ('outfit_fabrika',      'outfit',  'ფაბრიკის ჰუდი',    'Fabrika hoodie',     'hoodie_fab', 'rare'),
  ('outfit_saburtalo',    'outfit',  'საბურთალოს კომპლექტი', 'Saburtalo tracksuit', 'track_sab', 'rare'),
  ('outfit_vake',         'outfit',  'ვაკის ჯინსი',      'Vake denim',         'denim_vake', 'rare'),
  ('outfit_rustaveli',    'outfit',  'რუსთაველის პალტო', 'Rustaveli coat',     'coat_rust',  'legendary'),
  ('outfit_drybridge',    'outfit',  'მშრალი ხიდის ქურთუკი', 'Dry Bridge jacket', 'jacket_dry', 'legendary'),
  ('outfit_marjani',      'outfit',  'მარჯანიშვილის ქარსაცავი', 'Marjanishvili windbreaker', 'wind_marj', 'rare'),

  -- Map pins: the one cosmetic other players see from a distance.
  ('marker_neon',         'marker_skin', 'ნეონის პინი',  'Neon pin',           'pin_neon',   'common'),
  ('marker_grape',        'marker_skin', 'მარნის პინი',  'Grapevine pin',      'pin_grape',  'rare'),
  ('marker_flame',        'marker_skin', 'ცეცხლის პინი', 'Flame pin',          'pin_flame',  'rare'),
  ('marker_ghost',        'marker_skin', 'აჩრდილის პინი','Ghost pin',          'pin_ghost',  'legendary'),
  ('marker_goldpin',      'marker_skin', 'ოქროს პინი',   'Gold pin',           'pin_gold',   'legendary'),

  -- Titles: what sits under the name on a flex card. style_key is not
  -- nullable, and a title still has one -- it is how the app colours it.
  ('title_nightowl',      'title', 'საბურთალოს ღამის ფრინველი', 'Saburtalo night owl', 'nightowl', 'rare'),
  ('title_earlybird',     'title', 'ადრიანი',          'Early bird',         'earlybird', 'common'),
  ('title_collector',     'title', 'კოლექციონერი',     'Collector',          'collector', 'rare'),
  ('title_campus',        'title', 'კამპუსის მეფე',    'Campus king',        'campus', 'legendary'),
  ('title_marathon',      'title', 'მარათონელი',       'Marathoner',         'marathon', 'rare'),
  ('title_boba',          'title', 'ბობას ოსტატი',     'Boba master',        'boba', 'common'),
  ('title_citywalker',    'title', 'ქალაქის მოსიარულე','City walker',        'citywalker', 'common'),

  -- Frames and card themes: the profile itself.
  ('frame_cyan',          'avatar_frame', 'ცისფერი ჩარჩო', 'Cyan frame',      'cyan',    'common'),
  ('frame_emerald',       'avatar_frame', 'ზურმუხტის ჩარჩო', 'Emerald frame', 'emerald', 'rare'),
  ('frame_midnight',      'avatar_frame', 'შუაღამის ჩარჩო', 'Midnight frame', 'midnight','legendary'),
  ('card_theme_dusk',     'card_theme', 'საღამო',        'Dusk',              'dusk',    'common'),
  ('card_theme_grape',    'card_theme', 'მარანი',        'Vineyard',          'grape',   'rare'),
  ('card_theme_mono',     'card_theme', 'შავ-თეთრი',     'Monochrome',        'mono',    'rare'),
  ('card_theme_sunrise',  'card_theme', 'გარიჟრაჟი',     'Sunrise',           'sunrise', 'legendary')
on conflict (code) do update
  set title_ka  = excluded.title_ka,
      title_en  = excluded.title_en,
      style_key = excluded.style_key,
      rarity    = excluded.rarity;

-- ---------------------------------------------------------------------------
-- 2. Onto the ladder
-- ---------------------------------------------------------------------------
-- The seven rewards 0035 placed on the free track keep their levels; these
-- fill the gaps between them and build the premium track from scratch. The
-- level's own title becomes the reward's name, so a cell reads as the thing it
-- gives rather than "Level 27".
with plan(level, is_premium, code) as (
  values
    -- Free track: 3, 8, 15, 22, 30, 40 and 50 are already spoken for.
    (5,  false, 'sticker_khachapuri'),
    (10, false, 'marker_neon'),
    (13, false, 'title_earlybird'),
    (18, false, 'sticker_funicular'),
    (20, false, 'frame_cyan'),
    (25, false, 'title_citywalker'),
    (28, false, 'sticker_mtkvari'),
    (33, false, 'card_theme_dusk'),
    (35, false, 'sticker_boba'),
    (38, false, 'title_boba'),
    (43, false, 'marker_grape'),
    (45, false, 'sticker_grape'),
    (48, false, 'title_collector'),

    -- Premium track: denser and better, which is the whole argument for it.
    (2,  true, 'sticker_metro'),
    (4,  true, 'marker_flame'),
    (7,  true, 'outfit_saburtalo'),
    (9,  true, 'card_theme_grape'),
    (12, true, 'sticker_abano'),
    (14, true, 'title_nightowl'),
    (17, true, 'outfit_vake'),
    (19, true, 'frame_emerald'),
    (21, true, 'sticker_balcony'),
    (24, true, 'card_theme_mono'),
    (26, true, 'outfit_marjani'),
    (29, true, 'title_marathon'),
    (31, true, 'outfit_fabrika'),
    (34, true, 'marker_ghost'),
    (36, true, 'card_theme_sunrise'),
    (39, true, 'outfit_drybridge'),
    (41, true, 'frame_midnight'),
    (44, true, 'title_campus'),
    (46, true, 'outfit_rustaveli'),
    (49, true, 'marker_goldpin')
)
update public.season_tiers t
set reward_code = p.code,
    reward_type = case c.kind
                    when 'title'        then 'title'
                    when 'avatar_frame' then 'frame'
                    else 'cosmetic'
                  end,
    title_ka    = c.title_ka,
    title_en    = c.title_en
from plan p
join public.cosmetics c on c.code = p.code
where t.tier = p.level
  and t.is_premium = p.is_premium;

-- The rewards 0035 placed are named after the tier rather than the item; make
-- them read the same way as the rest.
update public.season_tiers t
set title_ka = c.title_ka,
    title_en = c.title_en
from public.cosmetics c
where c.code = t.reward_code
  and t.reward_code is not null;
