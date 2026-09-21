# Supabase setup

Getting from an empty account to a database with live drops in it.

---

## 1. Create the project

1. Sign up at **[supabase.com](https://supabase.com)** — the free tier is enough
   for development and early testing.
2. **New project**. Settings that matter:
   - **Region: Frankfurt (eu-central-1)** — closest to Tbilisi, roughly 40–60 ms.
     Picking a US region adds ~150 ms to every query for no benefit.
   - **Database password**: generate a strong one and save it in a password
     manager. You'll need it in step 3 and it isn't shown again.
3. Wait about two minutes for provisioning.

## 2. Enable PostGIS

The schema won't apply without it.

**Database → Extensions →** search `postgis` **→ enable**.

(Migration `0001` also issues `create extension if not exists postgis`, but
enabling it through the dashboard first avoids a permissions edge case on some
projects.)

## 3. Link this repo to the project

Grab the project ref from your dashboard URL:
`supabase.com/dashboard/project/`**`<this-part>`**

```bash
npx supabase login          # opens a browser, one time
npx supabase link --project-ref <your-project-ref>
```

It will ask for the database password from step 1.

## 4. Apply the schema

```bash
npx supabase db push
```

This runs migrations `0001`–`0006` in order. Expect roughly 15 seconds.

Verify in **Database → Tables**: you should see `users`, `venues`, `drops`,
`vouchers`, `redemptions`, `merchant_users`, `user_xp`, `quests` and the rest.

## 5. Seed test data

```bash
npx supabase db execute --file supabase/seed.sql
```

That creates 6 Tbilisi venues, 6 drops (4 live, 1 scheduled, 1 expired),
5 quests and 4 badges — and materialises the voucher rows.

Sanity check, in the SQL editor:

```sql
-- Should return 5 rows: the expired drop is correctly excluded.
select title_en, rarity, status,
       (select count(*) from vouchers v
         where v.drop_id = d.id and v.status = 'available') as available
from drops d
where ends_at > now()
order by starts_at;
```

## 6. Test the fog of war

`nearby_drops()` is the core map query. Run it standing at Fabrika:

```sql
-- Fabrika's own coordinates: this drop should come back revealed = true.
select title_en, round(distance_m) as metres, revealed, remaining
from nearby_drops(41.7060, 44.7975, 3000);
```

Then from Freedom Square, ~1.7 km away:

```sql
-- Same drops, but title_en is NULL on the distant ones. That's the fog of war
-- working: the data never leaves the database, so it can't be read off the wire.
select coalesce(title_en, '???') as title,
       round(distance_m) as metres, revealed
from nearby_drops(41.6934, 44.8015, 3000);
```

## 7. Get your API keys

**Project Settings → API**. You need two values:

| Value | Used by | Safe to expose? |
|---|---|---|
| Project URL | both apps | Yes |
| `anon` public key | both apps | Yes — RLS is what protects the data |
| `service_role` key | nothing in this project | **No. Never ship it.** |

The `service_role` key bypasses RLS completely. There is no code in this repo
that needs it; if you ever find yourself reaching for it, that's a sign a policy
is wrong instead.

Copy the values into `.env` files:

```bash
cp apps/mobile/.env.example    apps/mobile/.env
cp apps/merchant/.env.example  apps/merchant/.env.local
```

Both are gitignored.

## 8. Make yourself a merchant

Sign up through the merchant portal, then find your user id:

```sql
select id, email from auth.users order by created_at desc limit 1;
```

Link it to a venue as owner:

```sql
insert into public.merchant_users (user_id, venue_id, role)
values ('<your-auth-uid>', '11111111-1111-1111-1111-111111111101', 'owner');
```

You can now create drops for Fabrika Coffee Room from the portal.

---

## Verifying the concurrency design

Worth doing before building further, since everything else rests on it.

```sql
-- 20 vouchers on the tea house drop. Fire 200 concurrent claims at it and
-- exactly 20 should succeed.
select count(*) from vouchers
where drop_id = '22222222-2222-2222-2222-222222222204'
  and status = 'available';
```

With [k6](https://k6.io) or `pgbench -c 200 -j 8 -t 1`, call `claim_voucher()`
as 200 different users. The assertion is simple and absolute: **exactly 20
succeed, 180 get `SOLD_OUT`, and no voucher has two owners.**

If that test passes, the riskiest assumption in the system is proven.

---

## Troubleshooting

**`extension "postgis" is not available`** — do step 2 first.

**`permission denied for schema cron`** — `pg_cron` needs enabling in
**Database → Extensions** too. Without it the schema still applies, but expired
voucher holds are never swept back into the pool.

**`db push` says "no migrations to apply"** — the CLI thinks they already ran.
Check with `npx supabase migration list`.

**Georgian text shows as boxes** — the database is fine (Postgres is UTF-8 by
default); it's a missing font on whatever is displaying it.
