-- Tbilisi Quest :: 0042 :: coins, and a shop to spend them in
--
-- The store is deliberately **not** a real-money shop, and that is a decision
-- rather than a stage we have not reached yet:
--
--   Most of these players are minors. Taking their money for digital goods is a
--   different business with different law around it -- refund rights, parental
--   consent, and Play's rule that digital goods inside an Android app must go
--   through Play Billing and its cut. None of that is worth carrying to sell a
--   hoodie for a cartoon creature.
--
--   And the currency we already have is better. Coins are earned by redeeming
--   vouchers, which is the exact behaviour the venues are paying for. A player
--   who wants the Mtatsminda background walks into a shop to get it.
--
-- Balance is a sum over a ledger rather than a column, for the same reason
-- seasonal XP is: a counter that drifts cannot be reconciled, and a ledger can
-- always be read back and explained.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. The ledger
-- ---------------------------------------------------------------------------
create table if not exists public.coin_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      int  not null,
  reason      text not null,
  subject_id  uuid,
  occurred_at timestamptz not null default now()
);

create index if not exists coin_events_user_idx on public.coin_events (user_id, occurred_at desc);

alter table public.coin_events enable row level security;
drop policy if exists coin_events_read_own on public.coin_events;
create policy coin_events_read_own on public.coin_events
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

create or replace function public.my_coins()
returns int
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(sum(amount), 0)::int
  from public.coin_events where user_id = auth.uid();
$$;

grant execute on function public.my_coins() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Earning
-- ---------------------------------------------------------------------------
-- Redeeming pays, claiming does not. A claim is a tap on a phone; a redemption
-- is somebody standing at a counter, which is the only thing that earns the
-- business any money and so the only thing that earns the player any coins.
create or replace function public.coins_on_redemption()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.user_id is not null then
    insert into public.coin_events (user_id, amount, reason, subject_id)
    values (new.user_id, 50, 'redemption', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists redemptions_pay_coins on public.redemptions;
create trigger redemptions_pay_coins
  after insert on public.redemptions
  for each row execute function public.coins_on_redemption();

-- ---------------------------------------------------------------------------
-- 3. The shop
-- ---------------------------------------------------------------------------
create table if not exists public.store_items (
  code       text primary key references public.cosmetics(code) on delete cascade,
  price      int  not null check (price > 0),
  sort_order int  not null default 100,
  is_active  boolean not null default true,
  added_at   timestamptz not null default now()
);

alter table public.store_items enable row level security;
drop policy if exists store_items_read on public.store_items;
create policy store_items_read on public.store_items
  for select to authenticated using (is_active);

-- The backgrounds. Places these players already stand in, which is the whole
-- reason a background is worth having: it says where you spend your time.
insert into public.cosmetics (code, kind, title_ka, title_en, style_key, rarity) values
  ('bg_mtatsminda', 'background', 'მთაწმინდის პარკი',  'Mtatsminda Park',  'mtatsminda', 'rare'),
  ('bg_rike',       'background', 'რიყის პარკი',       'Rike Park',        'rike',       'common'),
  ('bg_fabrika',    'background', 'ფაბრიკის ეზო',      'Fabrika yard',     'fabrika',    'rare'),
  ('bg_sololaki',   'background', 'სოლოლაკის ეზო',     'Sololaki yard',    'sololaki',   'common'),
  ('bg_bridge',     'background', 'მშვიდობის ხიდი',    'Bridge of Peace',  'bridge',     'legendary'),
  ('bg_funicular',  'background', 'ფუნიკულიორი ღამით', 'Funicular at night','funinight', 'legendary')
on conflict (code) do update
  set title_ka = excluded.title_ka,
      title_en = excluded.title_en,
      style_key = excluded.style_key,
      rarity   = excluded.rarity;

-- Priced off rarity, and off what they cost to reach: 50 coins a redemption
-- means a common background is four visits and the Bridge of Peace is twenty.
insert into public.store_items (code, price, sort_order) values
  ('bg_rike',        200, 10),
  ('bg_sololaki',    200, 20),
  ('bg_mtatsminda',  500, 30),
  ('bg_fabrika',     500, 40),
  ('bg_bridge',     1000, 50),
  ('bg_funicular',  1000, 60)
on conflict (code) do update
  set price = excluded.price, sort_order = excluded.sort_order, is_active = true;

-- What the store screen reads: the catalogue, the price, and whether this
-- player already owns it.
create or replace function public.store_catalogue()
returns table (
  code      text,
  kind      text,
  title_ka  text,
  title_en  text,
  style_key text,
  rarity    text,
  price     int,
  owned     boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.code,
    c.kind::text,
    c.title_ka,
    c.title_en,
    c.style_key,
    c.rarity::text,
    s.price,
    uc.user_id is not null
  from public.store_items s
  join public.cosmetics c on c.code = s.code
  left join public.user_cosmetics uc
    on uc.code = c.code and uc.user_id = auth.uid()
  where s.is_active
  order by s.sort_order, c.code;
$$;

grant execute on function public.store_catalogue() to authenticated;

-- Buying. The ledger entry and the grant are one statement each inside one
-- function, so a player cannot be charged for something they did not get.
create or replace function public.buy_cosmetic(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price   int;
  v_balance int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform public.assert_player_active();

  select s.price into v_price
  from public.store_items s
  where s.code = p_code and s.is_active;

  if v_price is null then
    raise exception 'NOT_FOR_SALE';
  end if;

  if exists (
    select 1 from public.user_cosmetics uc
    where uc.user_id = auth.uid() and uc.code = p_code
  ) then
    raise exception 'ALREADY_OWNED';
  end if;

  -- Locked against the player's own rows so two taps cannot both pass the
  -- balance check and spend the same coins twice.
  select coalesce(sum(amount), 0)::int into v_balance
  from public.coin_events where user_id = auth.uid() for update;

  if v_balance < v_price then
    raise exception 'NOT_ENOUGH_COINS';
  end if;

  insert into public.coin_events (user_id, amount, reason)
  values (auth.uid(), -v_price, 'store:' || p_code);

  insert into public.user_cosmetics (user_id, code, source)
  values (auth.uid(), p_code, 'store')
  on conflict (user_id, code) do nothing;

  return jsonb_build_object(
    'code', p_code,
    'spent', v_price,
    'balance', v_balance - v_price
  );
end;
$$;

grant execute on function public.buy_cosmetic(text) to authenticated;

-- Backfill: redemptions that happened before coins existed still earned them.
insert into public.coin_events (user_id, amount, reason, subject_id, occurred_at)
select r.user_id, 50, 'redemption', r.id, r.redeemed_at
from public.redemptions r
where r.user_id is not null
  and not exists (
    select 1 from public.coin_events e
    where e.reason = 'redemption' and e.subject_id = r.id
  );
