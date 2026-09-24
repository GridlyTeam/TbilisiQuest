-- Tbilisi Quest :: 0044 :: fix a lock that made the store unable to sell anything
--
-- buy_cosmetic() computed the balance with
--
--   select coalesce(sum(amount), 0)::int ... for update
--
-- and Postgres refuses that outright: a locking clause needs an identifiable
-- row per result row, and an aggregate collapses many rows into one, so there
-- is nothing to lock. Every call raised
--
--   0A000: FOR UPDATE is not allowed with aggregate functions
--
-- which is not one of the named errors the app checks for, so a player saw
-- the generic "that did not work" message on every attempt. The store has
-- been unable to sell anything since 0042 introduced it; 0043 carried the same
-- bug forward when it added the availability window.
--
-- The fix locks the player's own row on `users` instead of the ledger. That
-- still serialises two purchases from the same account -- the second one
-- blocks until the first's transaction ends and then reads the balance the
-- first one left -- which is all the guard was ever for: stopping one person
-- double-tapping buy and spending the same coins twice. It was never meant to
-- lock other people's rows, so users being a wider table than coin_events
-- costs nothing here.

set search_path = public, extensions;

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

  -- Locks the caller's own row, which a second concurrent call from the same
  -- account blocks on until this transaction commits or rolls back. That is
  -- the whole guard: it was never about locking other rows, only about not
  -- letting one player's two taps both read the balance before either spent it.
  perform 1 from public.users where id = auth.uid() for update;

  select coalesce(sum(amount), 0)::int into v_balance
  from public.coin_events where user_id = auth.uid();

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
