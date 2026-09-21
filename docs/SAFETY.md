# Player safety

Location games have killed and injured people: players have walked into
traffic, off embankments, onto rail lines. Every control below answers
something that has actually happened somewhere.

## Where each control is enforced

The split matters more than the list.

| Control | Enforced | Can a modified app bypass it? |
|---|---|---|
| Play hours (11:00–19:00) | Database | **No** |
| Exclusion zones | Database | **No** |
| Manual review before live | Database | **No** |
| Claim geofence | Database | **No** |
| Speed lock | Client only | **Yes** |
| Traffic briefing | Client, ack stored server-side | Partly |
| 112 button | Client | n/a |

**Speed is the one control that cannot be enforced server-side.** The server
never observes velocity, only the coordinates a client chooses to send, and
those are trivially forged. Treat the speed lock as ergonomics for honest
users, not as a guarantee. Everything load-bearing lives in Postgres.

## What is implemented

- **Speed lock** — `useSafetyGate` smooths GPS speed over a five-sample median
  and locks above `max_speed_kmh` (default 10 km/h). Hysteresis at 60% stops
  the overlay flickering at the threshold. Movement inside GPS error bars
  counts as zero, so a stationary phone under a balcony does not trip it.
- **Daylight only** — enforced twice: `nearby_drops()` returns nothing outside
  the window, and `claim_voucher()` raises `OUTSIDE_PLAY_HOURS`. The window is
  evaluated in `Asia/Tbilisi`, not UTC.
- **Exclusion zones** — `safety_zones` holds PostGIS polygons by kind
  (roadway, rail, embankment, construction, private, religious, cemetery,
  school, hospital, water, steep) with a per-zone buffer. A trigger rejects any
  drop placed inside one, and `claim_voucher()` also checks *where the player
  is standing* — a drop can sit safely on a pavement while the player stands in
  the road beside it.
- **Manual review** — a drop is invisible and unclaimable until a human clears
  it. The merchant portal shows an "Awaiting safety check" badge and records
  who signed off and when.
- **Daily briefing** — the traffic warning appears once per calendar day, with
  the acknowledgement stored server-side so clearing app data does not reset
  it. Once per session would train people to dismiss it unread.
- **112 button** — always on screen, and still reachable under the safety
  overlay, because the moment someone is moving fast is the moment they may
  need it.

## What is NOT implemented, and needs you

These cannot be solved in code:

- **Flat ground.** Automatic slope detection needs an elevation model Tbilisi
  does not have at useful resolution. Sololaki stairs and Mtatsminda slopes
  must be drawn as `steep` zones by hand.
- **No major-road crossings.** Judging whether a route crosses a dangerous road
  is a human call. That is what the manual review step is for — it is a
  workflow, not an algorithm.
- **Age gate.** `users.date_of_birth` and `guardian_ack_at` exist; the signup
  flow does not collect them yet.
- **Liability insurance.** Get it before the first public hunt.

## Populating exclusion zones

Nothing is excluded until you draw the zones. The most dangerous roads first:

```sql
insert into public.safety_zones (kind, name, area, buffer_m, notes)
values (
  'roadway',
  'Rustaveli Ave carriageway',
  st_geogfromtext('POLYGON((44.7990 41.6970, 44.8010 41.6985, 44.8005 41.6990, 44.7985 41.6975, 44.7990 41.6970))'),
  15,
  'Six lanes, heavy traffic'
);
```

Draw polygons in geojson.io or QGIS and export as WKT. Priority order:
Rustaveli, Agmashenebeli, the Mtkvari embankments, the rail corridor, then
Sololaki and Mtatsminda as `steep`.

**Until zones exist, only the play window and manual review protect players.**
Do not run a public hunt before the roads are drawn.

## Tuning

```sql
-- Tighten the window, or the speed limit, without a deploy.
update public.safety_config
set play_opens_at = '11:00',
    play_closes_at = '19:00',
    max_speed_kmh = 10.0;
```

## Existing drops

Adding manual review made every pre-existing drop invisible, which is the
correct default. Clear them from the portal, or in bulk for development:

```sql
update public.drops set safety_reviewed_at = now() where safety_reviewed_at is null;
```
