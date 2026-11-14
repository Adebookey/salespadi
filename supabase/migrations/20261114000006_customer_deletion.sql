-- Erases one customer's personal data for a vendor (Nigeria Data Protection Act / Meta data-deletion requests).
-- Orders stay for the vendor's accounts, but without the customer's name, phone or address.
-- Returns the storage paths of the customer's photos, voice notes and receipts so the app can delete the files.
create or replace function public.delete_customer_data(p_vendor uuid, p_customer uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  c customers%rowtype;
  paths text[];
begin
  select * into c from customers where id = p_customer and vendor_id = p_vendor for update;
  if not found then raise exception 'Customer not found'; end if;

  select coalesce(array_agg(distinct p), '{}') into paths from (
    select m.media_url as p
      from messages m join conversations cv on cv.id = m.conversation_id
     where cv.customer_id = c.id and m.direction = 'in' and m.media_url is not null and m.media_url not like 'http%'
    union
    select py.proof_url
      from payments py join orders o on o.id = py.order_id
     where o.customer_id = c.id and py.proof_url is not null
  ) s;

  update payments py set proof_url = null, raw = null
    from orders o where o.id = py.order_id and o.customer_id = c.id;

  update orders
     set customer_name = 'Deleted customer', customer_phone = null, delivery_address = null, notes = null
   where customer_id = c.id;

  -- Raw webhook copies of their messages (normally cleared after 30 days anyway).
  delete from webhook_events
   where source in ('whatsapp', 'instagram') and payload::text like '%' || c.external_user_id || '%';

  -- Conversations, messages and restock requests go with the customer row (on delete cascade);
  -- orders keep their totals but lose the link (on delete set null).
  delete from customers where id = c.id;

  return paths;
end $$;

revoke execute on function public.delete_customer_data(uuid, uuid) from public, anon, authenticated;
