-- Tenant isolation (RLS) and database functions.

-- ---------------------------------------------------------------- helpers
create or replace function public.is_operator()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_operator from profiles where id = auth.uid()), false);
$$;

create or replace function public.can_access_vendor(v uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_operator()
      or exists (select 1 from vendor_members m where m.vendor_id = v and m.user_id = auth.uid());
$$;

create or replace function public.is_vendor_owner(v uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_operator()
      or exists (select 1 from vendor_members m
                 where m.vendor_id = v and m.user_id = auth.uid() and m.role in ('owner', 'operator'));
$$;

-- new auth user -> profile row
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.phone)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger orders_touch before update on orders
  for each row execute function public.touch_updated_at();
create trigger vendor_settings_touch before update on vendor_settings
  for each row execute function public.touch_updated_at();

-- every vendor gets a settings row
create or replace function public.create_vendor_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into vendor_settings (vendor_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger vendors_settings after insert on vendors
  for each row execute function public.create_vendor_settings();

-- ---------------------------------------------------------------- jobs
-- Claims up to `batch` ready jobs. Jobs stuck in "running" for 10 minutes are retried.
create or replace function public.claim_jobs(batch integer default 10)
returns setof jobs language plpgsql security definer set search_path = public as $$
begin
  update jobs set status = 'queued', locked_at = null
   where status = 'running' and locked_at < now() - interval '10 minutes';

  return query
  update jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1
   where j.id in (
     select id from jobs
      where status = 'queued' and run_at <= now()
      order by run_at
      limit batch
      for update skip locked)
  returning j.*;
end $$;

-- Keys starting with "slot:" mean "at most one queued/running job of this kind"; they are released when
-- the job finishes so the next one can be queued. Other keys stay forever ("do this exactly once").
create or replace function public.complete_job(job_id bigint)
returns void language sql security definer set search_path = public as $$
  update jobs set status = 'done', locked_at = null, last_error = null,
         dedupe_key = case when dedupe_key like 'slot:%' then null else dedupe_key end
   where id = job_id;
$$;

-- Exponential backoff: 30s, 2m, 8m, 32m ... then failed.
create or replace function public.fail_job(job_id bigint, err text)
returns void language sql security definer set search_path = public as $$
  update jobs
     set status = case when attempts >= max_attempts then 'failed'::job_status else 'queued'::job_status end,
         run_at = now() + (interval '30 seconds' * power(4, greatest(attempts - 1, 0))),
         locked_at = null,
         last_error = left(err, 2000),
         dedupe_key = case when attempts >= max_attempts and dedupe_key like 'slot:%' then null else dedupe_key end
   where id = job_id;
$$;

-- ---------------------------------------------------------------- payments
-- Marks an order paid exactly once and takes the items out of stock.
-- Returns true only on the call that actually changed the order.
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

  if o.status not in ('pending', 'awaiting_payment') then
    return false;  -- already paid (or cancelled); webhook retries land here
  end if;

  update orders set status = 'paid', paid_at = now(), payment_method = p_method where id = o.id;

  update product_variants v
     set stock = greatest(v.stock - i.quantity, 0)
    from order_items i
   where i.order_id = o.id and i.variant_id = v.id;

  return true;
end $$;

-- ---------------------------------------------------------------- reporting
create or replace function public.vendor_stats(p_vendor uuid, p_since timestamptz)
returns json language sql stable security definer set search_path = public as $$
  select case when not public.can_access_vendor(p_vendor) and auth.role() <> 'service_role' then null else
  json_build_object(
    'orders', (select count(*) from orders where vendor_id = p_vendor and created_at >= p_since),
    'paid_orders', (select count(*) from orders where vendor_id = p_vendor and paid_at >= p_since),
    'revenue_kobo', (select coalesce(sum(total_kobo), 0) from orders where vendor_id = p_vendor and paid_at >= p_since),
    'conversations', (select count(*) from conversations where vendor_id = p_vendor and last_inbound_at >= p_since),
    'needs_attention', (select count(*) from conversations where vendor_id = p_vendor and needs_attention),
    'awaiting_payment', (select count(*) from orders where vendor_id = p_vendor and status = 'awaiting_payment'),
    'ai_cost_usd_micros', (select coalesce(sum(cost_usd_micros), 0) from ai_usage where vendor_id = p_vendor and created_at >= p_since),
    'top_products', (select coalesce(json_agg(t), '[]'::json) from (
        select i.name, sum(i.quantity) as qty, sum(i.quantity * i.unit_price_kobo) as revenue_kobo
          from order_items i join orders o on o.id = i.order_id
         where o.vendor_id = p_vendor and o.paid_at >= p_since
         group by i.name order by qty desc limit 5) t)
  ) end;
$$;

-- ---------------------------------------------------------------- RLS
alter table profiles enable row level security;
create policy "own profile" on profiles for select using (id = auth.uid() or public.is_operator());
create policy "update own profile" on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and is_operator = (select p.is_operator from profiles p where p.id = auth.uid()));

alter table vendors enable row level security;
create policy "members read vendor" on vendors for select using (public.can_access_vendor(id));
create policy "operators create vendors" on vendors for insert with check (public.is_operator());
create policy "owners update vendor" on vendors for update using (public.is_vendor_owner(id));
create policy "operators delete vendors" on vendors for delete using (public.is_operator());

alter table vendor_members enable row level security;
create policy "read members" on vendor_members for select using (public.can_access_vendor(vendor_id));
create policy "owners manage members" on vendor_members for all
  using (public.is_vendor_owner(vendor_id)) with check (public.is_vendor_owner(vendor_id));

-- every other tenant table: members of the vendor (and operators) can read and write
do $$
declare t text;
begin
  foreach t in array array[
    'vendor_settings', 'channels', 'products', 'product_variants', 'product_images', 'delivery_zones',
    'customers', 'conversations', 'messages', 'orders', 'order_items', 'payments',
    'restock_requests', 'comment_triggers', 'broadcasts']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "tenant access" on %I for all using (public.can_access_vendor(vendor_id)) with check (public.can_access_vendor(vendor_id))', t);
  end loop;
end $$;

-- operator-only / read-only tables
alter table subscription_payments enable row level security;
create policy "operators only" on subscription_payments for all using (public.is_operator()) with check (public.is_operator());

alter table audit_log enable row level security;
create policy "read audit" on audit_log for select using (vendor_id is not null and public.can_access_vendor(vendor_id) or public.is_operator());

alter table ai_usage enable row level security;
create policy "read usage" on ai_usage for select using (public.can_access_vendor(vendor_id));

-- service role only (no policies => no access for anon/authenticated)
alter table jobs enable row level security;
alter table webhook_events enable row level security;

revoke execute on function public.claim_jobs(integer) from public, anon, authenticated;
revoke execute on function public.complete_job(bigint) from public, anon, authenticated;
revoke execute on function public.fail_job(bigint, text) from public, anon, authenticated;
revoke execute on function public.mark_order_paid(uuid, payment_method, text, integer, uuid, jsonb) from public, anon, authenticated;
