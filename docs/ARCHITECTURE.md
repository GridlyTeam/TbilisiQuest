# Tbilisi Quest — System Architecture

A gamified, location-based discount platform driving foot traffic to Tbilisi
businesses during off-peak hours.

---

## 1. Tech stack

| Layer | Choice | Why this over the alternative |
|---|---|---|
| Mobile | **React Native + Expo (dev build)** | Shares language, types and validation with the merchant portal. Flutter is an excellent framework but would mean two languages, two toolchains and two sets of models for a small team. |
| Maps (mobile) | **Mapbox via `@rnmapbox/maps`** | Mature RN bindings, offline tile packs, good custom-marker performance. Free to 25k MAU. |
| Merchant portal | **Next.js 15 (App Router) + Tailwind + shadcn/ui** | Server actions keep mutations on the server with the session cookie, so RLS applies without a separate API tier. |
| Backend | **Supabase (Postgres 15 + PostGIS + Auth + Realtime)** | PostGIS and row-level security are the two hard requirements, and both are native. Auth, storage and realtime come free. |
| Critical logic | **Postgres functions (`plpgsql`, security definer)** | Claiming and redemption are transactional problems. Solving them in the database removes a whole class of race conditions that application-tier code has to work to avoid. |
| Hosting (portal) | **Cloudflare Workers** | Already configured in this repo. |
| Push | **Expo Notifications → APNs/FCM** | One API for both platforms. |

### Why the mobile client cannot be a PWA

Two spec requirements rule it out:

- **NFC tag reading** is unavailable to web apps on iOS entirely.
- **Background geofencing** ("a drop appeared near you") requires native
  background location, which iOS Safari does not grant.

The merchant portal, by contrast, is a perfect fit for the web and deploys to
the Cloudflare setup already in this repo.

---

## 2. Concurrency: 200 users, 20 vouchers

This is the load-bearing problem in the whole system. Get it wrong and you
either give away inventory you don't have, or you serialise every claim and the
app feels broken under exactly the demand you engineered for.

### What doesn't work

**Read-modify-write on a counter.**

```sql
select claimed_count, inventory_cap from drops where id = $1;  -- all read "0 of 20"
-- ... application checks there is room ...
update drops set claimed_count = claimed_count + 1 where id = $1;
```

Every one of the 200 transactions reads before any of them writes, all 200 see
room, and you hand out 200 vouchers. Classic lost update.

**`SELECT … FOR UPDATE` on the drop row.** Correct, but it makes one row the
choke point: all 200 transactions queue on it and the last claimer waits behind
199 others. Worse, that row is also read by every map query.

### What this system does

Inventory is **materialised as rows** — one `vouchers` row per unit, created
when the drop is scheduled. Claiming is then *allocation*, not counting:

```sql
update vouchers v
   set user_id = auth.uid(), status = 'held', ...
 where v.id = (
   select id from vouchers
    where drop_id = $1 and status = 'available'
    order by id
    limit 1
    for update skip locked      -- <- the whole trick
 )
returning v.*;
```

`SKIP LOCKED` tells Postgres: *if another transaction already holds this row,
don't wait — take the next one.* The result:

- The 20 winners each lock a **different** row and commit in parallel.
- The 180 losers find nothing available and fail immediately with `SOLD_OUT`
  rather than waiting in a queue for a voucher that was never coming.
- No hot row. No lock convoy. Throughput scales with available inventory.

Three supporting decisions matter:

1. **There is deliberately no `claimed_count` column being incremented.**
   Maintaining one would reintroduce the single contended row the design just
   eliminated. Remaining inventory is counted from the partial index
   `vouchers_available_idx`, which contains only still-available rows and is
   therefore tiny.

2. **`unique (drop_id, user_id) where user_id is not null`** is what actually
   stops one person claiming twice. An application-level check races; a unique
   index does not. `claim_voucher()` catches the violation and returns
   `ALREADY_CLAIMED`.

3. **Claims are held, not permanent.** A 30-minute `hold_expires_at` plus a
   `pg_cron` sweep returns abandoned claims to the pool, so window shoppers
   can't lock up a merchant's whole day.

---

## 3. Trust model

Assume the client is hostile. A Legendary voucher is a free meal, and GPS
spoofing apps are a free download.

| Surface | Control |
|---|---|
| Fake coordinates | Server computes distance with PostGIS from raw lat/lng. A client-supplied distance is never accepted. |
| GPS spoofing | Defeated by the **second factor**: the in-store counter QR. Location alone never releases value. |
| Photographed counter QR | The counter code is **HMAC(venue_secret, 30-second window)** — a TOTP rendered as a QR. A screenshot is stale in half a minute. |
| Reading offers without walking | Fog of war is enforced in `nearby_drops()`, which nulls venue and offer fields beyond `reveal_radius_m`. The data never reaches the wire. |
| Writing yourself a voucher | `vouchers` has **no INSERT/UPDATE policy**. The only path is `claim_voucher()`, a security-definer function. |
| Cross-venue access | Every merchant policy routes through `has_venue_role()`. |
| Reading `counter_secret` | Column-level `REVOKE SELECT` on top of RLS. |

**Still open** (worth planning for before launch): rooted/jailbroken device
detection, impossible-travel heuristics (claims 5km apart 30 seconds apart), and
per-user claim rate limits.

---

## 4. API surface

Most of the mobile API is Postgres RPC over PostgREST rather than hand-written
endpoints — fewer moving parts, and RLS applies uniformly.

### Mobile client

| Operation | Call | Notes |
|---|---|---|
| Map data | `rpc/nearby_drops(lat, lng, radius)` | Fog of war applied server-side. Returns ≤200 rows ordered by distance. |
| Drop detail | `GET /drops?id=eq.…` | RLS restricts to live drops. |
| Claim | `rpc/claim_voucher(drop_id, lat, lng)` | Geofence + early access + atomic allocation. |
| Redeem | `rpc/redeem_voucher(code, counter_code, lat, lng)` | Dual verification. |
| My vouchers | `GET /vouchers?user_id=eq.…` | RLS-scoped to self. |
| Progress | `GET /user_xp`, `GET /user_quests` | |
| Log impression | `POST /drop_impressions` | Batched client-side. |

### Merchant portal

| Operation | Mechanism |
|---|---|
| Create drop | Server action → insert + `materialise_drop_inventory()` |
| Counter code | `rpc/current_counter_code(venue_id)`, polled every 30s |
| Performance | `GET /drop_performance?venue_id=eq.…` |
| Daily trend | `GET /venue_daily_stats` (materialised, refreshed every 15 min) |
| Staff management | `POST/DELETE /merchant_users` — owner-only via RLS |

### Error vocabulary

Functions raise typed codes the client maps to localised copy:
`AUTH_REQUIRED`, `DROP_NOT_FOUND`, `OUT_OF_RANGE:<metres>`, `NOT_YET_OPEN:<ts>`,
`DROP_EXPIRED`, `SOLD_OUT`, `ALREADY_CLAIMED`, `BAD_COUNTER_CODE`,
`HOLD_EXPIRED`, `ALREADY_REDEEMED`, `NOT_YOUR_VOUCHER`.

---

## 5. Repository layout

```
TbilisiQuest/
├── apps/
│   ├── mobile/                    # Expo React Native
│   │   └── src/
│   │       ├── screens/
│   │       │   ├── MapScreen.tsx
│   │       │   ├── DropDetailScreen.tsx
│   │       │   ├── GeofencedScannerScreen.tsx   ✅ implemented
│   │       │   └── ProfileScreen.tsx
│   │       ├── lib/               # supabase, i18n, geo helpers
│   │       └── components/
│   │
│   └── merchant/                  # Next.js portal
│       └── src/
│           ├── app/               # routes
│           ├── components/
│           │   ├── DropCreator.tsx              ✅ implemented
│           │   ├── CounterQRStation.tsx
│           │   └── AnalyticsDashboard.tsx
│           └── lib/
│               ├── actions.ts                   ✅ implemented
│               └── supabase-server.ts
│
├── packages/
│   └── shared/                    # types, zod schemas, error codes, i18n keys
│
├── supabase/
│   ├── migrations/
│   │   ├── 0001_extensions_and_enums.sql        ✅
│   │   ├── 0002_core_tables.sql                 ✅
│   │   ├── 0003_gamification.sql                ✅
│   │   ├── 0004_functions.sql                   ✅
│   │   ├── 0005_rls.sql                         ✅
│   │   └── 0006_analytics.sql                   ✅
│   └── functions/                 # Deno edge functions (push fan-out)
│
└── docs/
```

---

## 6. Build order

1. **Migrations + seed data** — run `0001`–`0006`, seed 5 venues and a few drops.
2. **Merchant portal** — drop creator, counter QR station. Ship this first: no
   player app is useful without inventory, and it deploys to the existing
   Cloudflare setup.
3. **Mobile: map + fog of war** — the core loop's visible half.
4. **Mobile: claim + scan** — `GeofencedScannerScreen` is already written.
5. **Gamification** — XP and levels exist in the schema; quests need a progress
   trigger on `redemptions`.
6. **Analytics dashboard** — reads `drop_performance` and `venue_daily_stats`.

### Load-test before launch

The concurrency design should be proven, not assumed. Point `pgbench` or k6 at
`claim_voucher()` with 200 concurrent clients against a 20-voucher drop and
assert exactly 20 succeed. That test is cheap to write and is the one that
matters most.
