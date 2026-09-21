-- Tbilisi Quest :: 0001 :: extensions and enumerated types
--
-- PostGIS gives us geography(point) columns and ST_DWithin, which is what makes
-- "show me every live drop within 2km of this phone" a single indexed query
-- instead of a full table scan with Haversine math in application code.

create extension if not exists postgis;
create extension if not exists pgcrypto;   -- gen_random_bytes for redemption codes
create extension if not exists pg_cron;    -- scheduled sweeps (expiring held vouchers)

-- Rarity drives both the visual treatment on the map and the early-access rules.
create type voucher_rarity as enum ('common', 'rare', 'legendary');

-- A drop's lifecycle. 'live' is derived from time in practice, but storing it
-- lets merchants pause a running drop without deleting it.
create type drop_status as enum (
  'draft', 'scheduled', 'live', 'paused', 'exhausted', 'expired', 'cancelled'
);

-- Voucher lifecycle. The key state is 'held': claiming reserves a voucher for a
-- limited window so a user who claims but never walks in doesn't burn inventory
-- permanently. A sweep job returns expired holds to 'available'.
create type voucher_status as enum (
  'available', 'held', 'redeemed', 'expired', 'released'
);

-- RBAC. 'cashier' sees only the redemption scanner; 'owner' sees everything
-- across every venue they own.
create type merchant_role as enum ('owner', 'manager', 'cashier');

create type subscription_tier as enum ('basic', 'premium');

create type offer_type as enum ('percent_off', 'bogo', 'free_item');
