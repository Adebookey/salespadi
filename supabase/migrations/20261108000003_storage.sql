-- Storage buckets: product photos are public (sent to customers on WhatsApp/Instagram),
-- chat media (customer photos, voice notes, transfer receipts) is private.
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('chat-media', 'chat-media', false)
  on conflict (id) do nothing;

-- Object paths start with the vendor id: "<vendor_id>/<file>"
create policy "vendor members upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.can_access_vendor(((storage.foldername(name))[1])::uuid));
create policy "vendor members update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.can_access_vendor(((storage.foldername(name))[1])::uuid));
create policy "vendor members delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.can_access_vendor(((storage.foldername(name))[1])::uuid));
-- Customer photos, voice notes and transfer receipts. Written by the worker (service role) only.
create policy "vendor members read chat media" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.can_access_vendor(((storage.foldername(name))[1])::uuid));
