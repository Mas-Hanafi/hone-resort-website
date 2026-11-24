-- Owner 29 Sep 2026: no discount cap for sales. Every check (payment links, sales-made vouchers, per-date
-- discounts in Kalender) reads booking_setting.diskon_sales_maks, so 100 = same freedom as the owner.
-- The owner can bring a cap back any time in admin Pengaturan -> "Diskon maks sales (%)".
alter table public.booking_setting alter column diskon_sales_maks set default 100;
update public.booking_setting set diskon_sales_maks = 100 where id = 1;
