// /api/payment/webhook   : notifications from DOKU / Midtrans / Xendit
// /api/payment/reconcile : cron-friendly active status pull for attempts the webhook missed
// /api/payment/mock      : simulated gateway page for staging (refuses to run on production)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rpc, secret, sendError, RpcError } from '../_lib/db.js';
import { provider } from '../_lib/payment.js';
import { notifyPaid } from '../_lib/notify.js';

const KODE_RE = /^HON-[0-9A-F]{10}$/;
const WEBHOOK_TARGET = '/api/payment/webhook';

interface SettleResult { booking: any; baru_lunas: boolean }
interface PaymentAttemptRow { invoice_number: string; provider: string; status: string; created_at: string }
interface PendingRow { invoice_number: string; provider: string; kode: string; created_at: string }

async function settle(invoice: string, status: string, amount: number | null, raw: unknown) {
  const result = await rpc<SettleResult>('payment_settle', {
    p_secret: secret(), p_invoice: invoice, p_status: status, p_amount: amount, p_payload: raw ?? {},
  });
  if (result.baru_lunas) await notifyPaid(result.booking).catch(e => console.error('[notify]', e));
  return result;
}

// Plain Vercel Node functions (this project ships no Next.js) don't honour Next's
// `export const config = { api: { bodyParser: false } }` — that switch only exists for Next.js API
// routes. @vercel/node instead exposes `req.body` as a LAZY getter: nothing is read off the socket
// until something touches `req.body`. So as long as we consume the raw stream ourselves FIRST (and
// never read req.body for this request), we get the exact bytes DOKU/Midtrans/Xendit signed — which
// JSON.stringify(req.body) cannot guarantee (key order / whitespace can differ from what was sent).
// In dev, vite.config.ts's api shim attaches the already-collected raw string as req.rawBody.
async function getRawBody(req: VercelRequest): Promise<string> {
  const withRaw = req as VercelRequest & { rawBody?: unknown; readable?: boolean };
  if (typeof withRaw.rawBody === 'string') return withRaw.rawBody;

  if (withRaw.readable !== false && typeof (req as any)[Symbol.asyncIterator] === 'function') {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req as unknown as AsyncIterable<Buffer | string>) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks.map(c => new Uint8Array(c))).toString('utf8');
    } catch (e) {
      console.error('[payment] failed to read raw request stream', e);
    }
  }

  console.error('[payment] raw body unavailable; falling back to JSON.stringify(req.body) — signature verification will likely fail');
  return JSON.stringify(req.body ?? {});
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function mockPage(b: any) {
  const rupiah = 'Rp' + Number(b.total).toLocaleString('id-ID');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Simulasi Pembayaran</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f4f4f2;color:#1c1c1c;display:grid;place-items:center;min-height:100vh;padding:16px}
.card{background:#fff;border:1px solid #e5e2d8;border-radius:14px;max-width:380px;width:100%;padding:24px}
.tag{display:inline-block;background:#fdf3dc;color:#8a6100;font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px}
h1{font-size:18px;margin:14px 0 4px}.amt{font-size:28px;font-weight:700;margin:6px 0 16px}
p{color:#555;font-size:14px;margin:4px 0}button{width:100%;padding:13px;border-radius:9px;border:0;font-weight:700;font-size:14px;cursor:pointer;margin-top:10px}
.pay{background:#1c1c1c;color:#d4af37}.fail{background:#fff;border:1px solid #ddd;color:#a33a2a}</style></head><body>
<div class="card"><span class="tag">MODE SIMULASI · tidak ada uang sungguhan</span>
<h1>${esc(b.room_nama ?? b.room_code)} × ${esc(b.jumlah_kamar)}</h1>
<p>${esc(b.checkin)} → ${esc(b.checkout)} · ${esc(b.kode)}</p>
<div class="amt">${rupiah}</div>
<form method="post"><input type="hidden" name="kode" value="${esc(b.kode)}">
<button class="pay" name="hasil" value="lunas">Simulasikan bayar berhasil</button>
<button class="fail" name="hasil" value="batal">Simulasikan batal</button></form>
<p style="margin-top:14px;font-size:12px">Halaman ini menggantikan halaman payment gateway selama akun pembayaran belum aktif.</p>
</div></body></html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || '');
  try {
    if (action === 'webhook' && req.method === 'POST') {
      const rawBody = await getRawBody(req);
      const headers = req.headers as Record<string, string | string[] | undefined>;
      const ev = provider().parseWebhook(rawBody, headers, WEBHOOK_TARGET);
      if (!ev) return res.status(401).json({ error: 'INVALID_SIGNATURE' });
      try {
        await settle(ev.invoice, ev.status, ev.amount, ev.raw);
      } catch (e) {
        if (e instanceof RpcError && e.code === 'INVOICE_TIDAK_ADA') {
          // Unknown invoice: nothing we can settle. Still 200 so the gateway stops retrying.
          console.error('[webhook] unknown invoice', ev.invoice);
          return res.status(200).json({ ok: true });
        }
        throw e;
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'reconcile' && req.method === 'GET') {
      // Called every few minutes by Supabase pg_cron (migration 20260928b). Safe without a secret:
      // payment_pending only returns attempts not checked in the last 4 minutes (max 20), and settling is
      // idempotent, so repeated calls cannot hammer the gateway. CRON_SECRET, when set, is still enforced.
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret && String(req.headers.authorization || '') !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
      }
      const prov = provider();
      const pending = await rpc<PendingRow[]>('payment_pending', { p_secret: secret(), p_limit: 20 });
      let checked = 0, settled = 0;
      for (const row of pending) {
        if (!prov.checkStatus) continue; // gateway relies on webhook-only settlement (midtrans/xendit)
        checked++;
        try {
          const ev = await prov.checkStatus(row.invoice_number);
          const result = await settle(row.invoice_number, ev.status, ev.amount, ev.raw);
          if (result.baru_lunas) settled++;
        } catch (e) {
          console.error('[reconcile] failed for', row.invoice_number, e);
        }
      }
      return res.status(200).json({ checked, settled });
    }

    if (action === 'mock') {
      if (process.env.VERCEL_ENV === 'production' || (process.env.PAYMENT_PROVIDER || 'mock') !== 'mock') {
        throw new RpcError('NOT_FOUND', 404);
      }
      const kode = String((req.method === 'POST' ? req.body?.kode : req.query.kode) || '');
      if (!KODE_RE.test(kode)) throw new RpcError('KODE_TIDAK_VALID', 400);
      const b = await rpc('booking_get', { p_kode: kode });
      if (!b) throw new RpcError('BOOKING_TIDAK_ADA', 404);

      if (req.method === 'POST') {
        if (b.status === 'menunggu_bayar') {
          const attempts = await rpc<PaymentAttemptRow[]>('payment_attempts_of', { p_secret: secret(), p_kode: kode });
          const latest = [...attempts].sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())[0];
          if (latest) {
            const hasil = req.body?.hasil === 'lunas' ? 'SUCCESS' : 'FAILED';
            await settle(latest.invoice_number, hasil, Number(b.total), { mock: true, hasil });
          }
        }
        res.setHeader('Location', `/booking/${encodeURIComponent(kode)}`);
        return res.status(303).end();
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Robots-Tag', 'noindex');
      return res.status(200).send(mockPage(b));
    }

    return res.status(404).json({ error: 'NOT_FOUND' });
  } catch (err) {
    return sendError(res, err);
  }
}
