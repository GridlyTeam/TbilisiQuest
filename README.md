# Tbilisi Quest

A gamified, location-based discount platform driving foot traffic to Tbilisi
businesses during off-peak hours.

## Structure

```
apps/mobile      Player app — Expo / React Native (Android; iOS pending)
apps/merchant    Landing page, merchant portal and /admin operator area —
                 Next.js on Cloudflare Workers
supabase         Database schema and business logic — Postgres, PostGIS,
                 row-level security, migrations in supabase/migrations
docs             Architecture, safety and setup notes
tools            One-off scripts (e.g. deriving the creature's colour
                 palette from a single generated render)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the stack and the reasoning
behind it, and [docs/DESIGN_DIRECTION.md](docs/DESIGN_DIRECTION.md) for what's
built, what's decided, and what's still ahead.

## Local development

Each app runs independently — see [docs/MOBILE_SETUP.md](docs/MOBILE_SETUP.md)
and `apps/merchant`'s own scripts. Database changes go through
[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
