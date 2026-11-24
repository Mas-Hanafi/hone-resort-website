# Booking engine contract (Sistem Reservasi Terpadu v2.0)

Shared contract between the database (Supabase, `supabase/migrations/`) and the API (`api/`).
Source PRD: "Sistem Reservasi Terpadu" v2.0 (24 Sep 2026). Section IDs (BE-, PAY-, K-, H-, FO-) refer to it.
Everything targets **Supabase staging only** (`YOUR-STAGING-REF`). Production is untouched.

Existing migrations (already applied to staging, do not edit them, build on top):
- `20260923_booking_engine.sql` — `inventori`, `booking`, `private.booking_config` (secret hash), `private.check_secret`,
  `private.night_price`, `private.rooms_used`, `booking_availability`, `booking_quote`, `booking_get`, `private.booking_insert`,
  `booking_create`, `booking_create_sales`, `booking_attach_payment`, `booking_mark`.
- `20260923b_admin_allowlist.sql` — `private.admins(user_id, note)`, `public.is_admin()`, policies via `is_admin()`.

Room codes (fixed): `sup_sv, sup_gv, dlx_sv, dlx_gv, suite_sv`. Suite max 1 room per booking.
All security-definer functions: `set search_path = ''`, fully qualified names. Errors are raised as
`raise exception 'CODE_IN_CAPS'` (PostgREST returns it as `message`; the API forwards the code).

## 1. New / changed tables

| Table | Columns |
|---|---|
| `public.room_type` (new) | `room_code text pk` (check in the 5 codes), `nama text`, `jatah_default int not null default 0 check >= 0`, `urutan int`, `jumlah_unit int not null` (physical rooms, migration `20260924b_room_units`: dlx_sv 8, dlx_gv 5, sup_sv 7, sup_gv 9, suite_sv 1). Check `jatah_default <= jumlah_unit`; trigger on `inventori` raises `JATAH_MELEBIHI_UNIT` (detail `"<tanggal> <room_code> <unit>"`) when `allotment > jumlah_unit`. Seed names: Superior Sea View, Superior Garden View, Deluxe Sea View, Deluxe Garden View, Suite Sea View; `jatah_default` 0. |
| `public.rule_set` (new) | `id uuid pk`, `nama text unique 1..40`, `warna smallint 0..7`, `persen int -90..200 null`, `min_malam int 1..30 null`, `maks_malam int 1..30 null`, `larangan_checkin smallint[] default '{}'` (0=Sunday..6=Saturday), `larangan_checkout smallint[] default '{}'`, `updated_at`, `updated_by text`. Seed: Sepi −20% (warna 4 hijau), Promo −10% (5 biru), Musim padat +50% min_malam 2 (0 merah). |
| `public.inventori` (alter) | `allotment` nullable (null = `room_type.jatah_default`); add `harga bigint null check > 0` (manual override), `rule_set_id uuid null references rule_set on delete set null`, `catatan text`, `min_malam int null 1..30`, `tutup_checkin bool not null default false`, `tutup_checkout bool not null default false`, `updated_by text`. |
| `public.booking_setting` (new, exactly one row id=1) | `min_malam 1`, `maks_malam 30`, `advance_notice_hari 0` (0..7), `batas_jam_hari_ini time '18:00'`, `jendela_bulan 12` (3,6,9,12), `larangan_checkin smallint[] '{}'`, `larangan_checkout smallint[] '{}'`, `jam_checkin time '14:00'`, `jam_checkout time '12:00'`, `hold_web_menit 30` (15..60), `link_sales_jam 24` (1..72), `jam_no_show time '22:00'`, `pembulatan int 1000` (1000, 10000, 50000), `pajak_persen numeric 10`, `pajak_termasuk bool true`, `kebijakan_pembatalan text`, `template_info_kedatangan text`, `updated_at`, `updated_by`. |
| `public.booking` (alter) | status check becomes `menunggu_bayar, lunas, kedaluwarsa, batal, checked_in, no_show, checked_out`. Add `pajak bigint not null default 0`, `addons jsonb not null default '[]'`, `room_id uuid null references rooms`, `id_verified bool not null default false`, `deposit bigint`, `checked_in_at timestamptz`, `checked_in_by text`, `no_show_at timestamptz`, `cancelled_at timestamptz`, `alasan_batal text`, `refund_amount bigint`, `info_kedatangan_at timestamptz`, `apoa_reported_at timestamptz`, `kewarganegaraan text`. |
| `public.rooms` (new) | `id uuid pk`, `nomor text unique`, `room_code text` (5 codes), `status text default 'bersih'` (bersih, kotor, perbaikan), `aktif bool default true`. No seed (numbers unknown). |
| `public.pre_checkin` (new) | `booking_id uuid pk references booking on delete cascade`, `jam_tiba time`, `jumlah_tamu int`, `kendaraan text`, `permintaan text`, `kewarganegaraan text`, `paspor jsonb` (nama, nomor, negara, tanggal_lahir), `created_at`, `updated_at`. |
| `public.payment_attempts` (new) | `id uuid pk`, `booking_id uuid not null references booking`, `provider text`, `invoice_number text unique not null`, `request_id text`, `token_id text`, `pay_url text`, `amount bigint not null`, `status text not null default 'PENDING'` (PENDING, SUCCESS, FAILED, EXPIRED, REFUNDED, TIMEOUT, REDIRECT), `expires_at timestamptz`, `last_checked_at timestamptz`, `raw jsonb`, `created_at`, `updated_at`. |
| `public.booking_events` (new) | `id bigserial pk`, `booking_id uuid null`, `jenis text`, `data jsonb`, `oleh text`, `created_at`. |
| `private.admins` (alter) | add `peran text not null default 'owner'` check in (`owner`, `sales`, `front_office`). |

RLS: every new public table has RLS enabled. Admin tables readable/writable only through `public.is_admin()`;
writes to `rule_set`, `booking_setting`, `room_type`, `inventori` additionally require role `owner` (use helper below).
`pre_checkin` and `payment_attempts`: no anon access at all.

## 2. Helpers

- `public.admin_role() returns text` — role of `auth.uid()` from `private.admins`, null if not admin. Execute: authenticated.
- `public.has_role(variadic roles text[]) returns bool`. Execute: authenticated.
- `private.effective_allotment(room, date) returns int` — `coalesce(inventori.allotment, room_type.jatah_default)`, 0 when `stop_sell`.
- `private.rooms_used(room, date)` — **change**: count `lunas, checked_in, no_show, checked_out` + `menunggu_bayar` with `expires_at > now()`.
- `private.night_price(room, date) returns bigint` — **change** to the PRD hierarchy:
  1. `inventori.harga` if not null;
  2. else base = period price (current logic); if base is null → null;
  3. if the cell has `rule_set_id` with `persen` → `round(base * (1 + persen/100.0) / pembulatan) * pembulatan`;
  4. else base.
- `private.stay_rules(room, checkin date) returns jsonb` — `{min_malam, maks_malam}` using cell > rule_set > booking_setting.
- `private.check_stay(room, checkin, checkout, sumber text)` — raises, in this order:
  `TANGGAL_TIDAK_VALID` (checkout <= checkin), `TANGGAL_LEWAT` (checkin < today WIB),
  `MIN_MALAM` (detail = required n), `MAKS_MALAM` (detail = n),
  `CHECKIN_DILARANG` (weekday in cell `tutup_checkin` / rule_set.larangan_checkin / setting.larangan_checkin; detail = date),
  `CHECKOUT_DILARANG` (same for checkout date, cell of the checkout date),
  and only for `sumber = 'web'`: `TERLALU_DEKAT` (checkin < today + advance_notice_hari, or checkin = today and now WIB > batas_jam_hari_ini),
  `DI_LUAR_JENDELA` (checkin > today + jendela_bulan months). Sales links skip the last two.

## 3. Public functions (anon)

| Function | Change |
|---|---|
| `booking_availability(p_from, p_to)` | Returns `tanggal, room_code, sisa, harga, min_malam, tutup_checkin, tutup_checkout` (new columns appended). `sisa` uses `effective_allotment`. |
| `booking_quote(p_room, p_checkin, p_checkout, p_qty)` | Same signature; uses new `night_price`; adds `pajak` (if `pajak_termasuk`: `round(total * p / (100 + p))`, else `round(total * p / 100)` and `total` includes it) and `pajak_termasuk` to the returned json. |
| `booking_public_setting()` (new) | json: min/maks malam, advance_notice_hari, batas_jam_hari_ini, jendela_bulan, jam_checkin, jam_checkout, hold_web_menit, pajak_persen, pajak_termasuk, kebijakan_pembatalan. |
| `booking_get(p_kode)` | Add `pajak`, `jam_checkin`, `jam_checkout`, `precheckin_diisi bool`. Keep hiding wa/email. |
| `private.booking_insert` | Call `check_stay` first. Default hold: web `hold_web_menit`, sales `link_sales_jam*60` when `hold_minutes` is absent. Web only: raise `TERLALU_BANYAK_HOLD` if the same WA digits already have 2 active `menunggu_bayar`. Store `pajak`. Log `booking_events('dibuat')`. |
| `precheckin_submit(p_kode, p jsonb)` (new, anon) | Allowed only when booking is `lunas` and checkin >= today. Upsert `pre_checkin`. Returns `{ok:true}`. Raise `BOOKING_TIDAK_ADA` / `BELUM_LUNAS`. |

## 4. Payment functions (secret-gated like `booking_mark`, `p_secret` first)

| Function | Behaviour |
|---|---|
| `payment_attempt_create(p_secret, p_kode, p_provider, p_invoice, p_request_id, p_token, p_url, p_amount bigint, p_expires_at timestamptz)` returns uuid | Booking must be `menunggu_bayar` and unexpired, else `BOOKING_KEDALUWARSA` / `SUDAH_LUNAS`. `p_amount` must equal `booking.total` else `NOMINAL_TIDAK_COCOK`. Also sets `booking.pg_provider/pg_ref` for backward compatibility. |
| `payment_next_invoice(p_secret, p_kode)` returns text | `'HON' || hex10 || 'P' || lpad(n,2,'0')` where hex10 is the kode without `HON-` and n = attempts so far + 1. Alphanumeric only, ≤ 30 chars. |
| `payment_settle(p_secret, p_invoice, p_status text, p_amount bigint, p_payload jsonb)` returns jsonb | Idempotent. Updates the attempt (status, raw, last_checked_at). Then: `SUCCESS` → booking `lunas` via same rules as `booking_mark` (amount check, PERIKSA note if hold expired) ; `EXPIRED` → booking `kedaluwarsa` only if booking still `menunggu_bayar` and hold expired ; `REFUNDED` → booking `batal`, `refund_amount = p_amount`, `cancelled_at` ; `FAILED`/`PENDING`/`TIMEOUT`/`REDIRECT` → attempt only. Returns `{booking: <row>, baru_lunas: bool}` (`baru_lunas` true only on the transition). Unknown invoice → `INVOICE_TIDAK_ADA`. Logs `booking_events`. |
| `payment_pending(p_secret, p_limit int)` returns table(`invoice_number, provider, kode, created_at`) | Attempts with status in PENDING/REDIRECT/TIMEOUT, created in the last 48 h, `last_checked_at` null or older than 4 minutes, oldest first. |
| `payment_attempts_of(p_secret, p_kode)` returns table(`invoice_number, provider, status, created_at`) | For the status page. |

Keep `booking_attach_payment` and `booking_mark` working (mock provider uses `booking_mark`).

## 5. Admin functions (authenticated + `is_admin()`, raise `UNAUTHORIZED` otherwise)

| Function | Roles | Behaviour |
|---|---|---|
| `admin_calendar(p_from date, p_to date)` returns table | all | Per date × room: `tanggal, room_code, harga_dasar, harga_efektif, sumber_harga ('manual','rule_set','periode', null), harga_manual, jatah, jatah_default, terpakai, sisa, stop_sell, rule_set_id, rule_set_nama, rule_set_warna, min_malam, tutup_checkin, tutup_checkout, catatan, jumlah_booking`. Max 62 days per call. |
| `admin_calendar_save(p jsonb)` returns jsonb | owner | `p = {rooms: text[], from: date, to: date (inclusive), days: int[] (0..6, empty = all), set: {...}}`. `set` keys present are applied: `stop_sell bool`, `allotment int or null` (null = follow default), `harga bigint or null` (null = remove override), `rule_set_id uuid or null`, `catatan text`, `min_malam int or null`, `tutup_checkin bool`, `tutup_checkout bool`; `reset: true` clears harga, rule_set_id, min_malam, tutup_*. Atomic. Reject `allotment` < `terpakai` on any night with `JATAH_KURANG` (detail = date + room). Upsert missing inventori rows. Sets `updated_by` (auth email). Returns `{sel_diubah: n}`. Logs one `booking_events('kalender')`. |
| `admin_checkin(p_kode text, p_room_id uuid, p_id_verified bool, p_deposit_jenis text, p_apoa bool, p_catatan text)` (migration `20260924d`) | owner, front_office | Booking must be `lunas`; `id_verified` must be true (`ID_BELUM_DIVERIFIKASI`); jaminan `uang` or `identitas` required (`JAMINAN_WAJIB`), `uang` stores `booking_setting.deposit_nominal` (100000) in `deposit`; room must be active and same room_code (`KAMAR_TIDAK_COCOK`) and not held by another `checked_in` booking (`KAMAR_TERISI`, detail = nomor); `p_apoa` sets `apoa_reported_at`. Sets `checked_in`, time, by. |
| `admin_no_show(p_kode text)` | owner, front_office | Only `lunas` and checkin <= today; on the check-in day only after `booking_setting.jam_no_show` (23:30 WIB), else `BELUM_JAM_NO_SHOW` (detail = jam). |
| `admin_cancel(p_kode text, p_alasan text, p_refund bigint)` | owner, sales | `alasan` required (`ALASAN_WAJIB`). `menunggu_bayar` or `lunas` → `batal`. |
| `admin_mark(p_kode text, p_field text)` | owner, front_office, sales | `p_field` in (`info_kedatangan`, `apoa`) → sets `info_kedatangan_at` / `apoa_reported_at = now()`. |
| `booking_create_sales(p jsonb)` | owner, sales | Existing; now also role-checked. |

## 6. API environment (see `.env.example`)

`PAYMENT_PROVIDER` = `mock` | `doku` | `midtrans` | `xendit`. When unset: `doku` if `DOKU_CLIENT_ID` and `DOKU_SECRET_KEY` are set, else `mock`.
`DOKU_ENV` = `sandbox` (base `https://api-sandbox.doku.com`) | `production` (`https://api.doku.com`).
`DOKU_PAYMENT_METHODS` = comma list for `payment.payment_method_types` (empty = DOKU default).
`TURNSTILE_SECRET_KEY` (server) / `VITE_TURNSTILE_SITE_KEY` (browser). When the secret is empty, Turnstile is skipped (dev only).
`CRON_SECRET` protects `GET /api/payment/reconcile` (header `Authorization: Bearer <CRON_SECRET>`).
