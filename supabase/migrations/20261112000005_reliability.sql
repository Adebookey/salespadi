-- Reliability fixes: stock is reserved when an order is placed, order numbers are per vendor,
-- pay-on-delivery can be paid at any stage, broadcasts track recipients, Instagram tokens are refreshed,
-- and each vendor has a daily AI budget.

alter table channels add column token_refreshed_at timestamptz not null default now();
alter table vendors add column ai_daily_budget_usd numeric(8, 2) not null default 2;

-- Order numbers count up per vendor instead of across the whole platform.
alter table orders drop constraint orders_number_key;
alter table orders add constraint orders_vendor_number_key unique (vendor_id, number);

-- One row per customer a broadcast has gone to, so a retried job never sends twice.
create table broadcast_recipients (
  broadcast_id uuid not null references broadcasts (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (broadcast_id, conversation_id)
);
alter table broadcast_recipients enable row level security;
comment on table public.broadcast_recipients is 'Service role only: RLS enabled with no policies on purpose.';

-- Creates an order atomically: checks and reserves stock, numbers the order, adds items and totals.
-- p_items: [{ "variant_id": "...", "quantity": 1 }]
create or replace function public.place_order(
  p_vendor uuid, p_customer uuid, p_conversation uuid, p_items jsonb, p_zone uuid,
  p_address text, p_name text, p_phone text, p_notes text)
returns orders language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  z delivery_zones%rowtype;
  it record;
  v record;
  subtotal integer := 0;
  next_number integer;
begin
  perform 1 from vendors where id = p_vendor for update;  -- one order at a time per vendor
  if not found then raise exception 'Vendor not found'; end if;

  select * into z from delivery_zones where id = p_zone and vendor_id = p_vendor;
  if not found then raise exception 'Unknown delivery zone'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The order has no items';
  end if;

  select coalesce(max(number), 1000) + 1 into next_number from orders where vendor_id = p_vendor;

  insert into orders (vendor_id, number, customer_id, conversation_id, status, delivery_zone_id,
                      delivery_address, customer_name, customer_phone, notes)
  values (p_vendor, next_number, p_customer, p_conversation, 'pending', z.id, p_address, p_name, p_phone, p_notes)
  returning * into o;

  for it in
    select e ->> 'variant_id' as variant_id, (e ->> 'quantity')::integer as quantity
      from jsonb_array_elements(p_items) e
     order by 1
  loop
    if it.quantity is null or it.quantity < 1 then raise exception 'Invalid quantity'; end if;

    select pv.id, pv.label, pv.price_kobo, pv.stock, p.id as product_id, p.name, p.is_active into v
      from product_variants pv join products p on p.id = pv.product_id
     where pv.id::text = it.variant_id and pv.vendor_id = p_vendor
       for update of pv;
    if not found or not v.is_active then raise exception 'Option % is not available', it.variant_id; end if;
    if v.stock = 0 then raise exception '% (%) is sold out', v.name, v.label; end if;
    if v.stock < it.quantity then raise exception 'Only % left of % (%)', v.stock, v.name, v.label; end if;

    update product_variants set stock = stock - it.quantity where id = v.id;
    insert into order_items (vendor_id, order_id, product_id, variant_id, name, variant_label, unit_price_kobo, quantity)
    values (p_vendor, o.id, v.product_id, v.id, v.name, v.label, v.price_kobo, it.quantity);
    subtotal := subtotal + v.price_kobo * it.quantity;
  end loop;

  update orders
     set subtotal_kobo = subtotal, delivery_fee_kobo = z.fee_kobo, total_kobo = subtotal + z.fee_kobo
   where id = o.id
  returning * into o;
  return o;
end $$;

revoke execute on function public.place_order(uuid, uuid, uuid, jsonb, uuid, text, text, text, text)
  from public, anon, authenticated;

-- Cancelling an order puts its reserved stock back.
create or replace function public.restore_stock_on_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update product_variants v
       set stock = v.stock + i.quantity
      from order_items i
     where i.order_id = new.id and i.variant_id = v.id;
  end if;
  return new;
end $$;
revoke execute on function public.restore_stock_on_cancel() from public, anon, authenticated;

create trigger orders_restore_stock after update of status on orders
  for each row execute function public.restore_stock_on_cancel();

-- Marks an order paid exactly once. Stock was already reserved by place_order, so it is not touched here.
-- An order already on its way (pay on delivery) keeps its delivery status and just becomes paid.
create or replace function public.mark_order_paid(
  p_order_id uuid, p_method payment_method, p_reference text, p_amount_kobo integer,
  p_confirmed_by uuid default null, p_raw jsonb default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'order % not found', p_order_id; end if;

  insert into payments (vendor_id, order_id, method, reference, amount_kobo, status, confirmed_by, raw)
  values (o.vendor_id, o.id, p_method, p_reference, p_amount_kobo, 'success', p_confirmed_by, p_raw)
  on conflict (reference) do update
    set status = 'success',
        confirmed_by = coalesce(excluded.confirmed_by, payments.confirmed_by),
        raw = coalesce(excluded.raw, payments.raw);

  if o.paid_at is not null or o.status = 'cancelled' then
    return false;  -- already paid (webhook retries land here) or cancelled
  end if;

  update orders
     set paid_at = now(), payment_method = p_method,
         status = case when status in ('pending', 'awaiting_payment') then 'paid'::order_status else status end
   where id = o.id;
  return true;
end $$;
