-- RLS and function checks. Run after migrations + seed. Fails loudly on the first broken expectation.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'operator@test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner-a@test'),
  ('00000000-0000-0000-0000-0000000000c1', 'owner-b@test');
update profiles set is_operator = true where id = '00000000-0000-0000-0000-0000000000a1';

insert into vendors (id, name, slug) values
  ('11111111-0000-0000-0000-000000000001', 'Vendor A', 'vendor-a'),
  ('22222222-0000-0000-0000-000000000002', 'Vendor B', 'vendor-b');
insert into vendor_members values
  ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('22222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'owner');
insert into products (id, vendor_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'A shoe'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'B bag');

-- settings row was auto-created
do $$ begin
  assert (select count(*) from vendor_settings where vendor_id in
    ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002')) = 2, 'settings trigger';
end $$;

-- owner A sees only vendor A
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select count(*) from vendors where slug in ('vendor-a','vendor-b')) = 1, 'owner sees one vendor';
  assert (select count(*) from products where name in ('A shoe','B bag')) = 1, 'owner sees own products';
  assert not exists (select 1 from products where name = 'B bag'), 'no cross-tenant read';
end $$;
do $$ begin
  begin
    insert into products (vendor_id, name) values ('22222222-0000-0000-0000-000000000002', 'sneaky');
    raise exception 'cross-tenant insert should fail';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into vendors (name, slug) values ('x', 'x');
    raise exception 'non-operator vendor insert should fail';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    perform public.claim_jobs(1);
    raise exception 'claim_jobs must not be callable by users';
  exception when insufficient_privilege then null;
  end;
end $$;
-- a user cannot promote themselves to operator
do $$ begin
  begin
    update profiles set is_operator = true where id = '00000000-0000-0000-0000-0000000000b1';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  assert not (select is_operator from profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'self-promotion blocked';
end $$;

-- operator sees all
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from vendors where slug in ('vendor-a','vendor-b')) = 2, 'operator sees all';
end $$;
reset role;

-- place_order reserves stock, numbers per vendor, and mark_order_paid is idempotent
insert into product_variants (id, vendor_id, product_id, label, price_kobo, stock) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Size 42', 2000000, 5);
insert into delivery_zones (id, vendor_id, name, fee_kobo) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Mainland', 250000);
do $$
declare
  o orders; o2 orders;
  items jsonb := '[{"variant_id":"cccccccc-0000-0000-0000-000000000001","quantity":2}]';
  v uuid := '11111111-0000-0000-0000-000000000001';
  z uuid := 'eeeeeeee-0000-0000-0000-000000000001';
begin
  o := public.place_order(v, null, null, items, z, '1 Test St', 'Ada', '0801', null);
  assert o.number = 1001, 'first order number per vendor';
  assert o.total_kobo = 4250000, 'total = items + delivery';
  assert (select stock from product_variants where id = 'cccccccc-0000-0000-0000-000000000001') = 3, 'stock reserved';

  assert public.mark_order_paid(o.id, 'paystack', 'ref-1', 4250000) = true, 'first pay';
  assert public.mark_order_paid(o.id, 'paystack', 'ref-1', 4250000) = false, 'retry no-op';
  assert (select stock from product_variants where id = 'cccccccc-0000-0000-0000-000000000001') = 3, 'paying does not touch stock';
  assert (select count(*) from payments where reference = 'ref-1') = 1, 'one payment row';

  o2 := public.place_order(v, null, null, items, z, '1 Test St', 'Ada', '0801', null);
  assert o2.number = 1002, 'numbers count up per vendor';
  begin
    perform public.place_order(v, null, null, items, z, '1 Test St', 'Ada', '0801', null);
    raise exception 'ordering more than stock should fail';
  exception when raise_exception then
    assert sqlerrm like 'Only 1 left%', sqlerrm;
  end;
  assert (select count(*) from orders where vendor_id = v) = 2, 'failed order left nothing behind';

  update orders set status = 'cancelled' where id = o2.id;
  assert (select stock from product_variants where id = 'cccccccc-0000-0000-0000-000000000001') = 3, 'cancel restores stock';

  -- pay on delivery: paid while already out for delivery keeps the delivery status
  o2 := public.place_order(v, null, null, items, z, '1 Test St', 'Ada', '0801', null);
  update orders set status = 'out_for_delivery' where id = o2.id;
  assert public.mark_order_paid(o2.id, 'cod', 'cod-1', 4250000) = true, 'cod paid';
  assert (select status from orders where id = o2.id) = 'out_for_delivery', 'status kept';
  assert (select paid_at from orders where id = o2.id) is not null, 'paid_at set';

  -- another vendor starts its own numbering
  insert into product_variants (id, vendor_id, product_id, label, price_kobo, stock) values
    ('cccccccc-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'One size', 500000, 1);
  insert into delivery_zones (id, vendor_id, name, fee_kobo) values
    ('eeeeeeee-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Abuja', 100000);
  o := public.place_order('22222222-0000-0000-0000-000000000002', null, null,
    '[{"variant_id":"cccccccc-0000-0000-0000-000000000002","quantity":1}]', 'eeeeeeee-0000-0000-0000-000000000002', 'x', 'y', 'z', null);
  assert o.number = 1001, 'vendor B numbering is separate';
  begin
    perform public.place_order('22222222-0000-0000-0000-000000000002', null, null, items, 'eeeeeeee-0000-0000-0000-000000000002', 'x', 'y', 'z', null);
    raise exception 'cross-vendor variant should fail';
  exception when raise_exception then
    assert sqlerrm like 'Option % is not available', sqlerrm;
  end;
end $$;

-- job queue
insert into jobs (type, payload) values ('noop', '{}'), ('noop', '{}');
do $$ declare n int; j bigint; begin
  select count(*) into n from public.claim_jobs(10);
  assert n = 2, 'claimed two';
  select id into j from jobs limit 1;
  perform public.fail_job(j, 'boom');
  assert (select status from jobs where id = j) = 'queued', 'requeued after failure';
  assert (select run_at from jobs where id = j) > now(), 'backoff applied';
end $$;

-- slot keys are released on completion, permanent keys are not
insert into jobs (type, dedupe_key) values ('noop', 'slot:ai:1'), ('noop', 'once:remind:1');
do $$ declare r record; begin
  for r in select * from public.claim_jobs(10) loop perform public.complete_job(r.id); end loop;
  assert not exists (select 1 from jobs where dedupe_key = 'slot:ai:1'), 'slot released';
  assert exists (select 1 from jobs where dedupe_key = 'once:remind:1'), 'once key kept';
end $$;

select 'RLS + function tests passed' as result;
