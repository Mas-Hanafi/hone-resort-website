-- Create pricelist_periods table
create table if not exists pricelist_periods (
  id          serial primary key,
  label       text not null,
  tag         text not null,
  min_check_in text not null,
  max_check_in text not null,
  sup_sv      text not null,
  sup_gv      text not null,
  dlx_sv      text not null,
  dlx_gv      text not null,
  suite_sv    text not null,
  check_in_dates text[] not null default '{}',
  sort_order  int not null default 0,
  active      boolean not null default true
);

-- Enable Row Level Security
alter table pricelist_periods enable row level security;

-- Allow public read (no auth needed — prices are public)
create policy "Public read" on pricelist_periods
  for select using (true);

-- Seed current pricelist data
insert into pricelist_periods (label, tag, min_check_in, max_check_in, sup_sv, sup_gv, dlx_sv, dlx_gv, suite_sv, check_in_dates, sort_order) values
('13 – 17 Juni',           'Peak Period',    '2026-06-13', '2026-06-17', '1.600.000', '1.430.000', '1.720.000', '1.660.000', '2.900.000', ARRAY['2026-06-13','2026-06-14','2026-06-15','2026-06-16','2026-06-17'], 1),
('5, 6, 7, 12, 19, 20, 21 Juni', 'Weekend Juni', '2026-06-05', '2026-06-21', '1.430.000', '1.320.000', '1.550.000', '1.490.000', '2.590.000', ARRAY['2026-06-05','2026-06-06','2026-06-07','2026-06-12','2026-06-19','2026-06-20','2026-06-21'], 2),
('2–4, 8–11, 18, 22–24 Juni', 'Weekday Juni', '2026-06-02', '2026-06-24', '1.300.000', '1.260.000', '1.370.000', '1.311.000', '2.130.000', ARRAY['2026-06-02','2026-06-03','2026-06-04','2026-06-08','2026-06-09','2026-06-10','2026-06-11','2026-06-18','2026-06-22','2026-06-23','2026-06-24'], 3),
('25, 29, 30 Juni',        'Weekday Juni',   '2026-06-25', '2026-06-30', '1.490.000', '1.370.000', '1.660.000', '1.550.000', '2.590.000', ARRAY['2026-06-25','2026-06-29','2026-06-30'], 4),
('26, 27, 28 Juni',        'Weekend Juni',   '2026-06-26', '2026-06-28', '1.600.000', '1.490.000', '1.750.000', '1.720.000', '2.820.000', ARRAY['2026-06-26','2026-06-27','2026-06-28'], 5),
('1 – 13 Juli',            'Weekday Juli',   '2026-07-01', '2026-07-13', '1.490.000', '1.370.000', '1.660.000', '1.550.000', '2.590.000', ARRAY['2026-07-01','2026-07-02','2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-13'], 6),
('3–5, 10–12 Juli',        'Weekend Juli',   '2026-07-03', '2026-07-12', '1.600.000', '1.490.000', '1.750.000', '1.720.000', '2.820.000', ARRAY['2026-07-03','2026-07-04','2026-07-05','2026-07-10','2026-07-11','2026-07-12'], 7),
('14 – 31 Juli',           'Weekday Juli',   '2026-07-14', '2026-07-31', '1.300.000', '1.260.000', '1.370.000', '1.311.000', '2.130.000', ARRAY['2026-07-14','2026-07-15','2026-07-16','2026-07-20','2026-07-21','2026-07-22','2026-07-23','2026-07-27','2026-07-28','2026-07-29','2026-07-30'], 8),
('17–19, 24–26, 31 Juli',  'Weekend Juli',   '2026-07-17', '2026-07-31', '1.430.000', '1.320.000', '1.550.000', '1.490.000', '2.590.000', ARRAY['2026-07-17','2026-07-18','2026-07-19','2026-07-24','2026-07-25','2026-07-26','2026-07-31'], 9);

-- Verify
select id, label, tag, sort_order, active from pricelist_periods order by sort_order;
