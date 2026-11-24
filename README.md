# H One Resort: website + booking engine + admin

Template resort/hotel dengan booking online dan pembayaran DOKU. Semua nama, kontak, ID, dan lokasi sudah diganti placeholder.

| Folder | Isi |
|---|---|
| `website/` | Frontend React/Vite, backend serverless `api/` (booking + pembayaran DOKU), migration Supabase |
| `admin/` | Panel admin: Kalender harga, voucher, booking, laporan |

Booking engine dan DOKU aktif lewat flag `BOOKING_ENGINE=on` dan `VITE_BOOKING_ENGINE=on`.

## Jadikan repo

Buat dua repo (website dan admin), satu per folder:

```powershell
cd website
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<akun-kamu>/<nama-repo>.git
git push -u origin main
```

## Setup backend

1. **Supabase**: buat project, jalankan semua `website/supabase/migrations/*.sql` berurutan menurut nama file, pertama kali di project kosong untuk tes. `20260924f_prod_admin_security.sql` ditulis untuk produksi lama; kalau error atau tidak relevan, lewati. Belum diuji di project kosong.
2. **Booking secret**: buat string acak, simpan sha256-nya di DB dan nilai aslinya di env Vercel.
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   `insert into private.booking_config (id, secret_hash) values (1, '<sha256 hex>');`
3. **Admin pertama**: daftarkan email kamu di `private.admins` dengan peran `owner`.
4. **Vercel (website)**: isi env sesuai `website/.env.example`. Minimal: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `BOOKING_ENGINE=on`, `VITE_BOOKING_ENGINE=on`, `BOOKING_SECRET`.
5. **DOKU**: ambil Client ID + Secret Key sandbox di dashboard DOKU, isi `PAYMENT_PROVIDER=doku`, `DOKU_ENV=sandbox`, `DOKU_CLIENT_ID`, `DOKU_SECRET_KEY`. Isi Payment Notification URL `https://<domain>/api/payment/webhook` untuk API Version 1.1 (SNAP) dan 1.0 (non-SNAP).
6. **Reconcile**: `20260928b_reconcile_cron.sql` menjadwalkan cek status tiap 3 menit. Ganti URL di dalamnya ke domain kamu sebelum dijalankan.
7. **Admin**: deploy `admin/` ke proyek Vercel lain, isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_KEY`.

## Placeholder yang harus kamu isi

| Placeholder | Lokasi |
|---|---|
| `hone.example`, `images.hone.example` | domain, email, URL gambar di seluruh kode |
| `YOUR-STAGING-REF`, `YOUR-PROD-REF` | project Supabase, di `website/vercel.json` (CSP), migration, `admin/src/supabase.ts` |
| `YOUR_CLOUD_NAME` | akun Cloudinary untuk gambar |
| `G-XXXXXXXXXX`, `YOUR_GOOGLE_PLACE_ID` | Google Analytics dan Places di `website/index.html`, `website/api/google-rating.ts` |
| `6280000000000` | nomor WhatsApp |
| `Jl. Contoh No. 1`, `Kota Contoh` | alamat dan lokasi di copy, SEO, dan JSON-LD |
| `honeresort` | handle Instagram, TikTok, Facebook |

Sisa yang perlu kamu ganti sendiri:
- Logo dan ikon di `public/` adalah placeholder teks "H One". Ganti dengan logo asli.
- 30 gambar masih dari imgur milik pihak lain (`i.imgur.com`). Ganti dengan fotomu.
- Isi copy kamar, harga, dan testimoni masih contoh dari proyek asal. Tulis ulang.
- Mode `mock` payment ditolak di production (`VERCEL_ENV=production`), jadi tanpa kunci DOKU hanya bisa dites di preview atau lokal.

## Status verifikasi

Lihat ringkasan di akhir sesi pembuatan. Alur DOKU end-to-end belum diuji dari salinan ini karena butuh kunci DOKU dan Supabase milikmu.
