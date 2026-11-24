# Dynamic Room Types Implementation Plan

**Goal:** Owner/sales can add a room type and its room numbers in admin "Kamar"; units, default allotment, Kalender, booking, checkout and pricelist follow automatically.

**Architecture:** `room_type` becomes the single master list (no hardcoded codes in DB). Room numbers (`rooms`) drive `jumlah_unit` = `jatah_default` via trigger. Base price = legacy pricelist period column (old 5 types) else `room_type.harga_weekday/harga_weekend` (Fri–Sun = weekend). `tampil_web` hides a type from the website engine (still sellable by sales link).

**Owner decisions (29 Sep 2026):** price in Kamar form (overridable per date in Kalender) · room-number list drives count · "Tampilkan di website" toggle, draft until on.

## Tasks

1. **DB `supabase/migrations/20260929c_tipe_kamar_dinamis.sql` (STAGING)**
   - `room_type` + `harga_weekday`, `harga_weekend`, `tampil_web`, `aktif`; code format check.
   - Drop 4 `*_room_code_check`; FK `inventori/booking/rooms.room_code -> room_type`.
   - Trigger `rooms_sync_unit`: active room count -> `jumlah_unit` + `jatah_default`.
   - `effective_allotment` capped at `jumlah_unit`; 0 when type inactive.
   - `private.base_price()`; `night_price_normal`, `admin_calendar` use it; `admin_calendar`/`booking_availability` iterate `room_type`.
   - `booking_insert`: validate type from table (web needs `tampil_web`), qty <= units.
   - `booking_public_setting.kamar`, `booking_get.room_nama`.
   - RPC `room_type_simpan(p jsonb)`: upsert type + sync website `kamar` row (name, price, visibility).
   - Test: `supabase/tests/20260929c_tipe_kamar_dinamis_test.sql` (begin…rollback): new type + 2 rooms -> units 2, availability hidden until `tampil_web`, price weekday/weekend, booking qty 3 rejected, sales booking OK.
2. **API**: drop `ROOM_CODES` list (format check only, DB validates); room names from `booking_get.room_nama`.
3. **Website** (engine on only): room list from `/api/booking/setting` `kamar` (CheckoutPage, pricelist, hero form); static list stays for engine off.
4. **Admin** (`hone-admin` branch `tema-satu`): `src/rooms.ts` loads `room_type` once at app start (`ROOMS` stays the import name); Kamar module: "Tambah tipe kamar", harga weekday/weekend, toggle Tampilkan, room-number chips.
5. Verify: build both, browser check admin + checkout staging, SQL test, revision log.
