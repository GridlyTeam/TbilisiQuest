-- Tbilisi Quest :: 0043 :: cosmetics that come and go with the season
--
-- The ask is Fortnite's rhythm: a set of things this season, a different set
-- next season, and a reason to come back for them. The trap is doing it the way
-- Fortnite does, with full outfits, because an outfit has to be drawn once per
-- body shape and every shape we add multiplies every season that follows.
--
-- So content is split by whether it touches the body:
--
--   SHAPE-BOUND  outfits. One render per shape. Expensive. Rare -- one or two a
--                season, treated as the headline item.
--   ANCHORED     hats, back pieces, trails, auras, pins, stickers, backgrounds,
--                titles. Drawn once and hung off a fixed point on any body, so
--                they cost the same whether there are three shapes or ten.
--
-- A season is then mostly anchored items with one shape-bound headline, and the
-- cost of a season stops growing when the shape catalogue does.
--
-- The rotation rule that matters, and the one Fortnite gets right: **leaving
-- the season never takes anything away from anyone.** Availability windows
-- decide what can still be acquired. Nothing ever removes a row from
-- user_cosmetics. A player who owns the first season's hoodie owns it in the
-- tenth.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. When a cosmetic can be got
-- ---------------------------------------------------------------------------
alter table public.cosmetics
  add column if not exists season_code      text,
  add column if not exists available_from   timestamptz,
  add column if not exists available_until  timestamptz,
  -- Anchored items cost one render whatever the body; shape-bound ones cost one
  -- per shape. Recorded on the item so the cost of a season can be counted
  -- before it is commissioned.
  add column if not exists shape_bound      boolean not null default false;

-- Outfits are the only thing we have that has to fit a body.
update public.cosmetics set shape_bound = true where kind = 'outfit';

create or replace function public.cosmetic_is_available(p_code text)
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select coalesce((
    select (c.available_from  is null or c.available_from  <= now())
       and (c.available_until is null or c.available_until >  now())
    from public.cosmetics c where c.code = p_code
  ), false);
$$;

grant execute on function public.cosmetic_is_available(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The locker shows what you missed
-- ---------------------------------------------------------------------------
-- A vaulted item stays in the locker, greyed, saying which season it belonged
-- to. Hiding it would make the collection look complete when it is not, and the
-- gap is the reason to be here for the next one.
-- Dropped first: `create or replace` cannot widen a function's result columns,
-- and two more are being added.
drop function if exists public.my_cosmetics();

create or replace function public.my_cosmetics()
returns table (
  code        text,
  kind        text,
  title_ka    text,
  title_en    text,
  style_key   text,
  rarity      text,
  owned       boolean,
  unlocked_at timestamptz,
  source      text,
  available   boolean,
  season_code text
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
    uc.user_id is not null,
    uc.unlocked_at,
    uc.source,
    (c.available_from  is null or c.available_from  <= now())
      and (c.available_until is null or c.available_until >  now()),
    c.season_code
  from public.cosmetics c
  left join public.user_cosmetics uc
    on uc.code = c.code and uc.user_id = auth.uid()
  -- Owned first is wrong here: the locker is a collection, so it reads by kind,
  -- and inside a kind the things you have come before the things you do not.
  order by c.kind, (uc.user_id is null), c.code;
$$;

grant execute on function public.my_cosmetics() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The store rotates
-- ---------------------------------------------------------------------------
-- store_items keeps its own window as well: an item can exist all year and be
-- on sale for a fortnight, which is how a shop stays worth opening.
alter table public.store_items
  add column if not exists on_sale_from  timestamptz,
  add column if not exists on_sale_until timestamptz;

drop function if exists public.store_catalogue();

create or replace function public.store_catalogue()
returns table (
  code       text,
  kind       text,
  title_ka   text,
  title_en   text,
  style_key  text,
  rarity     text,
  price      int,
  owned      boolean,
  leaves_at  timestamptz
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
    uc.user_id is not null,
    -- Whichever ends first is the one the countdown should show.
    least(s.on_sale_until, c.available_until)
  from public.store_items s
  join public.cosmetics c on c.code = s.code
  left join public.user_cosmetics uc
    on uc.code = c.code and uc.user_id = auth.uid()
  where s.is_active
    and (s.on_sale_from  is null or s.on_sale_from  <= now())
    and (s.on_sale_until is null or s.on_sale_until >  now())
    and (c.available_from  is null or c.available_from  <= now())
    and (c.available_until is null or c.available_until >  now())
  order by s.sort_order, c.code;
$$;

grant execute on function public.store_catalogue() to authenticated;

-- Buying respects the window too. The catalogue already hides what has left,
-- but a client holding an old list must not be able to buy from it.
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
  where s.code = p_code
    and s.is_active
    and (s.on_sale_from  is null or s.on_sale_from  <= now())
    and (s.on_sale_until is null or s.on_sale_until >  now());

  if v_price is null or not public.cosmetic_is_available(p_code) then
    raise exception 'NOT_FOR_SALE';
  end if;

  if exists (
    select 1 from public.user_cosmetics uc
    where uc.user_id = auth.uid() and uc.code = p_code
  ) then
    raise exception 'ALREADY_OWNED';
  end if;

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

-- ---------------------------------------------------------------------------
-- 4. Turning a season over
-- ---------------------------------------------------------------------------
-- One call an operator makes when a season ends: everything tagged with the
-- outgoing season stops being obtainable, and everything tagged with the
-- incoming one starts. It never touches user_cosmetics, so nobody loses
-- anything they earned.
create or replace function public.rotate_season_cosmetics(
  p_closing text,
  p_opening text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_closed  int;
  v_opened  int;
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  update public.cosmetics
  set available_until = now()
  where season_code = p_closing
    and (available_until is null or available_until > now());
  get diagnostics v_closed = row_count;

  update public.cosmetics
  set available_from  = now(),
      available_until = null
  where season_code = p_opening;
  get diagnostics v_opened = row_count;

  return jsonb_build_object('vaulted', v_closed, 'released', v_opened);
end;
$$;

grant execute on function public.rotate_season_cosmetics(text, text) to authenticated;

-- What a season costs to draw, before anyone commissions it. Shape-bound items
-- are counted once per shape, which is the number that surprises people.
create or replace function public.season_art_cost(p_season text)
returns table (
  items         int,
  anchored      int,
  shape_bound   int,
  shapes        int,
  renders_total int
)
language sql
stable
set search_path = public, extensions
as $$
  with shapes as (
    select greatest(count(*), 1)::int as n
    from public.cosmetics where kind = 'shape'
  ),
  items as (
    select
      count(*)::int as total,
      count(*) filter (where not shape_bound)::int as anchored,
      count(*) filter (where shape_bound)::int     as bound
    from public.cosmetics where season_code = p_season
  )
  select
    items.total,
    items.anchored,
    items.bound,
    shapes.n,
    (items.anchored + items.bound * shapes.n)::int
  from items, shapes;
$$;

grant execute on function public.season_art_cost(text) to authenticated;
