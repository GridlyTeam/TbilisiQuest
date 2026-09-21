-- Tbilisi Quest :: 0002 :: core domain tables

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- Supabase owns auth.users (email, phone, password hashes). This is the public
-- profile that other tables reference and that RLS policies can read cheaply.
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  locale        text not null default 'ka' check (locale in ('ka', 'en')),
  avatar_url    text,
  -- Last known position, refreshed on app foreground. Used to pre-warm the map
  -- and to target push notifications by neighbourhood.
  last_point    geography(point, 4326),
  push_token    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

create index users_last_point_idx on public.users using gist (last_point);

-- ---------------------------------------------------------------------------
-- venues
-- ---------------------------------------------------------------------------
create table public.venues (
  id                 uuid primary key default gen_random_uuid(),
  name_ka            text not null,
  name_en            text not null,
  description_ka     text,
  description_en     text,
  category           text not null,           -- cafe, bar, bakery, salon, ...
  location           geography(point, 4326) not null,
  address_ka         text,
  address_en         text,
  phone              text,
  subscription_tier  subscription_tier not null default 'basic',
  -- Seed for the rotating counter QR (see 0005). Never leaves the server: the
  -- cashier display calls an RPC that returns a short-lived code, not this.
  counter_secret     bytea not null default gen_random_bytes(32),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

-- The index that makes proximity queries fast. Without it, every map pan is a
-- sequential scan over all venues.
create index venues_location_idx on public.venues using gist (location);
create index venues_active_idx   on public.venues (is_active) where is_active;

-- ---------------------------------------------------------------------------
-- merchant_users  (RBAC join table)
-- ---------------------------------------------------------------------------
-- One row per (person, venue, role). A multi-location owner gets one row per
-- venue with role 'owner'; a barista gets a single 'cashier' row.
create table public.merchant_users (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  venue_id   uuid not null references public.venues(id) on delete cascade,
  role       merchant_role not null default 'cashier',
  created_at timestamptz not null default now(),
  unique (user_id, venue_id)
);

create index merchant_users_user_idx  on public.merchant_users (user_id);
create index merchant_users_venue_idx on public.merchant_users (venue_id);

-- ---------------------------------------------------------------------------
-- drops
-- ---------------------------------------------------------------------------
create table public.drops (
  id                   uuid primary key default gen_random_uuid(),
  venue_id             uuid not null references public.venues(id) on delete cascade,

  title_ka             text not null,
  title_en             text not null,
  description_ka       text,
  description_en       text,

  rarity               voucher_rarity not null,
  offer                offer_type not null,
  -- Only meaningful when offer = 'percent_off'.
  discount_percent     int check (discount_percent between 1 and 100),
  -- What the merchant tells us one unit is worth, for ROI reporting.
  face_value_gel       numeric(10, 2),

  -- Off-peak scheduling. starts_at/ends_at are absolute instants; the merchant
  -- UI composes them from a local time slot plus a recurrence rule.
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,

  -- Gamification: players at or above this level may claim early_access_minutes
  -- before starts_at. Zero disables the perk.
  early_access_level   int not null default 0 check (early_access_level >= 0),
  early_access_minutes int not null default 0 check (early_access_minutes >= 0),

  inventory_cap        int not null check (inventory_cap > 0),

  -- Denormalised from venues so map queries touch one table. Kept in sync by a
  -- trigger in 0005 -- venues move rarely, drops are read constantly.
  location             geography(point, 4326) not null,
  -- Fog of war: beyond this the client shows a mystery marker only.
  reveal_radius_m      int not null default 100 check (reveal_radius_m > 0),
  -- Claim geofence, deliberately much tighter than reveal.
  claim_radius_m       int not null default 20  check (claim_radius_m > 0),

  status               drop_status not null default 'draft',
  -- Premium tier: oversized "boss chest" treatment on the map.
  is_boss_chest        boolean not null default false,

  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),

  constraint drops_window_valid        check (ends_at > starts_at),
  constraint drops_claim_inside_reveal check (claim_radius_m <= reveal_radius_m)
);

create index drops_location_idx on public.drops using gist (location);
create index drops_venue_idx    on public.drops (venue_id);
-- Partial index for the hot map query: only rows that could possibly be shown.
create index drops_live_window_idx
  on public.drops (starts_at, ends_at)
  where status in ('scheduled', 'live');

-- ---------------------------------------------------------------------------
-- vouchers
-- ---------------------------------------------------------------------------
-- One row per unit of inventory, materialised up front when a drop goes live.
-- This is the single most important design decision in the schema: claiming
-- becomes "grab an unclaimed row" rather than "increment a counter", which is
-- what lets concurrent claims proceed in parallel. See 0005.
create table public.vouchers (
  id               uuid primary key default gen_random_uuid(),
  drop_id          uuid not null references public.drops(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  status           voucher_status not null default 'available',

  -- Generated at claim time, shown as the user's QR payload in-store.
  redemption_code  text unique,
  claimed_at       timestamptz,
  -- Holds expire so abandoned claims return to the pool.
  hold_expires_at  timestamptz,

  created_at       timestamptz not null default now()
);

-- THE hot-path index. Partial, so it contains only rows still up for grabs --
-- typically a handful even for a busy drop, which keeps the claim lookup cheap.
create index vouchers_available_idx
  on public.vouchers (drop_id)
  where status = 'available';

-- Enforces one voucher per person per drop at the database level. Application
-- checks race; a unique index does not.
create unique index vouchers_one_per_user_idx
  on public.vouchers (drop_id, user_id)
  where user_id is not null;

create index vouchers_user_idx on public.vouchers (user_id, status);
-- Supports the sweep job that releases expired holds.
create index vouchers_hold_expiry_idx
  on public.vouchers (hold_expires_at)
  where status = 'held';

-- ---------------------------------------------------------------------------
-- redemptions
-- ---------------------------------------------------------------------------
-- The money event: a voucher actually handed over at the counter. Separate from
-- vouchers because this is the analytics fact table and has different access
-- rules (cashiers write here, owners read aggregates).
create table public.redemptions (
  id                  uuid primary key default gen_random_uuid(),
  voucher_id          uuid not null unique references public.vouchers(id) on delete cascade,
  venue_id            uuid not null references public.venues(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  cashier_user_id     uuid references auth.users(id) on delete set null,

  redeemed_at         timestamptz not null default now(),
  -- Where the phone said it was at redemption, plus the server's computed
  -- distance from the venue. Retained for fraud review.
  redeemed_point      geography(point, 4326),
  distance_m          numeric(8, 2),

  face_value_gel      numeric(10, 2)
);

create index redemptions_venue_time_idx on public.redemptions (venue_id, redeemed_at desc);
create index redemptions_user_idx       on public.redemptions (user_id, redeemed_at desc);

-- ---------------------------------------------------------------------------
-- drop_impressions  (analytics source)
-- ---------------------------------------------------------------------------
-- High volume and append-only. bigserial rather than uuid because ordered
-- inserts matter far more than unguessable ids here.
create table public.drop_impressions (
  id          bigserial primary key,
  drop_id     uuid not null references public.drops(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  -- 'map_view' = rendered as a mystery marker in the viewport
  -- 'revealed' = user crossed reveal_radius_m and saw the real offer
  -- 'opened'   = user tapped through to the detail sheet
  kind        text not null check (kind in ('map_view', 'revealed', 'opened')),
  occurred_at timestamptz not null default now()
);

create index drop_impressions_drop_time_idx
  on public.drop_impressions (drop_id, occurred_at desc);
