-- Hardening from the Supabase security advisor.

-- Pin search_path on the remaining functions.
alter function public.product_search_doc(text, text, text, text[]) set search_path = public;
alter function public.touch_updated_at() set search_path = public;

-- Trigger functions are never called directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_vendor_settings() from public, anon, authenticated;

-- Access helpers and stats are only for signed-in users (RLS policies and the dashboard call them).
revoke execute on function public.is_operator() from public, anon;
revoke execute on function public.can_access_vendor(uuid) from public, anon;
revoke execute on function public.is_vendor_owner(uuid) from public, anon;
revoke execute on function public.vendor_stats(uuid, timestamptz) from public, anon;
grant execute on function public.is_operator() to authenticated, service_role;
grant execute on function public.can_access_vendor(uuid) to authenticated, service_role;
grant execute on function public.is_vendor_owner(uuid) to authenticated, service_role;
grant execute on function public.vendor_stats(uuid, timestamptz) to authenticated, service_role;

-- jobs and webhook_events are service-role only by design (RLS on, no policies).
comment on table public.jobs is 'Service role only: RLS enabled with no policies on purpose.';
comment on table public.webhook_events is 'Service role only: RLS enabled with no policies on purpose.';
