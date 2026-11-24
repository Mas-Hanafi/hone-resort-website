// /api/booking/{availability|quote|setting|addon-sisa|create|pay|status|precheckin|track}
// One function file keeps the project under the Vercel Hobby function limit.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rpc, secret, baseUrl, engineEnabled, sendError, RpcError, isRoomCode, isDate } from '../_lib/db.js';
import { provider } from '../_lib/payment.js';
import { notifyPaid } from '../_lib/notify.js';

const KODE_RE = /^HON-[0-9A-F]{10}$/;
// voucher codes are A-Z 0-9 and dashes (DB check); anything else is dropped rather than sent to SQL
const voucherOf = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return /^[A-Z0-9-]{3,30}$/.test(s) ? s : null;
};

interface PaymentAttemptRow { invoice_number: string; provider: string; status: string; created_at: string }

// Each gateway page is open at most 15 minutes (owner rule), and never past the booking's own hold.
// ponytail: fixed constant; read booking_setting if the owner ever wants it editable.
const PAY_WINDOW_MS = 15 * 60_000;

async function startPayment(req: VercelRequest, kode: string) {
  const b = await rpc('booking_get', { p_kode: kode });
  if (!b) throw new RpcError('BOOKING_TIDAK_ADA', 404);
  if (b.status !== 'menunggu_bayar') throw new RpcError(b.status === 'lunas' ? 'SUDAH_LUNAS' : 'BOOKING_KEDALUWARSA', 409);
  // guest contact from the DB (DOKU emails its own receipt to customer.email); an open gateway page is reused
  const ctx = await rpc<{ email: string | null; wa: string; pay_url: string | null }>('booking_pay_context', { p_secret: secret(), p_kode: kode });
  if (ctx?.pay_url) return { kode: b.kode, payUrl: ctx.pay_url };
  const payUntil = new Date(Math.min(new Date(b.expires_at).getTime(), Date.now() + PAY_WINDOW_MS)).toISOString();
  const base = baseUrl(req);
  const invoice = await rpc<string>('payment_next_invoice', { p_secret: secret(), p_kode: kode });
  const pay = await provider().create({
    kode: b.kode,
    invoice,
    total: Number(b.total),
    itemName: `${b.room_nama ?? b.room_code} x${b.jumlah_kamar}`,
    nama: b.nama,
    email: ctx?.email ?? null,
    wa: ctx?.wa ?? '',
    expiresAt: payUntil,
    finishUrl: `${base}/booking/${encodeURIComponent(b.kode)}`,
    baseUrl: base,
  });
  await rpc('payment_attempt_create', {
    p_secret: secret(), p_kode: b.kode, p_provider: pay.provider, p_invoice: pay.invoice,
    p_request_id: pay.requestId ?? null, p_token: pay.tokenId ?? null, p_url: pay.payUrl,
    p_amount: Number(b.total), p_expires_at: payUntil,
  });
  return { kode: b.kode, payUrl: pay.payUrl };
}

// No-op when TURNSTILE_SECRET_KEY is unset (dev/staging without a Turnstile site configured yet).
async function verifyTurnstile(token: unknown, req: VercelRequest) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return;
  if (!token || typeof token !== 'string') throw new RpcError('TURNSTILE_GAGAL', 403);
  const remoteip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const form = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteip) form.set('remoteip', remoteip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.success !== true) throw new RpcError('TURNSTILE_GAGAL', 403);
}

// Re-checks any attempt still in flight (PENDING/REDIRECT/TIMEOUT) against the gateway before
// answering, so a guest who paid but bounced before the webhook/redirect lands still sees "lunas".
async function refreshPendingAttempts(kode: string) {
  const prov = provider();
  if (!prov.checkStatus) return;
  const attempts = await rpc<PaymentAttemptRow[]>('payment_attempts_of', { p_secret: secret(), p_kode: kode });
  const pending = attempts.filter(a => a.status === 'PENDING' || a.status === 'REDIRECT' || a.status === 'TIMEOUT');
  for (const a of pending) {
    try {
      const ev = await prov.checkStatus(a.invoice_number);
      const result = await rpc<{ booking: any; baru_lunas: boolean }>('payment_settle', {
        p_secret: secret(), p_invoice: a.invoice_number, p_status: ev.status, p_amount: ev.amount, p_payload: ev.raw ?? {},
      });
      if (result.baru_lunas) await notifyPaid(result.booking).catch(e => console.error('[notify]', e));
    } catch (e) {
      console.error('[booking:status] checkStatus failed for', a.invoice_number, e);
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || '');
  res.setHeader('X-Robots-Tag', 'noindex');
  try {
    if (!engineEnabled()) throw new RpcError('BOOKING_ENGINE_OFF', 503);

    if (action === 'availability' && req.method === 'GET') {
      const { from, to } = req.query;
      if (!isDate(from) || !isDate(to)) throw new RpcError('TANGGAL_TIDAK_VALID', 400);
      const rows = await rpc('booking_availability', { p_from: from, p_to: to });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(rows);
    }

    if (action === 'quote' && req.method === 'GET') {
      const { room, checkin, checkout, qty } = req.query;
      if (!isRoomCode(room) || !isDate(checkin) || !isDate(checkout)) throw new RpcError('INPUT_TIDAK_VALID', 400);
      const q = await rpc('booking_quote', {
        p_room: room, p_checkin: checkin, p_checkout: checkout, p_qty: Number(qty) || 1, p_voucher: voucherOf(req.query.voucher),
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(q);
    }

    if (action === 'setting' && req.method === 'GET') {
      const s = await rpc('booking_public_setting', {});
      res.setHeader('Cache-Control', 'no-store'); // admin edits (rules, add-ons) must show on the next page load
      return res.status(200).json(s);
    }

    // remaining units per day-quota add-on for a check-in date: { bajaj_fun_trip: 1, ... }
    if (action === 'addon-sisa' && req.method === 'GET') {
      const { tanggal } = req.query;
      if (!isDate(tanggal)) throw new RpcError('TANGGAL_TIDAK_VALID', 400);
      const sisa = await rpc('addon_sisa', { p_tanggal: tanggal });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(sisa ?? {});
    }

    if (action === 'create' && req.method === 'POST') {
      const b = req.body || {};
      if (!isRoomCode(b.room_code) || !isDate(b.checkin) || !isDate(b.checkout)) throw new RpcError('INPUT_TIDAK_VALID', 400);
      if (b.setuju !== true) throw new RpcError('BELUM_SETUJU_SK', 400);
      // web guests must leave an email: the booking + payment receipt go there (sales links are separate)
      if (!b.email || typeof b.email !== 'string') throw new RpcError('EMAIL_WAJIB', 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) throw new RpcError('EMAIL_TIDAK_VALID', 400);
      await verifyTurnstile(b.turnstile, req);
      const booking = await rpc('booking_create', {
        p_secret: secret(),
        p: {
          room_code: b.room_code, checkin: b.checkin, checkout: b.checkout,
          jumlah_kamar: Number(b.jumlah_kamar) || 1, dewasa: Number(b.dewasa) || 2, anak: Number(b.anak) || 0,
          nama: String(b.nama || '').slice(0, 120), wa: String(b.wa || '').slice(0, 30),
          email: b.email ? String(b.email).slice(0, 160) : null, catatan: b.catatan ? String(b.catatan).slice(0, 1000) : null,
          voucher: voucherOf(b.voucher),
          // prices come from the addon table in SQL; only kode + qty are taken from the browser
          addons: Array.isArray(b.addons)
            ? b.addons.slice(0, 20).filter((a: any) => /^[a-z0-9_]{1,40}$/.test(String(a?.kode)))
                .map((a: any) => ({ kode: String(a.kode), qty: Math.max(0, Math.min(50, Math.floor(Number(a.qty) || 0))) }))
            : [],
          // hold_minutes intentionally omitted for web bookings: booking_setting.hold_web_menit applies.
        },
      });
      if (typeof b.sesi === 'string' && b.sesi.length >= 8) {
        await rpc('track_event', {
          p_secret: secret(), p_sesi: b.sesi.slice(0, 64), p_jenis: 'booking_dibuat', p_kode: booking.kode,
          p_data: { kamar: b.room_code, checkin: b.checkin, checkout: b.checkout, jumlah_kamar: Number(b.jumlah_kamar) || 1 },
        }).catch(e => console.error('[track]', e));
      }
      try {
        return res.status(200).json(await startPayment(req, booking.kode));
      } catch (e) {
        // the hold exists: hand back its kode so the guest retries via /booking/:kode instead of creating a second hold
        console.error('[booking] payment start failed for', booking.kode, e);
        return res.status(200).json({ kode: booking.kode, payUrl: null, payError: e instanceof RpcError ? e.code : 'GATEWAY_ERROR' });
      }
    }

    if (action === 'pay' && req.method === 'POST') {
      const kode = String(req.body?.kode || '');
      if (!KODE_RE.test(kode)) throw new RpcError('KODE_TIDAK_VALID', 400);
      return res.status(200).json(await startPayment(req, kode));
    }

    if (action === 'status' && req.method === 'GET') {
      const kode = String(req.query.kode || '');
      if (!KODE_RE.test(kode)) throw new RpcError('KODE_TIDAK_VALID', 400);
      let b = await rpc('booking_get', { p_kode: kode });
      if (!b) throw new RpcError('BOOKING_TIDAK_ADA', 404);
      if (b.status === 'menunggu_bayar') {
        await refreshPendingAttempts(kode);
        b = await rpc('booking_get', { p_kode: kode });
        if (!b) throw new RpcError('BOOKING_TIDAK_ADA', 404);
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(b);
    }

    // guest behaviour for admin Laporan; never fails the page
    if (action === 'track' && req.method === 'POST') {
      const t = req.body || {};
      await rpc('track_event', {
        p_secret: secret(), p_sesi: String(t.sesi || '').slice(0, 64), p_jenis: String(t.jenis || '').slice(0, 40),
        p_kode: KODE_RE.test(String(t.kode || '')) ? t.kode : null,
        p_data: t.data && typeof t.data === 'object' && !Array.isArray(t.data) ? t.data : {},
      }).catch(e => console.error('[track]', e));
      return res.status(204).end();
    }

    if (action === 'precheckin' && req.method === 'POST') {
      const body = req.body || {};
      const kode = String(body.kode || '');
      if (!KODE_RE.test(kode)) throw new RpcError('KODE_TIDAK_VALID', 400);
      const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      const paspor = body.paspor && typeof body.paspor === 'object' ? {
        nama: str(body.paspor.nama, 120),
        nomor: str(body.paspor.nomor, 40),
        negara: str(body.paspor.negara, 80),
        tanggal_lahir: typeof body.paspor.tanggal_lahir === 'string' ? body.paspor.tanggal_lahir.slice(0, 10) : null,
      } : null;
      const fields = {
        jam_tiba: typeof body.jam_tiba === 'string' ? body.jam_tiba.slice(0, 8) : null,
        jumlah_tamu: Number.isFinite(Number(body.jumlah_tamu)) ? Math.max(0, Math.min(99, Math.trunc(Number(body.jumlah_tamu)))) : null,
        kendaraan: str(body.kendaraan, 120) || null,
        permintaan: str(body.permintaan, 500) || null,
        kewarganegaraan: str(body.kewarganegaraan, 80) || null,
        paspor,
      };
      const result = await rpc('precheckin_submit', { p_kode: kode, p: fields });
      return res.status(200).json(result);
    }

    return res.status(404).json({ error: 'NOT_FOUND' });
  } catch (err) {
    return sendError(res, err);
  }
}
