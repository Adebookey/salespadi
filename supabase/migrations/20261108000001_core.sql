-- SalesPadi core schema: tenants, catalog, conversations, orders, payments, jobs.
-- Money is stored in kobo (integer). Times are timestamptz; display in Africa/Lagos.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type member_role as enum ('owner', 'staff', 'operator');
create type channel_type as enum ('whatsapp', 'instagram');
create type channel_status as enum ('pending', 'active', 'disabled', 'error');
create type vendor_status as enum ('onboarding', 'live', 'paused');
create type conversation_status as enum ('ai', 'human', 'closed');
create type message_direction as enum ('in', 'out');
create type message_sender as enum ('customer', 'ai', 'human', 'system');
create type order_status as enum (
  'pending', 'awaiting_payment', 'paid', 'packed', 'out_for_delivery', 'delivered', 'cancelled'
);
create type payment_method as enum ('paystack', 'transfer', 'cod');
create type payment_status as enum ('pending', 'success', 'failed', 'rejected');
create type job_status as enum ('queued', 'running', 'done', 'failed');

-- ---------------------------------------------------------------- people
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  is_operator boolean not null default false,
  created_at timestamptz not null default now()
);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status vendor_status not null default 'onboarding',
  ai_enabled boolean not null default true,
  city text,
  instagram_handle text,
  business_phone text,
  owner_whatsapp text,                 -- where the daily summary and alerts go (E.164, no +)
  google_sheet_id text,
  paystack_secret_enc text,            -- vendor's own Paystack secret key, AES-GCM encrypted by the app
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  pay_on_delivery boolean not null default false,
  low_stock_threshold integer not null default 3,
  -- your subscription with the vendor
  setup_fee_kobo integer not null default 0,
  monthly_fee_kobo integer not null default 0,
  next_billing_date date,
  created_at timestamptz not null default now()
);

create table vendor_members (
  vendor_id uuid not null references vendors (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (vendor_id, user_id)
);
create index on vendor_members (user_id);

create table vendor_settings (
  vendor_id uuid primary key references vendors (id) on delete cascade,
  tone text not null default 'Warm, friendly and brief. Use the customer''s name when you know it.',
  pidgin_enabled boolean not null default false,
  sample_replies text[] not null default '{}',
  greeting text,
  policies text not null default '',
  faqs jsonb not null default '[]',      -- [{ "q": "...", "a": "..." }]
  handoff_rules text not null default '',
  business_hours jsonb not null default '{"open":"08:00","close":"20:00","days":[1,2,3,4,5,6]}',
  followup_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table channels (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  type channel_type not null,
  external_id text not null,            -- WhatsApp phone_number_id or Instagram account id
  display_name text,                    -- phone number or @handle
  waba_id text,
  access_token_enc text,                -- encrypted by the app (lib/crypto.ts)
  status channel_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (type, external_id)
);
create index on channels (vendor_id);

-- ---------------------------------------------------------------- catalog
create function public.product_search_doc(name text, description text, category text, tags text[])
returns tsvector language sql immutable as $$
  select to_tsvector('simple'::regconfig,
    coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '') || ' ' ||
    coalesce(array_to_string(tags, ' '), ''));
$$;

create table products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  name text not null,
  description text not null default '',
  category text,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  source_post_id text,                  -- Instagram post it was imported from
  created_at timestamptz not null default now(),
  search tsvector generated always as (public.product_search_doc(name, description, category, tags)) stored
);
create index on products (vendor_id);
create index on products using gin (search);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  label text not null default 'Standard', -- e.g. "Size 42 / Black"
  size text,
  colour text,
  sku text,
  price_kobo integer not null check (price_kobo >= 0),
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now()
);
create index on product_variants (product_id);
create index on product_variants (vendor_id);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  storage_path text,
  url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index on product_images (product_id);

create table delivery_zones (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  name text not null,                   -- "Lagos Mainland"
  areas text[] not null default '{}',   -- ["Yaba", "Surulere", ...]
  fee_kobo integer not null default 0,
  eta text,                             -- "1-2 days"
  created_at timestamptz not null default now()
);
create index on delivery_zones (vendor_id);

-- ---------------------------------------------------------------- conversations
create table customers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  channel_type channel_type not null,
  external_user_id text not null,       -- wa_id or IGSID
  name text,
  phone text,
  address text,
  opted_in_broadcast boolean not null default false,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  unique (vendor_id, channel_type, external_user_id)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  channel_id uuid references channels (id) on delete set null,
  channel_type channel_type not null,
  status conversation_status not null default 'ai',
  summary text not null default '',
  summary_until timestamptz,            -- messages up to here are folded into summary
  needs_attention boolean not null default false,
  handoff_reason text,
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  followup_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (vendor_id, customer_id, channel_type)
);
create index on conversations (vendor_id, last_message_at desc);
create index on conversations (needs_attention) where needs_attention;

create table messages (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  direction message_direction not null,
  sender message_sender not null,
  type text not null default 'text',    -- text | image | audio | template | comment | story_reply
  content text not null default '',
  media_url text,
  external_id text,
  ai_meta jsonb,
  status text,                          -- sent | delivered | read | failed
  created_at timestamptz not null default now()
);
create index on messages (conversation_id, created_at);
create unique index messages_external_id_key on messages (external_id) where external_id is not null;

-- ---------------------------------------------------------------- orders & payments
create sequence order_number_seq start 1001;

create table orders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  number integer not null default nextval('order_number_seq') unique,
  customer_id uuid references customers (id) on delete set null,
  conversation_id uuid references conversations (id) on delete set null,
  status order_status not null default 'pending',
  subtotal_kobo integer not null default 0,
  delivery_fee_kobo integer not null default 0,
  total_kobo integer not null default 0,
  delivery_zone_id uuid references delivery_zones (id) on delete set null,
  delivery_address text,
  customer_name text,
  customer_phone text,
  notes text,
  payment_method payment_method,
  rider_name text,
  rider_phone text,
  rider_token uuid not null default gen_random_uuid(),
  reminder_count integer not null default 0,
  last_reminder_at timestamptz,
  paid_at timestamptz,
  delivered_at timestamptz,
  sheet_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on orders (vendor_id, created_at desc);
create index on orders (status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  variant_id uuid references product_variants (id) on delete set null,
  name text not null,
  variant_label text,
  unit_price_kobo integer not null,
  quantity integer not null check (quantity > 0)
);
create index on order_items (order_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  method payment_method not null,
  reference text not null unique,
  amount_kobo integer not null,
  status payment_status not null default 'pending',
  authorization_url text,
  proof_url text,
  confirmed_by uuid references auth.users (id),
  raw jsonb,
  created_at timestamptz not null default now()
);
create index on payments (order_id);

-- ---------------------------------------------------------------- growth
create table restock_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  variant_id uuid references product_variants (id) on delete cascade,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create table comment_triggers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  keyword text not null,                -- "PRICE"
  media_id text,                        -- null = any post
  reply_text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  message text not null,
  template_name text,                   -- approved WhatsApp template for out-of-window sends
  status text not null default 'draft', -- draft | sending | sent
  sent_count integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table subscription_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  amount_kobo integer not null,
  paid_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- platform
create table jobs (
  id bigserial primary key,
  type text not null,
  payload jsonb not null default '{}',
  status job_status not null default 'queued',
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  locked_at timestamptz,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index jobs_ready_idx on jobs (run_at) where status = 'queued';

create table webhook_events (
  id bigserial primary key,
  source text not null,                 -- whatsapp | instagram | paystack
  external_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (source, external_id)
);

create table audit_log (
  id bigserial primary key,
  vendor_id uuid references vendors (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  data jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log (vendor_id, created_at desc);

create table ai_usage (
  id bigserial primary key,
  vendor_id uuid not null references vendors (id) on delete cascade,
  conversation_id uuid references conversations (id) on delete set null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_usd_micros bigint not null default 0,
  created_at timestamptz not null default now()
);
create index on ai_usage (vendor_id, created_at);
