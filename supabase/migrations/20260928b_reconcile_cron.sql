-- Safety net for missed gateway notifications (e.g. DOKU Mandiri/CIMB VA, whose notification config
-- needs an inquiry URL we do not have, and QRIS): every 3 minutes ask the site to re-check open payments.
-- /api/payment/reconcile is throttled by payment_pending (each attempt at most once per 4 min, max 20).
-- STAGING URL below; at go-live schedule the same job on PROD with https://www.hone.example.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'hone-payment-reconcile';
select cron.schedule(
  'hone-payment-reconcile',
  '*/3 * * * *',
  $$select net.http_get(
      url := 'https://hone-git-staging.vercel.app/api/payment/reconcile',
      timeout_milliseconds := 20000)$$
);
