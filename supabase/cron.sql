-- Optional: run the job worker every minute from Supabase (works on Vercel's free plan, whose crons run once a day).
-- Run this in the Supabase SQL editor after deploying. Replace the URL and secret.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('salespadi-worker', '* * * * *', $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/worker',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$$);

select cron.schedule('salespadi-daily', '0 18 * * *', $$
  select net.http_get(url := 'https://YOUR-APP.vercel.app/api/cron/daily',
                      headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'));
$$);

select cron.schedule('salespadi-weekly', '0 7 * * 1', $$
  select net.http_get(url := 'https://YOUR-APP.vercel.app/api/cron/weekly',
                      headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'));
$$);
