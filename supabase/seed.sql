-- Demo vendor: a Lagos shoe seller with 10 products. Safe to run more than once.
insert into vendors (id, name, slug, status, city, instagram_handle, business_phone, owner_whatsapp,
                     bank_name, bank_account_name, bank_account_number, monthly_fee_kobo, setup_fee_kobo)
values ('5e1e0000-0000-4000-8000-000000000001', 'Kicks by Tolu', 'kicks-by-tolu', 'onboarding', 'Lagos',
        'kicksbytolu', '2348012345678', '2348012345678', 'GTBank', 'Kicks by Tolu Ventures', '0123456789',
        2500000, 5000000)
on conflict (id) do nothing;

update vendor_settings set
  tone = 'Warm, upbeat and brief, like a friendly Lagos shop assistant. Call customers "dear" sometimes. Use at most one emoji per message.',
  pidgin_enabled = true,
  greeting = 'Hello dear, welcome to Kicks by Tolu! 👟 What are you shopping for today?',
  sample_replies = array[
    'Yes dear, we have it in size 42 and 43. It''s ₦28,000. Should I reserve one for you?',
    'Delivery to Lekki is ₦3,500 and takes 1-2 days.'
  ],
  policies = E'Exchange within 3 days if the size does not fit, shoe must be unworn with the box.\nNo refunds on sale items.\nWe deliver Monday to Saturday.\nPayment before delivery for all orders outside Lagos.',
  faqs = '[
    {"q":"Are your shoes original?","a":"Yes, all our shoes are original. We import directly and you can check them on delivery."},
    {"q":"Do you have a physical store?","a":"We are online only for now, but you can pick up from Yaba by appointment."},
    {"q":"How do I know my size?","a":"Tell us your usual size in any brand and we will guide you. Our sizes are EU sizes."}
  ]',
  handoff_rules = 'Hand off for bulk orders above 10 pairs, custom colours, complaints about a delivered order, and any refund request.'
where vendor_id = '5e1e0000-0000-4000-8000-000000000001';

insert into delivery_zones (id, vendor_id, name, areas, fee_kobo, eta) values
  ('5e1e0000-0000-4000-8000-0000000000d1', '5e1e0000-0000-4000-8000-000000000001', 'Lagos Mainland',
   '{Yaba,Surulere,Ikeja,Maryland,Gbagada,Ogba,Ojota,Ketu,Oshodi,Mushin}', 250000, 'Same day or next day'),
  ('5e1e0000-0000-4000-8000-0000000000d2', '5e1e0000-0000-4000-8000-000000000001', 'Lagos Island',
   '{Lekki,Ajah,VI,"Victoria Island",Ikoyi,Obalende,Oniru,Chevron}', 350000, '1-2 days'),
  ('5e1e0000-0000-4000-8000-0000000000d3', '5e1e0000-0000-4000-8000-000000000001', 'Outside Lagos',
   '{Abuja,Ibadan,"Port Harcourt",Enugu,Benin,Abeokuta}', 600000, '2-4 days by courier')
on conflict (id) do nothing;

with p(id, name, description, category, tags, price, sizes, stock) as (values
  ('5e1e0000-0000-4000-8000-000000000101'::uuid, 'Classic White Sneakers', 'Clean all-white leather low-top sneakers. Goes with everything.', 'Sneakers', '{white,sneakers,leather,unisex}'::text[], 2800000, '{40,41,42,43,44}'::text[], 4),
  ('5e1e0000-0000-4000-8000-000000000102', 'Black Chelsea Boots', 'Suede Chelsea boots with elastic side panels. Smart-casual.', 'Boots', '{black,boots,chelsea,suede,men}', 3500000, '{41,42,43,44,45}', 3),
  ('5e1e0000-0000-4000-8000-000000000103', 'Brown Leather Loafers', 'Genuine leather penny loafers, brown. Perfect for office and owambe.', 'Loafers', '{brown,loafers,leather,men,office}', 3200000, '{40,41,42,43,44,45}', 3),
  ('5e1e0000-0000-4000-8000-000000000104', 'Red Block Heels', 'Red patent block heels, 3-inch heel. Comfortable for all-day events.', 'Heels', '{red,heels,women,party}', 1800000, '{37,38,39,40,41}', 2),
  ('5e1e0000-0000-4000-8000-000000000105', 'Nude Pointed Pumps', 'Nude stiletto pumps, 4-inch heel.', 'Heels', '{nude,pumps,heels,women,office}', 2200000, '{37,38,39,40}', 2),
  ('5e1e0000-0000-4000-8000-000000000106', 'Palm Slippers (Men)', 'Handmade leather palm slippers, black and brown.', 'Slippers', '{palm,slippers,leather,men,native}', 1200000, '{41,42,43,44,45}', 6),
  ('5e1e0000-0000-4000-8000-000000000107', 'Running Trainers', 'Lightweight mesh running trainers, grey/neon.', 'Sneakers', '{running,trainers,sports,gym,unisex}', 2500000, '{39,40,41,42,43,44}', 3),
  ('5e1e0000-0000-4000-8000-000000000108', 'Kids Velcro Sneakers', 'Easy velcro sneakers for kids, blue.', 'Kids', '{kids,children,sneakers,velcro,school}', 900000, '{28,30,32,34}', 5),
  ('5e1e0000-0000-4000-8000-000000000109', 'Ladies Flat Sandals', 'Gold strappy flat sandals.', 'Sandals', '{sandals,flat,gold,women}', 1000000, '{37,38,39,40,41}', 4),
  ('5e1e0000-0000-4000-8000-000000000110', 'Men''s Oxford Shoes', 'Black leather lace-up Oxfords. Wedding and office ready.', 'Formal', '{oxford,formal,black,leather,men,wedding}', 4000000, '{41,42,43,44,45}', 0)
)
, ins as (
  insert into products (id, vendor_id, name, description, category, tags)
  select id, '5e1e0000-0000-4000-8000-000000000001', name, description, category, tags from p
  on conflict (id) do nothing
  returning id
)
insert into product_variants (vendor_id, product_id, label, size, price_kobo, stock)
select '5e1e0000-0000-4000-8000-000000000001', p.id, 'Size ' || s, s, p.price, p.stock
  from p join ins on ins.id = p.id, unnest(p.sizes) s;

insert into product_images (vendor_id, product_id, url)
select '5e1e0000-0000-4000-8000-000000000001', p.id,
       'https://placehold.co/800x800/png?text=' || replace(p.name, ' ', '+')
  from products p
 where p.vendor_id = '5e1e0000-0000-4000-8000-000000000001'
   and not exists (select 1 from product_images i where i.product_id = p.id);
